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
//!
//! Cas distinct observé en pratique (2026-07-14) : l'API locale répond `200` à chaque tick
//! (donc `MAX_LOCAL_FAILURES` ne se déclenche jamais) mais ne reflète plus jamais la vraie
//! partie en cours — `hors_jeu` en boucle alors que le joueur est en pregame/in-game. Seul
//! un redémarrage complet de l'app (nouveau process, nouveau client HTTP, nouvelle lecture
//! du lockfile) débloquait la détection, ce qui pointe vers une session/connexion figée côté
//! client local plutôt qu'un vrai état hors-jeu. `STUCK_RESET_THRESHOLD` reproduit cet effet
//! de redémarrage sans intervention utilisateur : après un nombre prolongé de ticks
//! consécutifs résolus en `hors_jeu` alors que le lockfile reste joignable, on force la même
//! reconnexion complète que `on_local_api_failure` (voir le bloc dédié dans `tick`).
//!
//! Suite constatée le même jour : ce mécanisme de reconnexion fonctionnait, mais mettait
//! jusqu'à ~2 minutes à se déclencher (`STUCK_RESET_THRESHOLD` ticks à `IDLE_INTERVAL`,
//! puisque l'état résolu hors_jeu bascule l'intervalle sur le rythme lent) — trop long pour
//! rattraper la toute première partie qui suit un lancement d'app si elle est plus courte
//! que ça. `STARTUP_GRACE_TICKS` force le rythme rapide (`ACTIVE_INTERVAL`) pendant un moment
//! après toute (re)connexion, même si l'état résolu est hors_jeu — l'API locale Riot met
//! parfois ce genre de délai à stabiliser sa présence de chat juste après un démarrage, sans
//! que ce soit un vrai hors-jeu confirmé ; autant le détecter vite plutôt que d'attendre au
//! rythme lent conçu pour un hors-jeu déjà établi de longue date.

use std::time::{Duration, Instant};

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
/// Nombre de ticks consécutifs résolus en `hors_jeu` (lockfile joignable, requêtes en
/// succès) au-delà duquel on force une reconnexion complète — voir la note de module sur le
/// cas du 2026-07-14. À `IDLE_INTERVAL` (8s/tick), ça représente environ 2 minutes.
const STUCK_RESET_THRESHOLD: u32 = 15;
/// Ticks restants à forcer `ACTIVE_INTERVAL` après toute (re)connexion, même si l'état
/// résolu est hors_jeu/menu — voir la note de module sur le délai de stabilisation de l'API
/// locale Riot après un démarrage. ~2 minutes à `ACTIVE_INTERVAL` (2,5s/tick), pour couvrir
/// le pire cas observé en pratique.
const STARTUP_GRACE_TICKS: u32 = 48;
/// Nombre de cycles de reconnexion complète consécutifs (voir `on_local_api_failure`) qui
/// ont eux-mêmes échoué immédiatement, à partir duquel on commence à espacer les tentatives
/// suivantes au lieu de retenter en boucle serrée à `ACTIVE_INTERVAL` — cas d'un Riot Client
/// qui répond de façon systématiquement cassée (ex. changement de format d'auth après un
/// patch, voir backlog sécurité).
const RECONNECT_BACKOFF_THRESHOLD: u32 = 2;
const RECONNECT_BACKOFF_BASE: Duration = Duration::from_secs(5);
const RECONNECT_BACKOFF_MAX: Duration = Duration::from_secs(120);
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
    if let Some(until) = ctx.reconnect_backoff_until {
        let now = Instant::now();
        if now < until {
            return until - now;
        }
    }
    if ctx.startup_grace_ticks > 0 {
        return ACTIVE_INTERVAL;
    }
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
    /// Ticks consécutifs résolus en `hors_jeu` alors que le lockfile reste joignable (API
    /// locale en succès) — voir `STUCK_RESET_THRESHOLD` et la note de module du 2026-07-14.
    stuck_ticks: u32,
    /// Compte à rebours de polling rapide forcé après une (re)connexion — voir
    /// `STARTUP_GRACE_TICKS` et `next_interval`. Décrémenté une fois par tick dans `tick`.
    startup_grace_ticks: u32,
    /// Cycles de reconnexion complète consécutifs qui ont eux-mêmes échoué immédiatement —
    /// PAS remis à zéro par `reset_session` (aussi appelée pour un simple changement de
    /// lockfile bénin) : seul un aller-retour API réellement réussi le fait (voir `tick`).
    reconnect_failures: u32,
    /// Deadline de backoff avant la prochaine tentative de reconnexion complète — voir
    /// `RECONNECT_BACKOFF_THRESHOLD`/`next_interval`.
    reconnect_backoff_until: Option<Instant>,
    /// Roster mis en cache pour la phase de jeu en cours (pregame OU in-game) : le roster
    /// ne change pas une fois connu pour cette phase, pas besoin de refaire
    /// entitlements + 2 requêtes GLZ à chaque tick tant qu'on y est encore.
    roster_state: Option<GameState>,
    roster: Vec<LivePlayer>,
    /// Overlay & détection en jeu (TODO#3, notification live d'ami) : dernier état "actif"
    /// connu (pregame/in-game = `true`) par puuid d'ami suivi — sert à ne notifier que sur
    /// la transition inactif → actif, pas à chaque tick tant que l'ami reste en partie. Voir
    /// `scan_followed_friends_presence`.
    friend_active: std::collections::HashMap<String, bool>,
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
        self.stuck_ticks = 0;
        self.startup_grace_ticks = STARTUP_GRACE_TICKS;
        self.clear_roster();
    }

    fn clear_roster(&mut self) {
        self.roster_state = None;
        self.roster.clear();
    }
}

/// Réplique désactivée dans les réglages (`riot_local_disabled`) : republie l'état
/// "disabled", masque l'overlay et réinitialise le contexte de transition. Renvoie `true`
/// si `tick` doit s'arrêter là (c'était bien le cas désactivé).
fn handle_disabled(app: &AppHandle, ctx: &mut PollContext, settings: &crate::settings::AppSettings) -> bool {
    if !settings.riot_local_disabled {
        return false;
    }
    if ctx.previous_state.is_some() {
        crate::applog!("[riot_local] détection désactivée dans les réglages");
    }
    publish(app, ctx, settings, LiveSnapshot::disabled());
    crate::overlay::window::hide_overlay(app);
    ctx.previous_state = None;
    ctx.clear_roster();
    true
}

/// Tente de lire le lockfile ; si absent/illisible, republie l'état hors-jeu et met à jour
/// les compteurs d'idle. Renvoie `None` dans ce cas (appelant doit s'arrêter là), sinon
/// `Some(lockfile)` et remet `ctx.idle_ticks` à zéro (client joignable).
fn handle_lockfile_read(
    app: &AppHandle,
    ctx: &mut PollContext,
    settings: &crate::settings::AppSettings,
) -> Option<LockfileInfo> {
    match lockfile::read_lockfile() {
        Ok(Some(info)) => {
            // Le lockfile est là : le client vient de (re)démarrer ou tournait déjà, dans
            // les deux cas on n'est plus dans le "long hors-jeu" que `DEEP_IDLE_INTERVAL` cible.
            ctx.idle_ticks = 0;
            Some(info)
        }
        other => {
            if ctx.previous_state != Some(GameState::HorsJeu) {
                crate::applog!("[riot_local] lockfile introuvable/illisible: {other:?}");
            }
            publish(app, ctx, settings, LiveSnapshot::offline());
            crate::overlay::window::hide_overlay(app);
            ctx.previous_state = Some(GameState::HorsJeu);
            ctx.local_failures = 0;
            ctx.idle_ticks = ctx.idle_ticks.saturating_add(1);
            ctx.clear_roster();
            None
        }
    }
}

async fn tick(app: &AppHandle, ctx: &mut PollContext) {
    crate::diagnostics::record_tick(app, crate::diagnostics::RIOT_LOCAL_POLLER);
    if ctx.startup_grace_ticks > 0 {
        ctx.startup_grace_ticks -= 1;
    }

    let settings = read_settings(app).await;
    let default_region = settings.default_region.clone();

    if handle_disabled(app, ctx, &settings) {
        return;
    }

    let Some(lockfile) = handle_lockfile_read(app, ctx, &settings) else {
        return;
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
            Err(err) => {
                crate::applog!("[riot_local] échec fetch_local_puuid: {err:#}");
                crate::diagnostics::record_error(app, crate::diagnostics::RIOT_LOCAL_POLLER, &err);
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
            crate::diagnostics::record_error(app, crate::diagnostics::RIOT_LOCAL_POLLER, &err);
            on_local_api_failure(app, ctx, &settings).await;
            return;
        }
    };
    ctx.local_failures = 0;
    // Aller-retour complet réussi : la session est réellement rétablie, plus besoin
    // d'espacer les prochaines tentatives de reconnexion.
    ctx.reconnect_failures = 0;
    ctx.reconnect_backoff_until = None;

    if state == GameState::HorsJeu {
        ctx.stuck_ticks = ctx.stuck_ticks.saturating_add(1);
        if ctx.stuck_ticks >= STUCK_RESET_THRESHOLD {
            crate::applog!(
                "[riot_local] hors_jeu prolongé malgré une API locale joignable ({} ticks) — reconnexion forcée",
                ctx.stuck_ticks
            );
            ctx.reset_session();
            publish(app, ctx, &settings, LiveSnapshot::offline());
            crate::overlay::window::hide_overlay(app);
            ctx.previous_state = Some(GameState::HorsJeu);
            return;
        }
    } else {
        ctx.stuck_ticks = 0;
    }

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
    let players = resolve_roster(&http, &lockfile, &local_puuid, &region, state, ctx).await;

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
    scan_followed_friends_presence(app, ctx, &settings).await;
    maybe_start_postgame_summary(app, ctx.previous_state, state, ctx.local_puuid.clone(), &settings);
    ctx.previous_state = Some(state);

    let api_health = if ctx.local_failures > 0 || ctx.stuck_ticks >= STUCK_RESET_THRESHOLD / 2 {
        "degraded".to_string()
    } else {
        "ok".to_string()
    };

    publish(
        app,
        ctx,
        &settings,
        LiveSnapshot {
            state: state.as_str().to_string(),
            players,
            region: Some(region),
            api_health,
        },
    );
}

/// Résout le roster (allié en pregame, allié+ennemi en in-game) pour l'état de jeu courant,
/// en réutilisant `ctx.roster` tant qu'il reste valide pour cette même phase (voir doc de
/// `PollContext::roster`). Hors pregame/in-game, vide le roster en cache et renvoie une
/// liste vide.
async fn resolve_roster(
    http: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
    state: GameState,
    ctx: &mut PollContext,
) -> Vec<LivePlayer> {
    match state {
        GameState::Pregame | GameState::InGame => {
            if ctx.roster_state == Some(state) && !ctx.roster.is_empty() {
                return ctx.roster.clone();
            }
            let Some(client_version) = ctx.client_version.clone() else {
                // Version du client pas encore connue (premier tick de la session) —
                // retentera dès qu'un tick aura lu la presence avec succès.
                return Vec::new();
            };

            let fetched = match state {
                GameState::Pregame => {
                    fetch_pregame_roster(http, lockfile, local_puuid, region, &client_version).await
                }
                GameState::InGame => {
                    fetch_ingame_roster(http, lockfile, local_puuid, region, &client_version).await
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
        _ => {
            ctx.clear_roster();
            Vec::new()
        }
    }
}

/// Roster allié de la phase de sélection d'agents (pregame) — voir
/// `client::fetch_pregame_player_puuids`.
async fn fetch_pregame_roster(
    http: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
    client_version: &str,
) -> Vec<LivePlayer> {
    client::fetch_pregame_player_puuids(http, lockfile, local_puuid, region, client_version)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|p| LivePlayer {
            puuid: p.puuid,
            team: "ally".to_string(),
            agent: super::agents::agent_name_from_character_id(&p.character_id).map(str::to_string),
        })
        .collect()
}

/// Roster complet (allié + ennemi) de la manche en cours (in-game) — voir
/// `client::fetch_coregame_player_puuids`.
async fn fetch_ingame_roster(
    http: &reqwest::Client,
    lockfile: &LockfileInfo,
    local_puuid: &str,
    region: &str,
    client_version: &str,
) -> Vec<LivePlayer> {
    let core_players =
        client::fetch_coregame_player_puuids(http, lockfile, local_puuid, region, client_version)
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
                // Équipe locale inconnue (endpoint /players sans notre propre entrée) :
                // mieux vaut ne pas deviner que d'étiqueter à tort un ennemi comme allié.
                None => "inconnu".to_string(),
            },
            puuid: p.puuid,
            // Le core-game n'expose pas le `CharacterID` par ce même endpoint
            // (contrairement au pregame) — pas nécessaire de toute façon, le contre-pick
            // ne s'affiche qu'en pregame.
            agent: None,
        })
        .collect()
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
    ctx.reconnect_failures = ctx.reconnect_failures.saturating_add(1);
    if ctx.reconnect_failures > RECONNECT_BACKOFF_THRESHOLD {
        let backoff = reconnect_backoff(ctx.reconnect_failures);
        crate::applog!(
            "[riot_local] {} reconnexions consécutives en échec — backoff de {backoff:?} avant nouvelle tentative",
            ctx.reconnect_failures
        );
        ctx.reconnect_backoff_until = Some(Instant::now() + backoff);
    }
    ctx.reset_session();
}

/// Backoff exponentiel plafonné (base `RECONNECT_BACKOFF_BASE`, doublement par échec
/// au-delà de `RECONNECT_BACKOFF_THRESHOLD`, plafonné à `RECONNECT_BACKOFF_MAX`).
fn reconnect_backoff(failures: u32) -> Duration {
    // Plafonne l'exposant avant `pow` : au-delà d'une vingtaine de doublements la valeur
    // dépasse déjà largement RECONNECT_BACKOFF_MAX, pas besoin d'aller jusqu'à l'overflow de
    // `u64` pour un nombre d'échecs consécutifs qui n'a de toute façon aucune limite haute.
    let exponent = failures.saturating_sub(RECONNECT_BACKOFF_THRESHOLD).min(20);
    let millis = RECONNECT_BACKOFF_BASE.as_millis() as u64 * 2u64.saturating_pow(exponent);
    Duration::from_millis(millis).min(RECONNECT_BACKOFF_MAX)
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
            crate::overlay::window::show_secondary_overlay_if_configured(app).await;
        }
        GameState::InGame if previous != Some(GameState::InGame) => {
            crate::overlay::window::show_overlay(app).await;
            crate::overlay::window::show_secondary_overlay_if_configured(app).await;
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(IN_GAME_OVERLAY_DURATION).await;
                crate::overlay::window::hide_overlay(&app);
                // Le second overlay (écran dédié, pas de gêne pour la visée) reste affiché
                // toute la manche — pas de minuteur d'auto-masquage comme l'overlay principal.
            });
        }
        GameState::InGame => {
            // Déjà en cours (ex: reconnexion de session) — ne relance pas le minuteur.
        }
        _ => {
            crate::overlay::window::hide_overlay(app);
            crate::overlay::window::hide_secondary_overlay(app);
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

/// Overlay & détection en jeu (TODO#3) : scanne `chat/v4/presences` (déjà appelé pour
/// l'état local, voir `client::fetch_game_state`) à la recherche des amis suivis
/// (`db::list_followed_friends`) qui viennent d'entrer en pregame/in-game — notification OS
/// + event `riot-local://friend-live` pour l'overlay, uniquement sur la transition inactif →
/// actif (voir `PollContext::friend_active`) pour ne pas renotifier à chaque tick tant que
/// l'ami reste en partie. Best-effort complet : aucune requête réseau si la fonctionnalité
/// est désactivée ou qu'aucun ami n'est suivi.
async fn scan_followed_friends_presence(
    app: &AppHandle,
    ctx: &mut PollContext,
    settings: &crate::settings::AppSettings,
) {
    if !settings.friend_live_notify_enabled {
        return;
    }
    let (Some(http), Some(lockfile)) = (ctx.http.clone(), ctx.lockfile.clone()) else {
        return;
    };
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let friends = {
        let conn = state.db.lock().await;
        crate::db::list_followed_friends(&conn).unwrap_or_default()
    };
    if friends.is_empty() {
        return;
    }

    let Ok(presences) = client::fetch_all_valorant_presences(&http, &lockfile).await else {
        return;
    };

    for friend in friends {
        let is_active = presences
            .iter()
            .find(|(puuid, _)| *puuid == friend.puuid)
            .map(|(_, loop_state)| matches!(loop_state.as_deref(), Some("PREGAME") | Some("INGAME")))
            .unwrap_or(false);
        let was_active = ctx.friend_active.get(&friend.puuid).copied().unwrap_or(false);
        ctx.friend_active.insert(friend.puuid.clone(), is_active);
        if is_active && !was_active {
            let _ = app
                .notification()
                .builder()
                .title("Un ami suivi lance une partie")
                .body(format!("{}#{} vient d'entrer en partie", friend.name, friend.tag))
                .show();
            let _ = app.emit(
                super::FRIEND_LIVE_EVENT,
                super::FriendLiveEvent {
                    name: friend.name,
                    tag: friend.tag,
                },
            );
        }
    }
}

/// Overlay & détection en jeu (TODO#3) : déclenche la récupération best-effort du résumé de
/// fin de partie sur la transition in-game → menu — même condition que la notification de
/// fin de partie existante (voir plus bas dans `on_state_changed`), respecte le toggle
/// `overlay_postgame_summary_enabled`.
fn maybe_start_postgame_summary(
    app: &AppHandle,
    previous: Option<GameState>,
    current: GameState,
    local_puuid: Option<String>,
    settings: &crate::settings::AppSettings,
) {
    if !settings.overlay_postgame_summary_enabled {
        return;
    }
    if !(previous == Some(GameState::InGame) && current == GameState::Menu) {
        return;
    }
    let Some(local_puuid) = local_puuid else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        fetch_and_emit_postgame_summary(app, local_puuid).await;
    });
}

/// Tentatives espacées de `POSTGAME_SUMMARY_RETRY_DELAY` — le match qui vient de se
/// terminer n'est pas forcément déjà ingéré côté Henrik au moment de la transition (voir la
/// même limite déjà documentée pour `PostgameLink`/la notification de fin de partie).
const POSTGAME_SUMMARY_MAX_ATTEMPTS: u32 = 5;
const POSTGAME_SUMMARY_RETRY_DELAY: Duration = Duration::from_secs(20);

async fn fetch_and_emit_postgame_summary(app: AppHandle, local_puuid: String) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let (player, api_key) = {
        let conn = state.db.lock().await;
        let player = crate::db::find_tracked_player(&conn, &local_puuid).ok().flatten();
        let api_key = crate::settings::get_henrik_api_key(&conn).ok().flatten();
        (player, api_key)
    };
    let (Some(player), Some(api_key)) = (player, api_key) else {
        return;
    };

    for attempt in 0..POSTGAME_SUMMARY_MAX_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(POSTGAME_SUMMARY_RETRY_DELAY).await;
        }
        let result = crate::api::henrik::endpoints::get_matches(
            &state.db,
            &state.henrik,
            Some(&api_key),
            &player.region,
            &player.name,
            &player.tag,
            1,
            attempt > 0,
        )
        .await;
        let Ok(fetched) = result else { continue };
        let Some(latest) = fetched.data.first() else { continue };
        let Some(match_player) = latest
            .players
            .iter()
            .find(|p| p.puuid.as_deref() == Some(local_puuid.as_str()))
        else {
            continue;
        };
        let won = match_player
            .team_id
            .as_deref()
            .and_then(|team_id| latest.teams.iter().find(|t| t.team_id.as_deref() == Some(team_id)))
            .and_then(|t| t.won);
        let summary = super::PostgameSummary {
            agent: match_player.agent.as_ref().and_then(|a| a.name.clone()),
            map: latest.metadata.map.as_ref().and_then(|m| m.name.clone()),
            kills: match_player.stats.as_ref().and_then(|s| s.kills).unwrap_or(0),
            deaths: match_player.stats.as_ref().and_then(|s| s.deaths).unwrap_or(0),
            assists: match_player.stats.as_ref().and_then(|s| s.assists).unwrap_or(0),
            won,
        };
        let _ = app.emit(super::POSTGAME_SUMMARY_EVENT, summary);
        return;
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
        discord_webhook_enabled: false,
        discord_webhook_url: None,
        status_watcher_enabled: false,
        usage_metrics_enabled: false,
        ui_theme: "dark".to_string(),
        ui_accent: "red".to_string(),
        ui_language: "fr".to_string(),
        ui_density: "comfortable".to_string(),
        overlay_density: "detailed".to_string(),
        overlay_layout: "full".to_string(),
        overlay_monitor: "auto".to_string(),
        loss_streak_alert_enabled: false,
        loss_streak_alert_count: 3,
        win_streak_alert_enabled: false,
        win_streak_alert_count: 3,
        rank_change_alert_enabled: true,
        rank_gap_alert_enabled: false,
        rank_gap_alert_threshold: 9,
        inactivity_reminder_enabled: false,
        inactivity_reminder_days: 3,
        notes_pin_enabled: false,
        onboarding_completed: true,
        henrik_api_key_dpapi_unreadable: false,
        notes_pin_dpapi_unreadable: false,
        shortcut_overlay_toggle: crate::settings::DEFAULT_SHORTCUT_OVERLAY_TOGGLE.to_string(),
        shortcut_main_window_toggle: crate::settings::DEFAULT_SHORTCUT_MAIN_WINDOW_TOGGLE
            .to_string(),
        ui_font: "display".to_string(),
        presentation_mode_enabled: false,
        wallpaper_enabled: false,
        hud_sounds_enabled: true,
        hud_sounds_volume: 15,
        cursor_enabled: false,
        icon_style: "official".to_string(),
        overlay_secondary_monitor: "none".to_string(),
        overlay_postgame_summary_enabled: true,
        overlay_postgame_summary_autodismiss_secs: 8,
        friend_live_notify_enabled: true,
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
    fn reset_session_clears_stuck_ticks() {
        let mut ctx = PollContext::default();
        ctx.stuck_ticks = STUCK_RESET_THRESHOLD;
        ctx.reset_session();
        assert_eq!(ctx.stuck_ticks, 0);
    }

    #[test]
    fn reset_session_arms_startup_grace() {
        let mut ctx = PollContext::default();
        assert_eq!(ctx.startup_grace_ticks, 0);
        ctx.reset_session();
        assert_eq!(ctx.startup_grace_ticks, STARTUP_GRACE_TICKS);
    }

    #[test]
    fn next_interval_stays_active_during_startup_grace_even_when_hors_jeu() {
        let mut ctx = PollContext::default();
        ctx.previous_state = Some(GameState::HorsJeu);
        ctx.startup_grace_ticks = 1;
        assert_eq!(next_interval(&ctx), ACTIVE_INTERVAL);
        ctx.startup_grace_ticks = 0;
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

    #[test]
    fn reconnect_backoff_stays_at_base_below_threshold() {
        assert_eq!(reconnect_backoff(1), RECONNECT_BACKOFF_BASE);
        assert_eq!(reconnect_backoff(RECONNECT_BACKOFF_THRESHOLD), RECONNECT_BACKOFF_BASE);
    }

    #[test]
    fn reconnect_backoff_grows_then_caps() {
        let first_over = reconnect_backoff(RECONNECT_BACKOFF_THRESHOLD + 1);
        let second_over = reconnect_backoff(RECONNECT_BACKOFF_THRESHOLD + 2);
        assert!(first_over > RECONNECT_BACKOFF_BASE);
        assert!(second_over > first_over);
        assert_eq!(reconnect_backoff(1000), RECONNECT_BACKOFF_MAX);
    }

    #[test]
    fn next_interval_honors_active_reconnect_backoff() {
        let mut ctx = PollContext::default();
        ctx.reconnect_backoff_until = Some(Instant::now() + Duration::from_secs(30));
        let interval = next_interval(&ctx);
        assert!(interval > Duration::from_secs(20) && interval <= Duration::from_secs(30));
    }
}
