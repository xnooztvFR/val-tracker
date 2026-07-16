//! Registre partagé des tâches de fond (poller riot_local, status watcher, rappel
//! d'inactivité, thread Discord RPC) — dernier tick / dernière erreur de chacune,
//! consultable depuis Paramètres → Diagnostics. Ces tâches tournent indépendamment,
//! best-effort partout (une panne dans l'une ne doit jamais affecter les autres ni l'app),
//! ce qui les rendait auparavant invisibles sans aller lire le fichier de log brut.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Identifiants stables des tâches de fond suivies — toujours renvoyés par `snapshot`
/// même avant leur premier tick, pour que l'UI affiche "jamais" plutôt que de faire
/// disparaître une tâche qui n'a simplement pas encore eu l'occasion de tourner.
pub const RIOT_LOCAL_POLLER: &str = "riot_local_poller";
pub const STATUS_WATCHER: &str = "status_watcher";
pub const INACTIVITY_REMINDER: &str = "inactivity_reminder";
pub const DISCORD_RPC: &str = "discord_rpc";
pub const FRIEND_WATCHER: &str = "friend_watcher";

const KNOWN_TASKS: [&str; 5] =
    [RIOT_LOCAL_POLLER, STATUS_WATCHER, INACTIVITY_REMINDER, DISCORD_RPC, FRIEND_WATCHER];

#[derive(Debug, Clone, Serialize, Default)]
pub struct TaskDiagnostic {
    pub name: &'static str,
    pub last_tick_at: Option<i64>,
    pub last_error: Option<String>,
    pub last_error_at: Option<i64>,
}

#[derive(Default)]
pub struct TaskRegistry(Mutex<HashMap<&'static str, TaskDiagnostic>>);

impl TaskRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<&'static str, TaskDiagnostic>> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn record_tick(&self, task: &'static str) {
        let mut map = self.lock();
        let diag = map.entry(task).or_insert_with(|| TaskDiagnostic { name: task, ..Default::default() });
        diag.last_tick_at = Some(chrono::Utc::now().timestamp());
    }

    pub fn record_error(&self, task: &'static str, error: impl std::fmt::Display) {
        let mut map = self.lock();
        let diag = map.entry(task).or_insert_with(|| TaskDiagnostic { name: task, ..Default::default() });
        diag.last_error = Some(error.to_string());
        diag.last_error_at = Some(chrono::Utc::now().timestamp());
    }

    pub fn snapshot(&self) -> Vec<TaskDiagnostic> {
        let map = self.lock();
        KNOWN_TASKS
            .iter()
            .map(|name| {
                map.get(name).cloned().unwrap_or_else(|| TaskDiagnostic { name, ..Default::default() })
            })
            .collect()
    }
}

/// Enregistre un tick depuis un `AppHandle` — no-op si le registre n'est pas (encore)
/// managé, ce qui ne devrait arriver qu'avant la fin de `main.rs::setup`.
pub fn record_tick(app: &AppHandle, task: &'static str) {
    if let Some(registry) = app.try_state::<TaskRegistry>() {
        registry.record_tick(task);
    }
}

pub fn record_error(app: &AppHandle, task: &'static str, error: impl std::fmt::Display) {
    if let Some(registry) = app.try_state::<TaskRegistry>() {
        registry.record_error(task, error);
    }
}
