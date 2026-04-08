import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GameState, ClientMessage, Player, Team } from "@/lib/types";
import { Check, X, Clock, PartyPopper, Hand, Zap } from "lucide-react";
import * as sounds from "@/lib/sounds";

interface PlayerViewProps {
  gameState: GameState;
  playerId: string | null;
  send: (msg: ClientMessage) => void;
}

export function PlayerView({ gameState, playerId, send }: PlayerViewProps) {
  const player = gameState.players.find((p) => p.id === playerId);
  const hasJoined = !!player;

  if (!hasJoined) return <JoinScreen send={send} />;

  const { phase, teams, round, steal } = gameState;

  if (phase === "lobby") {
    return <WaitingScreen player={player} message="ממתינים לשחקנים נוספים..." />;
  }

  if (phase === "teams") {
    const team = player.teamIndex !== null ? teams[player.teamIndex] : null;
    if (!team) return <WaitingScreen player={player} message="המשחק כבר התחיל. המתן לאיפוס..." />;
    return <TeamAssigned player={player} team={team} players={gameState.players} />;
  }

  // Late joiner without a team
  if (player.teamIndex === null) {
    return <WaitingScreen player={player} message="המשחק כבר התחיל. המתן לאיפוס..." />;
  }

  if (phase === "round_active" && round) {
    const currentTeam = teams[round.teamIndex];
    const isExplainer = currentTeam.playerIds[round.explainerIndex] === playerId;
    const isMyTeam = player.teamIndex === round.teamIndex;

    if (isExplainer) return <ExplainerView round={round} team={currentTeam} send={send} />;
    if (isMyTeam) return <GuesserView round={round} team={currentTeam} />;
    return <SpectatorView round={round} teams={teams} currentTeam={currentTeam} />;
  }

  if (phase === "stealing" && steal && round) {
    const isExplainerTeam = player.teamIndex === round.teamIndex;
    if (isExplainerTeam) {
      return <StatusScreen title="גניבת מילה!" subtitle="קבוצות אחרות מנסות לנחש..." color="#eab308" />;
    }
    return <StealBuzzView steal={steal} teams={teams} player={player} send={send} />;
  }

  if (phase === "round_end" && round) {
    const currentTeam = teams[round.teamIndex];
    const correct = round.words.filter((w) => w.correct).length;
    const skipped = round.words.filter((w) => !w.correct).length;
    return <StatusScreen title="סוף התור" subtitle={`${currentTeam.name}: +${correct - skipped} נקודות`} color={currentTeam.color} />;
  }

  if (phase === "game_over" && gameState.winnerTeamIndex !== null) {
    const winner = teams[gameState.winnerTeamIndex];
    const isWinner = player.teamIndex === gameState.winnerTeamIndex;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
        <PartyPopper className="h-16 w-16 text-yellow-500" />
        <h1 className="text-4xl font-black" style={{ color: winner.color }}>
          {isWinner ? "ניצחתם! 🎉" : `${winner.name} ניצחו`}
        </h1>
        <div className="text-6xl font-black" style={{ color: winner.color }}>{winner.score}</div>
      </div>
    );
  }

  const myTeam = player.teamIndex !== null ? teams[player.teamIndex] : null;
  return <WaitingScreen player={player} message="ממתינים לתור הבא..." team={myTeam} />;
}

// ---- Join Screen ----

function JoinScreen({ send }: { send: (msg: ClientMessage) => void }) {
  const [name, setName] = useState("");
  const handleJoin = () => {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      sounds.unlockAudio();
      sounds.playClick();
      send({ type: "join", name: trimmed });
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-center text-5xl font-black game-title">
        Alias
      </h1>
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="השם שלך" className="text-center text-xl py-6" autoFocus maxLength={20} onKeyDown={(e) => e.key === "Enter" && handleJoin()} dir="rtl" />
          <Button size="lg" className="btn-party w-full py-6 text-xl" onClick={handleJoin} disabled={name.trim().length === 0}>
            הצטרף למשחק
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Waiting Screen ----

function WaitingScreen({ player, message, team }: { player: Player; message: string; team?: Team | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-2xl font-bold">שלום {player.name}! 👋</div>
      {team && <Badge className="text-lg px-4 py-2" style={{ backgroundColor: team.color, color: "white" }}>{team.name}</Badge>}
      <div className="text-lg text-muted-foreground">{message}</div>
      <div className="mt-4 h-2 w-32 animate-pulse rounded-full bg-muted" />
    </div>
  );
}

// ---- Team Assigned ----

function TeamAssigned({ player, team, players }: { player: Player; team: Team | null; players: Player[] }) {
  if (!team) return null;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="text-xl">הקבוצה שלך:</div>
      <h2 className="text-5xl font-black" style={{ color: team.color }}>{team.name}</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {team.playerIds.map((pid) => {
          const p = players.find((pl) => pl.id === pid);
          return (
            <Badge key={pid} variant={pid === player.id ? "default" : "secondary"} className="text-base px-3 py-1" style={pid === player.id ? { backgroundColor: team.color } : undefined}>
              {p?.name} {pid === player.id && "(את/ה)"}
            </Badge>
          );
        })}
      </div>
      <div className="mt-4 text-muted-foreground">ממתינים להתחלה...</div>
    </div>
  );
}

// ---- Explainer View ----

function ExplainerView({ round, team, send }: { round: NonNullable<GameState["round"]>; team: Team; send: (msg: ClientMessage) => void }) {
  const isUrgent = round.timeLeft <= 10;
  const correct = round.words.filter((w) => w.correct).length;
  const skipped = round.words.filter((w) => !w.correct).length;
  const prevTimeRef = useRef(round.timeLeft);

  useEffect(() => {
    if (round.timeLeft !== prevTimeRef.current) {
      prevTimeRef.current = round.timeLeft;
      if (round.timeLeft <= 5 && round.timeLeft > 0) sounds.playUrgentTick();
      else if (round.timeLeft <= 10 && round.timeLeft > 0) sounds.playTick();
      if (round.timeLeft === 0) sounds.playTimeUp();
    }
  }, [round.timeLeft]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between p-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2"><Check className="h-5 w-5 text-green-600" /><span className="text-xl font-bold text-green-600">{correct}</span></div>
        <div className={cn("flex items-center gap-1 rounded-full px-4 py-2 text-white font-bold text-xl", isUrgent ? "bg-destructive timer-urgent" : "")} style={!isUrgent ? { backgroundColor: team.color } : undefined}>
          <Clock className="h-5 w-5" />{round.timeLeft}
        </div>
        <div className="flex items-center gap-2"><X className="h-5 w-5 text-red-500" /><span className="text-xl font-bold text-red-500">{skipped}</span></div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div key={round.currentWord} className="text-center text-5xl font-black leading-tight px-4 word-reveal" style={{ color: team.color }}>{round.currentWord}</div>
      </div>
      <div className="flex w-full gap-4 pb-4">
        <Button size="lg" variant="destructive" className="flex-1 py-8 text-2xl font-bold" onClick={() => { sounds.playSkip(); send({ type: "skip" }); }}>
          <X className="ml-2 h-8 w-8" />דלג
        </Button>
        <Button size="lg" className="flex-1 py-8 text-2xl font-bold bg-green-600 hover:bg-green-700 text-white" onClick={() => { sounds.playCorrect(); send({ type: "correct" }); }}>
          <Check className="ml-2 h-8 w-8" />נכון!
        </Button>
      </div>
    </div>
  );
}

// ---- Guesser View ----

function GuesserView({ round, team }: { round: NonNullable<GameState["round"]>; team: Team }) {
  const isUrgent = round.timeLeft <= 10;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className={cn("rounded-full w-28 h-28 flex items-center justify-center text-white text-5xl font-black", isUrgent && "timer-urgent bg-destructive")} style={!isUrgent ? { backgroundColor: team.color } : undefined}>
        {round.timeLeft}
      </div>
      <Hand className="h-12 w-12" style={{ color: team.color }} />
      <h2 className="text-3xl font-bold" style={{ color: team.color }}>תור שלכם לנחש!</h2>
      <p className="text-xl text-muted-foreground">הקשיבו ונחשו את המילה</p>
      <div className="flex gap-4 text-xl">
        <span className="text-green-600 font-bold">✓ {round.words.filter((w) => w.correct).length}</span>
        <span className="text-red-500 font-bold">✗ {round.words.filter((w) => !w.correct).length}</span>
      </div>
    </div>
  );
}

// ---- Steal Buzz View (other teams try to guess the last word) ----

function StealBuzzView({ steal, teams, player, send }: { steal: NonNullable<GameState["steal"]>; teams: Team[]; player: Player; send: (msg: ClientMessage) => void }) {
  const myTeam = player.teamIndex !== null ? teams[player.teamIndex] : null;
  const buzzedTeam = steal.buzzedTeamIndex !== null ? teams[steal.buzzedTeamIndex] : null;
  const myTeamBuzzed = steal.buzzedTeamIndex === player.teamIndex;

  if (buzzedTeam) {
    // Someone already buzzed
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Zap className="h-12 w-12 text-yellow-500" />
        <h2 className="text-2xl font-bold">
          {myTeamBuzzed ? "הקבוצה שלכם לחצה!" : `${buzzedTeam.name} לחצו`}
        </h2>
        <p className="text-lg text-muted-foreground">ממתינים לשופט...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Zap className="h-16 w-16 text-yellow-500" />
      <h2 className="text-3xl font-bold text-yellow-600">גניבת מילה!</h2>
      <p className="text-xl text-muted-foreground">יודעים מה המילה?</p>

      <div className={cn("rounded-full w-20 h-20 flex items-center justify-center text-white text-3xl font-black bg-yellow-500", steal.timeLeft <= 3 && "timer-urgent")}>
        {steal.timeLeft}
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs py-12 text-3xl font-black bg-yellow-500 hover:bg-yellow-600 text-white rounded-2xl buzz-pulse shadow-xl"
        onClick={() => { sounds.playClick(); send({ type: "buzz" }); }}
      >
        <Zap className="ml-2 h-10 w-10" />
        אני יודע/ת!
      </Button>
    </div>
  );
}

// ---- Spectator View ----

function SpectatorView({ round, teams, currentTeam }: { round: NonNullable<GameState["round"]>; teams: Team[]; currentTeam: Team }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="rounded-full w-20 h-20 flex items-center justify-center text-white text-3xl font-black" style={{ backgroundColor: currentTeam.color }}>
        {round.timeLeft}
      </div>
      <h2 className="text-2xl">תור <span className="font-bold" style={{ color: currentTeam.color }}>{currentTeam.name}</span></h2>
      <div className="flex gap-4">
        {teams.map((t, i) => (
          <div key={i} className="text-center">
            <div className="text-sm" style={{ color: t.color }}>{t.name}</div>
            <div className="text-3xl font-bold" style={{ color: t.color }}>{t.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Status Screen ----

function StatusScreen({ title, subtitle, color }: { title: string; subtitle: string; color: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-3xl font-bold" style={{ color }}>{title}</h2>
      <p className="text-xl text-muted-foreground">{subtitle}</p>
    </div>
  );
}
