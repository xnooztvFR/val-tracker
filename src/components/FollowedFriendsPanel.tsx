import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { tauriApi } from "../lib/tauriApi";
import { formatRelativeTime } from "../lib/format";

interface FollowedFriendsPanelProps {
  onOpenPlayer: (p: { region: string; name: string; tag: string }) => void;
}

/** TODO Fonctionnalités#19 : "mode spectateur ami" — liste des amis suivis avec leur
 * dernier match connu, visible depuis l'écran de recherche sans lancer sa propre partie.
 * Le statut affiché est *a posteriori* ("dernière partie il y a X"), pas une présence en
 * direct : l'API Henrik n'expose aucun endpoint de présence par joueur (voir
 * `friend_watcher.rs`). */
export default function FollowedFriendsPanel({ onOpenPlayer }: FollowedFriendsPanelProps) {
  const { t } = useTranslation("search");
  const friends = useQuery({
    queryKey: ["followed_friends"],
    queryFn: () => tauriApi.listFollowedFriends(),
    staleTime: 60_000,
  });

  const list = friends.data ?? [];
  const lastMatchQueries = useQueries({
    queries: list.map((friend) => ({
      queryKey: ["followed-friend-last-match", friend.puuid],
      queryFn: () => tauriApi.fetchMatches(friend.region, friend.name, friend.tag, 1),
      staleTime: 5 * 60_000,
      enabled: Boolean(friend.name && friend.tag),
    })),
  });

  if (list.length === 0) return null;

  return (
    <div className="mt-10 w-full">
      <h2 className="hud-label mb-3">{t("followedFriends.title")}</h2>
      <div className="flex flex-wrap gap-2">
        {list.map((friend, index) => {
          const query = lastMatchQueries[index];
          const lastMatch = query?.data?.data[0];
          const player = lastMatch?.players.find((p) => p.puuid === friend.puuid);
          const team = lastMatch?.teams.find((t) => t.team_id === player?.team_id);
          const won = team?.won;
          const startedAt = lastMatch?.metadata.started_at;

          return (
            <button
              key={friend.puuid}
              type="button"
              onClick={() => onOpenPlayer(friend)}
              className="panel-clip-sm flex items-center gap-2 py-1.5 pl-3 pr-3 text-left text-sm text-hi transition-colors hover:bg-raised"
            >
              <span className="font-medium">{friend.name}</span>
              <span className="text-lo">#{friend.tag}</span>
              {startedAt && (
                <span className={won === true ? "text-accent" : won === false ? "text-crit" : "text-lo"}>
                  {t("followedFriends.lastMatch", { time: formatRelativeTime(startedAt) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
