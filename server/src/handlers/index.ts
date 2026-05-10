import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { GamePhase, GameState, Player } from "../../../shared/types";
import {
  MIN_PLAYERS_TO_START,
  ROOM_TTL_MS,
  REJOIN_EXPIRY_MS,
} from "../../../shared/constants";
import {
  getRoom,
  setRoom,
  deleteRoom,
  generateRoomCode,
  createInitialGameState,
  scheduleCleanup,
  cancelCleanup,
} from "../rooms/roomStore";
import { validateDisplayName, validateRoomCode } from "../utils/validation";
import { redisClient } from "../redis";
import { sanitizeStateForClient, broadcastGameState, broadcastToRoom } from "./broadcast";
import { getGame } from "../games/registry";

// ─── Handler registration ────────────────────────────────────────────────────

export function registerHandlers(io: Server, socket: Socket): void {
  const broadcast = broadcastToRoom(io);

  // ── JOIN_ROOM ──────────────────────────────────────────────────────────────
  socket.on("JOIN_ROOM", (payload: unknown) => {
    const p = payload as {
      room_code?: string;
      display_name?: string;
      session_id?: string;
      game_type?: string;
      location?: { lat: unknown; lng: unknown };
      create?: boolean;
    };

    const rawCode = typeof p?.room_code === "string" ? p.room_code.toUpperCase().trim() : "";

    let location: { lat: number; lng: number } | undefined;
    const rawLoc = p?.location;
    if (
      rawLoc &&
      typeof rawLoc.lat === "number" && typeof rawLoc.lng === "number" &&
      isFinite(rawLoc.lat) && isFinite(rawLoc.lng) &&
      rawLoc.lat >= -90 && rawLoc.lat <= 90 &&
      rawLoc.lng >= -180 && rawLoc.lng <= 180
    ) {
      location = { lat: rawLoc.lat, lng: rawLoc.lng };
    }

    const roomCode = rawCode || generateRoomCode();

    if (!validateRoomCode(roomCode)) {
      socket.emit("ERROR", { code: "INVALID_ROOM_CODE", message: "Invalid room code format" });
      return;
    }

    const nameResult = validateDisplayName(p?.display_name);
    if (!nameResult.valid) {
      socket.emit("ERROR", { code: "INVALID_NAME", message: nameResult.error });
      return;
    }
    const displayName = nameResult.value;

    // --- REJOIN: session_id provided ---
    if (p?.session_id) {
      const state = getRoom(roomCode);
      if (!state) {
        socket.emit("ERROR", { code: "ROOM_NOT_FOUND", message: "Room not found" });
        return;
      }

      const existingPlayer = state.players.find((pl) => pl.session_id === p.session_id);
      if (!existingPlayer) {
        socket.emit("ERROR", { code: "SESSION_NOT_FOUND", message: "Session not found in this room" });
        return;
      }

      if (
        state.phase !== GamePhase.LOBBY &&
        !existingPlayer.is_connected &&
        existingPlayer.disconnected_at !== null &&
        Date.now() - existingPlayer.disconnected_at > REJOIN_EXPIRY_MS
      ) {
        socket.emit("ERROR", { code: "REJOIN_EXPIRED", message: "Rejoin window has expired" });
        return;
      }

      if (existingPlayer.is_connected && existingPlayer.id !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existingPlayer.id);
        if (oldSocket) {
          oldSocket.disconnect(true);
        }
      }

      existingPlayer.id = socket.id;
      existingPlayer.is_connected = true;
      existingPlayer.disconnected_at = null;
      existingPlayer.display_name = displayName;

      socket.join(roomCode);
      cancelCleanup(roomCode);
      setRoom(roomCode, state);

      const sanitized = sanitizeStateForClient(state);
      socket.emit("ROOM_JOINED", {
        game_state: sanitized,
        your_session_id: existingPlayer.session_id,
      });
      socket.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitizeStateForClient(state) });
      return;
    }

    // --- New join ---
    const sessionId = uuidv4();
    const existing = getRoom(roomCode);
    let state: GameState;

    if (existing) {
      if (existing.phase !== GamePhase.LOBBY) {
        socket.emit("ERROR", { code: "GAME_IN_PROGRESS", message: "Game already in progress" });
        return;
      }
      const nameTaken = existing.players.some(
        (pl) => pl.display_name.toLowerCase() === displayName.toLowerCase() && pl.is_connected
      );
      if (nameTaken) {
        socket.emit("ERROR", { code: "NAME_TAKEN", message: "That name is already taken in this room" });
        return;
      }
      state = existing;
    } else {
      if (!p.create) {
        socket.emit("ERROR", { code: "ROOM_NOT_FOUND", message: "Room not found" });
        return;
      }
      // Validate requested game type, default to bluffalo
      const requestedGame = typeof p.game_type === "string" ? p.game_type : "bluffalo";
      if (!getGame(requestedGame)) {
        socket.emit("ERROR", { code: "INVALID_GAME_TYPE", message: "Unknown game type" });
        return;
      }
      state = createInitialGameState(roomCode, sessionId, requestedGame, location);
      setRoom(roomCode, state);
    }

    const newPlayer: Player = {
      id: socket.id,
      session_id: sessionId,
      display_name: displayName,
      score: 0,
      deception_count: 0,
      funny_vote_count: 0,
      is_connected: true,
      disconnected_at: null,
      active_debuff: null,
      round: {
        submitted_lie: null,
        voted_for_id: null,
        great_minds: false,
        bamboozle_count: 0,
        truth_found: false,
      },
    };

    state.players.push(newPlayer);
    socket.join(roomCode);
    setRoom(roomCode, state);

    const sanitized = sanitizeStateForClient(state);
    socket.emit("ROOM_JOINED", {
      game_state: sanitized,
      your_session_id: sessionId,
    });
    socket.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitized });
  });

  // ── START_GAME ─────────────────────────────────────────────────────────────
  socket.on("START_GAME", (payload: unknown) => {
    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) {
      socket.emit("ERROR", { code: "NOT_IN_ROOM", message: "You are not in a room" });
      return;
    }

    const state = getRoom(roomCode);
    if (!state) {
      socket.emit("ERROR", { code: "ROOM_NOT_FOUND", message: "Room not found" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player || player.session_id !== state.room_master_session_id) {
      socket.emit("ERROR", { code: "NOT_ROOM_MASTER", message: "Only the room master can start the game" });
      return;
    }

    if (state.phase !== GamePhase.LOBBY) {
      socket.emit("ERROR", { code: "GAME_ALREADY_STARTED", message: "Game already started" });
      return;
    }

    const connectedCount = state.players.filter((pl) => pl.is_connected).length;
    if (connectedCount < MIN_PLAYERS_TO_START) {
      socket.emit("ERROR", {
        code: "NOT_ENOUGH_PLAYERS",
        message: `Need at least ${MIN_PLAYERS_TO_START} players to start`,
      });
      return;
    }

    const plugin = getGame(state.game_type);
    if (!plugin) {
      socket.emit("ERROR", { code: "UNKNOWN_GAME", message: "Unknown game type" });
      return;
    }

    const updatedState = plugin.startGame(state, payload, broadcast);
    setRoom(roomCode, updatedState);
  });

  // ── REPORT_FACT ────────────────────────────────────────────────────────────
  socket.on("REPORT_FACT", (payload: unknown) => {
    const p = payload as { fact_id?: unknown };
    const factId = typeof p?.fact_id === "string" ? p.fact_id.trim() : null;
    if (!factId) return;
    redisClient?.set(`report:${factId}`, "1", "EX", 86400, "NX").catch(() => {});
  });

  // ── PLAY_AGAIN ─────────────────────────────────────────────────────────────
  socket.on("PLAY_AGAIN", (_payload: unknown) => {
    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.PODIUM) {
      socket.emit("ERROR", { code: "WRONG_PHASE", message: "Game not at PODIUM" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player || player.session_id !== state.room_master_session_id) {
      socket.emit("ERROR", { code: "NOT_ROOM_MASTER", message: "Only the room master can start a new game" });
      return;
    }

    const plugin = getGame(state.game_type);
    if (!plugin) {
      socket.emit("ERROR", { code: "UNKNOWN_GAME", message: "Unknown game type" });
      return;
    }

    const resetState = plugin.resetToLobby(state);
    setRoom(roomCode, resetState);
    broadcastGameState(io, roomCode, resetState);
  });

  // ── KICK_PLAYER ────────────────────────────────────────────────────────────
  socket.on("KICK_PLAYER", (payload: unknown) => {
    const p = payload as { player_id?: string };
    const targetSocketId = typeof p?.player_id === "string" ? p.player_id : null;
    if (!targetSocketId) return;

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.LOBBY) return;

    const kicker = state.players.find((pl) => pl.id === socket.id);
    if (!kicker || kicker.session_id !== state.room_master_session_id) return;

    const targetIndex = state.players.findIndex((pl) => pl.id === targetSocketId);
    if (targetIndex === -1) return;

    state.players.splice(targetIndex, 1);

    io.to(targetSocketId).emit("KICKED", {});
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) targetSocket.leave(roomCode);

    setRoom(roomCode, state);
    broadcastGameState(io, roomCode, state);
  });

  // ── LEAVE_ROOM ─────────────────────────────────────────────────────────────
  socket.on("LEAVE_ROOM", () => {
    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.LOBBY) return;

    const playerIndex = state.players.findIndex((pl) => pl.id === socket.id);
    if (playerIndex === -1) return;

    const leavingPlayer = state.players[playerIndex];
    const wasRoomMaster = leavingPlayer.session_id === state.room_master_session_id;

    state.players.splice(playerIndex, 1);
    socket.leave(roomCode);

    if (state.players.length === 0) {
      deleteRoom(roomCode);
    } else {
      if (wasRoomMaster) {
        const nextConnected = state.players.find((p) => p.is_connected) ?? state.players[0];
        state.room_master_session_id = nextConnected.session_id;
      }
      setRoom(roomCode, state);
      broadcastGameState(io, roomCode, state);
    }
  });

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  socket.on("disconnecting", () => {
    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state) return;

    const player = state.players.find((pl) => pl.id === socket.id);
    if (player) {
      player.is_connected = false;
      player.disconnected_at = Date.now();
      setRoom(roomCode, state);
      broadcastGameState(io, roomCode, state);

      const plugin = getGame(state.game_type);
      if (plugin) {
        plugin.onPlayerDisconnect(state, broadcast);
      }

      const anyConnected = state.players.some((p) => p.is_connected);
      if (!anyConnected) {
        scheduleCleanup(roomCode, ROOM_TTL_MS);
      }
    }
  });
}

// ─── Helper: find room code for a socket ────────────────────────────────────

export function getRoomCodeForSocket(socket: Socket): string | null {
  for (const room of socket.rooms) {
    if (room !== socket.id) {
      return room;
    }
  }
  return null;
}
