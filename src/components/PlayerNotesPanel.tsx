import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import Panel from "./Panel";
import { isCommandError, PLAYER_TAGS, tauriApi, type PlayerTag } from "../lib/tauriApi";
import { useSettingsStore } from "../store/settingsStore";

interface PlayerNotesPanelProps {
  puuid: string;
  initialNotes: string | null;
  initialTags: PlayerTag[];
  /** TODO Fonctionnalités#10 : lien manuel vers un profil pro VLR connu de l'utilisateur —
   * pas de recherche automatique par nom (l'API Henrik n'expose aucun endpoint VLR par nom,
   * uniquement par `player_id` numérique). Croisé dans l'overlay contre les joueurs
   * détectés en partie. */
  initialVlrPlayerId?: number | null;
  initialVlrPlayerName?: string | null;
  /** TODO Fonctionnalités#19 : "mode spectateur ami" — suivi passif, opt-in par joueur.
   * Voir `friend_watcher.rs` pour la limite documentée (pas de vraie présence en direct,
   * seulement la détection d'un nouveau match dans l'historique). */
  initialFollowedFriend?: boolean;
}

const SAVE_DEBOUNCE_MS = 800;

/** Backlog #12 : note libre attachée à un joueur suivi (tags "smurf"/"toxique"/"duo
 * régulier"...), sauvegardée avec un léger debounce pendant la frappe.
 *
 * Backlog #99 : si `notes_pin_enabled` (Paramètres → Confidentialité), le contenu reste
 * masqué derrière un écran de saisie PIN tant que l'utilisateur ne l'a pas déverrouillé —
 * état local, pas persistant : redemandé à chaque remount (changement de profil via `key`
 * côté Home.tsx, ou fermeture/réouverture de l'app), pensé pour l'usage stream/écran
 * partagé plutôt que comme un vrai coffre-fort. */
export default function PlayerNotesPanel({
  puuid,
  initialNotes,
  initialTags,
  initialVlrPlayerId,
  initialVlrPlayerName,
  initialFollowedFriend,
}: PlayerNotesPanelProps) {
  const { t } = useTranslation("componentsExtra");
  const notesPinEnabled = useSettingsStore((s) => s.settings?.notes_pin_enabled ?? false);
  const [value, setValue] = useState(initialNotes ?? "");
  const [tags, setTags] = useState<PlayerTag[]>(initialTags);
  const [vlrPlayerIdInput, setVlrPlayerIdInput] = useState(
    initialVlrPlayerId != null ? String(initialVlrPlayerId) : "",
  );
  const [vlrPlayerNameInput, setVlrPlayerNameInput] = useState(initialVlrPlayerName ?? "");
  const [vlrSaved, setVlrSaved] = useState(true);
  const [followedFriend, setFollowedFriend] = useState(initialFollowedFriend ?? false);
  const [saved, setSaved] = useState(true);
  const [unlocked, setUnlocked] = useState(!notesPinEnabled);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinLockedSeconds, setPinLockedSeconds] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Le panneau est monté une fois par profil (puuid change entraîne un remount via `key`
  // côté Home.tsx) — pas besoin de resynchroniser `value` à chaque refetch de la liste.
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  function handleChange(next: string) {
    setValue(next);
    setSaved(false);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      await tauriApi.savePlayerNotes(puuid, next);
      setSaved(true);
    }, SAVE_DEBOUNCE_MS);
  }

  async function toggleTag(tag: PlayerTag) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    await tauriApi.savePlayerTags(puuid, next);
  }

  async function toggleFollowedFriend() {
    const next = !followedFriend;
    setFollowedFriend(next);
    await tauriApi.saveFollowedFriend(puuid, next);
  }

  async function handleSaveVlrLink() {
    const trimmedId = vlrPlayerIdInput.trim();
    const id = trimmedId ? Number(trimmedId) : null;
    const name = vlrPlayerNameInput.trim() || null;
    await tauriApi.saveVlrPlayerLink(puuid, Number.isFinite(id) ? id : null, name);
    setVlrSaved(true);
  }

  async function handleUnlock() {
    try {
      const ok = await tauriApi.verifyNotesPin(pinInput);
      if (ok) {
        setUnlocked(true);
        setPinInput("");
        setPinError(false);
        setPinLockedSeconds(null);
      } else {
        setPinError(true);
        setPinLockedSeconds(null);
      }
    } catch (err) {
      // Backlog sécurité : verrouillage temporaire après plusieurs échecs consécutifs
      // (voir settings.rs::verify_notes_pin), réutilise CommandError::RateLimited.
      if (isCommandError(err) && err.kind === "rate_limited") {
        setPinError(false);
        setPinLockedSeconds(err.retry_after_secs ?? null);
      } else {
        setPinError(true);
      }
    }
  }

  if (notesPinEnabled && !unlocked) {
    return (
      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="hud-label">{t("playerNotesPanel.title")}</p>
          <span className="text-[10px] text-lo">{t("playerNotesPanel.locked")}</span>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError(false);
              setPinLockedSeconds(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUnlock();
            }}
            placeholder={t("playerNotesPanel.pinPlaceholder")}
            className="w-24 border border-line bg-base px-2.5 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleUnlock}
            className="border border-line px-3 py-2 text-sm text-hi transition-colors hover:border-accent"
          >
            {t("playerNotesPanel.unlock")}
          </button>
        </div>
        {pinError && <p className="mt-2 text-xs text-crit">{t("playerNotesPanel.pinIncorrect")}</p>}
        {pinLockedSeconds !== null && (
          <p className="mt-2 text-xs text-crit">
            {t("playerNotesPanel.pinLocked", { seconds: pinLockedSeconds })}
          </p>
        )}
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="hud-label">{t("playerNotesPanel.title")}</p>
        <span className="text-[10px] text-lo">{saved ? t("playerNotesPanel.saved") : t("playerNotesPanel.saving")}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("playerNotesPanel.notesPlaceholder")}
        rows={3}
        maxLength={2000}
        className="w-full resize-none border border-line bg-base px-2.5 py-2 text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PLAYER_TAGS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`border px-2 py-1 text-[10px] uppercase tracking-hud transition-colors ${
                active ? "border-accent text-accent" : "border-line text-lo hover:border-accent/60 hover:text-hi"
              }`}
            >
              {t(`playerNotesPanel.tags.${tag}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-line pt-3">
        <p className="hud-label text-[10px] text-lo">{t("playerNotesPanel.vlrLinkTitle")}</p>
        <div className="flex gap-1.5">
          <input
            type="number"
            value={vlrPlayerIdInput}
            onChange={(e) => {
              setVlrPlayerIdInput(e.target.value);
              setVlrSaved(false);
            }}
            placeholder={t("playerNotesPanel.vlrLinkIdPlaceholder")}
            className="w-24 border border-line bg-base px-2 py-1.5 text-xs text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={vlrPlayerNameInput}
            onChange={(e) => {
              setVlrPlayerNameInput(e.target.value);
              setVlrSaved(false);
            }}
            placeholder={t("playerNotesPanel.vlrLinkNamePlaceholder")}
            className="flex-1 border border-line bg-base px-2 py-1.5 text-xs text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveVlrLink}
            className="hud-label border border-line px-2.5 py-1.5 text-[11px] text-hi transition-colors hover:border-accent disabled:opacity-50"
            disabled={vlrSaved}
          >
            {t("playerNotesPanel.vlrLinkSave")}
          </button>
        </div>
        <p className="text-[10px] text-lo">{t("playerNotesPanel.vlrLinkHint")}</p>
      </div>

      <div className="mt-3 space-y-1 border-t border-line pt-3">
        <label className="flex items-center gap-2.5 text-sm text-hi">
          <input
            type="checkbox"
            checked={followedFriend}
            onChange={toggleFollowedFriend}
            className="h-4 w-4 border-line bg-surface accent-accent"
          />
          {t("playerNotesPanel.followFriendLabel")}
        </label>
        <p className="text-[10px] text-lo">{t("playerNotesPanel.followFriendHint")}</p>
      </div>
    </Panel>
  );
}
