import { useGame } from "@/hooks/useGame";
import { HostView } from "@/components/HostView";
import { PlayerView } from "@/components/PlayerView";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function App() {
  const { gameState, playerId, roomCode, roomError, connected, send } = useGame();

  const params = new URLSearchParams(window.location.search);
  const isHost = params.has("host");
  const urlRoomCode = params.get("room")?.toUpperCase() || null;

  const joinedRef = useRef(false);

  // Auto-create or auto-join room based on URL params
  useEffect(() => {
    if (!connected || joinedRef.current) return;

    if (urlRoomCode) {
      // URL has ?room=XXXX — join that room
      send({ type: "join_room", roomCode: urlRoomCode });
      joinedRef.current = true;
    } else if (isHost) {
      // Host with no room code — create a new room
      send({ type: "create_room" });
      joinedRef.current = true;
    }
  }, [connected, urlRoomCode, isHost, send]);

  // Update URL when room code is received (host creating or player manually joining)
  useEffect(() => {
    if (roomCode && !urlRoomCode) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomCode);
      window.history.replaceState({}, "", url.toString());
    }
  }, [roomCode, urlRoomCode]);

  if (!connected) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold">...מתחבר למשחק</div>
          <div className="mt-2 text-muted-foreground">מחפש את השרת</div>
        </div>
      </div>
    );
  }

  // Not in a room yet and no auto-join — show room entry screen
  if (!roomCode && !urlRoomCode && !isHost) {
    return <RoomEntry send={send} roomError={roomError} />;
  }

  // Waiting for room to be created/joined
  if (!roomCode) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold">...מצטרף לחדר</div>
          {roomError && <div className="mt-2 text-destructive font-bold">{roomError}</div>}
        </div>
      </div>
    );
  }

  if (isHost) {
    return <HostView gameState={gameState} send={send} roomCode={roomCode} />;
  }

  return <PlayerView gameState={gameState} playerId={playerId} send={send} />;
}

function RoomEntry({ send, roomError }: { send: (msg: any) => void; roomError: string | null }) {
  const [code, setCode] = useState("");

  const handleJoin = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 4) {
      send({ type: "join_room", roomCode: trimmed });
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-sm p-8 text-center space-y-6">
        <h1 className="text-5xl font-black game-title">Alias</h1>
        <p className="text-muted-foreground">הכניסו קוד חדר כדי להצטרף</p>

        <input
          type="text"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="ABCD"
          className="w-full text-center text-4xl font-black tracking-[0.3em] border-2 rounded-xl p-4 focus:outline-none focus:border-primary"
          autoFocus
        />

        {roomError && <p className="text-destructive font-bold">{roomError}</p>}

        <Button
          size="lg"
          className="btn-party w-full py-6 text-xl"
          disabled={code.length !== 4}
          onClick={handleJoin}
        >
          הצטרף למשחק
        </Button>
      </Card>
    </div>
  );
}
