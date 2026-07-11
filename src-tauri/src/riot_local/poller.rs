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
use super::{LiveSnapshot, LiveState};
use crate::AppState;

const ACTIVE_INTERVAL: Duration = Duration::from_millis(2500);
const IDLE_INTERVAL: Duration = Duration::from_millis(8000);
const MAX_LOCAL_FAILURES: u32 = 3;
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
/// les vérifications, il n'y a qu'une transition à guetter.
fn next_interval(ctx: &PollContext) -> Duration {
    match ctx.previous_state {
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
    previous_state: Option<GameState>,
    last_snapshot: Option<LiveSnapshot>,
    /// Échecs consécutifs de l'API locale (lockfile présent mais injoignable) — voir
    /// `on_local_api_failure`.
    local_failures: u32,
    /// Roster mis en cache pour la phase de jeu en cours (pregame OU in-game) : le roster
    /// ne change pas une fois connu pour cette phase, pas besoin de refaire
    /// entitlements + 2 requêtes GLZ à chaque tick tant qu'on y est encore.
    roster_state: Option<GameState>,
    roster: Vec<String>,
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
        publish(app, ctx, &settings, LiveSnapshot::disabled());
        crate::overlay::window::hide_overlay(app);
        ctx.previous_state = None;
        ctx.clear_roster();
        return;
    }

    let lockfile = match lockfile::read_lockfile() {
        Ok(Some(info)) => info,
        _ => {
            publish(app, ctx, &settings, LiveSnapshot::offline());
            crate::overlay::window::hide_overlay(app);
            ctx.previous_state = Some(GameState::HorsJeu);
            ctx.local_failures = 0;
            ctx.clear_roster();
            return;
        }
    };

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
            Err(_) => {
                on_local_api_failure(app, ctx, &settings).await;
                return;
            }
        }
    }
    let Some(local_puuid) = ctx.local_puuid.clone() else {
        return;
    };

    let state = match client::fetch_game_state(&http, &lockfile, &local_puuid).await {
        Ok(state) => state,
        Err(_) => {
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
            } else {
                let fetched = match state {
                    GameState::Pregame => {
                        client::fetch_pregame_player_puuids(&http, &lockfile, &local_puuid, &region)
                            .await
                            .unwrap_or_default()
                    }
                    GameState::InGame => {
                        client::fetch_coregame_player_puuids(&http, &lockfile, &local_puuid, &region)
                            .await
                            .unwrap_or_default()
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
            }
        }
        _ => {
            ctx.clear_roster();
            Vec::new()
        }
    };

    on_state_changed(app, ctx.previous_state, state).await;
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

/// Réagit aux transitions : affiche/masque l'overlay, notifie la fin de partie.
async fn on_state_changed(app: &AppHandle, previous: Option<GameState>, current: GameState) {
    match current {
        GameState::Pregame | GameState::InGame => {
            crate::overlay::window::show_overlay(app).await;
        }
        _ => {
            crate::overlay::window::hide_overlay(app);
        }
    }

    if previous == Some(GameState::InGame) && current == GameState::Menu {
        let _ = app
            .notification()
            .builder()
            .title("Partie terminée")
            .body("Tes stats seront à jour dans le tracker d'ici quelques minutes.")
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

    let (details, state_text) = match snapshot.state.as_str() {
        "pregame" => ("Sélection des agents".to_string(), region_label(snapshot)),
        "in_game" => ("En partie".to_string(), region_label(snapshot)),
        "menu" => ("Dans le menu".to_string(), "En attente de partie".to_string()),
        _ => ("Valorant Tracker".to_string(), "Hors-jeu".to_string()),
    };

    rpc.update(
        client_id,
        crate::discord_rpc::RpcActivity {
            details,
            state: state_text,
        },
    );
}

fn region_label(snapshot: &LiveSnapshot) -> String {
    match snapshot.region.as_deref() {
        Some(region) => format!("Région : {}", region.to_uppercase()),
        None => "Partie en cours".to_string(),
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
    })
}
