import { Server, Socket } from "socket.io";
import { getRoom } from "../rooms/roomStore";
import { getGame } from "../games/registry";
import { broadcastToRoom } from "./broadcast";
import { getRoomCodeForSocket } from "./index";

const FRAMEWORK_EVENTS = new Set([
  "JOIN_ROOM",
  "START_GAME",
  "LEAVE_ROOM",
  "KICK_PLAYER",
  "PLAY_AGAIN",
  "REPORT_FACT",
  "disconnect",
  "disconnecting",
]);

export function registerGameEventForwarder(io: Server, socket: Socket): void {
  const broadcast = broadcastToRoom(io);

  socket.onAny((event: string, payload: unknown) => {
    if (FRAMEWORK_EVENTS.has(event)) return;

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state) return;

    const plugin = getGame(state.game_type);
    if (!plugin) return;

    plugin.handleEvent(event, payload, { io, socket, state, roomCode, broadcast });
  });
}
