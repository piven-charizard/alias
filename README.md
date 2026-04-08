# Alias - משחק מילים למסיבות

A local multiplayer word-guessing party game in Hebrew. One person hosts on their laptop (mirrored to TV), everyone else joins from their phones by scanning a QR code. No accounts, no internet required — just WiFi.

## Quick Start

```bash
git clone https://github.com/piven-charizard/alias.git
cd alias
npm install
npm run dev
```

Two URLs will appear in the terminal:

- **Host (TV):** `http://<your-ip>:5173?host=true` — open on your laptop, mirror to TV
- **Players (phones):** scan the QR code shown on the TV

## How It Works

### Setup
1. Host runs `npm run dev` on their laptop
2. Host opens the `?host=true` URL and mirrors/casts to TV
3. Guests scan the QR code on the TV from their phones
4. Each guest enters their name — they appear on the TV in real time

### Game Flow
1. **Lobby** — Host picks settings: team count (2-5), difficulty, game mode
2. **Teams** — Players are auto-assigned to color-coded teams. A rules card appears before the first round
3. **Round** (60s) — One player from the active team is the *explainer*. They see a word on their phone and describe it to their team without saying the word or any part of it. Teammates guess out loud. The explainer taps "Correct" or "Skip" on their phone
4. **Steal** — When time runs out, the last word is revealed on the TV. Other teams have 10 seconds to buzz in and guess it for a bonus point
5. **Scoring** — +1 per correct guess, -1 per skip. First to 50 points wins (or highest score after X rounds)
6. **Next round** — Rotates to the next team. The explainer role rotates within each team

### Settings
| Setting | Options | Default |
|---------|---------|---------|
| Teams | 2–5 | 2 |
| Difficulty | Easy (🧒), Medium (😎), Hard (🤯), Mixed (🎲) | Mixed |
| Game mode | Score (first to 50) or Rounds (5/10/15/20) | Score |

## Architecture

```
alias/
├── server/
│   └── index.ts            # WebSocket server (game state, timer, word queue)
├── src/
│   ├── App.tsx              # Router: host vs player view based on ?host=true
│   ├── components/
│   │   ├── HostView.tsx     # TV screen: lobby → teams → game board → steal → scores
│   │   ├── PlayerView.tsx   # Phone: join → wait → explain/guess/buzz
│   │   └── ui/              # shadcn/ui components (button, card, input, badge, etc.)
│   ├── hooks/
│   │   └── useGame.ts       # WebSocket connection + game state hook
│   ├── lib/
│   │   ├── types.ts         # Shared types: GameState, Player, Team, messages
│   │   ├── words.ts         # 439 Hebrew words tagged by difficulty
│   │   ├── sounds.ts        # Web Audio API sound effects (no external files)
│   │   └── utils.ts         # cn() class merge helper
│   ├── index.css            # Tailwind theme + animations
│   └── main.tsx             # React entry point
├── package.json
├── vite.config.ts           # Vite + WebSocket proxy to port 3001
├── tsconfig.json
└── postcss.config.js
```

### How the pieces connect

1. `npm run dev` starts two processes via `concurrently`:
   - **Vite dev server** (port 5173) — serves the React frontend, exposes on LAN with `--host`
   - **WebSocket server** (port 3001) — manages all game state in memory
2. Vite proxies `/ws` requests to the WebSocket server
3. Every connected client (host TV + player phones) shares the same `GameState` via WebSocket
4. The host view (`?host=true`) is a passive display — it never shows the current word (only the explainer's phone does)
5. Only the current explainer can send `correct`/`skip` messages (server-enforced)

### Key design decisions

- **No database** — all state lives in server memory. Reset the server = fresh game
- **No auth** — anyone on the WiFi can join. Reconnect by name if disconnected
- **Words tagged by difficulty** — `easy` (concrete nouns kids know), `medium` (compound concepts), `hard` (abstract/idiomatic)
- **Steal phase** — official Alias rule: when time runs out mid-word, other teams can buzz in to guess it
- **Sound effects** — generated via Web Audio API, no audio files needed. Includes ticks, buzzer, victory fanfare

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript 5.9 |
| Styling | Tailwind CSS 4 + shadcn/ui (new-york) |
| Build | Vite 7 |
| Server | Node.js + `ws` WebSocket library |
| Dev runner | `tsx` (TypeScript execution) + `concurrently` |
| QR Code | `qrcode.react` |
| Sounds | Web Audio API (built-in, no dependencies) |

## Development

```bash
npm run dev              # Start both servers (frontend + WebSocket)
npm run dev:client       # Frontend only
npm run dev:server       # WebSocket server only
npx tsc --noEmit         # Type check
npx vite build           # Production build
```

### Adding words

Edit `src/lib/words.ts` (client) and `server/index.ts` (server — has its own copy). Words are tagged with difficulty:

```ts
const EASY: Word[] = tag("easy", ["כלב", "חתול", ...]);
const MEDIUM: Word[] = tag("medium", ["שואב אבק", ...]);
const HARD: Word[] = tag("hard", ["אינפלציה", ...]);
```

### Adding shadcn components

```bash
npx shadcn@latest add <component-name>
```

## Requirements

- [Node.js](https://nodejs.org/) 18+
- All players must be on the same WiFi network
- A TV/monitor for screen mirroring (AirPlay, Chromecast, HDMI, etc.)

## License

MIT
