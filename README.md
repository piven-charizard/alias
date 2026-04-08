# Alias - משחק מילים למסיבות

A local multiplayer word-guessing party game. One person hosts on their laptop (mirrored to TV), everyone else joins from their phones by scanning a QR code.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/piven-charizard/alias.git
cd alias
npm install

# 2. Run
npm run dev
```

That's it. Two URLs will appear:

- **Host (TV):** `http://<your-ip>:5173?host=true` — open on your laptop, mirror to TV
- **Players (phones):** scan the QR code shown on the TV

## How to Play

1. **Everyone joins** — scan the QR code and enter your name
2. **Host picks settings** — team count, difficulty, game mode
3. **Rounds** — one player explains words, teammates guess
4. **Rules** — describe the word without saying it or any part of it. +1 for correct, -1 for skip
5. **Steal** — when time runs out, other teams can steal the last word
6. **Win** — first to 50 points, or most points after X rounds

## Requirements

- [Node.js](https://nodejs.org/) 18+
- All players on the same WiFi network
