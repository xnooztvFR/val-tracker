//! Rich Presence Discord (V3) — best-effort, même philosophie que `riot_local` : IPC
//! local vers le client Discord desktop (named pipe sous Windows), aucune donnée envoyée
//! sur le réseau. Nécessite un client_id d'application Discord configuré par
//! l'utilisateur dans Paramètres (voir `settings::AppSettings::discord_rpc_client_id`) —
//! un simple ID d'application créée sur le Discord Developer Portal, pas de secret/token.
//!
//! Tourne sur un thread OS dédié (pas la runtime tokio) : `discord-rich-presence` est un
//! client IPC synchrone/bloquant, et l'isoler sur son propre thread évite tout souci de
//! `Send`/`Sync` du type de connexion sous-jacent vis-à-vis de l'état géré par Tauri.
//! Toute erreur (Discord non lancé, client_id invalide, pipe cassée) est absorbée : la
//! RPC est un bonus visuel, jamais un chemin critique de l'app.

use std::sync::mpsc::{channel, Sender};
use std::thread;

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::AppHandle;

use crate::diagnostics::{self, DISCORD_RPC};

/// Activité à afficher — `None` sur les champs optionnels pour ne pas fixer d'image tant
/// qu'on n'a pas d'assets uploadés côté Developer Portal (ceux-ci restent configurables
/// plus tard sans changer ce module).
pub struct RpcActivity {
    pub details: String,
    pub state: String,
}

enum RpcCommand {
    Update { client_id: String, activity: RpcActivity },
    Clear,
}

#[derive(Clone)]
pub struct DiscordRpcHandle {
    tx: Sender<RpcCommand>,
}

impl DiscordRpcHandle {
    /// Met à jour (ou établit) la Rich Presence pour ce `client_id`. Reconnecte
    /// automatiquement si le client_id a changé depuis le dernier appel ou si la
    /// connexion précédente est tombée.
    pub fn update(&self, client_id: String, activity: RpcActivity) {
        let _ = self.tx.send(RpcCommand::Update { client_id, activity });
    }

    /// Efface l'activité affichée (désactivation depuis Paramètres, ou app en arrière-plan
    /// sans partie détectée).
    pub fn clear(&self) {
        let _ = self.tx.send(RpcCommand::Clear);
    }
}

/// Démarre le thread IPC et renvoie un handle léger (clonable, juste un `Sender`) à
/// enregistrer comme état géré par Tauri. `app_handle` sert uniquement à alimenter le
/// registre de diagnostics (dernier tick/dernière erreur, voir `diagnostics.rs`) depuis ce
/// thread OS dédié, pas la runtime tokio.
pub fn spawn(app_handle: AppHandle) -> DiscordRpcHandle {
    let (tx, rx) = channel::<RpcCommand>();
    thread::spawn(move || run(rx, app_handle));
    DiscordRpcHandle { tx }
}

fn run(rx: std::sync::mpsc::Receiver<RpcCommand>, app_handle: AppHandle) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut connected_client_id: Option<String> = None;

    while let Ok(cmd) = rx.recv() {
        diagnostics::record_tick(&app_handle, DISCORD_RPC);
        match cmd {
            RpcCommand::Update { client_id, activity } => {
                if connected_client_id.as_deref() != Some(client_id.as_str()) {
                    if let Some(mut old) = client.take() {
                        let _ = old.close();
                    }
                    connected_client_id = None;
                    match connect(&client_id) {
                        Ok(c) => {
                            client = Some(c);
                            connected_client_id = Some(client_id);
                        }
                        Err(err) => {
                            crate::applog!("[discord_rpc] connexion IPC impossible (Discord lancé ? client_id valide ?): {err}");
                            diagnostics::record_error(&app_handle, DISCORD_RPC, &err);
                            continue;
                        }
                    }
                }

                let Some(c) = client.as_mut() else { continue };
                let payload = activity::Activity::new()
                    .details(&activity.details)
                    .state(&activity.state);

                if c.set_activity(payload).is_err() {
                    // Pipe cassée (Discord fermé/redémarré entre-temps) — on force une
                    // reconnexion propre au prochain Update plutôt que de rester bloqué
                    // sur une connexion morte.
                    let _ = c.close();
                    client = None;
                    connected_client_id = None;
                    diagnostics::record_error(&app_handle, DISCORD_RPC, "pipe IPC cassée (set_activity)");
                }
            }
            RpcCommand::Clear => {
                if let Some(c) = client.as_mut() {
                    let _ = c.clear_activity();
                }
            }
        }
    }
}

fn connect(client_id: &str) -> anyhow::Result<DiscordIpcClient> {
    let mut client = DiscordIpcClient::new(client_id);
    client
        .connect()
        .map_err(|e| anyhow::anyhow!("connexion IPC Discord: {e}"))?;
    Ok(client)
}
