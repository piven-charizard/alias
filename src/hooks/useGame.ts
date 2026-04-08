import { useState, useEffect, useRef, useCallback } from "react";
import type { GameState, ClientMessage } from "@/lib/types";

const INITIAL_STATE: GameState = {
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

export function useGame() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    // Connect to WebSocket server
    // In dev, Vite proxies /ws to the backend
    // In production or direct access, connect to port 3001
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl =
      window.location.port === "5173"
        ? `${protocol}//${window.location.hostname}:5173/ws`
        : `${protocol}//${window.location.hostname}:3001`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("Connected to game server");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "state") {
        setGameState(msg.state);
        setPlayerId(msg.playerId);
        if (msg.serverIp) setServerIp(msg.serverIp);
      } else if (msg.type === "state_update") {
        setGameState(msg.state);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("Disconnected. Reconnecting in 2s...");
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { gameState, playerId, serverIp, connected, send };
}
