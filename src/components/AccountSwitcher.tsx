import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useSelfAccountsStore } from "../store/selfAccountsStore";
import { tauriApi } from "../lib/tauriApi";

interface CurrentPlayer {
  puuid: string;
  region: string;
  name: string;
  tag: string;
}

/** Sélecteur de comptes Valorant "à soi" (V4, multi-comptes) — pas de RSO/OAuth Riot
 * possible pour cette app (réservé aux partenaires approuvés par Riot), donc "lier son
 * compte" ne fait que marquer un Riot ID déjà consulté comme favori spécial, avec une
 * suggestion best-effort basée sur le Riot ID détecté localement (lockfile du client
 * Riot) pour éviter d'avoir à le retaper. */
export default function AccountSwitcher({ current }: { current?: CurrentPlayer }) {
  const [open, setOpen] = useState(false);
  const { accounts, refresh, setSelf } = useSelfAccountsStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const detected = useQuery({
    queryKey: ["detect-local-account"],
    queryFn: () => tauriApi.detectLocalAccount(),
    enabled: open,
    staleTime: 30_000,
  });

  const navigate = useNavigate();

  const isCurrentSelf = current ? accounts.some((a) => a.puuid === current.puuid) : false;
  const suggestion =
    detected.data && !accounts.some((a) => a.puuid === detected.data!.puuid) ? detected.data : null;

  async function linkDetected() {
    if (!suggestion) return;
    await tauriApi.fetchAccount(suggestion.name, suggestion.tag);
    await setSelf(suggestion.puuid, true);
  }

  async function markCurrentAsSelf() {
    if (!current) return;
    await setSelf(current.puuid, true);
  }

  function goTo(account: { region: string; name: string; tag: string }) {
    navigate(`/joueur/${account.region}/${encodeURIComponent(account.name)}/${encodeURIComponent(account.tag)}`);
    setOpen(false);
  }

  return (
    <div className="relative self-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mes comptes"
        title="Mes comptes"
        className={`flex h-8 w-8 items-center justify-center transition-colors ${
          accounts.length > 0 ? "text-accent" : "text-hi/70 hover:text-accent"
        }`}
      >
        <StarIcon filled={accounts.length > 0} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="panel-clip-sm absolute right-0 top-full z-20 mt-1 w-72 border border-line bg-raised p-2 shadow-lg">
            <p className="hud-label px-1 pb-1.5 text-[10px]">Mes comptes</p>

            {accounts.length === 0 && (
              <p className="px-1 py-1.5 text-xs text-lo">
                Aucun compte lié. Marque un profil comme le tien ci-dessous, ou lie le compte
                détecté si le client Riot est ouvert.
              </p>
            )}

            <div className="space-y-1">
              {accounts.map((a) => (
                <div
                  key={a.puuid}
                  className="group flex items-center gap-1.5 px-1 py-1 hover:bg-base"
                >
                  <button
                    type="button"
                    onClick={() => goTo(a)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-hi"
                  >
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="shrink-0 text-lo">#{a.tag}</span>
                    <span className="hud-label shrink-0 border border-line px-1 py-0.5 text-[9px] text-lo">
                      {a.region}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelf(a.puuid, false)}
                    aria-label="Délier ce compte"
                    title="Délier ce compte"
                    className="shrink-0 text-lo/60 opacity-0 transition-opacity hover:text-crit group-hover:opacity-100"
                  >
                    <CrossIcon />
                  </button>
                </div>
              ))}
            </div>

            {current && !isCurrentSelf && (
              <button
                type="button"
                onClick={markCurrentAsSelf}
                className="mt-1.5 flex w-full items-center gap-1.5 border-t border-line px-1 pt-1.5 text-left text-xs text-lo hover:text-accent"
              >
                <StarIcon filled={false} />
                Marquer {current.name}#{current.tag} comme mon compte
              </button>
            )}

            {suggestion && (
              <button
                type="button"
                onClick={linkDetected}
                className="mt-1.5 flex w-full items-center gap-1.5 border-t border-line px-1 pt-1.5 text-left text-xs text-lo hover:text-accent"
              >
                <StarIcon filled={false} />
                Compte détecté : {suggestion.name}#{suggestion.tag} — Lier
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                navigate("/");
                setOpen(false);
              }}
              className="mt-1.5 flex w-full items-center gap-1.5 border-t border-line px-1 pt-1.5 text-left text-xs text-lo hover:text-hi"
            >
              + Chercher un profil à lier
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} className="h-4 w-4 shrink-0">
      <path
        d="M10 1.5l2.47 5.51 6.03.58-4.55 4.03 1.34 5.9L10 14.7l-5.29 2.82 1.34-5.9L1.5 7.59l6.03-.58L10 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
