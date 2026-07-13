//! Boucle de détection d'état de partie (V2).
//!
//! Interroge l'état (`client::fetch_game_state`) et notifie les changements pour piloter
//! l'overlay (`crate::overlay`) et la notification de fin de partie. L'intervalle est
//! adaptatif : rapide (`ACTIVE_INTERVAL`) en pregame/in-game où la réactivité de l'overlay
//! compte, plus lent (`IDLE_INTERVAL`) hors-jeu/menu où on ne fait qu'attendre une
//! transition — ça réduit la charge CPU/réseau au repos. Se met en pause proprement si le
//! lockfile disparaît (jeu fermé) et respecte le toggle `settings::AppSettings::riot_local_disabled`
//! (relu à chaque itération — pas besoin de redémarrer l'app après un changement dans
//! Paramètres).
//!
//! Best-effort face à un Riot Client qui plante sans nettoyer son lockfile : après
//! `MAX_LOCAL_FAILURES` échecs consécutifs de l'API locale (lockfile présent mais
//! injoignable), on republie l'état hors-jeu et on force une reconnexion complète au lieu
//! de rester bloqué indéfiniment sur le dernier état connu (voir `on_local_api_failure`).

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::watch;

use super::client::{self, GameState};
use super::lockfile::{self, LockfileInfo};
use super::{LivePlayer, LiveSnapshot, LiveState};
use crate::AppState;

const ACTIVE_INTERVAL: Duration = Duration::from_millis(2500);
const IDLE_INTERVAL: Duration = Duration::from_millis(8000);
/// Backlog #78 : au-delà de `DEEP_IDLE_THRESHOLD` ticks consécutifs sans lockfile (Riot
/// Client fermé), on espace encore plus les vérifications — un simple `read_lockfile()`
/// idle à 8s en continu pendant des heures hors session n'a pas de raison d'être alors que
/// rien ne peut changer sans que l'utilisateur relance le client.
const DEEP_IDLE_INTERVAL: Duration = Duration::from_millis(60_000);
const DEEP_IDLE_THRESHOLD: u32 = 10;
const MAX_LOCAL_FAILURES: u32 = 3;
/// Durée d'affichage de l'overlay une fois la manche lancée, le temps de lire le roster
/// ennemi (voir `on_state_changed`) avant de se masquer pour ne pas gêner la visée.
const IN_GAME_OVERLAY_DURATION: Duration = Duration::from_secs(12);
pub const STATE_EVENT: &str = "riot-local://state";

pub struct PollerHandle {
    stop: watch::Sender<bool>,
}

/// Démarre la boucle de polling en tâche de fond (tokio, via le runtime de Tauri).
pub fn start(app_handle: AppHandle) -> PollerHandle {
    let (stop_tx, stop_rx) = watch::channel(false);
    tauri::async_runtime::spawn(run_loop(app_handle, stop_rx));
    PollerHandle { stop: stop_tx }
}

#[allow(dead_code)]
pub fn stop(handle: PollerHandle) {
    // Le récepteur voit la valeur changer et sort de la boucle au prochain tick.
    let _ = handle.stop.send(true);
}

async fn run_loop(app: AppHandle, mut stop_rx: watch::Receiver<bool>) {
    crate::applog!("[riot_local] poller démarré, log_path={:?}", crate::applog::path());
    let mut ctx = PollContext::default();

    loop {
        let interval = next_interval(&ctx);
        tokio::select! {
            changed = stop_rx.changed() => {
                if changed.is_err() || *stop_rx.borrow() {
                    break;
                }
            }
            _ = tokio::time::sleep(interval) => {
                tick(&app, &mut ctx).await;
            }
        }
    }
}

/// Pregame/in-game veulent une détection rapide (overlay réactif) ; le reste du temps
/// (hors-jeu, menu, désactivé, ou avant le premier tick) on peut se permettre d'espacer
/// les vérifications, il n'y a qu'une transition à guetter. Backlog #78 : hors-jeu
/// (lockfile absent, client fermé) durablement escalade encore vers `DEEP_IDLE_INTERVAL`
/// après `DEEP_IDLE_THRESHOLD` ticks — `Menu` reste à `IDLE_INTERVAL` puisque le client est
/// ouvert et une mise en file d'attente peut survenir à tout moment.
fn next_interval(ctx: &PollContext) -> Duration {
    match ctx.previous_state {
        Some(GameState::HorsJeu) if ctx.idle_ticks >= DEEP_IDLE_THRESHOLD => DEEP_IDLE_INTERVAL,
        Some(GameState::HorsJeu) | Some(GameState::Menu) => IDLE_INTERVAL,
        _ => ACTIVE_INTERVAL,
    }
}

#[derive(Default)]
struct PollContext {
    http: Option<reqwest::Client>,
    lockfile: Option<LockfileInfo>,
    local_puuid: Option<String>,
    region: Option<String>,
    /// Version du client Valorant, extraite de la presence (voir `client::fetch_game_state`)
    /// et requise en en-tête des appels GLZ du roster — mise en cache comme `region` car
    /// elle ne change pas d'un tick à l'autre pour une même session.
    client_version: Option<String>,
    previous_state: Option<GameState>,
    last_snapshot: Option<LiveSnapshot>,
    /// Échecs consécutifs de l'API locale (lockfile présent mais injoignable) — voir
    /// `on_local_api_failure`.
    local_failures: u32,
    /// Ticks consécutifs sans lockfile (client fermé) — voir `next_interval` et backlog #78.
    idle_ticks: u32,
    /// Roster mis en cache pour la phase de jeu en cours (pregame OU in-game) : le roster
    /// ne change pas une fois connu pour cette phase, pas besoin de refaire
    /// entitlements + 2 requêtes GLZ à chaque tick tant qu'on y est encore.
    roster_state: Option<GameState>,
    roster: Vec<LivePlayer>,
}

impl PollContext {
    /// Réinitialise tout le contexte de session (nouveau lockfile, ou reconnexion forcée
    /// après une série d'échecs) : client HTTP, identité locale, région détectée, roster
    /// en cache. Ne touche pas `previous_state`/`last_snapshot`, gérés par l'appelant.
    fn reset_session(&mut self) {
        self.http = None;
        self.lockfile = None;
        self.local_puuid = None;
        self.region = None;
        self.client_version = None;
        self.local_failures = 0;
        self.clear_roster();
    }

    fn clear_roster(&mut self) {
        self.roster_state = None;
        self.roster.clear();
    }
}

async fn tick(app: &AppHandle, ctx: &mut PollContext) {
    let settings = read_settings(app).await;
    let disabled = settings.riot_local_disabled;
    let default_region = settings.default_region.clone();

    if disabled {
        if ctx.previous_state.is_some() {
            crate::applog!("[riot_local] détection désactivée dans les réglages");
        }
        publish(app, ctx, &settings, LiveSnapshot::disabled());
        crate::overlay::window::hide_overlay(app);
        ctx.previous_state = None;
        ctx.clear_roster();
        return;
    }

    let lockfile = match lockfile::read_lockfile() {
        Ok(Some(info)) => info,
        other => {
            if ctx.previous_state != Some(GameState::HorsJeu) {
                crate::applog!("[riot_local] lockfile introuvable/illisible: {other:?}");
            }
            publish(app, ctx, &settings, LiveSnapshot::offline());
            crate::overlay::window::hide_overlay(app);
            ctx.previous_state = Some(GameState::HorsJeu);
            ctx.local_failures = 0;
            ctx.idle_ticks = ctx.idle_ticks.saturating_add(1);
            ctx.clear_roster();
            return;
        }
    };
    // Le lockfile est là : le client vient de (re)démarrer ou tournait déjà, dans les deux
    // cas on n'est plus dans le "long hors-jeu" que `DEEP_IDLE_INTERVAL` cible.
    ctx.idle_ticks = 0;

    // (Re)construit le client local et invalide le contexte si le Riot Client a
    // redémarré (port/mot de passe différents).
    if ctx.lockfile.as_ref() != Some(&lockfile) {
        ctx.reset_session();
        ctx.http = client::build_local_client().ok();
        ctx.lockfile = Some(lockfile.clone());
    }
    let Some(http) = ctx.http.clone() else { return };

    if ctx.local_puuid.is_none() {
        match client::fetch_local_puuid(&http, &lockfile).await {
            Ok(puuid) => {
                ctx.local_puuid = Some(puuid);
                ctx.local_failures = 0;
            }
            Err(err) => {
                crate::applog!("[riot_local] échec fetch_local_puuid: {err:#}");
                on_local_api_failure(app, ctx, &settings).await;
                return;
            }
        }
    }
    let Some(local_puuid) = ctx.local_puuid.clone() else {
        return;
    };

    let state = match client::fetch_game_state(&http, &lockfile, &local_puuid).await {
        Ok((state, client_version)) => {
            if let Some(client_version) = client_version {
                ctx.client_version = Some(client_version);
            }
            state
        }
        Err(err) => {
            crate::applog!("[riot_local] échec fetch_game_state: {err:#}");
            on_local_api_failure(app, ctx, &settings).await;
            return;
        }
    };
    ctx.local_failures = 0;

    if ctx.region.is_none() && matches!(state, GameState::Pregame | GameState::InGame) {
        ctx.region = client::fetch_deployment_region(&http, &lockfile)
            .await
            .ok()
            .flatten();
    }
    let region = ctx.region.clone().unwrap_or(default_region);

    // Roster best-effort, mis en cache par phase (voir doc de `PollContext::roster`) :
    // liste vide si les endpoints GLZ ne répondent pas comme attendu — l'overlay affiche
    // alors juste l'état de la partie.
    let players = match state {
        GameState::Pregame | GameState::InGame => {
            if ctx.roster_state == Some(state) && !ctx.roster.is_empty() {
                ctx.roster.clone()
            } else if let Some(client_version) = ctx.client_version.clone() {
                let fetched = match state {
                    GameState::Pregame => client::fetch_pregame_player_puuids(
                        &http,
                        &lockfile,
                        &local_puuid,
                        &region,
                        &client_version,
                    )
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .map(|puuid| LivePlayer {
                        puuid,
                        team: "ally".to_string(),
                    })
                    .collect::<Vec<_>>(),
                    GameState::InGame => {
                        let core_players = client::fetch_coregame_player_puuids(
                            &http,
                            &lockfile,
                            &local_puuid,
                            &region,
                            &client_version,
                        )
                        .await
                        .unwrap_or_default();
                        let own_team_id = core_players
                            .iter()
                            .find(|p| p.puuid == local_puuid)
                            .map(|p| p.team_id.clone());
                        core_players
                            .into_iter()
                            .map(|p| LivePlayer {
                                team: match &own_team_id {
                                    Some(own) if *own == p.team_id => "ally".to_string(),
                                    Some(_) => "enemy".to_string(),
                                    // Équipe locale inconnue (endpoint /players sans notre
                                    // propre entrée) : mieux vaut ne pas deviner que
                                    // d'étiqueter à tort un ennemi comme allié.
                                    None => "inconnu".to_string(),
                                },
                                puuid: p.puuid,
                            })
                            .collect()
                    }
                    _ => unreachable!(),
                };
                if fetched.is_empty() {
                    // Pas encore prêt côté GLZ (ex: juste après la transition) : on garde
                    // roster_state à None pour retenter au prochain tick sans rester
                    // bloqué sur un roster vide mis en cache.
                    Vec::new()
                } else {
                    ctx.roster_state = Some(state);
                    ctx.roster = fetched.clone();
                    fetched
                }
            } else {
                // Version du client pas encore connue (premier tick de la session) —
                // retentera dès qu'un tick aura lu la presence avec succès.
                Vec::new()
            }
        }
        _ => {
            ctx.clear_roster();
            Vec::new()
        }
    };

    if ctx.previous_state != Some(state) {
        crate::applog!(
            "[riot_local] transition {:?} -> {} (region={:?}, roster={})",
            ctx.previous_state.map(GameState::as_str),
            state.as_str(),
            region,
            players.len()
        );
    }

    on_state_changed(app, ctx.previous_state, state, ctx.local_puuid.as_deref()).await;
    ctx.previous_state = Some(state);

    publish(
        app,
        ctx,
        &settings,
        LiveSnapshot {
            state: state.as_str().to_string(),
            players,
            region: Some(region),
        },
    );
}

/// Après `MAX_LOCAL_FAILURES` échecs consécutifs vers l'API locale (lockfile présent mais
/// injoignable — typiquement un Riot Client qui a planté sans nettoyer son lockfile), on
/// republie l'état hors-jeu et on force une reconnexion complète (nouveau client HTTP,
/// nouvelle lecture du lockfile) au prochain tick, plutôt que de rester bloqué
/// indéfiniment sur le dernier état connu avec un overlay figé.
async fn on_local_api_failure(app: &AppHandle, ctx: &mut PollContext, settings: &crate::settings::AppSettings) {
    ctx.local_failures += 1;
    if ctx.local_failures < MAX_LOCAL_FAILURES {
        return;
    }

    publish(app, ctx, settings, LiveSnapshot::offline());
    crate::overlay::window::hide_overlay(app);
    ctx.previous_state = Some(GameState::HorsJeu);
    ctx.reset_session();
}

/// Réagit aux transitions : affiche/masque l'overlay, notifie la fin de partie. L'overlay
/// s'affiche en pregame (sélection d'agents, roster allié uniquement) et reste affiché
/// `IN_GAME_OVERLAY_DURATION` après le lancement de la manche (`InGame`) — le temps de
/// lire le roster ennemi, indisponible avant ce moment (voir `client::fetch_coregame_player_puuids`)
/// — avant de se masquer automatiquement : il peut sinon gêner le focus/la visée pendant
/// l'action (retour utilisateur : kills loupés à cause de l'overlay affiché pendant le
/// combat).
async fn on_state_changed(
    app: &AppHandle,
    previous: Option<GameState>,
    current: GameState,
    local_puuid: Option<&str>,
) {
    match current {
        GameState::Pregame => {
            crate::overlay::window::show_overlay(app).await;
        }
        GameState::InGame if previous != Some(GameState::InGame) => {
            crate::overlay::window::show_overlay(app).await;
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(IN_GAME_OVERLAY_DURATION).await;
                crate::overlay::window::hide_overlay(&app);
            });
        }
        GameState::InGame => {
            // Déjà en cours (ex: reconnexion de session) — ne relance pas le minuteur.
        }
        _ => {
            crate::overlay::window::hide_overlay(app);
        }
    }

    if previous == Some(GameState::InGame) && current == GameState::Menu {
        // Backlog #81 : dépose un lien "voir le récap" (historique du compte local), pris
        // par le handler de focus de la fenêtre principale (voir `main.rs`) — best-effort,
        // un puuid local inconnu ou une DB indisponible laisse juste la notification sans
        // lien plutôt que d'échouer la notification elle-même.
        if let (Some(puuid), Some(state)) = (local_puuid, app.try_state::<AppState>()) {
            if let Ok(conn) = state.db.try_lock() {
                if let Ok(Some(player)) = crate::db::find_tracked_player(&conn, puuid) {
                    if let Some(link_state) = app.try_state::<crate::riot_local::PostgameLinkState>() {
                        link_state.set(crate::riot_local::PostgameLink {
                            region: player.region,
                            name: player.name,
                            tag: player.tag,
                            set_at: chrono::Utc::now().timestamp(),
                        });
                    }
                }
            }
        }

        let _ = app
            .notification()
            .builder()
            .title("Partie terminée")
            .body("Tes stats seront à jour dans le tracker d'ici quelques minutes. Clique pour voir ton historique.")
            .show();
    }
}

/// Met à jour l'état partagé + émet l'event Tauri, uniquement si l'instantané change.
/// C'est aussi le seul point d'entrée qui pousse une mise à jour Rich Presence Discord
/// (voir `update_discord_presence`) : comme il ne s'exécute que sur un vrai changement
/// d'état, on évite de spammer l'IPC Discord à chaque tick (2,5-8s) pour rien.
fn publish(app: &AppHandle, ctx: &mut PollContext, settings: &crate::settings::AppSettings, snapshot: LiveSnapshot) {
    if ctx.last_snapshot.as_ref() == Some(&snapshot) {
        return;
    }
    ctx.last_snapshot = Some(snapshot.clone());

    if let Some(live) = app.try_state::<LiveState>() {
        if let Ok(mut guard) = live.0.lock() {
            *guard = snapshot.clone();
        }
    }
    update_discord_presence(app, settings, &snapshot);
    let _ = app.emit(STATE_EVENT, snapshot);
}

/// Traduit l'instantané de détection en Rich Presence Discord. `None` (RPC désactivée ou
/// aucun client_id configuré) efface l'activité plutôt que d'envoyer quoi que ce soit —
/// c'est une fonctionnalité opt-in (voir `settings::AppSettings::discord_rpc_enabled`).
fn update_discord_presence(app: &AppHandle, settings: &crate::settings::AppSettings, snapshot: &LiveSnapshot) {
    let Some(rpc) = app.try_state::<crate::discord_rpc::DiscordRpcHandle>() else {
        return;
    };

    let Some(client_id) = settings
        .discord_rpc_client_id
        .clone()
        .filter(|_| settings.discord_rpc_enabled)
    else {
        rpc.clear();
        return;
    };

    let (details, state_text) = presence_text(&snapshot.state, snapshot.region.as_deref());

    rpc.update(
        client_id,
        crate::discord_rpc::RpcActivity {
            details,
            state: state_text,
        },
    );
}

fn region_label(region: Option<&str>) -> String {
    match region {
        Some(region) => format!("Région : {}", region.to_uppercase()),
        None => "Partie en cours".to_string(),
    }
}

/// Traduit un état de partie + région en (details, state) Rich Presence — pur, testable
/// sans `AppHandle` ni `LiveSnapshot`.
fn presence_text(state: &str, region: Option<&str>) -> (String, String) {
    match state {
        "pregame" => ("Sélection des agents".to_string(), region_label(region)),
        "in_game" => ("En partie".to_string(), region_label(region)),
        "menu" => ("Dans le menu".to_string(), "En attente de partie".to_string()),
        _ => ("Valorant Tracker".to_string(), "Hors-jeu".to_string()),
    }
}

async fn read_settings(app: &AppHandle) -> crate::settings::AppSettings {
    let state = app.state::<AppState>();
    let conn = state.db.lock().await;
    crate::settings::load_settings(&conn).unwrap_or(crate::settings::AppSettings {
        henrik_api_key: None,
        henrik_api_key_set: false,
        default_region: "eu".to_string(),
        auto_update_enabled: false,
        riot_local_disabled: true,
        discord_rpc_enabled: false,
        discord_rpc_client_id: None,
        status_watcher_enabled: false,
        usage_metrics_enabled: false,
        ui_theme: "dark".to_string(),
        ui_accent: "red".to_string(),
        ui_language: "fr".to_string(),
        ui_density: "comfortable".to_string(),
        overlay_density: "detailed".to_string(),
        overlay_layout: "full".to_string(),
        loss_streak_alert_enabled: false,
        loss_streak_alert_count: 3,
        inactivity_reminder_enabled: false,
        inactivity_reminder_days: 3,
        notes_pin_enabled: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_interval_is_idle_when_out_of_game_or_in_menu() {
        let mut ctx = PollContext::default();
        ctx.previous_state = Some(GameState::HorsJeu);
        assert_eq!(next_interval(&ctx), IDLE_INTERVAL);
        ctx.previous_state = Some(GameState::Menu);
        assert_eq!(next_interval(&ctx), IDLE_INTERVAL);
    }

    #[test]
    fn next_interval_escalates_to_deep_idle_after_threshold_out_of_game() {
        let mut ctx = PollContext::default();
        ctx.previous_state = Some(GameState::HorsJeu);
        ctx.idle_ticks = DEEP_IDLE_THRESHOLD - 1;
        assert_eq!(next_interval(&ctx), IDLE_INTERVAL);
        ctx.idle_ticks = DEEP_IDLE_THRESHOLD;
        assert_eq!(next_interval(&ctx), DEEP_IDLE_INTERVAL);
        // Menu (client ouvert) ne doit jamais escalader, même avec le compteur haut.
        ctx.previous_state = Some(GameState::Menu);
        assert_eq!(next_interval(&ctx), IDLE_INTERVAL);
    }

    #[test]
    fn next_interval_is_active_when_pregame_ingame_or_unknown() {
        let mut ctx = PollContext::default();
        ctx.previous_state = Some(GameState::Pregame);
        assert_eq!(next_interval(&ctx), ACTIVE_INTERVAL);
        ctx.previous_state = Some(GameState::InGame);
        assert_eq!(next_interval(&ctx), ACTIVE_INTERVAL);
        ctx.previous_state = None;
        assert_eq!(next_interval(&ctx), ACTIVE_INTERVAL);
    }

    #[test]
    fn region_label_formats_known_region_uppercase() {
        assert_eq!(region_label(Some("eu")), "Région : EU");
    }

    #[test]
    fn region_label_falls_back_when_region_unknown() {
        assert_eq!(region_label(None), "Partie en cours");
    }

    #[test]
    fn presence_text_maps_each_known_state() {
        assert_eq!(
            presence_text("pregame", Some("eu")),
            ("Sélection des agents".to_string(), "Région : EU".to_string())
        );
        assert_eq!(
            presence_text("in_game", None),
            ("En partie".to_string(), "Partie en cours".to_string())
        );
        assert_eq!(
            presence_text("menu", None),
            ("Dans le menu".to_string(), "En attente de partie".to_string())
        );
    }

    #[test]
    fn presence_text_falls_back_for_unknown_or_offline_state() {
        assert_eq!(
            presence_text("hors_jeu", None),
            ("Valorant Tracker".to_string(), "Hors-jeu".to_string())
        );
        assert_eq!(
            presence_text("anything_else", None),
            ("Valorant Tracker".to_string(), "Hors-jeu".to_string())
        );
    }
}
