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
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const roomCodeRef = useRef<string | null>(null);
  const playerNameRef = useRef<string | null>(null);

  // Keep refs in sync with state for use inside connect closure
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl =
      window.location.port === "5173"
        ? `${protocol}//${window.location.hostname}:5173/ws`
        : `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("Connected to game server");

      // Auto-rejoin room after reconnect
      if (roomCodeRef.current) {
        ws.send(JSON.stringify({ type: "join_room", roomCode: roomCodeRef.current }));
        // Re-join with player name if we had one
        if (playerNameRef.current) {
          // Small delay to ensure room join is processed first
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "join", name: playerNameRef.current }));
            }
          }, 100);
        }
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "state":
          setGameState(msg.state);
          setPlayerId(msg.playerId);
          if (msg.serverIp) setServerIp(msg.serverIp);
          if (msg.roomCode) setRoomCode(msg.roomCode);
          // Track player name for reconnection
          if (msg.state.players && msg.playerId) {
            const player = msg.state.players.find((p: any) => p.id === msg.playerId);
            if (player) playerNameRef.current = player.name;
          }
          break;
        case "state_update":
          setGameState(msg.state);
          break;
        case "room_created":
          setRoomCode(msg.roomCode);
          setRoomError(null);
          break;
        case "room_joined":
          setRoomCode(msg.roomCode);
          setRoomError(null);
          break;
        case "room_error":
          setRoomError(msg.message);
          break;
        case "error":
          console.error("Server error:", msg.message);
          break;
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

  return { gameState, playerId, serverIp, roomCode, roomError, connected, send };
}
