import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useSettingsStore } from "../store/settingsStore";
import { tauriApi } from "../lib/tauriApi";
import { REGIONS } from "../lib/format";
import { useUpdater } from "../hooks/useUpdater";

type VerifyState = "idle" | "checking" | "valid" | "invalid" | "error";
type Category =
  | "general"
  | "overlay"
  | "discord"
  | "notifications"
  | "updates"
  | "crosshair"
  | "data"
  | "about";

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "general", label: "Général" },
  { id: "overlay", label: "Overlay en jeu" },
  { id: "discord", label: "Discord" },
  { id: "notifications", label: "Notifications" },
  { id: "updates", label: "Mises à jour" },
  { id: "crosshair", label: "Crosshair" },
  { id: "data", label: "Données locales" },
  { id: "about", label: "À propos" },
];

function isCategory(value: string | null): value is Category {
  return CATEGORIES.some((c) => c.id === value);
}

export default function Settings() {
  const {
    settings,
    refresh,
    setApiKey,
    setDefaultRegion,
    setAutoUpdateEnabled,
    setRiotLocalDisabled,
    setDiscordRpcEnabled,
    setDiscordRpcClientId,
    setStatusWatcherEnabled,
  } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("section");
  const [category, setCategory] = useState<Category>(
    isCategory(initialCategory) ? initialCategory : "general",
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-line bg-base p-4">
        <p className="hud-label mb-3 px-3">Paramètres</p>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`relative block w-full px-3 py-2 text-left text-sm font-medium transition-colors ${
              category === c.id ? "bg-surface text-hi" : "text-lo hover:bg-surface/60 hover:text-hi"
            }`}
          >
            {category === c.id && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
            {c.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        {category === "general" && (
          <GeneralSection
            apiKeySet={settings?.henrik_api_key_set ?? false}
            savedApiKey={settings?.henrik_api_key ?? ""}
            defaultRegion={settings?.default_region ?? "eu"}
            onSaveApiKey={setApiKey}
            onSaveRegion={setDefaultRegion}
          />
        )}
        {category === "overlay" && (
          <OverlaySection
            disabled={settings?.riot_local_disabled ?? false}
            onChange={setRiotLocalDisabled}
          />
        )}
        {category === "discord" && (
          <DiscordSection
            enabled={settings?.discord_rpc_enabled ?? false}
            clientId={settings?.discord_rpc_client_id ?? ""}
            onChangeEnabled={setDiscordRpcEnabled}
            onSaveClientId={setDiscordRpcClientId}
          />
        )}
        {category === "notifications" && (
          <NotificationsSection
            statusWatcherEnabled={settings?.status_watcher_enabled ?? false}
            onChangeStatusWatcher={setStatusWatcherEnabled}
          />
        )}
        {category === "updates" && (
          <UpdatesSection
            enabled={settings?.auto_update_enabled ?? false}
            onChange={setAutoUpdateEnabled}
          />
        )}
        {category === "crosshair" && <CrosshairSection />}
        {category === "data" && <DataSection />}
        {category === "about" && <AboutSection />}
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "border border-line bg-surface px-3 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-lg font-bold uppercase tracking-hud text-hi">{children}</h1>;
}

function GeneralSection({
  apiKeySet,
  savedApiKey,
  defaultRegion,
  onSaveApiKey,
  onSaveRegion,
}: {
  apiKeySet: boolean;
  savedApiKey: string;
  defaultRegion: string;
  onSaveApiKey: (key: string) => Promise<void>;
  onSaveRegion: (region: string) => Promise<void>;
}) {
  const [apiKeyInput, setApiKeyInput] = useState(savedApiKey);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setApiKeyInput(savedApiKey);
  }, [savedApiKey]);

  async function handleVerify() {
    if (!apiKeyInput.trim()) return;
    setVerifyState("checking");
    try {
      const valid = await tauriApi.verifyHenrikApiKey(apiKeyInput.trim());
      setVerifyState(valid ? "valid" : "invalid");
    } catch {
      setVerifyState("error");
    }
  }

  async function handleSaveKey() {
    await onSaveApiKey(apiKeyInput.trim());
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <SectionTitle>Général</SectionTitle>
        <p className="mt-1 text-sm text-lo">
          {apiKeySet ? "Clé API Henrik configurée." : "Aucune clé API Henrik configurée."}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="hud-label">Clé API Henrik</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setVerifyState("idle");
            }}
            placeholder="Colle ta clé API Henrik ici"
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={!apiKeyInput.trim() || verifyState === "checking"}
            className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {verifyState === "checking" ? "Vérification…" : "Vérifier"}
          </button>
          <button
            type="button"
            onClick={handleSaveKey}
            disabled={!apiKeyInput.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#96F0DF] disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>

        {verifyState === "valid" && <p className="text-sm text-accent">Clé valide.</p>}
        {verifyState === "invalid" && (
          <p className="text-sm text-crit">Clé invalide — vérifie qu'elle est correcte.</p>
        )}
        {verifyState === "error" && (
          <p className="text-sm text-crit">Impossible de vérifier la clé (panne réseau ?).</p>
        )}
        {saveState === "saved" && <p className="text-sm text-accent">Clé enregistrée.</p>}

        <p className="text-xs text-lo">
          Obtiens une clé sur le Discord de Henrik Dev. Elle n'est jamais envoyée ailleurs qu'à
          l'API Henrik et reste stockée uniquement sur cette machine.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">Région par défaut</h2>
        <select value={defaultRegion} onChange={(e) => onSaveRegion(e.target.value)} className={INPUT_CLASS}>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}

function OverlaySection({
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (disabled: boolean) => Promise<void>;
}) {
  const [shortcutRegistered, setShortcutRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    tauriApi
      .getOverlayShortcutStatus()
      .then(setShortcutRegistered)
      .catch(() => setShortcutRegistered(null));
  }, []);

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Overlay en jeu</SectionTitle>
      <p className="text-sm text-lo">
        Détecte automatiquement une partie en cours via l'API locale du Riot Client et affiche
        un overlay always-on-top avec le rank des joueurs du lobby. Aucune injection dans le
        jeu : uniquement une fenêtre superposée. Fonctionne en « plein écran sans bordure »
        (le plein écran exclusif peut masquer l'overlay).
      </p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={!disabled}
          onChange={(e) => onChange(!e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-[#7CE8D3]"
        />
        Activer la détection automatique de partie et l'overlay
      </label>

      {shortcutRegistered === false && (
        <div className="relative border border-crit/30 bg-crit/5 py-2.5 pl-4 pr-3 text-xs text-hi">
          <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
          <p className="hud-label !text-crit">Raccourci indisponible</p>
          <p className="mt-1 text-lo">
            <span className="font-mono text-hi">Ctrl+Shift+V</span> est déjà utilisé par une
            autre application sur cette machine (souvent un raccourci "coller sans
            formatage"). L'overlay reste cliquable au travers, mais impossible de le
            déplacer tant que ce conflit n'est pas résolu — libère le raccourci ailleurs puis
            redémarre l'app.
          </p>
        </div>
      )}

      <div className="panel-clip-sm space-y-1.5 p-3 text-xs text-lo">
        <p>
          <span className="hud-label mr-2 text-[10px]">Raccourci</span>
          <span className="font-mono text-hi">Ctrl+Shift+V</span> — bascule l'overlay entre
          click-through (transparent aux clics) et interactif (déplaçable). Sa position est
          mémorisée d'une session à l'autre.
        </p>
        <p>
          Cette détection s'appuie sur une API locale non officielle de Riot : si elle devient
          indisponible (y compris en cours de partie, ex. plantage du client Riot), l'app
          repasse silencieusement en mode recherche manuelle.
        </p>
      </div>
    </div>
  );
}

function DiscordSection({
  enabled,
  clientId,
  onChangeEnabled,
  onSaveClientId,
}: {
  enabled: boolean;
  clientId: string;
  onChangeEnabled: (enabled: boolean) => Promise<void>;
  onSaveClientId: (clientId: string) => Promise<void>;
}) {
  const [input, setInput] = useState(clientId);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setInput(clientId);
  }, [clientId]);

  async function handleSave() {
    await onSaveClientId(input.trim());
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Rich Presence Discord</SectionTitle>
      <p className="text-sm text-lo">
        Affiche automatiquement ce que tu fais dans le tracker (partie en cours, sélection
        d'agents, région) comme statut Discord. Purement local : une connexion IPC directe
        vers ton client Discord desktop, aucune donnée envoyée sur le réseau.
      </p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChangeEnabled(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-[#7CE8D3]"
        />
        Activer la Rich Presence Discord
      </label>

      <section className="space-y-2">
        <h2 className="hud-label">Client ID de l'application Discord</h2>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="123456789012345678"
            className={`flex-1 font-mono ${INPUT_CLASS}`}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!input.trim()}
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#96F0DF] disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
        {saveState === "saved" && <p className="text-sm text-accent">Client ID enregistré.</p>}
        <p className="text-xs text-lo">
          Crée une application (gratuite) sur le{" "}
          <span className="font-mono text-hi">Discord Developer Portal</span> et colle son
          « Application ID » ici — pas de secret ni de token, juste un identifiant public.
        </p>
      </section>

      <div className="panel-clip-sm space-y-1.5 p-3 text-xs text-lo">
        <p>
          Best-effort, comme la détection de partie : si Discord n'est pas lancé ou que le
          client_id est invalide, la Rich Presence reste simplement inactive, sans erreur
          bloquante.
        </p>
      </div>
    </div>
  );
}

function NotificationsSection({
  statusWatcherEnabled,
  onChangeStatusWatcher,
}: {
  statusWatcherEnabled: boolean;
  onChangeStatusWatcher: (enabled: boolean) => Promise<void>;
}) {
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Notifications</SectionTitle>

      <section className="space-y-2">
        <h2 className="hud-label">Changement de rank</h2>
        <p className="text-sm text-lo">
          Toujours active : une notification native s'affiche dès qu'une montée/descente de
          rank est détectée en consultant un profil (promotion, dérank). Aucun réglage
          nécessaire — ça ne déclenche aucun appel réseau supplémentaire, ça observe juste ce
          que l'app récupère déjà.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">Statut serveur &amp; file d'attente</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={statusWatcherEnabled}
            onChange={(e) => onChangeStatusWatcher(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-[#7CE8D3]"
          />
          Me notifier des incidents et changements de file d'attente sur ma région par
          défaut
        </label>
        <p className="text-xs text-lo">
          Seul réglage qui déclenche un appel réseau périodique même quand tu ne regardes pas
          l'app (toutes les {"~3 min, respecte le cache/rate limiter existant"}) — désactivé
          par défaut, à toi de l'activer si tu veux être alerté en tâche de fond.
        </p>
      </section>
    </div>
  );
}

function UpdatesSection({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const { status, version, error, checkNow, installNow } = useUpdater();

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Mises à jour</SectionTitle>
      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-[#7CE8D3]"
        />
        Vérifier automatiquement les mises à jour au démarrage
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => checkNow()}
          disabled={status === "checking" || status === "downloading"}
          className="border border-line px-3 py-1.5 text-xs text-hi hover:bg-surface disabled:opacity-50"
        >
          {status === "checking" ? "Vérification…" : "Vérifier maintenant"}
        </button>
        {status === "up-to-date" && (
          <span className="text-xs text-lo">Version actuelle à jour.</span>
        )}
        {status === "available" && (
          <button
            type="button"
            onClick={() => installNow()}
            className="border border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
          >
            Installer la version {version}
          </button>
        )}
        {status === "downloading" && (
          <span className="text-xs text-lo">Téléchargement en cours…</span>
        )}
        {status === "error" && <span className="text-xs text-crit">Erreur : {error}</span>}
      </div>

      <p className="text-xs text-lo">
        Les mises à jour sont distribuées via GitHub Releases et signées (updater +
        Authenticode). Sans certificat de signature de code payant, Windows SmartScreen peut
        afficher un avertissement à l'installation malgré la signature.
      </p>
    </div>
  );
}

function CrosshairSection() {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setState("loading");
    setPreview(null);
    try {
      const base64 = await tauriApi.fetchCrosshairPreview(code.trim());
      setPreview(`data:image/png;base64,${base64}`);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Aperçu de crosshair</SectionTitle>
      <p className="text-sm text-lo">
        Colle un code de crosshair Valorant (copié depuis le jeu ou une vidéo/config
        partagée) pour prévisualiser son rendu sans lancer le jeu.
      </p>

      <form onSubmit={handlePreview} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="0;s;1;P;c;1;o;1;..."
          className={`flex-1 font-mono ${INPUT_CLASS}`}
        />
        <button
          type="submit"
          disabled={!code.trim() || state === "loading"}
          className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#96F0DF] disabled:opacity-50"
        >
          {state === "loading" ? "Génération…" : "Prévisualiser"}
        </button>
      </form>

      {state === "error" && (
        <p className="text-sm text-crit">Impossible de générer l'aperçu — vérifie le code et ta clé API.</p>
      )}

      {preview && (
        <div className="panel-clip flex items-center justify-center bg-[#0B0E11] p-8">
          <img src={preview} alt="Aperçu du crosshair" className="max-h-40" />
        </div>
      )}
    </div>
  );
}

function DataSection() {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");

  async function handleReset() {
    const confirmed = window.confirm(
      "Effacer le cache local, l'historique de rank et l'historique de recherche ? Cette action est irréversible (les réglages sont conservés).",
    );
    if (!confirmed) return;

    setStatus("working");
    try {
      await tauriApi.resetLocalStats();
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Données locales</SectionTitle>
      <p className="text-sm text-lo">
        L'app garde une copie locale (cache SQLite) de tes recherches, du cache API et de
        l'historique de progression de rank pour rester rapide et fonctionner hors-ligne en
        repli.
      </p>

      <div className="relative border border-crit/30 bg-crit/5 p-4">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-crit" />
        <h2 className="text-sm font-semibold text-hi">Effacer le cache et l'historique local</h2>
        <p className="mt-1 text-xs text-lo">
          Supprime le cache API, l'historique de progression de rank et l'historique de
          recherche. Ta clé API et tes préférences sont conservées.
        </p>
        <button
          type="button"
          onClick={handleReset}
          disabled={status === "working"}
          className="mt-3 border border-crit/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-crit transition-colors hover:bg-crit/10 disabled:opacity-50"
        >
          {status === "working" ? "Suppression…" : "Supprimer"}
        </button>
        {status === "done" && <p className="mt-2 text-sm text-accent">Données effacées.</p>}
        {status === "error" && <p className="mt-2 text-sm text-crit">Échec de la suppression.</p>}
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="max-w-xl space-y-2">
      <SectionTitle>À propos</SectionTitle>
      <p className="text-sm text-lo">Valorant Tracker v0.1.0 — build Tauri 2.x</p>
      <p className="text-xs text-lo">
        Données de rank et de matchs fournies par l'API Henrik Dev. N'est ni développé ni
        approuvé par Riot Games.
      </p>
    </div>
  );
}
