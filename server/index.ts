import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { networkInterfaces } from "os";
import path from "path";
import { fileURLToPath } from "url";
import type {
  GameState,
  ClientMessage,
  Team,
  Word,
} from "../src/lib/types.js";
import { TEAM_CONFIGS } from "../src/lib/types.js";
import { ALL_WORDS, getFilteredWords, shuffleWords } from "../src/lib/words.js";

// ---- Room Code Generation ----

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude I and O

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () =>
      ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

// ---- Connected Client ----

interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  room: Room | null;
}

// ---- Room Class ----

class Room {
  code: string;
  gameState: GameState;
  wordQueue: Word[];
  wordIndex: number;
  timerInterval: ReturnType<typeof setInterval> | null = null;
  stealTimerInterval: ReturnType<typeof setInterval> | null = null;
  teamExplainerRotation: Map<number, number> = new Map();
  clients: ConnectedClient[] = [];
  cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  nextId = 1;

  constructor(code: string) {
    this.code = code;
    this.gameState = {
      phase: "lobby",
      players: [],
      teams: [],
      round: null,
      steal: null,
      targetScore: 50,
      roundDuration: 60,
      winnerTeamIndex: null,
      difficulty: "mixed",
      gameMode: "score",
      maxRounds: null,
      roundsPlayed: 0,
    };
    this.wordQueue = shuffleWords(ALL_WORDS);
    this.wordIndex = 0;
  }

  addClient(client: ConnectedClient) {
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }
    client.room = this;
    this.clients.push(client);
    this.sendTo(client.ws, client.playerId);
  }

  removeClient(client: ConnectedClient) {
    const idx = this.clients.indexOf(client);
    if (idx !== -1) this.clients.splice(idx, 1);
    client.room = null;

    if (this.clients.length === 0) {
      this.cleanupTimeout = setTimeout(() => {
        if (this.clients.length === 0) {
          this.destroy();
          rooms.delete(this.code);
          console.log(`Room ${this.code} destroyed (empty)`);
        }
      }, 30_000);
    }
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.stealTimerInterval) clearInterval(this.stealTimerInterval);
    if (this.cleanupTimeout) clearTimeout(this.cleanupTimeout);
  }

  broadcast() {
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "state_update", state: this.gameState }));
      }
    }
  }

  sendTo(ws: WebSocket, playerId: string) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "state",
        state: this.gameState,
        playerId,
        roomCode: this.code,
        serverIp: getLocalIP(),
      }));
    }
  }

  getNextWord(): string {
    if (this.wordIndex >= this.wordQueue.length) {
      this.wordQueue = shuffleWords(this.wordQueue);
      this.wordIndex = 0;
    }
    return this.wordQueue[this.wordIndex++].text;
  }

  resetGame() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.stealTimerInterval) clearInterval(this.stealTimerInterval);
    this.timerInterval = null;
    this.stealTimerInterval = null;
    this.gameState = {
      phase: "lobby",
      players: this.gameState.players.map(p => ({ ...p, teamIndex: null })),
      teams: [],
      round: null,
      steal: null,
      targetScore: 50,
      roundDuration: 60,
      winnerTeamIndex: null,
      difficulty: "mixed",
      gameMode: "score",
      maxRounds: null,
      roundsPlayed: 0,
    };
    this.wordQueue = shuffleWords(ALL_WORDS);
    this.wordIndex = 0;
    this.teamExplainerRotation.clear();
  }

  assignTeams(teamCount: number) {
    const players = shuffleArray(this.gameState.players);
    const teams: Team[] = [];
    for (let i = 0; i < teamCount; i++) {
      teams.push({ name: TEAM_CONFIGS[i].name, color: TEAM_CONFIGS[i].color, score: 0, playerIds: [] });
    }
    players.forEach((player, i) => {
      const teamIdx = i % teamCount;
      teams[teamIdx].playerIds.push(player.id);
      player.teamIndex = teamIdx;
    });
    this.gameState.teams = teams;
    this.gameState.phase = "teams";
    for (let i = 0; i < teamCount; i++) this.teamExplainerRotation.set(i, 0);
  }

  checkWinCondition(): boolean {
    if (this.gameState.gameMode === "score") {
      const winnerIdx = this.gameState.teams.findIndex(t => t.score >= this.gameState.targetScore);
      if (winnerIdx !== -1) {
        this.gameState.phase = "game_over";
        this.gameState.winnerTeamIndex = winnerIdx;
        return true;
      }
    } else if (this.gameState.gameMode === "rounds" && this.gameState.maxRounds !== null) {
      if (this.gameState.roundsPlayed >= this.gameState.maxRounds) {
        let maxScore = -Infinity;
        let winnerIdx = 0;
        this.gameState.teams.forEach((t, i) => {
          if (t.score > maxScore) { maxScore = t.score; winnerIdx = i; }
        });
        this.gameState.phase = "game_over";
        this.gameState.winnerTeamIndex = winnerIdx;
        return true;
      }
    }
    return false;
  }

  startRound() {
    if (!this.gameState.round && this.gameState.teams.length === 0) return;

    let teamIndex: number;
    if (this.gameState.round === null) {
      teamIndex = 0;
    } else {
      teamIndex = (this.gameState.round.teamIndex + 1) % this.gameState.teams.length;
    }

    const team = this.gameState.teams[teamIndex];
    const explainerIdx = this.teamExplainerRotation.get(teamIndex) ?? 0;

    this.gameState.round = {
      teamIndex,
      explainerIndex: explainerIdx,
      words: [],
      timeLeft: this.gameState.roundDuration,
      currentWord: this.getNextWord(),
    };
    this.gameState.steal = null;
    this.gameState.phase = "round_active";

    this.teamExplainerRotation.set(teamIndex, (explainerIdx + 1) % team.playerIds.length);

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.gameState.round) {
        this.gameState.round.timeLeft--;
        if (this.gameState.round.timeLeft <= 0) {
          this.endRound();
        } else {
          this.broadcast();
        }
      }
    }, 1000);

    this.broadcast();
  }

  endRound() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    if (!this.gameState.round) return;

    const stolenWord = this.gameState.round.currentWord;
    const correct = this.gameState.round.words.filter(w => w.correct).length;
    const skipped = this.gameState.round.words.filter(w => !w.correct).length;
    const roundScore = correct - skipped;
    this.gameState.teams[this.gameState.round.teamIndex].score += roundScore;
    this.gameState.roundsPlayed++;

    this.gameState.steal = {
      word: stolenWord,
      buzzedTeamIndex: null,
      buzzedPlayerName: null,
      timeLeft: 10,
    };
    this.gameState.phase = "stealing";

    if (this.stealTimerInterval) clearInterval(this.stealTimerInterval);
    this.stealTimerInterval = setInterval(() => {
      if (this.gameState.steal) {
        this.gameState.steal.timeLeft--;
        if (this.gameState.steal.timeLeft <= 0) {
          this.finishSteal();
        } else {
          this.broadcast();
        }
      }
    }, 1000);

    this.broadcast();
  }

  finishSteal() {
    if (this.stealTimerInterval) clearInterval(this.stealTimerInterval);
    this.stealTimerInterval = null;

    if (!this.checkWinCondition()) {
      this.gameState.phase = "round_end";
    }
    this.broadcast();
  }

  handleBuzz(playerId: string) {
    if (!this.gameState.steal || this.gameState.phase !== "stealing") return;
    if (this.gameState.steal.buzzedTeamIndex !== null) return;

    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player || player.teamIndex === null) return;
    if (this.gameState.round && player.teamIndex === this.gameState.round.teamIndex) return;

    if (this.stealTimerInterval) clearInterval(this.stealTimerInterval);
    this.stealTimerInterval = null;

    this.gameState.steal.buzzedTeamIndex = player.teamIndex;
    this.gameState.steal.buzzedPlayerName = player.name;
    this.broadcast();
  }

  handleStealCorrect() {
    if (!this.gameState.steal || this.gameState.steal.buzzedTeamIndex === null) return;
    this.gameState.teams[this.gameState.steal.buzzedTeamIndex].score += 1;
    this.finishSteal();
  }

  handleStealWrong() {
    if (!this.gameState.steal) return;
    this.finishSteal();
  }

  getCurrentExplainerId(): string | null {
    if (!this.gameState.round) return null;
    const team = this.gameState.teams[this.gameState.round.teamIndex];
    return team?.playerIds[this.gameState.round.explainerIndex] ?? null;
  }

  handleCorrect(senderId: string) {
    if (!this.gameState.round || this.gameState.phase !== "round_active") return;
    if (senderId !== this.getCurrentExplainerId()) return;
    this.gameState.round.words.push({ word: this.gameState.round.currentWord, correct: true });
    this.gameState.round.currentWord = this.getNextWord();
    this.broadcast();
  }

  handleSkip(senderId: string) {
    if (!this.gameState.round || this.gameState.phase !== "round_active") return;
    if (senderId !== this.getCurrentExplainerId()) return;
    this.gameState.round.words.push({ word: this.gameState.round.currentWord, correct: false });
    this.gameState.round.currentWord = this.getNextWord();
    this.broadcast();
  }

  handleMessage(client: ConnectedClient, msg: ClientMessage) {
    switch (msg.type) {
      case "join": {
        const existingByName = this.gameState.players.find(
          p => p.name === msg.name && !this.clients.some(c => c.playerId === p.id && c.ws !== client.ws)
        );
        if (existingByName) {
          client.playerId = existingByName.id;
        } else {
          const existingById = this.gameState.players.find(p => p.id === client.playerId);
          if (!existingById) {
            this.gameState.players.push({ id: client.playerId, name: msg.name, teamIndex: null });
          }
        }
        this.sendTo(client.ws, client.playerId);
        for (const c of this.clients) {
          if (c.ws !== client.ws && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({ type: "state_update", state: this.gameState }));
          }
        }
        break;
      }
      case "start_game": {
        const count = msg.teamCount ?? 2;
        this.gameState.difficulty = msg.difficulty ?? "mixed";
        this.gameState.gameMode = msg.gameMode ?? "score";
        this.gameState.maxRounds = msg.maxRounds ?? null;
        this.gameState.roundsPlayed = 0;
        this.wordQueue = shuffleWords(getFilteredWords(this.gameState.difficulty));
        this.wordIndex = 0;
        this.assignTeams(Math.min(count, this.gameState.players.length, 5));
        this.broadcast();
        break;
      }
      case "start_round": { this.startRound(); break; }
      case "correct": { this.handleCorrect(client.playerId); break; }
      case "skip": { this.handleSkip(client.playerId); break; }
      case "buzz": { this.handleBuzz(client.playerId); break; }
      case "steal_correct": { this.handleStealCorrect(); break; }
      case "steal_wrong": { this.handleStealWrong(); break; }
      case "steal_skip": { this.handleStealWrong(); break; }
      case "next_round": { this.startRound(); break; }
      case "reset_game": { this.resetGame(); this.broadcast(); break; }
    }
  }
}

// ---- Utility ----

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

// ---- Room Registry ----

const rooms = new Map<string, Room>();

// ---- Server Setup ----

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3001");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Serve static files in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// WebSocket upgrade on /ws path
server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url || "/", "http://base.url");
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ---- Connection Handling ----

let globalNextId = 1;

wss.on("connection", (ws) => {
  const client: ConnectedClient = { ws, playerId: `player_${globalNextId++}`, room: null };

  ws.on("message", (data) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      // Room-level messages (before joining a room)
      if (msg.type === "create_room") {
        const code = generateRoomCode();
        const room = new Room(code);
        rooms.set(code, room);
        room.addClient(client);
        ws.send(JSON.stringify({ type: "room_created", roomCode: code }));
        console.log(`Room ${code} created (${rooms.size} active rooms)`);
        return;
      }

      if (msg.type === "join_room") {
        const room = rooms.get(msg.roomCode.toUpperCase());
        if (!room) {
          ws.send(JSON.stringify({ type: "room_error", message: "Room not found" }));
          return;
        }
        room.addClient(client);
        ws.send(JSON.stringify({ type: "room_joined", roomCode: room.code }));
        console.log(`Player joined room ${room.code} (${room.clients.length} clients)`);
        return;
      }

      // All other messages require being in a room
      if (!client.room) {
        ws.send(JSON.stringify({ type: "error", message: "Not in a room" }));
        return;
      }

      client.room.handleMessage(client, msg);
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  });

  ws.on("close", () => {
    if (client.room) {
      client.room.removeClient(client);
    }
  });
});

// ---- Start Server ----

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`\nAlias Game Server running on port ${PORT}`);
  console.log(`Local IP: ${localIP}`);
  console.log(`Players connect to: http://${localIP}:${PORT === 3001 ? "5173" : String(PORT)}`);
  console.log(`Host view: http://${localIP}:${PORT === 3001 ? "5173" : String(PORT)}?host=true\n`);
});
