[🇫🇷 Français](README.md)&nbsp;|&nbsp;🇺🇸 English

# Valorant Tracker

A Windows desktop app for tracking your Valorant rank and stats, think tracker.gg, but
running locally on your machine: player search, rank progression history, match details,
per-map/per-agent stats, side-by-side player comparison, and automatic in-game detection
with a small overlay showing your lobby's ranks.

> This project is not developed by or affiliated with Riot Games. Rank and match data comes
> from the unofficial third-party [Henrik Dev API](https://docs.henrikdev.xyz/).

## Features

**Profile & progression**
- Search a player by Riot ID, full profile (current rank, RR history, peak rank reached)
- Match history, match detail (economy, kills, accuracy per round), Attack/Defense winrate
  per match, and a detailed match report (round-by-round eco/force/full-buy breakdown,
  best/worst rounds)
- Stats by map, by agent, and by agent role (Duelist/Initiator/Controller/Sentinel), with a
  comparison of your match stats against your personal average on that specific map
- Progression goals (example: "reach Diamond 2") with a progress bar, plus custom weekly
  goals (e.g. "10 matches this week", "winrate ≥ 55%")
- Automatic grouping of matches into play sessions
- Performance heatmap by day of week / hour
- Season-over-season progression comparison
- Side-by-side comparison of two players (VS)
- Solo-queue vs party winrate, duo and squad (3 players) winrate based on games played
  together, filterable by recency (30d/90d/all) and by a tag placed on your teammates (smurf,
  toxic, carry, regular duo...)
- Rivalry stats against a given opponent (your winrate facing them), with a retroactive
  lookup by Riot ID that backfills rivalry history from already-cached matches, no extra
  network request needed
- Timeline of notable events on a tracked account (rank changes...)
- Regional competitive leaderboard percentile placement (e.g. "Top 12% of Immortal 2"),
  shown for Immortal/Radiant tiers
- Personal notes on a tracked player, lockable behind a PIN (DPAPI-encrypted) for clean
  screen sharing or streaming without exposing sensitive tags
- Track multiple accounts as "your own" (no Riot RSO available), with auto-suggestion based
  on the Riot ID detected locally
- Adjustable sample size (last 20/50/100 matches) for analysis, consistent across the Home,
  Trends, Agents, and Maps screens
- CSV/JSON export of match history

**In-game**
- Automatic game detection via the local Riot client, nothing to launch manually, with a
  persistent status indicator (disabled / active out-of-game / match detected) and a queue
  status strip (competitive, unrated, swiftplay...)
- Always-on-top overlay showing detected players' ranks (compact, detailed, or mini mode),
  choice of target monitor, configurable alert when a teammate's rank gap is too wide
- Suggests your best-performing personal agents during agent select
- Discord Rich Presence (shows what you're doing in the app as your Discord status), with
  support for your own Discord Client ID

**Competitive & esports**
- Regional competitive leaderboard with direct Riot ID search across the whole leaderboard
  (not just the displayed page), "banned" badges and anonymized players relayed from Riot
- Premier mode: search teams by name, team page with customization colors, win/loss record
  and rounds won/lost, full season history (league and tournament matches with match-by-match
  point swings)
- VLR esports explorer: pro match calendar by day/league, event browser filterable by region
  (12 regions/circuits) and status, event and match detail (per-map boxscore: rating, ACS,
  K/D/A, ADR, KAST%, HS% per player), pro player pages (stats by agent, filterable by time
  window) and pro team pages (roster, tournament results, earnings) — all cross-linked

**Quality of life**
- Favorites and search history, reorderable by drag & drop; profile navigation tabs are
  reorderable the same way
- Command palette (Ctrl+K) for quick navigation
- Configurable alerts (loss streak, inactivity reminder, rank change)
- Result/agent/map filters in match history; "?" tooltips on advanced stats (ADR, HS%,
  economy...)
- One-click Riot ID copy; PNG image export (one-click copy to clipboard for Discord, or
  download) for a profile "card", a match recap, or a period recap (week/month: W/L record,
  winrate, K/D, HS%, ACS, most-played agent, rank evolution over the period) — cards render
  in the currently active theme/accent
- Light/dark theme, customizable accent color, and adjustable display density
  (comfortable/compact); app available in French, English, Spanish, and Brazilian Portuguese
- Auto-start with Windows; global keyboard shortcuts (show/hide the main window, focus mode
  for clean screen sharing), rebindable to avoid conflicts with other apps
- Preview a pasted Valorant crosshair code
- "What's new" changelog shown automatically after an update, with a full browsable history
  and a replayable onboarding wizard
- "Health" dashboard (cache, network latency), background task diagnostics, and recent log
  viewing, all optional and fully local
- Export or fully reset locally stored data
- Signed auto-update (double-checked: Ed25519 signature + SHA256 hash)

## Installation

1. Go to the [Releases](../../releases) page and download the latest
   `Valorant.Tracker_x.y.z_x64-setup.exe` (silent installer, recommended) or the `.msi`
   (classic manual install).
2. Run the installer. **Windows SmartScreen will likely show a warning**, that's expected:
   the app is signed with a self-signed certificate, not one purchased from a recognized
   authority. Click *More info* then *Run anyway*. The binary is properly signed (integrity
   is verifiable), this is just a reputation warning, not an antivirus blocking malware.
3. On first launch, the app walks you through 3 steps: enter a
   [Henrik Dev](https://api.henrikdev.xyz/dashboard/api-keys) API key (free), pick your region, and check the automatic Riot client detection.
4. Future updates install automatically (or via *Settings → Updates → Check now*).

### Privacy

Everything stays local on your machine: the API key is stored encrypted
(`%APPDATA%\com.xnooztv.val-tracker\`), no data is sent anywhere except to the Henrik Dev
API for requests you trigger yourself. No telemetry, the "Health" dashboard in Settings is
optional (disabled by default) and stays 100% local.

## Developing / building from source

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable, MSVC toolchain)
- [Node.js](https://nodejs.org/) 18+
- [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/) (WebView2,
  Visual Studio Build Tools with the "Desktop development with C++" workload)
- A [Henrik Dev](https://api.henrikdev.xyz/dashboard/api-keys) API key

### Setup

```bash
npm install
npm run tauri dev
```

Then configure your API key directly in the app (Settings → Henrik API Key), never in the
repo.

### Local build

```bash
npm run tauri build
```

Generates the `.msi` and `.exe` (NSIS) installers in `src-tauri/target/release/bundle/`.
Without a locally configured signing certificate, the binary won't be signed (see
`src-tauri/tauri.conf.json` for the Authenticode signing config).

### Tests

```bash
npm test                      # frontend (vitest)
cd src-tauri && cargo test    # backend (Rust)
```

### Tech stack

- **Backend**: Rust, Tauri 2.x, `reqwest`, `rusqlite` (local SQLite), API cache with
  per-endpoint TTLs, rate limiting, circuit breaker, retry honoring `Retry-After`.
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Zustand, React Query.

```
src-tauri/src/
  main.rs            # Tauri setup, shared state
  commands.rs         # commands exposed to the frontend
  db.rs               # local SQLite (history, favorites, rank snapshots...)
  settings.rs          # local preferences (encrypted API key, settings)
  api/henrik/          # HTTP client + cache + rate limiter + Henrik endpoints
  riot_local/           # game detection via the local Riot client API
  overlay/              # in-game overlay window
  proxy/                # optional Cloudflare Worker relay (see its own README)

src/
  screens/              # screens (Home, MatchHistory, Trends, Agents, Compare, Settings...)
  components/           # reusable components
  hooks/                # React Query hooks (account, MMR, matches...)
  lib/                  # invoke() wrapper, formatting, stats aggregation
  store/                # global state (Zustand)
```

### CI

A GitHub Actions workflow (`.github/workflows/build.yml`) builds the app on every push/PR
to make sure the Windows build doesn't break (`cargo check`, `cargo test`, `npm test`,
`npm run build`, `cargo build --release`). It doesn't sign anything and produces no
installer (signing needs local-only secrets that live on the build machine, see above) —
it's a continuous compile safety net, not a replacement for the release flow.
`scripts/release.ps1` remains the only way to publish an actual signed release.

## Known limitations

- **SmartScreen**: the signing certificate is self-signed, not purchased from a recognized
  authority, the Windows warning will persist as long as that's the case.
- **Exclusive fullscreen overlay**: can be hidden by Valorant's exclusive fullscreen mode
  (not "borderless"), a Windows API limitation, use "fullscreen borderless" in the game's
  video settings.
- **Unofficial local Riot API**: the lockfile and endpoints used for game detection aren't
  documented by Riot and can change between client updates; the app silently falls back to
  manual lookup mode when that happens.

## Acknowledgments

- [Henrik Dev API](https://docs.henrikdev.xyz/) for Valorant rank/match data.
- [Tauri](https://tauri.app/) for the desktop framework.

## License

Licensed under [GPLv3](LICENSE) — © xnooztvFR. You're free to redistribute and modify this
project, but anything derived from it that you distribute must stay open source under the
same license.
