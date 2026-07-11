import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useSettingsStore } from "../store/settingsStore";
import { tauriApi, type UsageMetricsSummary } from "../lib/tauriApi";
import { REGIONS } from "../lib/format";
import { useUpdater } from "../hooks/useUpdater";
import StatCard from "../components/StatCard";

type VerifyState = "idle" | "checking" | "valid" | "invalid" | "error";
type Category =
  | "general"
  | "appearance"
  | "overlay"
  | "discord"
  | "notifications"
  | "updates"
  | "crosshair"
  | "shortcuts"
  | "data"
  | "logs"
  | "health"
  | "about";

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "general", label: "Général" },
  { id: "appearance", label: "Apparence" },
  { id: "overlay", label: "Overlay en jeu" },
  { id: "discord", label: "Discord" },
  { id: "notifications", label: "Notifications" },
  { id: "updates", label: "Mises à jour" },
  { id: "crosshair", label: "Crosshair" },
  { id: "shortcuts", label: "Raccourcis" },
  { id: "data", label: "Données locales" },
  { id: "logs", label: "Logs" },
  { id: "health", label: "Santé" },
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
    setUsageMetricsEnabled,
    setUiTheme,
    setUiAccent,
    setOverlayDensity,
    setLossStreakAlertEnabled,
    setLossStreakAlertCount,
    setInactivityReminderEnabled,
    setInactivityReminderDays,
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
        {category === "appearance" && (
          <AppearanceSection
            theme={settings?.ui_theme ?? "dark"}
            accent={settings?.ui_accent ?? "red"}
            onChangeTheme={setUiTheme}
            onChangeAccent={setUiAccent}
          />
        )}
        {category === "overlay" && (
          <OverlaySection
            disabled={settings?.riot_local_disabled ?? false}
            onChange={setRiotLocalDisabled}
            density={settings?.overlay_density ?? "detailed"}
            onChangeDensity={setOverlayDensity}
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
            lossStreakAlertEnabled={settings?.loss_streak_alert_enabled ?? false}
            lossStreakAlertCount={settings?.loss_streak_alert_count ?? 3}
            onChangeLossStreakAlertEnabled={setLossStreakAlertEnabled}
            onChangeLossStreakAlertCount={setLossStreakAlertCount}
            inactivityReminderEnabled={settings?.inactivity_reminder_enabled ?? false}
            inactivityReminderDays={settings?.inactivity_reminder_days ?? 3}
            onChangeInactivityReminderEnabled={setInactivityReminderEnabled}
            onChangeInactivityReminderDays={setInactivityReminderDays}
          />
        )}
        {category === "updates" && (
          <UpdatesSection
            enabled={settings?.auto_update_enabled ?? true}
            onChange={setAutoUpdateEnabled}
          />
        )}
        {category === "crosshair" && <CrosshairSection />}
        {category === "shortcuts" && <ShortcutsSection />}
        {category === "data" && <DataSection />}
        {category === "logs" && <LogsSection />}
        {category === "health" && (
          <HealthSection
            enabled={settings?.usage_metrics_enabled ?? false}
            onChange={setUsageMetricsEnabled}
          />
        )}
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
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
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

const THEMES: Array<{ id: string; label: string }> = [
  { id: "dark", label: "Sombre (défaut)" },
  { id: "light", label: "Clair" },
];

const ACCENTS: Array<{ id: string; label: string; swatch: string }> = [
  { id: "red", label: "Rouge (défaut)", swatch: "#FF3B4E" },
  { id: "cyan", label: "Cyan", swatch: "#7CE8D3" },
  { id: "violet", label: "Violet", swatch: "#A672E0" },
  { id: "amber", label: "Ambre", swatch: "#D4AF37" },
];

function AppearanceSection({
  theme,
  accent,
  onChangeTheme,
  onChangeAccent,
}: {
  theme: string;
  accent: string;
  onChangeTheme: (theme: string) => Promise<void>;
  onChangeAccent: (accent: string) => Promise<void>;
}) {
  return (
    <div className="max-w-xl space-y-6">
      <SectionTitle>Apparence</SectionTitle>

      <section className="space-y-2">
        <h2 className="hud-label">Thème</h2>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTheme(t.id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                theme === t.id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">Couleur d'accent</h2>
        <p className="text-xs text-lo">
          Identité HUD par défaut en rouge — quelques variantes disponibles sans casser le
          reste du design (coins coupés, typographie, contrastes).
        </p>
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChangeAccent(a.id)}
              className={`flex items-center gap-2 border px-3 py-2 text-sm transition-colors ${
                accent === a.id ? "border-hi text-hi" : "border-line text-lo hover:text-hi"
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: a.swatch }}
              />
              {a.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function OverlaySection({
  disabled,
  onChange,
  density,
  onChangeDensity,
}: {
  disabled: boolean;
  onChange: (disabled: boolean) => Promise<void>;
  density: string;
  onChangeDensity: (density: string) => Promise<void>;
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
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        Activer la détection automatique de partie et l'overlay
      </label>

      <section className="space-y-2">
        <h2 className="hud-label">Densité d'affichage</h2>
        <div className="flex gap-2">
          {OVERLAY_DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onChangeDensity(d.id)}
              className={`border px-4 py-2 text-sm transition-colors ${
                density === d.id
                  ? "border-accent text-hi"
                  : "border-line text-lo hover:border-line hover:text-hi"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-lo">
          « Compact » n'affiche que le badge de rang des joueurs détectés ; « Détaillé »
          (défaut) ajoute le nom du rang et le RR.
        </p>
      </section>

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

const OVERLAY_DENSITIES: Array<{ id: string; label: string }> = [
  { id: "compact", label: "Compact" },
  { id: "detailed", label: "Détaillé (défaut)" },
];

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
          className="h-4 w-4 border-line bg-surface accent-accent"
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
            className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
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
  lossStreakAlertEnabled,
  lossStreakAlertCount,
  onChangeLossStreakAlertEnabled,
  onChangeLossStreakAlertCount,
  inactivityReminderEnabled,
  inactivityReminderDays,
  onChangeInactivityReminderEnabled,
  onChangeInactivityReminderDays,
}: {
  statusWatcherEnabled: boolean;
  onChangeStatusWatcher: (enabled: boolean) => Promise<void>;
  lossStreakAlertEnabled: boolean;
  lossStreakAlertCount: number;
  onChangeLossStreakAlertEnabled: (enabled: boolean) => Promise<void>;
  onChangeLossStreakAlertCount: (count: number) => Promise<void>;
  inactivityReminderEnabled: boolean;
  inactivityReminderDays: number;
  onChangeInactivityReminderEnabled: (enabled: boolean) => Promise<void>;
  onChangeInactivityReminderDays: (days: number) => Promise<void>;
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
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          Me notifier des incidents et changements de file d'attente sur ma région par
          défaut
        </label>
        <p className="text-xs text-lo">
          Seul réglage (avec le rappel d'inactivité ci-dessous) qui déclenche un appel réseau
          périodique même quand tu ne regardes pas l'app (toutes les{" "}
          {"~3 min, respecte le cache/rate limiter existant"}) — désactivé par défaut, à toi
          de l'activer si tu veux être alerté en tâche de fond.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">Série de défaites</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={lossStreakAlertEnabled}
            onChange={(e) => onChangeLossStreakAlertEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          Me notifier après plusieurs défaites d'affilée
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={20}
            value={lossStreakAlertCount}
            onChange={(e) => onChangeLossStreakAlertCount(Number(e.target.value))}
            disabled={!lossStreakAlertEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">défaites d'affilée</span>
        </div>
        <p className="text-xs text-lo">
          Vérifié sur tes comptes marqués « à soi » (voir TopNav) à chaque consultation de
          l'historique de matchs — pas d'appel réseau dédié.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="hud-label">Rappel d'inactivité</h2>
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={inactivityReminderEnabled}
            onChange={(e) => onChangeInactivityReminderEnabled(e.target.checked)}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          Me rappeler si je n'ai pas consulté mes stats depuis un moment
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-lo">Après</span>
          <input
            type="number"
            min={1}
            max={30}
            value={inactivityReminderDays}
            onChange={(e) => onChangeInactivityReminderDays(Number(e.target.value))}
            disabled={!inactivityReminderEnabled}
            className={`w-20 disabled:opacity-50 ${INPUT_CLASS}`}
          />
          <span className="text-sm text-lo">jours sans consulter un compte « à soi »</span>
        </div>
        <p className="text-xs text-lo">
          Rappel doux, jamais plus d'une fois par jour — nécessite au moins un compte marqué
          « à soi » (voir TopNav → sélecteur de comptes).
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
          className="h-4 w-4 border-line bg-surface accent-accent"
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
          className="btn-clip bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969] disabled:opacity-50"
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

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  {
    keys: "Ctrl+Shift+V",
    description:
      "Bascule l'overlay en jeu entre mode click-through (affichage seul) et mode interactif (déplaçable à la souris).",
  },
  {
    keys: "Ctrl+K",
    description:
      "Ouvre la palette de commande (Rechercher un joueur, aller à un écran, sauter vers un joueur récent/favori). Fenêtre principale uniquement.",
  },
];

function ShortcutsSection() {
  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>Raccourcis clavier</SectionTitle>
      <p className="text-sm text-lo">
        Liste centralisée de tous les raccourcis clavier de l'app. D'autres pourront s'y
        ajouter au fil des futures versions.
      </p>

      <div className="divide-y divide-line border border-line">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-start gap-4 px-4 py-3">
            <span className="hud-label shrink-0 border border-line bg-surface px-2 py-1 font-mono text-[11px] text-hi">
              {s.keys}
            </span>
            <p className="text-sm text-lo">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthSection({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const [summary, setSummary] = useState<UsageMetricsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSummary(await tauriApi.getUsageMetricsSummary());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  const totalRequests = (summary?.cache_hits ?? 0) + (summary?.network_fetches ?? 0);
  const hitRate = totalRequests > 0 ? Math.round(((summary?.cache_hits ?? 0) / totalRequests) * 100) : 0;

  return (
    <div className="max-w-3xl space-y-4">
      <SectionTitle>Santé de l'app</SectionTitle>
      <p className="text-sm text-lo">
        Dashboard 100% local (taux de cache hit, erreurs API des 7 derniers jours) — rien
        n'est jamais envoyé nulle part, ça reste dans ta base SQLite locale.
      </p>

      <label className="flex items-center gap-2.5 text-sm text-hi">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 border-line bg-surface accent-accent"
        />
        Accumuler ces métriques localement
      </label>
      <p className="text-xs text-lo">
        Désactivé par défaut : ajoute une petite écriture SQLite à chaque appel Henrik pour
        compter les évènements, activable uniquement si tu veux ce suivi.
      </p>

      {enabled && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
            >
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Taux de cache hit (7j)"
              value={`${hitRate}%`}
              hint={`${summary?.cache_hits ?? 0} / ${totalRequests} requêtes servies depuis le cache`}
              gaugePercent={hitRate}
              gaugeColor="#7CE8D3"
            />
            <StatCard
              label="Appels réseau (7j)"
              value={String(summary?.network_fetches ?? 0)}
              hint="Cache manqué ou périmé, requête Henrik effectuée"
            />
            <StatCard
              label="Erreurs API (7j)"
              value={String(summary?.api_errors ?? 0)}
              hint="Rate limit, circuit breaker, panne réseau..."
            />
          </div>
        </>
      )}
    </div>
  );
}

function LogsSection() {
  const [snapshot, setSnapshot] = useState<{ path: string | null; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  async function load() {
    setLoading(true);
    try {
      setSnapshot(await tauriApi.getRecentLogs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCopy() {
    if (!snapshot?.content) return;
    await navigator.clipboard.writeText(snapshot.content);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <SectionTitle>Logs</SectionTitle>
      <p className="text-sm text-lo">
        Dernières entrées du fichier de log local de l'app — utile pour du support/debug
        sans avoir à fouiller <span className="font-mono text-xs">%APPDATA%</span> à la main.
      </p>
      {snapshot?.path && (
        <p className="font-mono text-xs text-lo/70 break-all">{snapshot.path}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!snapshot?.content}
          className="border border-line px-4 py-2 font-display text-xs font-semibold uppercase tracking-hud text-hi transition-colors hover:bg-surface disabled:opacity-50"
        >
          {copyState === "copied" ? "Copié !" : "Copier"}
        </button>
      </div>

      <pre className="max-h-[60vh] overflow-auto border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-lo">
        {snapshot?.content ? snapshot.content : "Aucun log pour l'instant."}
      </pre>
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
