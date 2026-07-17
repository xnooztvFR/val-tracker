import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { usePinnedTabsStore, type PinnedPlayer } from "../store/pinnedTabsStore";
import { useAccount, useMmr } from "../hooks/usePlayer";
import { rankInfo } from "../lib/format";
import { readMatchDragPayload } from "../lib/matchDrag";
import { tauriApi } from "../lib/tauriApi";

/** Backlog Fonctionnalités#1 : barre flottante en bas à droite listant les profils
 * épinglés (max 3, voir pinnedTabsStore) — accès en un clic sans quitter l'écran courant,
 * contrairement à l'écran Compare (/vs) qui est un formulaire de comparaison figé. Masquée
 * en mode focus/mini (voir App.tsx) comme le reste du chrome. */
export default function FloatingSessionTabs() {
  const pinned = usePinnedTabsStore((s) => s.pinned);
  if (pinned.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-1.5">
      {pinned.map((p) => (
        <PinnedTabChip key={`${p.region}-${p.name}-${p.tag}`} player={p} />
      ))}
    </div>
  );
}

function PinnedTabChip({ player }: { player: PinnedPlayer }) {
  const { t } = useTranslation("componentsCore");
  const navigate = useNavigate();
  const remove = usePinnedTabsStore((s) => s.remove);
  const [dropHover, setDropHover] = useState(false);

  const account = useAccount(player.name, player.tag);
  const puuid = account.data?.data.puuid;
  const mmr = useMmr({ puuid, region: player.region, name: player.name, tag: player.tag });
  const info = rankInfo(mmr.data?.data.current_data?.currenttier);

  // Backlog Fonctionnalités#6 : dépose d'un match sur un profil épinglé — ajoute une
  // référence au match dans la note libre de ce profil (`TrackedPlayer.notes`, voir
  // PlayerNotesPanel.tsx). `savePlayerNotes` écrase tout le champ (pas d'API d'ajout côté
  // Rust) : on relit la liste des profils suivis pour repartir de la note existante plutôt
  // que de l'écraser.
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropHover(false);
    const payload = readMatchDragPayload(e.dataTransfer);
    if (!payload || !puuid) return;
    const tracked = await tauriApi.listTrackedPlayers(200);
    const current = tracked.find((p) => p.puuid === puuid)?.notes ?? "";
    const reference = `[Match] ${payload.mapName || "?"} — ${payload.region}/${payload.name}#${payload.tag}`;
    const next = current ? `${current}\n${reference}` : reference;
    await tauriApi.savePlayerNotes(puuid, next);
  }

  return (
    <div
      className={`panel-clip-sm pointer-events-auto flex items-center gap-2 bg-surface py-1.5 pl-3 pr-1.5 shadow-lg transition-colors ${
        dropHover ? "ring-1 ring-inset ring-accent" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropHover(true);
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={handleDrop}
    >
      <button
        type="button"
        onClick={() => navigate(`/joueur/${player.region}/${player.name}/${player.tag}`)}
        className="flex items-center gap-2"
      >
        <img src={info.iconUrl} alt="" className="h-5 w-5 object-contain" />
        <span className="text-xs text-hi">
          <span className="font-medium">{player.name}</span>
          <span className="text-lo">#{player.tag}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => remove(player)}
        aria-label={t("floatingTabs.unpin")}
        title={t("floatingTabs.unpin")}
        className="flex h-5 w-5 shrink-0 items-center justify-center text-lo/60 transition-colors hover:text-crit"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
