import { invoke } from "@tauri-apps/api/core";

// Types miroir des DTO Rust (voir src-tauri/src/api/henrik/types.rs, commands.rs, db.rs).
// Tenus à jour manuellement — pas de génération automatique dans ce scaffold V1.

export interface AccountData {
  puuid: string;
  region: string | null;
  account_level: number | null;
  name: string;
  tag: string;
  /** UUID de la carte de joueur — construire l'image via `playerCardIconUrl()`. */
  card: string | null;
  title: string | null;
}

export interface CurrentRankData {
  currenttier: number | null;
  currenttierpatched: string | null;
  ranking_in_tier: number | null;
  elo: number | null;
  mmr_change_to_last_game: number | null;
}

export interface HighestRank {
  tier: number | null;
  patched_tier: string | null;
  season: string | null;
}

export interface MmrData {
  current_data: CurrentRankData | null;
  highest_rank: HighestRank | null;
  /** Présents sur la variante by-puuid (overlay V2). */
  name?: string | null;
  tag?: string | null;
}

/** Joueur détecté dans la partie en cours. En pregame, le Riot Client n'expose que
 * l'équipe alliée donc `team` vaut toujours "ally" ; en in-game les deux équipes sont
 * connues via leur TeamID Riot. */
export interface LivePlayer {
  puuid: string;
  team: "ally" | "enemy" | "inconnu";
}

/** Instantané de la détection de partie V2 (commande get_live_state + event
 * `riot-local://state`). */
export interface LiveSnapshot {
  state: "hors_jeu" | "menu" | "pregame" | "in_game" | "post_game" | "desactive";
  players: LivePlayer[];
  region: string | null;
}

export interface NamedRef {
  id: string | null;
  name: string | null;
}

export interface QueueRef {
  id: string | null;
  name: string | null;
  mode_type: string | null;
}

export interface PlayerStats {
  score: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  headshots: number | null;
  bodyshots: number | null;
  legshots: number | null;
}

export interface MatchPlayer {
  puuid: string | null;
  name: string | null;
  tag: string | null;
  team_id: string | null;
  agent: NamedRef | null;
  stats: PlayerStats | null;
}

export interface TeamRounds {
  won: number | null;
  lost: number | null;
}

export interface MatchTeam {
  team_id: string | null;
  won: boolean | null;
  rounds: TeamRounds | null;
}

export interface MatchMetadata {
  match_id: string | null;
  map: NamedRef | null;
  queue: QueueRef | null;
  started_at: string | null;
  game_length_in_ms: number | null;
}

export interface MatchEntry {
  metadata: MatchMetadata;
  players: MatchPlayer[];
  teams: MatchTeam[];
}

// ---- mmr-history ----

export interface MmrHistoryAccount {
  name: string | null;
  tag: string | null;
  puuid: string | null;
}

export interface SeasonRef {
  id: string | null;
  short: string | null;
}

export interface TierRef {
  id: number | null;
  name: string | null;
}

export interface MmrHistoryEntry {
  date: string | null;
  elo: number | null;
  last_change: number | null;
  rr: number | null;
  match_id: string | null;
  refunded_rr: number | null;
  was_derank_protected: boolean | null;
  map: NamedRef | null;
  season: SeasonRef | null;
  tier: TierRef | null;
}

export interface MmrHistoryData {
  account: MmrHistoryAccount;
  history: MmrHistoryEntry[];
}

// ---- match detail (v2/match) ----

export interface MatchDetailMetadata {
  matchid: string | null;
  map: string | null;
  mode: string | null;
  queue: string | null;
  season_id: string | null;
  game_length: number | null;
  game_start: number | null;
  game_start_patched: string | null;
  rounds_played: number | null;
}

export interface MatchDetailAgentAssets {
  small: string | null;
  bust: string | null;
  full: string | null;
  killfeed: string | null;
}

export interface MatchDetailPlayerAssets {
  agent: MatchDetailAgentAssets | null;
}

export interface MatchDetailPlayerStats {
  score: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  bodyshots: number | null;
  headshots: number | null;
  legshots: number | null;
}

export interface MatchDetailEconomyValue {
  overall: number | null;
  average: number | null;
}

export interface MatchDetailPlayerEconomy {
  spent: MatchDetailEconomyValue | null;
  loadout_value: MatchDetailEconomyValue | null;
}

export interface MatchDetailPlayer {
  puuid: string;
  name: string;
  tag: string;
  team: string;
  level: number | null;
  character: string | null;
  currenttier: number | null;
  currenttier_patched: string | null;
  party_id: string | null;
  assets: MatchDetailPlayerAssets | null;
  stats: MatchDetailPlayerStats | null;
  economy: MatchDetailPlayerEconomy | null;
  damage_made: number | null;
  damage_received: number | null;
}

export interface MatchDetailTeam {
  has_won: boolean | null;
  rounds_won: number | null;
  rounds_lost: number | null;
}

export interface MatchDetailEconomyEquipment {
  id: string | null;
  name: string | null;
}

export interface MatchDetailRoundEconomy {
  loadout_value: number | null;
  remaining: number | null;
  spent: number | null;
  weapon: MatchDetailEconomyEquipment | null;
  armor: MatchDetailEconomyEquipment | null;
}

export interface MatchDetailRoundPlayerStat {
  player_puuid: string | null;
  player_display_name: string | null;
  player_team: string | null;
  damage: number | null;
  bodyshots: number | null;
  headshots: number | null;
  legshots: number | null;
  kills: number | null;
  score: number | null;
  was_afk: boolean | null;
  economy: MatchDetailRoundEconomy | null;
}

export interface MatchDetailRound {
  winning_team: string | null;
  end_type: string | null;
  bomb_planted: boolean | null;
  bomb_defused: boolean | null;
  player_stats: MatchDetailRoundPlayerStat[];
}

export interface MatchDetailData {
  metadata: MatchDetailMetadata;
  players: { all_players: MatchDetailPlayer[] };
  teams: { red: MatchDetailTeam | null; blue: MatchDetailTeam | null };
  rounds: MatchDetailRound[];
}

// ---- leaderboard ----

export interface LeaderboardPlayer {
  puuid: string | null;
  name: string;
  tag: string;
  card: string | null;
  title: string | null;
  is_banned: boolean | null;
  is_anonymized: boolean | null;
  leaderboard_rank: number | null;
  tier: number | null;
  rr: number | null;
  wins: number | null;
  updated_at: string | null;
}

export interface LeaderboardThreshold {
  start_index: number | null;
  threshold: number | null;
  tier: TierRef | null;
}

export interface LeaderboardData {
  updated_at: string | null;
  players: LeaderboardPlayer[];
  thresholds: LeaderboardThreshold[];
}

// ---- status / queue-status ----

export interface StatusIncidentContent {
  locale: string | null;
  content: string | null;
}

export interface StatusIncident {
  id: number | null;
  incident_severity: string | null;
  maintenance_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  platforms: string[];
  titles: StatusIncidentContent[];
}

export interface StatusData {
  incidents: StatusIncident[];
  maintenances: StatusIncident[];
}

export interface QueueStatusEntry {
  mode: string | null;
  mode_id: string | null;
  enabled: boolean | null;
  team_size: number | null;
  ranked: boolean | null;
  tournament: boolean | null;
  required_account_level: number | null;
  platforms: string[];
}

// ---- esports schedule ----

export interface EsportsLeague {
  name: string | null;
  identifier: string | null;
  icon: string | null;
  region: string | null;
}

export interface EsportsTournament {
  name: string | null;
  season: string | null;
}

export interface EsportsMatchTeamRecord {
  wins: number | null;
  losses: number | null;
}

export interface EsportsMatchTeam {
  name: string | null;
  code: string | null;
  icon: string | null;
  has_won: boolean | null;
  game_wins: number | null;
  record: EsportsMatchTeamRecord | null;
}

export interface EsportsMatch {
  id: string | null;
  teams: EsportsMatchTeam[];
}

export interface EsportsScheduleEntry {
  date: string | null;
  state: string | null;
  kind: string | null;
  vod: string | null;
  league: EsportsLeague | null;
  tournament: EsportsTournament | null;
  match_: EsportsMatch | null;
}

// ---- Premier ----

export interface PremierTeamCustomization {
  icon: string | null;
  image: string | null;
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
}

export interface PremierTeamLite {
  id: string;
  name: string;
  tag: string;
  conference: string | null;
  division: number | null;
  affinity: string | null;
  region: string | null;
  losses: number | null;
  wins: number | null;
  score: number | null;
  ranking: number | null;
  customization: PremierTeamCustomization | null;
  updated_at: string | null;
}

export interface PremierTeamMember {
  puuid: string;
  name: string | null;
  tag: string | null;
}

export interface PremierTeamPlacement {
  points: number | null;
  conference: string | null;
  division: number | null;
  place: number | null;
}

export interface PremierTeamStats {
  wins: number | null;
  matches: number | null;
  losses: number | null;
  rounds_won: number | null;
  rounds_lost: number | null;
}

export interface PremierTeamDetail {
  id: string;
  name: string;
  tag: string;
  enrolled: boolean | null;
  stats: PremierTeamStats | null;
  placement: PremierTeamPlacement | null;
  customization: PremierTeamCustomization | null;
  member: PremierTeamMember[];
}

export interface PremierLeagueMatch {
  id: string;
  points_before: number | null;
  points_after: number | null;
  started_at: string | null;
}

export interface PremierTournamentMatch {
  tournament_id: string;
  placement: number | null;
  placement_league_bonus: number | null;
  points_before: number | null;
  points_after: number | null;
  matches: string[];
}

export interface PremierTeamHistory {
  league_matches: PremierLeagueMatch[];
  tournament_matches: PremierTournamentMatch[];
}

// ---- Esport pro (VLR) ----

export interface VlrCountry {
  name: string | null;
  code: string | null;
}

export interface VlrSocial {
  platform: string | null;
  url: string | null;
}

export interface VlrIdSlug {
  id: number;
  slug: string | null;
}

export interface VlrEventDates {
  start: string | null;
  end: string | null;
}

export interface VlrEvent {
  id: number;
  title: string;
  slug: string | null;
  icon: string | null;
  price: string | null;
  region: string | null;
  status: string | null;
  dates: VlrEventDates | null;
}

export interface VlrMatchTeamLite {
  name: string;
  is_winner: boolean | null;
  score: number | null;
}

export interface VlrEventMatch {
  id: number;
  slug: string | null;
  event: string | null;
  series: string | null;
  date: string | null;
  tags: string[];
  teams: VlrMatchTeamLite[];
}

export interface VlrTeamRosterMember {
  id: number;
  alias: string;
  avatar: string | null;
  country_code: string | null;
  real_name: string | null;
  role: string | null;
  is_captain: boolean | null;
}

export interface VlrPlacementEvent {
  id: number;
  slug: string | null;
  name: string | null;
}

export interface VlrPlacementEntry {
  place: string | null;
  prize: string | null;
}

export interface VlrEventPlacement {
  event: VlrPlacementEvent | null;
  year: string | null;
  placements: VlrPlacementEntry[];
}

export interface VlrTeam {
  id: number;
  name: string;
  tag: string | null;
  logo: string | null;
  country: VlrCountry | null;
  total_winnings: string | null;
  roster: VlrTeamRosterMember[];
  socials: VlrSocial[];
  event_placements: VlrEventPlacement[];
}

export interface VlrMatchLeague {
  icon: string | null;
  name: string | null;
  series: string | null;
}

export interface VlrTeamMatchTeam {
  name: string;
  tag: string | null;
  logo: string | null;
  score: number | null;
}

export interface VlrTeamMatch {
  match: VlrIdSlug;
  league: VlrMatchLeague | null;
  date: string | null;
  teams: VlrTeamMatchTeam[];
  vods: string[];
}

export interface VlrPlayerTeamRef {
  id: number;
  name: string | null;
  logo: string | null;
}

export interface VlrAgentUsage {
  count: number | null;
  percentage: number | null;
  rounds: number | null;
}

export interface VlrAgentPerformanceStats {
  rating: number | null;
  acs: number | null;
  kd: number | null;
  adr: number | null;
  kast: number | null;
  kpr: number | null;
  apr: number | null;
  fkpr: number | null;
  fdpr: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  first_kills: number | null;
  first_deaths: number | null;
}

export interface VlrPlayerAgentStats {
  agent: string;
  usage: VlrAgentUsage | null;
  stats: VlrAgentPerformanceStats | null;
}

export interface VlrPlayer {
  id: number;
  name: string;
  real_name: string | null;
  avatar: string | null;
  country: VlrCountry | null;
  total_winnings: string | null;
  current_teams: VlrPlayerTeamRef[];
  past_teams: VlrPlayerTeamRef[];
  agent_stats: VlrPlayerAgentStats[];
  event_placements: VlrEventPlacement[];
  socials: VlrSocial[];
}

export interface VlrPlayerMatchTeam {
  name: string;
  tag: string | null;
  icon: string | null;
  score: number | null;
}

export interface VlrPlayerMatch {
  match: VlrIdSlug;
  league: VlrMatchLeague | null;
  date: string | null;
  teams: VlrPlayerMatchTeam[];
  vods: string[];
}

export interface VlrMatchEvent {
  id: number;
  slug: string | null;
  icon: string | null;
  title: string | null;
  series: string | null;
}

export interface VlrMatchHeader {
  event: VlrMatchEvent | null;
  date: string | null;
  patch: string | null;
  format: string | null;
  status: string | null;
  note: string | null;
}

export interface VlrMatchHeaderTeam {
  id: number;
  slug: string | null;
  url: string | null;
  name: string;
  icon: string | null;
  score: number | null;
}

export interface VlrMatchStream {
  name: string;
  link: string;
}

export interface VlrMatchPlayerRef {
  id: number;
  name: string;
  nation: string | null;
  slug: string | null;
}

export interface VlrMatchGamePlayerStats {
  rating: number | null;
  acs: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kd_diff: number | null;
  kast: number | null;
  adr: number | null;
  hs_pct: number | null;
  first_kills: number | null;
  first_deaths: number | null;
  fk_diff: number | null;
}

export interface VlrMatchGamePlayer {
  player: VlrMatchPlayerRef;
  agent: string;
  stats: VlrMatchGamePlayerStats | null;
}

export interface VlrMatchGameTeam {
  name: string;
  is_winner: boolean | null;
  score: number | null;
  score_ct: number | null;
  score_t: number | null;
  players: VlrMatchGamePlayer[];
}

export interface VlrMatchGame {
  map: string;
  duration_in_s: number | null;
  picked_by: number | null;
  teams: VlrMatchGameTeam[];
}

export interface VlrMatchDetail {
  metadata: VlrMatchHeader;
  teams: VlrMatchHeaderTeam[];
  streams: VlrMatchStream[];
  vods: VlrMatchStream[];
  games: VlrMatchGame[];
}

export interface Fetched<T> {
  data: T;
  stale: boolean;
  from_network: boolean;
  cached_at: number | null;
}

export interface AppSettings {
  henrik_api_key: string | null;
  henrik_api_key_set: boolean;
  default_region: string;
  auto_update_enabled: boolean;
  riot_local_disabled: boolean;
  discord_rpc_enabled: boolean;
  discord_rpc_client_id: string | null;
  status_watcher_enabled: boolean;
  usage_metrics_enabled: boolean;
  ui_theme: string;
  ui_accent: string;
  /** Système multilangue : `"fr"` (défaut) | `"en"`. */
  ui_language: string;
  /** Backlog #31 : `"compact"` | `"detailed"` (défaut). */
  overlay_density: string;
  /** Backlog #24 : alerte "N défaites d'affilée" (comptes "à soi" uniquement). */
  loss_streak_alert_enabled: boolean;
  loss_streak_alert_count: number;
  /** Backlog #32 : rappel doux si aucun compte "à soi" consulté depuis X jours. */
  inactivity_reminder_enabled: boolean;
  inactivity_reminder_days: number;
  /** Backlog #99 : verrou PIN optionnel devant les notes perso (`PlayerNotesPanel`). */
  notes_pin_enabled: boolean;
}

export interface UsageMetricsSummary {
  cache_hits: number;
  network_fetches: number;
  api_errors: number;
}

export interface TrackedPlayer {
  puuid: string;
  name: string;
  tag: string;
  region: string;
  is_favorite: boolean;
  last_viewed_at: number;
  /** V4 : ce Riot ID est l'un des comptes Valorant "à soi" de l'utilisateur (multi-comptes). */
  is_self: boolean;
  /** Backlog #12 : note libre (tags "smurf"/"toxique"/"duo régulier"...), `null` si vide. */
  notes: string | null;
}

/** Backlog #13 : objectif de progression ("atteindre Diamant 2") pour un joueur suivi. */
export interface ProgressionGoal {
  target_tier: number;
  target_tier_patched: string;
  target_rr: number | null;
  created_at: number;
}

/** V4 : Riot ID détecté via le lockfile du Riot Client local, résolu via Henrik
 * (nom/tag/région) — voir `detectLocalAccount`. */
export interface DetectedAccount {
  puuid: string;
  name: string;
  tag: string;
  region: string;
}

export interface LogSnapshot {
  path: string | null;
  content: string;
}

export interface RankSnapshot {
  tier: number;
  tier_patched: string;
  rr: number | null;
  recorded_at: number;
}

export interface DuoStat {
  teammate_puuid: string;
  teammate_name: string;
  teammate_tag: string;
  matches_played: number;
  matches_won: number;
}

/** Backlog #23 : extension "squad" (trios) de DuoStat. */
export interface SquadStat {
  teammate_a_puuid: string;
  teammate_a_name: string;
  teammate_a_tag: string;
  teammate_b_puuid: string;
  teammate_b_name: string;
  teammate_b_tag: string;
  matches_played: number;
  matches_won: number;
}

export type CommandError =
  | { kind: "missing_api_key" }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retry_after_secs: number | null }
  | { kind: "circuit_open" }
  | { kind: "network"; message: string }
  | { kind: "api"; status: number; message: string }
  | { kind: "database"; message: string }
  | { kind: "unknown"; message: string };

export function isCommandError(err: unknown): err is CommandError {
  return typeof err === "object" && err !== null && "kind" in err;
}

export const tauriApi = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveHenrikApiKey: (apiKey: string) =>
    invoke<void>("save_henrik_api_key", { apiKey }),
  saveDefaultRegion: (region: string) =>
    invoke<void>("save_default_region", { region }),
  saveAutoUpdateEnabled: (enabled: boolean) =>
    invoke<void>("save_auto_update_enabled", { enabled }),
  saveRiotLocalDisabled: (disabled: boolean) =>
    invoke<void>("save_riot_local_disabled", { disabled }),
  saveDiscordRpcEnabled: (enabled: boolean) =>
    invoke<void>("save_discord_rpc_enabled", { enabled }),
  saveDiscordRpcClientId: (clientId: string) =>
    invoke<void>("save_discord_rpc_client_id", { clientId }),
  saveStatusWatcherEnabled: (enabled: boolean) =>
    invoke<void>("save_status_watcher_enabled", { enabled }),
  saveUsageMetricsEnabled: (enabled: boolean) =>
    invoke<void>("save_usage_metrics_enabled", { enabled }),
  getUsageMetricsSummary: () =>
    invoke<UsageMetricsSummary>("get_usage_metrics_summary"),
  saveUiTheme: (theme: string) => invoke<void>("save_ui_theme", { theme }),
  saveUiAccent: (accent: string) => invoke<void>("save_ui_accent", { accent }),
  saveUiLanguage: (language: string) => invoke<void>("save_ui_language", { language }),
  saveOverlayDensity: (density: string) =>
    invoke<void>("save_overlay_density", { density }),
  saveLossStreakAlertEnabled: (enabled: boolean) =>
    invoke<void>("save_loss_streak_alert_enabled", { enabled }),
  saveLossStreakAlertCount: (count: number) =>
    invoke<void>("save_loss_streak_alert_count", { count }),
  saveInactivityReminderEnabled: (enabled: boolean) =>
    invoke<void>("save_inactivity_reminder_enabled", { enabled }),
  saveInactivityReminderDays: (days: number) =>
    invoke<void>("save_inactivity_reminder_days", { days }),
  verifyHenrikApiKey: (apiKey: string) =>
    invoke<boolean>("verify_henrik_api_key", { apiKey }),
  saveNotesPin: (pin: string) => invoke<void>("save_notes_pin", { pin }),
  clearNotesPin: () => invoke<void>("clear_notes_pin"),
  verifyNotesPin: (pin: string) => invoke<boolean>("verify_notes_pin", { pin }),
  fetchExternalImage: (url: string) => invoke<string>("fetch_external_image", { url }),

  fetchAccount: (name: string, tag: string, force = false) =>
    invoke<Fetched<AccountData>>("fetch_account", { name, tag, force }),
  fetchMmr: (puuid: string, region: string, name: string, tag: string, force = false) =>
    invoke<Fetched<MmrData>>("fetch_mmr", { puuid, region, name, tag, force }),
  fetchMatches: (region: string, name: string, tag: string, size: number, force = false) =>
    invoke<Fetched<MatchEntry[]>>("fetch_matches", { region, name, tag, size, force }),

  fetchMmrByPuuid: (puuid: string, region: string) =>
    invoke<Fetched<MmrData>>("fetch_mmr_by_puuid", { puuid, region }),
  getLiveState: () => invoke<LiveSnapshot>("get_live_state"),
  getOverlayShortcutStatus: () => invoke<boolean>("get_overlay_shortcut_status"),

  fetchMmrHistory: (region: string, name: string, tag: string, force = false) =>
    invoke<Fetched<MmrHistoryData>>("fetch_mmr_history", { region, name, tag, force }),
  fetchMatchDetail: (matchId: string, force = false) =>
    invoke<Fetched<MatchDetailData>>("fetch_match_detail", { matchId, force }),
  fetchLeaderboard: (
    region: string,
    size: number,
    startIndex: number,
    name?: string,
    tag?: string,
    force = false,
  ) =>
    invoke<Fetched<LeaderboardData>>("fetch_leaderboard", {
      region,
      size,
      startIndex,
      name: name ?? null,
      tag: tag ?? null,
      force,
    }),
  fetchStatus: (region: string) => invoke<Fetched<StatusData>>("fetch_status", { region }),
  fetchQueueStatus: (region: string) =>
    invoke<Fetched<QueueStatusEntry[]>>("fetch_queue_status", { region }),
  fetchEsportsSchedule: (region?: string, league?: string) =>
    invoke<Fetched<EsportsScheduleEntry[]>>("fetch_esports_schedule", {
      region: region ?? null,
      league: league ?? null,
    }),
  fetchCrosshairPreview: (code: string) =>
    invoke<string>("fetch_crosshair_preview", { code }),

  searchPremierTeams: (name?: string, tag?: string) =>
    invoke<Fetched<PremierTeamLite[]>>("search_premier_teams", {
      name: name ?? null,
      tag: tag ?? null,
    }),
  fetchPremierLeaderboard: (region: string) =>
    invoke<Fetched<PremierTeamLite[]>>("fetch_premier_leaderboard", { region }),
  fetchPremierTeam: (params: { name?: string; tag?: string; teamId?: string }) =>
    invoke<Fetched<PremierTeamDetail>>("fetch_premier_team", {
      name: params.name ?? null,
      tag: params.tag ?? null,
      teamId: params.teamId ?? null,
    }),
  fetchPremierTeamHistory: (params: { name?: string; tag?: string; teamId?: string }) =>
    invoke<Fetched<PremierTeamHistory>>("fetch_premier_team_history", {
      name: params.name ?? null,
      tag: params.tag ?? null,
      teamId: params.teamId ?? null,
    }),

  fetchVlrEvents: (region?: string, eventType?: string, page = 1) =>
    invoke<Fetched<VlrEvent[]>>("fetch_vlr_events", {
      region: region ?? null,
      eventType: eventType ?? null,
      page,
    }),
  fetchVlrEventMatches: (eventId: number) =>
    invoke<Fetched<VlrEventMatch[]>>("fetch_vlr_event_matches", { eventId }),
  fetchVlrMatch: (matchId: number) =>
    invoke<Fetched<VlrMatchDetail>>("fetch_vlr_match", { matchId }),
  fetchVlrTeam: (teamId: number) => invoke<Fetched<VlrTeam>>("fetch_vlr_team", { teamId }),
  fetchVlrTeamMatches: (teamId: number, page = 1) =>
    invoke<Fetched<VlrTeamMatch[]>>("fetch_vlr_team_matches", { teamId, page }),
  fetchVlrPlayer: (playerId: number, timespan?: string) =>
    invoke<Fetched<VlrPlayer>>("fetch_vlr_player", { playerId, timespan: timespan ?? null }),
  fetchVlrPlayerMatches: (playerId: number, page = 1) =>
    invoke<Fetched<VlrPlayerMatch[]>>("fetch_vlr_player_matches", { playerId, page }),

  listTrackedPlayers: (limit: number) =>
    invoke<TrackedPlayer[]>("list_tracked_players", { limit }),
  toggleFavoritePlayer: (puuid: string) =>
    invoke<boolean>("toggle_favorite_player", { puuid }),
  listFavoritePlayers: () => invoke<TrackedPlayer[]>("list_favorite_players"),
  reorderFavoritePlayers: (orderedPuuids: string[]) =>
    invoke<void>("reorder_favorite_players", { orderedPuuids }),
  listRankSnapshots: (puuid: string) =>
    invoke<RankSnapshot[]>("list_rank_snapshots", { puuid }),
  resetLocalStats: () => invoke<void>("reset_local_stats"),
  savePlayerNotes: (puuid: string, notes: string) =>
    invoke<void>("save_player_notes", { puuid, notes }),
  getProgressionGoal: (puuid: string) =>
    invoke<ProgressionGoal | null>("get_progression_goal", { puuid }),
  saveProgressionGoal: (
    puuid: string,
    targetTier: number,
    targetTierPatched: string,
    targetRr: number | null,
  ) =>
    invoke<void>("save_progression_goal", {
      puuid,
      targetTier,
      targetTierPatched,
      targetRr,
    }),
  clearProgressionGoal: (puuid: string) =>
    invoke<void>("clear_progression_goal", { puuid }),

  recordPartyFromMatch: (matchId: string, trackedPuuid: string) =>
    invoke<void>("record_party_from_match", { matchId, trackedPuuid }),
  listDuoStats: (puuid: string, minMatches = 2) =>
    invoke<DuoStat[]>("list_duo_stats", { puuid, minMatches }),
  listSquadStats: (puuid: string, minMatches = 2) =>
    invoke<SquadStat[]>("list_squad_stats", { puuid, minMatches }),

  setSelfAccount: (puuid: string, isSelf: boolean) =>
    invoke<void>("set_self_account", { puuid, isSelf }),
  listSelfAccounts: () => invoke<TrackedPlayer[]>("list_self_accounts"),
  detectLocalAccount: () => invoke<DetectedAccount | null>("detect_local_account"),

  getRecentLogs: () => invoke<LogSnapshot>("get_recent_logs"),
};
