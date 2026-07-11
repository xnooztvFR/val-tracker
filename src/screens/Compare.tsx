import { useMemo, useState } from "react";

import { useAccount } from "../hooks/usePlayer";
import { useMatches } from "../hooks/useMatches";
import { Skeleton } from "../components/Skeleton";
import Panel from "../components/Panel";
import ErrorState from "../components/ErrorState";
import SampleSizeSwitch, { type SampleSize } from "../components/SampleSizeSwitch";
import { computeOverview, type Overview } from "../lib/stats";
import { formatPercent, REGIONS, splitRiotId } from "../lib/format";

interface Side {
  region: string;
  name: string;
  tag: string;
}

/** Backlog #11 : comparaison côte à côte de deux Riot ID sur le même échantillon de
 * matchs — aucune donnée persistée, tout vit dans l'état local de cet écran. */
export default function Compare() {
  const [sampleSize, setSampleSize] = useState<SampleSize>(20);
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [regionA, setRegionA] = useState("eu");
  const [regionB, setRegionB] = useState("eu");
  const [sideA, setSideA] = useState<Side | null>(null);
  const [sideB, setSideB] = useState<Side | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedA = splitRiotId(inputA);
    const parsedB = splitRiotId(inputB);
    if (!parsedA || !parsedB) {
      setFormError("Format attendu pour les deux joueurs : pseudo#tag");
      return;
    }
    setFormError(null);
    setSideA({ region: regionA, name: parsedA.name, tag: parsedA.tag });
    setSideB({ region: regionB, name: parsedB.name, tag: parsedB.tag });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="hud-label text-sm">Comparaison VS</h1>
        {(sideA || sideB) && <SampleSizeSwitch value={sampleSize} onChange={setSampleSize} />}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <RiotIdField
          label="Joueur A"
          value={inputA}
          onChange={setInputA}
          region={regionA}
          onChangeRegion={setRegionA}
        />
        <RiotIdField
          label="Joueur B"
          value={inputB}
          onChange={setInputB}
          region={regionB}
          onChangeRegion={setRegionB}
        />
        <button
          type="submit"
          className="btn-clip col-span-full bg-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-hud text-base transition-colors hover:bg-[#FF5969]"
        >
          Comparer
        </button>
      </form>

      {formError && <p className="text-sm text-crit">{formError}</p>}

      {sideA && sideB && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PlayerColumn side={sideA} sampleSize={sampleSize} />
          <PlayerColumn side={sideB} sampleSize={sampleSize} />
        </div>
      )}
    </div>
  );
}

function RiotIdField({
  label,
  value,
  onChange,
  region,
  onChangeRegion,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  region: string;
  onChangeRegion: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label} — pseudo#tag`}
        className="flex-1 border border-line bg-surface px-3 py-2 font-mono text-sm text-hi placeholder:text-lo/60 focus:border-accent focus:outline-none"
      />
      <select
        value={region}
        onChange={(e) => onChangeRegion(e.target.value)}
        className="shrink-0 border border-line bg-surface px-2 text-sm text-hi focus:border-accent focus:outline-none"
      >
        {REGIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PlayerColumn({ side, sampleSize }: { side: Side; sampleSize: SampleSize }) {
  const account = useAccount(side.name, side.tag);
  const puuid = account.data?.data.puuid;
  const matches = useMatches({ region: side.region, name: side.name, tag: side.tag, size: sampleSize });

  const overview = useMemo(
    () => (matches.data && puuid ? computeOverview(matches.data.data, puuid) : null),
    [matches.data, puuid],
  );

  if (account.isError) return <ErrorState error={account.error} />;
  if (account.isLoading || matches.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Panel className="space-y-3 p-4">
      <p className="font-display text-base font-bold text-hi">
        {side.name}
        <span className="text-lo">#{side.tag}</span>
      </p>
      {overview ? <OverviewRows overview={overview} /> : <p className="text-sm text-lo">Aucune donnée.</p>}
    </Panel>
  );
}

function OverviewRows({ overview }: { overview: Overview }) {
  const rows: Array<[string, string]> = [
    ["Winrate", `${formatPercent(overview.winPercent)} (${overview.wins}V-${overview.losses}D)`],
    ["K/D", overview.kd],
    ["Kills", String(overview.kills)],
    ["Deaths", String(overview.deaths)],
    ["Assists", String(overview.assists)],
    ["Headshot %", formatPercent(overview.hsPercent)],
    ["ACS", String(overview.acs)],
    ["Agent le plus joué", overview.topAgent?.name ?? "—"],
  ];
  return (
    <div className="divide-y divide-line/60">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-lo">{label}</span>
          <span className="stat-value text-hi">{value}</span>
        </div>
      ))}
    </div>
  );
}
