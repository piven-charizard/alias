import { useGame } from "@/hooks/useGame";
import { HostView } from "@/components/HostView";
import { PlayerView } from "@/components/PlayerView";

export default function App() {
  const { gameState, playerId, serverIp, connected, send } = useGame();

  const isHost = new URLSearchParams(window.location.search).has("host");

  if (!connected) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold">מתחבר למשחק...</div>
          <div className="mt-2 text-muted-foreground">מחפש את השרת</div>
        </div>
      </div>
    );
  }

  if (isHost) {
    return <HostView gameState={gameState} send={send} serverIp={serverIp} />;
  }

  return (
    <PlayerView gameState={gameState} playerId={playerId} send={send} />
  );
}
