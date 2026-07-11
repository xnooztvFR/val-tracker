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
- Match history, match detail (economy, kills, accuracy per round)
- Stats by map, by agent, and by agent role (Duelist/Initiator/Controller/Sentinel)
- Progression goals ("reach Diamond 2") with a progress bar
- Automatic grouping of matches into play sessions
- Performance heatmap by day of week / hour
- Season-over-season progression comparison
- Side-by-side comparison of two players (VS)
- Duo and squad (3 players) winrate based on games played together
- Personal notes on a tracked player
- CSV/JSON export of match history

**In-game**
- Automatic game detection via the local Riot client, nothing to launch manually
- Always-on-top overlay showing detected players' ranks (compact or detailed mode)
- Suggests your best-performing personal agents during agent select
- Discord Rich Presence (shows what you're doing in the app as your Discord status)

**Quality of life**
- Favorites and search history, reorderable by drag & drop
- Command palette (Ctrl+K) for quick navigation
- Configurable alerts (loss streak, inactivity reminder, rank change)
- Light/dark theme and customizable accent color
- Signed auto-update, competitive leaderboard, Premier mode, esports news (VLR)

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
