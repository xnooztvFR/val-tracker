import { useQueueStatus } from "../hooks/useMeta";
import Panel from "./Panel";

const KNOWN_MODES = ["competitive", "unrated", "swiftplay", "spikerush", "deathmatch"];

/** Bandeau compact d'état des files d'attente Riot pour la région du joueur — utile pour
 * distinguer "je n'ai pas de partie" d'une file désactivée côté serveur. */
export default function QueueStatusStrip({ region }: { region: string | undefined }) {
  const queueStatus = useQueueStatus(region);
  const entries = queueStatus.data?.data ?? [];
  const known = entries.filter((e) => e.mode_id && KNOWN_MODES.includes(e.mode_id));

  if (known.length === 0) return null;

  return (
    <Panel className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <p className="hud-label shrink-0 text-[10px]">Files d'attente</p>
      {known.map((entry) => (
        <span key={entry.mode_id} className="flex items-center gap-1.5 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full ${entry.enabled ? "bg-accent" : "bg-crit"}`} />
          <span className={entry.enabled ? "text-hi" : "text-lo line-through"}>{entry.mode ?? entry.mode_id}</span>
        </span>
      ))}
    </Panel>
  );
}
