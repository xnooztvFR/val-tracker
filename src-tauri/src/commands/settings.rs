//! Réglages app (clé API Henrik, préférences UI/overlay, alertes, PIN des notes, démarrage
//! auto avec Windows, wizard d'onboarding).

use serde::Serialize;
use tauri::State;

use super::{ensure_one_of, CommandError};
use crate::api::henrik::HenrikError;
use crate::settings::AppSettings;
use crate::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, CommandError> {
    let conn = state.db.lock().await;
    Ok(crate::settings::load_settings(&conn)?)
}

#[derive(Debug, Serialize)]
pub struct PendingChangelog {
    version: String,
    notes: String,
}

/// Backlog #72 (fix) : écrit le changelog en attente côté Rust (SQLite) juste avant
/// `relaunch()` — voir doc de `settings::KEY_PENDING_CHANGELOG_VERSION` pour la raison
/// (remplace un `localStorage.setItem()` racy vis-à-vis du kill de process immédiat).
#[tauri::command]
pub async fn set_pending_changelog(
    state: State<'_, AppState>,
    version: String,
    notes: String,
) -> Result<(), CommandError> {
    crate::applog!("[changelog] set_pending_changelog appelé, version={version}");
    let conn = state.db.lock().await;
    crate::settings::set_pending_changelog(&conn, &version, &notes)?;
    crate::applog!("[changelog] set_pending_changelog écrit en base pour version={version}");
    Ok(())
}

/// Lit puis efface le changelog en attente (affichage unique) — appelé par
/// `ChangelogModal.tsx` au montage.
#[tauri::command]
pub async fn take_pending_changelog(
    state: State<'_, AppState>,
) -> Result<Option<PendingChangelog>, CommandError> {
    let conn = state.db.lock().await;
    let result = crate::settings::take_pending_changelog(&conn)?;
    crate::applog!(
        "[changelog] take_pending_changelog appelé, trouvé={}",
        result.is_some()
    );
    Ok(result.map(|(version, notes)| PendingChangelog { version, notes }))
}

/// Diagnostic (backlog #72) : trace côté Rust les étapes du flux `installNow` pour
/// comprendre pourquoi `set_pending_changelog` ne semble parfois jamais être appelé côté
/// JS malgré un clic sur "Installer maintenant" — le log frontend n'est pas visible à
/// l'utilisateur, alors que `val-tracker.log` (Paramètres > Journaux) l'est. À retirer une
/// fois le vrai problème identifié.
#[tauri::command]
pub async fn log_updater_trace(step: String) -> Result<(), CommandError> {
    crate::applog!("[updater-trace] {step}");
    Ok(())
}

#[tauri::command]
pub async fn save_henrik_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_henrik_api_key(&conn, api_key.trim())?;
    Ok(())
}

#[tauri::command]
pub async fn save_default_region(
    state: State<'_, AppState>,
    region: String,
) -> Result<(), CommandError> {
    // Superset des régions proposées par le frontend (REGIONS de lib/format.ts) : les
    // régions Henrik valides restent acceptées même si l'UI n'en liste que 4.
    ensure_one_of(&region, &["eu", "na", "ap", "kr", "latam", "br"], "region")?;
    let conn = state.db.lock().await;
    crate::settings::set_default_region(&conn, &region)?;
    Ok(())
}

#[tauri::command]
pub async fn save_auto_update_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_auto_update_enabled(&conn, enabled)?;
    Ok(())
}

/// V2 : active/désactive la détection automatique de partie + overlay. Le poller relit
/// ce réglage à chaque tick, pas besoin de redémarrer l'app.
#[tauri::command]
pub async fn save_riot_local_disabled(
    state: State<'_, AppState>,
    disabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_riot_local_disabled(&conn, disabled)?;
    Ok(())
}

/// V3 : active/désactive la Rich Presence Discord. Si on vient de désactiver, on efface
/// tout de suite l'activité affichée plutôt que d'attendre le prochain tick du poller.
#[tauri::command]
pub async fn save_discord_rpc_enabled(
    state: State<'_, AppState>,
    rpc: State<'_, crate::discord_rpc::DiscordRpcHandle>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_discord_rpc_enabled(&conn, enabled)?;
    if !enabled {
        rpc.clear();
    }
    Ok(())
}

#[tauri::command]
pub async fn save_discord_rpc_client_id(
    state: State<'_, AppState>,
    client_id: String,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_discord_rpc_client_id(&conn, &client_id)?;
    Ok(())
}

/// V3 : active/désactive le watcher de statut serveur/file d'attente en arrière-plan
/// (voir `status_watcher.rs`) — seul réglage qui déclenche un appel réseau périodique
/// même quand l'utilisateur ne regarde pas l'app, donc opt-in.
#[tauri::command]
pub async fn save_status_watcher_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_status_watcher_enabled(&conn, enabled)?;
    Ok(())
}

/// Backlog #50 : active/désactive l'accumulation locale de métriques d'usage (cache hit
/// rate, erreurs API) — opt-in, 100% local, voir `api::henrik::endpoints::
/// record_usage_if_enabled`.
#[tauri::command]
pub async fn save_usage_metrics_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_usage_metrics_enabled(&conn, enabled)?;
    Ok(())
}

/// Backlog #33 : `"dark"` | `"light"`.
#[tauri::command]
pub async fn save_ui_theme(state: State<'_, AppState>, theme: String) -> Result<(), CommandError> {
    ensure_one_of(&theme, &["dark", "light"], "theme")?;
    let conn = state.db.lock().await;
    crate::settings::set_ui_theme(&conn, &theme)?;
    Ok(())
}

/// Backlog #38 : `"red"` | `"cyan"` | `"violet"` | `"amber"`.
#[tauri::command]
pub async fn save_ui_accent(
    state: State<'_, AppState>,
    accent: String,
) -> Result<(), CommandError> {
    ensure_one_of(&accent, &["red", "cyan", "violet", "amber"], "accent")?;
    let conn = state.db.lock().await;
    crate::settings::set_ui_accent(&conn, &accent)?;
    Ok(())
}

/// Système multilangue : `"fr"` | `"en"`.
#[tauri::command]
pub async fn save_ui_language(
    state: State<'_, AppState>,
    language: String,
) -> Result<(), CommandError> {
    ensure_one_of(&language, &["fr", "en"], "language")?;
    let conn = state.db.lock().await;
    crate::settings::set_ui_language(&conn, &language)?;
    Ok(())
}

/// Backlog #66 : `"comfortable"` | `"compact"`.
#[tauri::command]
pub async fn save_ui_density(
    state: State<'_, AppState>,
    density: String,
) -> Result<(), CommandError> {
    ensure_one_of(&density, &["comfortable", "compact"], "density")?;
    let conn = state.db.lock().await;
    crate::settings::set_ui_density(&conn, &density)?;
    Ok(())
}

/// Backlog #31 : `"compact"` | `"detailed"`.
#[tauri::command]
pub async fn save_overlay_density(
    state: State<'_, AppState>,
    density: String,
) -> Result<(), CommandError> {
    ensure_one_of(&density, &["compact", "detailed"], "density")?;
    let conn = state.db.lock().await;
    crate::settings::set_overlay_density(&conn, &density)?;
    Ok(())
}

/// Backlog #75 : `"full"` | `"mini"`.
#[tauri::command]
pub async fn save_overlay_layout(
    state: State<'_, AppState>,
    layout: String,
) -> Result<(), CommandError> {
    ensure_one_of(&layout, &["full", "mini"], "layout")?;
    let conn = state.db.lock().await;
    crate::settings::set_overlay_layout(&conn, &layout)?;
    Ok(())
}

/// Backlog #24 : toggle + seuil de l'alerte "N défaites d'affilée" (comptes "à soi"
/// uniquement — voir `fetch_matches` pour le check déclenché après chaque refetch).
#[tauri::command]
pub async fn save_loss_streak_alert_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_loss_streak_alert_enabled(&conn, enabled)?;
    Ok(())
}

#[tauri::command]
pub async fn save_loss_streak_alert_count(
    state: State<'_, AppState>,
    count: i64,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_loss_streak_alert_count(&conn, count)?;
    Ok(())
}

/// Toggle + seuil de l'alerte sonore d'écart de rang adverse dans l'overlay (voir
/// `Overlay.tsx`).
#[tauri::command]
pub async fn save_rank_gap_alert_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_rank_gap_alert_enabled(&conn, enabled)?;
    Ok(())
}

#[tauri::command]
pub async fn save_rank_gap_alert_threshold(
    state: State<'_, AppState>,
    threshold: i64,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_rank_gap_alert_threshold(&conn, threshold)?;
    Ok(())
}

/// Backlog #32 : toggle + seuil (en jours) du rappel d'inactivité — voir
/// `inactivity_reminder.rs`.
#[tauri::command]
pub async fn save_inactivity_reminder_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_inactivity_reminder_enabled(&conn, enabled)?;
    Ok(())
}

#[tauri::command]
pub async fn save_inactivity_reminder_days(
    state: State<'_, AppState>,
    days: i64,
) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_inactivity_reminder_days(&conn, days)?;
    Ok(())
}

/// Teste une clé API Henrik candidate (pas forcément encore enregistrée) contre un
/// endpoint authentifié. Un 404 (joueur introuvable) compte comme "clé valide" : ça
/// prouve juste que l'authentification est passée.
#[tauri::command]
pub async fn verify_henrik_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<bool, CommandError> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Ok(false);
    }

    let auth = crate::api::henrik::HenrikAuth::Direct(api_key.to_string());
    match state.henrik.get_raw("/valorant/v2/account/Henrik/DEV", &auth).await {
        Ok(_) => Ok(true),
        Err(HenrikError::NotFound) => Ok(true),
        Err(HenrikError::Api { status: 401, .. }) | Err(HenrikError::Api { status: 403, .. }) => {
            Ok(false)
        }
        Err(err) => Err(err.into()),
    }
}

/// Active le verrou et enregistre `pin` (chiffré via DPAPI, voir `settings::set_notes_pin`).
/// `pin` vide rejeté ici plutôt que côté frontend seul — la commande reste la seule porte
/// d'entrée vers le stockage.
#[tauri::command]
pub async fn save_notes_pin(state: State<'_, AppState>, pin: String) -> Result<(), CommandError> {
    let pin = pin.trim();
    if pin.is_empty() {
        return Err(CommandError::Unknown {
            message: "le PIN ne peut pas être vide".to_string(),
        });
    }
    let conn = state.db.lock().await;
    crate::settings::set_notes_pin(&conn, pin)?;
    Ok(())
}

/// Désactive le verrou et efface le PIN enregistré.
#[tauri::command]
pub async fn clear_notes_pin(state: State<'_, AppState>) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::clear_notes_pin(&conn)?;
    Ok(())
}

/// Marque le wizard d'onboarding (`OnboardingWizard.tsx`) comme terminé — voir
/// `settings::KEY_ONBOARDING_COMPLETED`. Appelée au clic sur "Terminé" de la dernière étape.
#[tauri::command]
pub async fn mark_onboarding_completed(state: State<'_, AppState>) -> Result<(), CommandError> {
    let conn = state.db.lock().await;
    crate::settings::set_onboarding_completed(&conn, true)?;
    Ok(())
}

/// Vérifie `pin` contre celui enregistré — utilisé par `PlayerNotesPanel.tsx` pour
/// déverrouiller l'affichage des notes le temps de la session courante (pas de "déverrouillé"
/// persistant, cohérent avec l'usage stream/écran partagé visé par #99).
#[tauri::command]
pub async fn verify_notes_pin(state: State<'_, AppState>, pin: String) -> Result<bool, CommandError> {
    let conn = state.db.lock().await;
    match crate::settings::verify_notes_pin(&conn, pin.trim())? {
        crate::settings::NotesPinCheck::Verified(matched) => Ok(matched),
        // Réutilise CommandError::RateLimited (déjà géré côté frontend, ErrorState.tsx) pour
        // que l'utilisateur voie un délai d'attente plutôt qu'un simple "PIN incorrect"
        // trompeur pendant le cooldown de brute-force.
        crate::settings::NotesPinCheck::LockedOut { retry_after_secs } => {
            Err(CommandError::RateLimited {
                retry_after_secs: Some(retry_after_secs.max(0) as u64),
            })
        }
    }
}

/// Pas de champ dédié dans `AppSettings` : l'état de la tâche planifiée/clé de registre
/// gérée par le plugin fait déjà foi (`ManagerExt::autolaunch`), pas besoin de dupliquer un
/// flag en DB qui pourrait se désynchroniser (ex. l'utilisateur désactive le lancement au
/// démarrage depuis le Gestionnaire des tâches Windows directement).
#[tauri::command]
pub async fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, CommandError> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| CommandError::Unknown { message: e.to_string() })
}

#[tauri::command]
pub async fn save_autostart_enabled(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), CommandError> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    let result = if enabled { autolaunch.enable() } else { autolaunch.disable() };
    result.map_err(|e| CommandError::Unknown { message: e.to_string() })
}
