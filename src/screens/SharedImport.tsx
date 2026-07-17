import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import Panel from "../components/Panel";
import StatCard from "../components/StatCard";
import RankBadge from "../components/RankBadge";
import EmptyState from "../components/EmptyState";
import { formatPercent } from "../lib/format";
import { downloadTextFile } from "../lib/downloadFile";
import { tauriApi } from "../lib/tauriApi";
import {
  buildGroupSessionExport,
  buildPlayerCardExport,
  parseShareExport,
  type GroupSessionExport,
  type PlayerCardExport,
  type ShareExport,
} from "../lib/shareExport";

/** TODO Social/multi-comptes#2/#37/#38/#39 : partage lecture-seule entre utilisateurs — un
 * fichier JSON autonome, exporté depuis un compte suivi et importé ici sans jamais nécessiter
 * de clé API Henrik côté destinataire (tout est déjà embarqué dans le fichier, voir
 * `shareExport.ts`). Écran unique : section "Exporter" (construit le fichier depuis un compte
 * "à soi" déjà suivi localement) + section "Importer" (lit un fichier reçu, rendu 100% depuis
 * les données embarquées). */
export default function SharedImport() {
  const { t } = useTranslation("sharedImport");
  const selfAccounts = useQuery({ queryKey: ["self_accounts_for_share"], queryFn: () => tauriApi.listSelfAccounts() });

  const [imported, setImported] = useState<ShareExport | null>(null);
  const [importError, setImportError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setImportError(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseShareExport(JSON.parse(String(reader.result)));
        if (!parsed) {
          setImportError(true);
          return;
        }
        setImported(parsed);
      } catch {
        setImportError(true);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hud-label text-sm">{t("title")}</h1>
        <p className="mt-1 text-xs text-lo">{t("description")}</p>
      </div>

      <ExportSection accounts={selfAccounts.data ?? []} />

      <Panel className="p-4">
        <p className="hud-label mb-3">{t("import.title")}</p>
        <div
          className="panel-clip-sm flex flex-col items-center justify-center gap-2 border border-dashed border-line px-4 py-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <p className="text-sm text-lo">{t("import.dropHint")}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="hud-label border border-line px-3 py-1.5 text-xs text-hi transition-colors hover:border-accent hover:text-accent"
          >
            {t("import.browseButton")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {importError && <p className="mt-2 text-xs text-crit">{t("import.error")}</p>}
      </Panel>

      {imported?.kind === "player_card" && <PlayerCardView data={imported} />}
      {imported?.kind === "group_session" && <GroupSessionView data={imported} />}
    </div>
  );
}

function ExportSection({ accounts }: { accounts: { puuid: string; name: string; tag: string; region: string }[] }) {
  const { t } = useTranslation("sharedImport");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);

  function toggle(puuid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(puuid)) next.delete(puuid);
      else next.add(puuid);
      return next;
    });
  }

  async function exportCard(account: { puuid: string; name: string; tag: string; region: string }) {
    setBuilding(true);
    try {
      const data = await buildPlayerCardExport({ ...account, includeMatchNotes: includeNotes });
      downloadTextFile(`carte-${account.name}-${account.tag}.json`, JSON.stringify(data, null, 2), "application/json");
    } finally {
      setBuilding(false);
    }
  }

  async function exportGroupSession() {
    const chosen = accounts.filter((a) => selected.has(a.puuid));
    if (chosen.length === 0) return;
    setBuilding(true);
    try {
      const data = await buildGroupSessionExport(chosen);
      const date = new Date().toISOString().slice(0, 10);
      downloadTextFile(`session-groupe-${date}.json`, JSON.stringify(data, null, 2), "application/json");
    } finally {
      setBuilding(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <Panel className="p-4">
        <p className="hud-label mb-2">{t("export.title")}</p>
        <p className="text-xs text-lo">{t("export.noSelfAccount")}</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-3 p-4">
      <p className="hud-label">{t("export.title")}</p>
      <label className="flex items-center gap-2 text-xs text-lo">
        <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
        {t("export.includeNotes")}
      </label>

      <div className="space-y-2">
        {accounts.map((account) => (
          <div key={account.puuid} className="flex items-center justify-between gap-3 border border-line px-3 py-2">
            <label className="flex min-w-0 items-center gap-2 text-sm text-hi">
              <input type="checkbox" checked={selected.has(account.puuid)} onChange={() => toggle(account.puuid)} />
              <span className="truncate">
                {account.name}
                <span className="text-lo">#{account.tag}</span>
              </span>
            </label>
            <button
              type="button"
              disabled={building}
              onClick={() => exportCard(account)}
              className="hud-label shrink-0 border border-line px-2.5 py-1 text-[11px] text-lo transition-colors hover:border-accent hover:text-hi disabled:opacity-50"
            >
              {t("export.cardButton")}
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={building || selected.size === 0}
        onClick={exportGroupSession}
        className="hud-label border border-line px-3 py-1.5 text-xs text-hi transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {t("export.groupSessionButton", { count: selected.size })}
      </button>
    </Panel>
  );
}

function PlayerCardView({ data }: { data: PlayerCardExport }) {
  const { t } = useTranslation("sharedImport");
  return (
    <Panel className="scanline-once space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-hi">
            {data.name}
            <span className="text-lo">#{data.tag}</span>
          </p>
          <p className="text-xs text-lo">{t("card.exportedAt", { date: new Date(data.exported_at).toLocaleString() })}</p>
        </div>
        <RankBadge tier={data.current_tier} tierPatched={data.current_tier_patched} rr={data.rr} size="md" />
      </div>

      {data.tracker_score && (
        <div className="flex items-center gap-3 border border-line px-3 py-2">
          <span className="font-display text-xl font-bold text-accent">{data.tracker_score.tier}</span>
          <span className="stat-value text-sm text-hi">
            {Math.round(data.tracker_score.total_score)} / 1000
          </span>
          <span className="text-xs text-lo">{t("card.trackerScore")}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label={t("card.stats.winrate")} value={formatPercent(data.overview.winPercent)} />
        <StatCard label={t("card.stats.kd")} value={data.overview.kd} />
        <StatCard label={t("card.stats.hsPercent")} value={formatPercent(data.overview.hsPercent)} />
        <StatCard label={t("card.stats.acs")} value={String(data.overview.acs)} />
      </div>

      {data.highlights.length > 0 && (
        <div>
          <p className="hud-label mb-2">{t("card.highlights")}</p>
          <ul className="flex flex-wrap gap-2">
            {data.highlights.slice(0, 12).map((h, i) => (
              <li
                key={i}
                className={`hud-label border px-2 py-1 text-[11px] ${
                  h.kind === "clutch" ? "border-accent/50 text-accent" : "border-hi/40 text-hi"
                }`}
              >
                {h.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlayedTogetherPanel data={data} />
    </Panel>
  );
}

/** TODO Social/multi-comptes#39 : "on a joué ensemble X fois" — croise les duo/squad/rivalité
 * embarqués dans le fichier importé contre mes propres comptes "à soi" (par puuid). Purement
 * local : aucune donnée n'est renvoyée à qui a exporté le fichier. */
function PlayedTogetherPanel({ data }: { data: PlayerCardExport }) {
  const { t } = useTranslation("sharedImport");
  const myAccounts = useQuery({ queryKey: ["self_accounts_for_share"], queryFn: () => tauriApi.listSelfAccounts() });

  const matches = useMemo(() => {
    const myPuuids = new Set((myAccounts.data ?? []).map((a) => a.puuid));
    const fromDuo = data.duo_stats.filter((d) => myPuuids.has(d.teammate_puuid));
    const fromRivalry = data.rivalry_stats.filter((r) => myPuuids.has(r.opponent_puuid));
    return { fromDuo, fromRivalry };
  }, [data, myAccounts.data]);

  if (matches.fromDuo.length === 0 && matches.fromRivalry.length === 0) return null;

  return (
    <div className="border border-accent/30 bg-accent/5 p-3">
      <p className="hud-label mb-2 text-accent">{t("card.playedTogether.title")}</p>
      {matches.fromDuo.map((d) => (
        <p key={d.teammate_puuid} className="text-xs text-hi">
          {t("card.playedTogether.asTeammates", { count: d.matches_played, wins: d.matches_won })}
        </p>
      ))}
      {matches.fromRivalry.map((r) => (
        <p key={r.opponent_puuid} className="text-xs text-hi">
          {t("card.playedTogether.asOpponents", { count: r.matches_played })}
        </p>
      ))}
    </div>
  );
}

function GroupSessionView({ data }: { data: GroupSessionExport }) {
  const { t } = useTranslation("sharedImport");
  if (data.accounts.length === 0) {
    return <EmptyState icon="team" title={t("groupSession.empty")} />;
  }
  return (
    <Panel className="scanline-once space-y-3 p-4">
      <p className="hud-label">{t("groupSession.title", { date: new Date(data.exported_at).toLocaleString() })}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.accounts.map((account) => (
          <div key={account.puuid} className="flex items-center justify-between gap-3 border border-line px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-hi">
                {account.name}
                <span className="text-lo">#{account.tag}</span>
              </p>
              <p className="stat-value text-xs text-lo">
                {t("groupSession.statsLine", {
                  wins: account.today.wins,
                  played: account.today.matches,
                  winPercent: formatPercent(account.today.winPercent),
                })}
              </p>
            </div>
            <RankBadge tier={account.current_tier} tierPatched={account.current_tier_patched} size="sm" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
