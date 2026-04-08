import { WebSocketServer, WebSocket } from "ws";
import { networkInterfaces } from "os";

// ---- Types ----

type Difficulty = "easy" | "medium" | "hard";
type GameMode = "score" | "rounds";

interface Word { text: string; difficulty: Difficulty; }

interface Player { id: string; name: string; teamIndex: number | null; }
interface Team { name: string; color: string; score: number; playerIds: string[]; }
interface WordResult { word: string; correct: boolean; }

interface StealState {
  word: string;
  buzzedTeamIndex: number | null;
  buzzedPlayerName: string | null;
  timeLeft: number;
}

interface RoundState {
  teamIndex: number;
  explainerIndex: number;
  words: WordResult[];
  timeLeft: number;
  currentWord: string;
}

type GamePhase = "lobby" | "teams" | "playing" | "round_active" | "stealing" | "round_end" | "game_over";

interface GameState {
  phase: GamePhase;
  players: Player[];
  teams: Team[];
  round: RoundState | null;
  steal: StealState | null;
  targetScore: number;
  roundDuration: number;
  winnerTeamIndex: number | null;
  difficulty: Difficulty | "mixed";
  gameMode: GameMode;
  maxRounds: number | null;
  roundsPlayed: number;
}

type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start_game"; teamCount?: number; difficulty?: Difficulty | "mixed"; gameMode?: GameMode; maxRounds?: number | null }
  | { type: "start_round" }
  | { type: "correct" }
  | { type: "skip" }
  | { type: "buzz" }
  | { type: "steal_correct" }
  | { type: "steal_wrong" }
  | { type: "steal_skip" }
  | { type: "next_round" }
  | { type: "reset_game" };

const TEAM_CONFIGS = [
  { name: "כחולים", color: "#3b82f6" },
  { name: "אדומים", color: "#ef4444" },
  { name: "ירוקים", color: "#22c55e" },
  { name: "סגולים", color: "#a855f7" },
  { name: "כתומים", color: "#f97316" },
];

// ---- Word helpers ----

const tag = (d: Difficulty, words: string[]): Word[] => words.map(text => ({ text, difficulty: d }));

const EASY: Word[] = tag("easy", [
  "כלב","חתול","סוס","פרה","חזיר","תרנגולת","ארנב","דג","ציפור",
  "פיל","אריה","קוף","דוב","נחש","צב","פרפר","עכביש","נמלה",
  "זברה","ג'ירפה","כבשה","עז","חמור","גמל","יונה","ברבור",
  "דולפין","כריש","נשר","שועל","צפרדע","פינגווין",
  "פיצה","גלידה","שוקולד","עוגה","לחם","ביצה","חלב","גבינה",
  "בננה","תפוח","תפוז","אבטיח","עגבנייה","מלפפון","גזר","תירס",
  "אורז","פסטה","סלט","מרק","קפה","תה","מים","מיץ",
  "פלאפל","חומוס","פיתה","שניצל","במבה","ביסלי",
  "יד","רגל","ראש","עין","אוזן","אף","פה","שן","לשון",
  "בטן","גב","אצבע","ברך","כתף","צוואר",
  "כדור","כיסא","שולחן","מיטה","דלת","חלון","מראה","מפתח",
  "שעון","טלפון","מחשב","טלוויזיה","מנורה","כרית","שמיכה",
  "כובע","נעליים","משקפיים","מטריה","תיק","ספר",
  "שמש","ירח","כוכב","גשם","שלג","רוח","ענן","קשת",
  "עץ","פרח","הר","נהר","ים","חוף","אבן",
  "בית","בית ספר","גן","חנות","מסעדה","בריכה","מגרש",
  "לרוץ","לקפוץ","לשחות","לצייר","לשיר","לרקוד","לבשל",
  "לישון","לאכול","לשתות","לצחוק","לבכות",
  "רופא","מורה","שוטר","כבאי","נהג","טבח",
]);

const MEDIUM: Word[] = tag("medium", [
  "תוכי","פלמינגו","אלפקה","דינוזאור","תנין","עקרב",
  "ינשוף","קנגורו","עטלף","חד קרן","תמנון","כלב ים","דג זהב",
  "סושי","המבורגר","שקשוקה","קרואסון","פנקייק","נקניקייה",
  "שווארמה","סטייק","סופגנייה","בייגלה","לימונדה",
  "טחינה","קרמבו","ג'חנון","מלוואח","סביח","שקדי מרק","לאפה",
  "טאקו","ראמן","קרפ","בורקס","ג'לטו","נאצ'וס","קבב",
  "טייס","שף","אסטרונאוט","צלם","קוסם","ליצן","בלש",
  "מציל","דוור","נהג מונית","עורך דין","אדריכל","גנן","ספר",
  "שחקן","במאי","מעצב","עיתונאי","מאמן כושר",
  "מקרר","מכונת כביסה","שואב אבק","מיקרוגל","טוסטר","מזגן",
  "שעון מעורר","סולם","ארנק","סבון","מברשת שיניים","מספריים",
  "פנס","גרב",
  "הר געש","מפל מים","קשת בענן","רעם","ברק","סופת שלג",
  "שקיעה","מדבר","אוקיינוס","יער","מערה","אגם","קרחון",
  "כדורגל","כדורסל","טניס","שחייה","גלישה","סקי","יוגה",
  "אגרוף","שחמט","באולינג","פינג פונג","מרתון","גולף",
  "צלילה","טיפוס","סקייטבורד",
  "בית חולים","תחנת רכבת","גן חיות","לונה פארק","מוזיאון",
  "קולנוע","ספרייה","סופרמרקט","חדר כושר","בית קפה","מלון",
  "שדה תעופה","תחנת דלק","מספרה","בנק",
  "להתעטש","לפהק","להתגלח","לשרוק","למחוא כפיים",
  "להתחפש","להתנדנד","להתאמן","לנהוג","לטפס","לצלול","לזרוק",
  "עניבה","צעיף","כפפות","חגורה","משקפי שמש","סנדלים",
  "מגפיים","פיג'מה","חליפה","שמלה","ג'ינס","סוודר","מעיל גשם",
  "רובוט","מזלט","לוויין","רקטה","מצלמה","אוזניות",
  "מדפסת","מקלדת","שלט רחוק","מיקרופון","טאבלט",
  "מרפק","קרסול","עפעף","גבה","שפם","בוהן","מצח","סנטר",
  "נינג'ה","פיראט","אביר","מכשפה","קאובוי","סופרמן","רובין הוד",
  "מטוס","רכבת","אופנוע","מסוק","צוללת","קרוואן","סירה",
  "רכבל","אופניים","קורקינט",
  "גיטרה","תופים","כינור","חצוצרה","הרמוניקה","סקסופון",
  "חנוכייה","מצה","שופר","סוכה","זיקוקים","מתנה","בלון",
  "משקפת","מצפן","טלסקופ","שרשרת","טבעת","כתר","חרב","דגל","פאזל",
]);

const HARD: Word[] = tag("hard", [
  "עצלן","ביישן","אמיץ","עצבני","מקנא","סקרן","עקשן",
  "רומנטי","פזרן","קמצן","אופטימי","פסימי","נוסטלגי",
  "היסטרי","מבולבל","מיואש","נלהב","מופתע",
  "חלום","סיוט","דמיון","זיכרון","חירות","צדק",
  "אינפלציה","דמוקרטיה","גורל","מזל","קארמה","אירוניה",
  "נוסטלגיה","אמפתיה","סרקזם","פרדוקס","אוטופיה",
  "ביורוקרטיה","פילוסופיה","אנרכיה","קפיטליזם",
  "פרעה","סמוראי","גלדיאטור","ערפד","זומבי",
  "פקק תנועה","דייט ראשון","ראיון עבודה","חניה מקבילה",
  "שבירת שיא","נפילה מסולם","הצעת נישואין","תספורת גרועה",
  "שריקה","גיהוק","שיהוק","קריצה","מחמאה",
  "דיפלומט","סטנדאפיסט","בלוגר","פסנתרן",
  "שעון חול","זכוכית מגדלת","קשת וחץ",
  "טורנדו","צונאמי","רעידת אדמה",
  "ביליארד","רכיבה על סוסים",
  "הזמנת פיצה","צילום סלפי","נסיעה במעלית","המתנה לאוטובוס",
  "תור בסופר","שיחת טלפון",
  "מוסקה","דים סאם","פד תאי",
  "דיסקו","מזרקה","דומינו",
  "סופרהירו","חייזר","מרגל","בלש פרטי","שודד","מדען מטורף",
  "נסיכה","דרקון",
  "עוגת יום הולדת","נרות","קונפטי","מסכה",
  "כביסה","בישול","מעבורת","אקורדיון","בנג'ו","נבל",
  "גלגל","קוביה","מגן","מפה",
]);

const ALL_WORDS: Word[] = [...EASY, ...MEDIUM, ...HARD];

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getFilteredWords(difficulty: Difficulty | "mixed"): Word[] {
  if (difficulty === "mixed") return ALL_WORDS;
  return ALL_WORDS.filter(w => w.difficulty === difficulty);
}

// ---- Game State ----

let gameState: GameState = {
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

let wordQueue: Word[] = shuffleArray(ALL_WORDS);
let wordIndex = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let stealTimerInterval: ReturnType<typeof setInterval> | null = null;

const teamExplainerRotation: Map<number, number> = new Map();

function getNextWord(): string {
  if (wordIndex >= wordQueue.length) {
    wordQueue = shuffleArray(wordQueue);
    wordIndex = 0;
  }
  return wordQueue[wordIndex++].text;
}

function resetGame() {
  if (timerInterval) clearInterval(timerInterval);
  if (stealTimerInterval) clearInterval(stealTimerInterval);
  gameState = {
    phase: "lobby",
    players: gameState.players.map(p => ({ ...p, teamIndex: null })),
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
  wordQueue = shuffleArray(ALL_WORDS);
  wordIndex = 0;
  teamExplainerRotation.clear();
}

// ---- WebSocket Server ----

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

interface ConnectedClient { ws: WebSocket; playerId: string; }

const clients: ConnectedClient[] = [];
let nextId = 1;

function broadcast() {
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: "state_update", state: gameState }));
    }
  }
}

function sendTo(ws: WebSocket, playerId: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "state", state: gameState, playerId, serverIp: getLocalIP() }));
  }
}

function assignTeams(teamCount: number) {
  const players = shuffleArray(gameState.players);
  const teams: Team[] = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push({ name: TEAM_CONFIGS[i].name, color: TEAM_CONFIGS[i].color, score: 0, playerIds: [] });
  }
  players.forEach((player, i) => {
    const teamIdx = i % teamCount;
    teams[teamIdx].playerIds.push(player.id);
    player.teamIndex = teamIdx;
  });
  gameState.teams = teams;
  gameState.phase = "teams";
  for (let i = 0; i < teamCount; i++) teamExplainerRotation.set(i, 0);
}

function checkWinCondition(): boolean {
  if (gameState.gameMode === "score") {
    const winnerIdx = gameState.teams.findIndex(t => t.score >= gameState.targetScore);
    if (winnerIdx !== -1) {
      gameState.phase = "game_over";
      gameState.winnerTeamIndex = winnerIdx;
      return true;
    }
  } else if (gameState.gameMode === "rounds" && gameState.maxRounds !== null) {
    if (gameState.roundsPlayed >= gameState.maxRounds) {
      // Highest score wins
      let maxScore = -Infinity;
      let winnerIdx = 0;
      gameState.teams.forEach((t, i) => { if (t.score > maxScore) { maxScore = t.score; winnerIdx = i; } });
      gameState.phase = "game_over";
      gameState.winnerTeamIndex = winnerIdx;
      return true;
    }
  }
  return false;
}

function startRound() {
  if (!gameState.round && gameState.teams.length === 0) return;

  let teamIndex: number;
  if (gameState.round === null) {
    teamIndex = 0;
  } else {
    teamIndex = (gameState.round.teamIndex + 1) % gameState.teams.length;
  }

  const team = gameState.teams[teamIndex];
  const explainerIdx = teamExplainerRotation.get(teamIndex) ?? 0;

  gameState.round = {
    teamIndex,
    explainerIndex: explainerIdx,
    words: [],
    timeLeft: gameState.roundDuration,
    currentWord: getNextWord(),
  };
  gameState.steal = null;
  gameState.phase = "round_active";

  teamExplainerRotation.set(teamIndex, (explainerIdx + 1) % team.playerIds.length);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (gameState.round) {
      gameState.round.timeLeft--;
      if (gameState.round.timeLeft <= 0) {
        endRound();
      } else {
        broadcast();
      }
    }
  }, 1000);

  broadcast();
}

function endRound() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (!gameState.round) return;

  // The current word was being explained when time ran out → start steal phase
  const stolenWord = gameState.round.currentWord;

  // Calculate score for words already answered
  const correct = gameState.round.words.filter(w => w.correct).length;
  const skipped = gameState.round.words.filter(w => !w.correct).length;
  const roundScore = correct - skipped;
  gameState.teams[gameState.round.teamIndex].score += roundScore;
  gameState.roundsPlayed++;

  // Enter stealing phase (other teams try to guess the last word)
  gameState.steal = {
    word: stolenWord,
    buzzedTeamIndex: null,
    buzzedPlayerName: null,
    timeLeft: 10,
  };
  gameState.phase = "stealing";

  // 10-second countdown for steal
  if (stealTimerInterval) clearInterval(stealTimerInterval);
  stealTimerInterval = setInterval(() => {
    if (gameState.steal) {
      gameState.steal.timeLeft--;
      if (gameState.steal.timeLeft <= 0) {
        finishSteal();
      } else {
        broadcast();
      }
    }
  }, 1000);

  broadcast();
}

function finishSteal() {
  if (stealTimerInterval) clearInterval(stealTimerInterval);
  stealTimerInterval = null;

  // Move to round_end (or game_over)
  if (!checkWinCondition()) {
    gameState.phase = "round_end";
  }
  broadcast();
}

function handleBuzz(playerId: string) {
  if (!gameState.steal || gameState.phase !== "stealing") return;
  if (gameState.steal.buzzedTeamIndex !== null) return; // already buzzed

  const player = gameState.players.find(p => p.id === playerId);
  if (!player || player.teamIndex === null) return;

  // Can't steal your own team's word
  if (gameState.round && player.teamIndex === gameState.round.teamIndex) return;

  // Stop the steal timer while host decides
  if (stealTimerInterval) clearInterval(stealTimerInterval);
  stealTimerInterval = null;

  gameState.steal.buzzedTeamIndex = player.teamIndex;
  gameState.steal.buzzedPlayerName = player.name;
  broadcast();
}

function handleStealCorrect() {
  if (!gameState.steal || gameState.steal.buzzedTeamIndex === null) return;
  gameState.teams[gameState.steal.buzzedTeamIndex].score += 1;
  finishSteal();
}

function handleStealWrong() {
  if (!gameState.steal) return;
  // Wrong guess or skip - just move on
  finishSteal();
}

function getCurrentExplainerId(): string | null {
  if (!gameState.round) return null;
  const team = gameState.teams[gameState.round.teamIndex];
  return team?.playerIds[gameState.round.explainerIndex] ?? null;
}

function handleCorrect(senderId: string) {
  if (!gameState.round || gameState.phase !== "round_active") return;
  if (senderId !== getCurrentExplainerId()) return;
  gameState.round.words.push({ word: gameState.round.currentWord, correct: true });
  gameState.round.currentWord = getNextWord();
  broadcast();
}

function handleSkip(senderId: string) {
  if (!gameState.round || gameState.phase !== "round_active") return;
  if (senderId !== getCurrentExplainerId()) return;
  gameState.round.words.push({ word: gameState.round.currentWord, correct: false });
  gameState.round.currentWord = getNextWord();
  broadcast();
}

// ---- Connection handling ----

wss.on("connection", (ws) => {
  let playerId = `player_${nextId++}`;
  const client: ConnectedClient = { ws, playerId };
  clients.push(client);
  sendTo(ws, playerId);

  ws.on("message", (data) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case "join": {
          const existingByName = gameState.players.find(
            p => p.name === msg.name && !clients.some(c => c.playerId === p.id && c.ws !== ws)
          );
          if (existingByName) {
            playerId = existingByName.id;
            client.playerId = playerId;
          } else {
            const existingById = gameState.players.find(p => p.id === playerId);
            if (!existingById) {
              gameState.players.push({ id: playerId, name: msg.name, teamIndex: null });
            }
          }
          sendTo(ws, playerId);
          for (const c of clients) {
            if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({ type: "state_update", state: gameState }));
            }
          }
          break;
        }
        case "start_game": {
          const count = msg.teamCount ?? 2;
          gameState.difficulty = msg.difficulty ?? "mixed";
          gameState.gameMode = msg.gameMode ?? "score";
          gameState.maxRounds = msg.maxRounds ?? null;
          gameState.roundsPlayed = 0;
          // Filter and shuffle words based on difficulty
          wordQueue = shuffleArray(getFilteredWords(gameState.difficulty));
          wordIndex = 0;
          assignTeams(Math.min(count, gameState.players.length, 5));
          broadcast();
          break;
        }
        case "start_round": { startRound(); break; }
        case "correct": { handleCorrect(playerId); break; }
        case "skip": { handleSkip(playerId); break; }
        case "buzz": { handleBuzz(playerId); break; }
        case "steal_correct": { handleStealCorrect(); break; }
        case "steal_wrong": { handleStealWrong(); break; }
        case "steal_skip": { handleStealWrong(); break; }
        case "next_round": { startRound(); break; }
        case "reset_game": { resetGame(); broadcast(); break; }
      }
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  });

  ws.on("close", () => {
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

// ---- Get local IP ----
function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

const localIP = getLocalIP();
console.log(`\n🎮 Alias Game Server running on port ${PORT}`);
console.log(`📡 Local IP: ${localIP}`);
console.log(`🔗 Players connect to: http://${localIP}:5173`);
console.log(`📺 Host view: http://${localIP}:5173?host=true\n`);
