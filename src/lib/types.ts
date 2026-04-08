export type Difficulty = "easy" | "medium" | "hard";

export interface Word {
  text: string;
  difficulty: Difficulty;
}

export interface Player {
  id: string;
  name: string;
  teamIndex: number | null;
}

export interface Team {
  name: string;
  color: string;
  score: number;
  playerIds: string[];
}

export interface WordResult {
  word: string;
  correct: boolean;
}

export interface StealState {
  word: string;
  buzzedTeamIndex: number | null; // team that buzzed in
  buzzedPlayerName: string | null;
  timeLeft: number; // 10s countdown for steal
}

export interface RoundState {
  teamIndex: number;
  explainerIndex: number;
  words: WordResult[];
  timeLeft: number;
  currentWord: string;
}

export type GamePhase = "lobby" | "teams" | "playing" | "round_active" | "stealing" | "round_end" | "game_over";

export type GameMode = "score" | "rounds";

export interface GameState {
  phase: GamePhase;
  players: Player[];
  teams: Team[];
  round: RoundState | null;
  steal: StealState | null;
  targetScore: number;
  roundDuration: number;
  winnerTeamIndex: number | null;
  // Settings
  difficulty: Difficulty | "mixed";
  gameMode: GameMode;
  maxRounds: number | null;
  roundsPlayed: number;
}

// WebSocket messages
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start_game"; teamCount?: number; difficulty?: Difficulty | "mixed"; gameMode?: GameMode; maxRounds?: number | null }
  | { type: "start_round" }
  | { type: "correct" }
  | { type: "skip" }
  | { type: "buzz" } // steal: player buzzes in
  | { type: "steal_correct" } // host confirms steal guess correct
  | { type: "steal_wrong" } // host confirms steal guess wrong
  | { type: "steal_skip" } // host skips steal (no one guessed)
  | { type: "next_round" }
  | { type: "reset_game" };

export type ServerMessage =
  | { type: "state"; state: GameState; playerId: string }
  | { type: "state_update"; state: GameState }
  | { type: "error"; message: string };

export const TEAM_CONFIGS = [
  { name: "כחולים", color: "#3b82f6" },
  { name: "אדומים", color: "#ef4444" },
  { name: "ירוקים", color: "#22c55e" },
  { name: "סגולים", color: "#a855f7" },
  { name: "כתומים", color: "#f97316" },
] as const;
