import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GameState, ClientMessage, Difficulty, GameMode } from "@/lib/types";
import { Users, Play, RotateCcw, Check, X, Crown, Zap, HelpCircle, Timer, MessageCircle, Ban, Trophy } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import * as sounds from "@/lib/sounds";

interface HostViewProps {
  gameState: GameState;
  send: (msg: ClientMessage) => void;
  serverIp: string | null;
}

function getJoinUrl(serverIp: string | null): string {
  if (serverIp && serverIp !== "localhost") return `http://${serverIp}:${window.location.port}`;
  return `http://${window.location.hostname}:${window.location.port}`;
}

export function HostView({ gameState, send, serverIp }: HostViewProps) {
  const { phase, players, teams } = gameState;
  const prevPhaseRef = useRef(phase);
  const prevPlayerCountRef = useRef(players.length);

  useEffect(() => {
    if (players.length > prevPlayerCountRef.current && phase === "lobby") sounds.playPlayerJoin();
    prevPlayerCountRef.current = players.length;
  }, [players.length, phase]);

  useEffect(() => {
    if (phase === prevPhaseRef.current) return;
    prevPhaseRef.current = phase;
    if (phase === "round_active") sounds.playRoundStart();
    if (phase === "stealing") sounds.playTimeUp();
    if (phase === "game_over") sounds.playVictory();
  }, [phase]);

  return (
    <div className="min-h-dvh p-6" dir="rtl">
      {phase === "lobby" && <Lobby players={players} send={send} serverIp={serverIp} />}
      {phase === "teams" && <TeamsDisplay teams={teams} players={players} send={send} />}
      {(phase === "playing" || phase === "round_active") && <GameBoard gameState={gameState} />}
      {phase === "stealing" && <StealView gameState={gameState} send={send} />}
      {phase === "round_end" && <RoundEnd gameState={gameState} send={send} />}
      {phase === "game_over" && <GameOver gameState={gameState} send={send} />}

      {/* Reset button */}
      {phase !== "lobby" && phase !== "game_over" && (
        <div className="fixed bottom-6 left-6">
          <Button variant="outline" size="sm" className="bg-white/80 backdrop-blur-sm" onClick={() => { if (confirm("לאפס את המשחק?")) { sounds.playClick(); send({ type: "reset_game" }); } }}>
            <RotateCcw className="ml-1 h-4 w-4" /> איפוס
          </Button>
        </div>
      )}

      {/* Round counter */}
      {gameState.gameMode === "rounds" && gameState.maxRounds && phase !== "lobby" && phase !== "game_over" && (
        <div className="fixed top-6 left-6 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 text-lg font-bold shadow-sm">
          סיבוב {gameState.roundsPlayed} / {gameState.maxRounds}
        </div>
      )}
    </div>
  );
}

// ---- Rules Card ----

function RulesCard({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: <MessageCircle className="h-8 w-8" />, title: "תתארו", desc: "תסבירו את המילה בלי להגיד אותה!" },
    { icon: <Ban className="h-8 w-8" />, title: "אסור!", desc: "אסור להגיד את המילה או חלק ממנה" },
    { icon: <Timer className="h-8 w-8" />, title: "60 שניות", desc: "כמה שיותר מילים לפני שנגמר הזמן" },
    { icon: <Trophy className="h-8 w-8" />, title: "ניקוד", desc: "נכון = +1, דילוג = -1" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-3xl font-black text-center mb-6 game-title">איך משחקים?</h2>
        <div className="grid grid-cols-2 gap-4">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-2 p-4 rounded-xl bg-muted/50">
              <div className="text-primary">{step.icon}</div>
              <div className="text-lg font-bold">{step.title}</div>
              <div className="text-sm text-muted-foreground">{step.desc}</div>
            </div>
          ))}
        </div>
        <Button className="btn-party w-full mt-6 py-4 text-xl" onClick={onClose}>הבנתי, יאללה!</Button>
      </Card>
    </div>
  );
}

// ---- Lobby ----

function Lobby({ players, send, serverIp }: { players: GameState["players"]; send: (msg: ClientMessage) => void; serverIp: string | null }) {
  const url = getJoinUrl(serverIp);
  const [teamCount, setTeamCount] = useState(2);
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [gameMode, setGameMode] = useState<GameMode>("score");
  const [maxRounds, setMaxRounds] = useState(10);
  const [showRules, setShowRules] = useState(false);

  const difficultyOptions: { value: Difficulty | "mixed"; label: string; emoji: string }[] = [
    { value: "easy", label: "קל", emoji: "🧒" },
    { value: "medium", label: "בינוני", emoji: "😎" },
    { value: "hard", label: "קשה", emoji: "🤯" },
    { value: "mixed", label: "מעורב", emoji: "🎲" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
      {showRules && <RulesCard onClose={() => setShowRules(false)} />}

      <div className="flex items-center gap-3">
        <h1 className="text-center text-7xl font-black game-title">Alias</h1>
        <button onClick={() => setShowRules(true)} className="mt-2 text-muted-foreground hover:text-primary transition-colors">
          <HelpCircle className="h-8 w-8" />
        </button>
      </div>
      <p className="text-xl text-muted-foreground -mt-4">סרקו את הברקוד כדי להצטרף</p>

      <div className="flex flex-wrap items-start justify-center gap-12">
        {/* QR Code */}
        <Card className="p-8 shadow-lg">
          <QRCodeSVG value={url} size={260} level="M" />
          <p className="mt-3 text-center text-sm text-muted-foreground">{url}</p>
        </Card>

        {/* Players list */}
        <Card className="min-w-[300px] shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> שחקנים ({players.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {players.length === 0 ? (
              <p className="text-muted-foreground">ממתינים לשחקנים...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {players.map((p, i) => {
                  const colors = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500"];
                  return (
                    <Badge key={p.id} className={cn("text-base px-3 py-1 text-white slide-up", colors[i % colors.length])}>
                      {p.name}
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settings */}
      {players.length >= 4 && (
        <Card className="w-full max-w-xl p-6 shadow-lg">
          <div className="flex flex-col gap-4">
            {/* Teams */}
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold min-w-[80px]">קבוצות:</span>
              <div className="flex gap-2">
                {[2, 3, 4, 5].filter(n => n <= Math.floor(players.length / 2)).map((n) => (
                  <Button key={n} variant={teamCount === n ? "default" : "outline"} size="lg" onClick={() => setTeamCount(n)} className={teamCount === n ? "btn-party" : ""}>
                    {n}
                  </Button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold min-w-[80px]">קושי:</span>
              <div className="flex gap-2">
                {difficultyOptions.map((d) => (
                  <Button key={d.value} variant={difficulty === d.value ? "default" : "outline"} size="lg" onClick={() => setDifficulty(d.value)} className={difficulty === d.value ? "btn-party" : ""}>
                    {d.emoji} {d.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Game mode */}
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold min-w-[80px]">מצב:</span>
              <div className="flex gap-2">
                <Button variant={gameMode === "score" ? "default" : "outline"} size="lg" onClick={() => setGameMode("score")} className={gameMode === "score" ? "btn-party" : ""}>
                  🏆 עד 50 נקודות
                </Button>
                <Button variant={gameMode === "rounds" ? "default" : "outline"} size="lg" onClick={() => setGameMode("rounds")} className={gameMode === "rounds" ? "btn-party" : ""}>
                  🔄 מספר סיבובים
                </Button>
              </div>
            </div>

            {/* Round count */}
            {gameMode === "rounds" && (
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold min-w-[80px]">סיבובים:</span>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map((n) => (
                    <Button key={n} variant={maxRounds === n ? "default" : "outline"} size="lg" onClick={() => setMaxRounds(n)} className={maxRounds === n ? "btn-party" : ""}>
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Start button */}
      {players.length >= 4 && (
        <Button
          size="lg"
          className="btn-party px-16 py-7 text-3xl rounded-2xl"
          onClick={() => {
            sounds.unlockAudio();
            sounds.playCountdown();
            send({ type: "start_game", teamCount, difficulty, gameMode, maxRounds: gameMode === "rounds" ? maxRounds : null });
          }}
        >
          <Play className="ml-2 h-7 w-7" /> התחל משחק!
        </Button>
      )}

      {players.length > 0 && players.length < 4 && (
        <p className="text-lg text-muted-foreground">צריך לפחות 4 שחקנים כדי להתחיל</p>
      )}
    </div>
  );
}

// ---- Teams Display ----

function TeamsDisplay({ teams, players, send }: { teams: GameState["teams"]; players: GameState["players"]; send: (msg: ClientMessage) => void }) {
  const [showRules, setShowRules] = useState(true);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
      {showRules && <RulesCard onClose={() => setShowRules(false)} />}

      <h2 className="tv-text game-title">הקבוצות</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {teams.map((team, i) => (
          <Card key={i} className="min-w-[220px] border-3 shadow-lg slide-up" style={{ borderColor: team.color, animationDelay: `${i * 150}ms` }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl font-black" style={{ color: team.color }}>{team.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                {team.playerIds.map(pid => {
                  const player = players.find(p => p.id === pid);
                  return <span key={pid} className="text-lg">{player?.name}</span>;
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button size="lg" className="btn-party px-16 py-7 text-3xl rounded-2xl" onClick={() => { sounds.playClick(); send({ type: "start_round" }); }}>
        <Play className="ml-2 h-7 w-7" /> יאללה!
      </Button>
    </div>
  );
}

// ---- Game Board ----

function GameBoard({ gameState }: { gameState: GameState }) {
  const { teams, round, phase } = gameState;
  const prevTimeRef = useRef(round?.timeLeft ?? 0);
  const prevWordsRef = useRef(round?.words.length ?? 0);
  const [scoreKey, setScoreKey] = useState(0);

  if (!round) return null;

  const currentTeam = teams[round.teamIndex];
  const explainerId = currentTeam.playerIds[round.explainerIndex];
  const explainerPlayer = gameState.players.find(p => p.id === explainerId);
  const isActive = phase === "round_active";
  const isUrgent = round.timeLeft <= 10;
  const correct = round.words.filter(w => w.correct).length;
  const skipped = round.words.filter(w => !w.correct).length;

  if (round.timeLeft !== prevTimeRef.current) {
    prevTimeRef.current = round.timeLeft;
    if (round.timeLeft <= 5 && round.timeLeft > 0) sounds.playUrgentTick();
    else if (round.timeLeft <= 10 && round.timeLeft > 0) sounds.playTick();
  }
  if (round.words.length > prevWordsRef.current) {
    const lastWord = round.words[round.words.length - 1];
    if (lastWord.correct) sounds.playCorrect(); else sounds.playSkip();
    prevWordsRef.current = round.words.length;
    setScoreKey(k => k + 1);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-6">
      {/* Scoreboard */}
      <div className="flex w-full justify-center gap-4">
        {teams.map((team, i) => (
          <Card key={i} className={cn("flex-1 max-w-[220px] text-center border-3 transition-all", i === round.teamIndex && "scale-110 shadow-xl")} style={{ borderColor: team.color }}>
            <CardContent className="p-4">
              <div className="text-base font-bold" style={{ color: team.color }}>{team.name}</div>
              <div key={`${i}-${scoreKey}`} className={cn("tv-score", i === round.teamIndex && "score-pop")} style={{ color: team.color }}>{team.score}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Current team & explainer */}
      <div className="text-center">
        <div className="text-2xl">תור <span className="font-black" style={{ color: currentTeam.color }}>{currentTeam.name}</span></div>
        <div className="text-xl text-muted-foreground">{explainerPlayer?.name} מסביר/ה</div>
      </div>

      {/* Timer */}
      {isActive && (
        <div className={cn("rounded-full w-44 h-44 flex items-center justify-center border-[6px] shadow-lg", isUrgent ? "timer-urgent border-destructive bg-destructive/5" : "")} style={!isUrgent ? { borderColor: currentTeam.color } : undefined}>
          <span className={cn("tv-score", isUrgent ? "text-destructive" : "")} style={!isUrgent ? { color: currentTeam.color } : undefined}>{round.timeLeft}</span>
        </div>
      )}

      {/* Round stats */}
      <div className="flex gap-10 text-2xl">
        <div className="flex items-center gap-2 text-green-600"><Check className="h-8 w-8" /><span className="font-black text-3xl">{correct}</span></div>
        <div className="flex items-center gap-2 text-red-500"><X className="h-8 w-8" /><span className="font-black text-3xl">{skipped}</span></div>
      </div>

      {/* Word badges */}
      {round.words.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
          {round.words.slice(-10).map((w, i) => (
            <Badge key={`${i}-${w.word}`} variant={w.correct ? "default" : "destructive"} className="text-lg px-4 py-1 badge-in" style={{ animationDelay: `${i * 30}ms` }}>
              {w.word}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Steal View ----

function StealView({ gameState, send }: { gameState: GameState; send: (msg: ClientMessage) => void }) {
  const { steal, teams, round } = gameState;
  if (!steal || !round) return null;

  const buzzedTeam = steal.buzzedTeamIndex !== null ? teams[steal.buzzedTeamIndex] : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 steal-flash rounded-3xl p-8">
      {/* Scoreboard */}
      <div className="flex w-full justify-center gap-4">
        {teams.map((team, i) => (
          <Card key={i} className="flex-1 max-w-[200px] text-center border-2" style={{ borderColor: team.color }}>
            <CardContent className="p-4">
              <div className="text-sm font-bold" style={{ color: team.color }}>{team.name}</div>
              <div className="tv-score" style={{ color: team.color }}>{team.score}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Zap className="h-14 w-14 text-yellow-500 drop-shadow-lg" />
      <h2 className="text-5xl font-black text-yellow-600">גניבת מילה!</h2>

      {/* The stolen word — dramatic reveal */}
      <div className="word-reveal">
        <Card className="border-4 border-yellow-500 px-14 py-8 shadow-xl bg-yellow-50">
          <div className="text-center text-6xl font-black">{steal.word}</div>
        </Card>
      </div>

      {!buzzedTeam ? (
        <>
          <p className="text-2xl font-bold text-muted-foreground">מי מנחש?</p>
          <div className={cn("rounded-full w-28 h-28 flex items-center justify-center text-white text-5xl font-black bg-yellow-500 shadow-lg", steal.timeLeft <= 3 && "timer-urgent")}>
            {steal.timeLeft}
          </div>
          <Button variant="outline" size="lg" className="text-xl mt-2" onClick={() => { sounds.playClick(); send({ type: "steal_skip" }); }}>
            אף אחד → דלג
          </Button>
        </>
      ) : (
        <>
          <p className="text-3xl font-bold">
            <span style={{ color: buzzedTeam.color }}>{steal.buzzedPlayerName}</span>
            {" "}מ<span className="font-black" style={{ color: buzzedTeam.color }}>{buzzedTeam.name}</span>!
          </p>
          <div className="flex gap-6">
            <Button size="lg" variant="destructive" className="py-8 px-10 text-2xl font-bold rounded-2xl" onClick={() => { sounds.playSkip(); send({ type: "steal_wrong" }); }}>
              <X className="ml-2 h-7 w-7" /> לא נכון
            </Button>
            <Button size="lg" className="py-8 px-10 text-2xl font-bold bg-green-600 hover:bg-green-700 text-white rounded-2xl" onClick={() => { sounds.playCorrect(); send({ type: "steal_correct" }); }}>
              <Check className="ml-2 h-7 w-7" /> נכון!
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Round End ----

function RoundEnd({ gameState, send }: { gameState: GameState; send: (msg: ClientMessage) => void }) {
  const { teams, round } = gameState;
  if (!round) return null;

  const currentTeam = teams[round.teamIndex];
  const correct = round.words.filter(w => w.correct).length;
  const skipped = round.words.filter(w => !w.correct).length;
  const roundScore = correct - skipped;

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-6">
      <h2 className="tv-text font-black" style={{ color: currentTeam.color }}>סוף תור — {currentTeam.name}</h2>
      <div className="flex gap-8 text-3xl items-baseline">
        <div className="text-green-600 font-black text-4xl">+{correct}</div>
        <div className="text-red-500 font-black text-4xl">-{skipped}</div>
        <div className="font-black text-5xl">= {roundScore > 0 ? `+${roundScore}` : roundScore}</div>
      </div>

      <div className="flex gap-4">
        {teams.map((team, i) => (
          <Card key={i} className="border-3 text-center px-8 py-4 shadow-lg" style={{ borderColor: team.color }}>
            <div className="font-bold" style={{ color: team.color }}>{team.name}</div>
            <div className="tv-score score-pop" style={{ color: team.color }}>{team.score}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
        {round.words.map((w, i) => (
          <Badge key={i} variant={w.correct ? "default" : "destructive"} className="text-base px-3 py-1 badge-in" style={{ animationDelay: `${i * 50}ms` }}>
            {w.correct ? "✓" : "✗"} {w.word}
          </Badge>
        ))}
      </div>

      <Button size="lg" className="btn-party px-14 py-7 text-2xl rounded-2xl" onClick={() => { sounds.playClick(); send({ type: "next_round" }); }}>
        <Play className="ml-2 h-7 w-7" /> תור הבא
      </Button>
    </div>
  );
}

// ---- Game Over ----

function GameOver({ gameState, send }: { gameState: GameState; send: (msg: ClientMessage) => void }) {
  const { teams, winnerTeamIndex } = gameState;
  if (winnerTeamIndex === null) return null;
  const winner = teams[winnerTeamIndex];

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 pt-8">
      <div className="text-8xl">🎉</div>
      <Crown className="h-20 w-20 text-yellow-500 drop-shadow-lg" />
      <h1 className="text-6xl font-black text-center" style={{ color: winner.color }}>{winner.name} ניצחו!</h1>
      <div className="tv-score score-pop" style={{ color: winner.color }}>{winner.score} נקודות</div>

      <div className="flex gap-4">
        {[...teams].sort((a, b) => b.score - a.score).map((team, i) => (
          <Card key={i} className="border-3 text-center px-8 py-4 shadow-lg" style={{ borderColor: team.color }}>
            <div className="text-lg font-bold" style={{ color: team.color }}>
              {i === 0 && "🥇 "}{i === 1 && "🥈 "}{i === 2 && "🥉 "}{team.name}
            </div>
            <div className="text-5xl font-black" style={{ color: team.color }}>{team.score}</div>
          </Card>
        ))}
      </div>

      <Button size="lg" className="btn-party px-14 py-7 text-2xl rounded-2xl" onClick={() => { sounds.playClick(); send({ type: "reset_game" }); }}>
        <RotateCcw className="ml-2 h-6 w-6" /> משחק חדש
      </Button>
    </div>
  );
}
