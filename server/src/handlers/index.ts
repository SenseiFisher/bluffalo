import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { DebuffType, GamePhase, GameState, Player, VoteOption } from "../../../shared/types";
import {
  MIN_PLAYERS_TO_START,
  MIN_ROUNDS,
  MAX_ROUNDS,
  DEFAULT_TOTAL_ROUNDS,
  ROOM_TTL_MS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  REJOIN_EXPIRY_MS,
  FUNNY_BONUS,
  CHARACTER_EXCLUDE_OPTIONS,
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
import {
  startGame,
  advanceToReveal,
  advanceToSelection,
  advanceToResolution,
  checkAllLiesSubmitted,
  checkAllVotesSubmitted,
  clearRoomTimers,
  allLiesSubmitted,
} from "../rooms/stateMachine";
import { validateDisplayName, validateLie, validateRoomCode } from "../utils/validation";

// ─── Broadcasting helpers ────────────────────────────────────────────────────

/**
 * Strip session_id from player objects and mask sensitive fields based on phase.
 */
function sanitizeStateForClient(state: GameState): GameState {
  const masked: GameState = {
    ...state,
    // Strip truth_keyword during phases where answer should be hidden
    current_fact:
      state.current_fact &&
      (state.phase === GamePhase.PROMPT ||
        state.phase === GamePhase.REVEAL ||
        state.phase === GamePhase.SELECTION)
        ? { ...state.current_fact, truth_keyword: "" }
        : state.current_fact,
    // Mask is_truth during REVEAL and SELECTION; reveal author names only during RESOLUTION/PODIUM
    vote_options: state.vote_options.map((opt) => {
      const maskTruth = state.phase === GamePhase.REVEAL || state.phase === GamePhase.SELECTION;
      const revealAuthor = state.phase === GamePhase.RESOLUTION || state.phase === GamePhase.PODIUM;
      return {
        ...opt,
        is_truth: maskTruth ? false : opt.is_truth,
        author_display_name: revealAuthor && opt.author_session_id
          ? (state.players.find((p) => p.session_id === opt.author_session_id)?.display_name ?? null)
          : null,
        co_author_display_names: revealAuthor
          ? opt.co_author_session_ids
              .map((sid) => state.players.find((p) => p.session_id === sid)?.display_name ?? null)
              .filter((n): n is string => n !== null)
          : [],
      };
    }),
    // Strip session_id from all players
    players: state.players.map((p) => ({ ...p, session_id: "" })),
  };
  return masked;
}

function broadcastGameState(io: Server, roomCode: string, state: GameState): void {
  const sanitized = sanitizeStateForClient(state);
  io.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitized });
}

function broadcastToRoom(io: Server): (roomCode: string, state: GameState) => void {
  return (roomCode: string, state: GameState) => {
    setRoom(roomCode, state);
    broadcastGameState(io, roomCode, state);
  };
}

// ─── Handler registration ────────────────────────────────────────────────────

export function registerHandlers(io: Server, socket: Socket): void {
  const broadcast = broadcastToRoom(io);

  // ── JOIN_ROOM ──────────────────────────────────────────────────────────────
  socket.on("JOIN_ROOM", (payload: unknown) => {
    const p = payload as { room_code?: string; display_name?: string; session_id?: string };

    const rawCode = typeof p?.room_code === "string" ? p.room_code.toUpperCase().trim() : "";

    // Generate a code if none provided
    const roomCode = rawCode || generateRoomCode();

    // Validate room code format
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

      // Reject rejoin if player was disconnected too long during an active game
      if (
        state.phase !== GamePhase.LOBBY &&
        !existingPlayer.is_connected &&
        existingPlayer.disconnected_at !== null &&
        Date.now() - existingPlayer.disconnected_at > REJOIN_EXPIRY_MS
      ) {
        socket.emit("ERROR", { code: "REJOIN_EXPIRED", message: "Rejoin window has expired" });
        return;
      }

      // Double-connection prevention: disconnect old socket if still connected
      if (existingPlayer.is_connected && existingPlayer.id !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existingPlayer.id);
        if (oldSocket) {
          oldSocket.disconnect(true);
        }
      }

      // Update player with new socket id
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

      // Broadcast updated state to others
      const sanitizedForBroadcast = sanitizeStateForClient(state);
      socket.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitizedForBroadcast });
      return;
    }

    // --- New join ---
    const sessionId = uuidv4();
    const existing = getRoom(roomCode);
    let state: GameState;

    if (existing) {
      // Join existing room
      if (existing.phase !== GamePhase.LOBBY) {
        socket.emit("ERROR", { code: "GAME_IN_PROGRESS", message: "Game already in progress" });
        return;
      }
      state = existing;
    } else {
      // Create new room — this player becomes room master
      state = createInitialGameState(roomCode, sessionId);
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

    // Notify others
    socket.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitized });
  });

  // ── START_GAME ─────────────────────────────────────────────────────────────
  socket.on("START_GAME", (payload: unknown) => {
    const p = payload as { total_rounds?: number; prompt_timer_seconds?: number; language?: string; debuffs_enabled?: boolean };

    // Find room this socket is in
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

    // Verify room master
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

    let totalRounds = typeof p?.total_rounds === "number" ? p.total_rounds : DEFAULT_TOTAL_ROUNDS;
    totalRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, totalRounds));

    const VALID_TIMER_PRESETS = [30, 45, 60, 90, 120, 150];
    let promptTimerSeconds = typeof p?.prompt_timer_seconds === "number" ? p.prompt_timer_seconds : 60;
    if (!VALID_TIMER_PRESETS.includes(promptTimerSeconds)) promptTimerSeconds = 60;
    state.prompt_timer_seconds = promptTimerSeconds;

    const lang = typeof p?.language === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(p.language)
      ? p.language
      : DEFAULT_LANGUAGE;
    state.language = lang;

    state.debuffs_enabled = p?.debuffs_enabled === true;

    const updatedState = startGame(state, totalRounds, broadcast);
    setRoom(roomCode, updatedState);
  });

  // ── SUBMIT_LIE ─────────────────────────────────────────────────────────────
  socket.on("SUBMIT_LIE", (payload: unknown) => {
    const p = payload as { text?: string };

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.PROMPT) {
      socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in PROMPT phase" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player) {
      socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
      return;
    }

    if (player.round.submitted_lie !== null) {
      socket.emit("ERROR", { code: "ALREADY_SUBMITTED", message: "Already submitted a lie" });
      return;
    }

    const lieResult = validateLie(p?.text);
    if (!lieResult.valid) {
      socket.emit("ERROR", { code: "INVALID_LIE", message: lieResult.error });
      return;
    }

    const lieText = lieResult.value;

    // Check for Great Minds: lie matches truth keyword (case-insensitive)
    const truthKeyword = state.current_fact!.truth_keyword;
    if (lieText.toLowerCase() === truthKeyword.toLowerCase()) {
      player.round.great_minds = true;
    }

    player.round.submitted_lie = lieText;
    setRoom(roomCode, state);

    // Broadcast updated state (players can see submission count)
    broadcastGameState(io, roomCode, state);

    // Check if all lies submitted
    checkAllLiesSubmitted(state, broadcast);
  });

  // ── EDIT_LIE ───────────────────────────────────────────────────────────────
  socket.on("EDIT_LIE", (payload: unknown) => {
    const p = payload as { text?: string };

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.PROMPT) {
      socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in PROMPT phase" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player) {
      socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
      return;
    }

    if (player.round.submitted_lie === null) {
      socket.emit("ERROR", { code: "NOT_SUBMITTED", message: "No answer to edit" });
      return;
    }

    if (allLiesSubmitted(state)) {
      socket.emit("ERROR", { code: "TOO_LATE", message: "All players have already submitted" });
      return;
    }

    const lieResult = validateLie(p?.text);
    if (!lieResult.valid) {
      socket.emit("ERROR", { code: "INVALID_LIE", message: lieResult.error });
      return;
    }

    const lieText = lieResult.value;

    const truthKeyword = state.current_fact!.truth_keyword;
    player.round.great_minds = lieText.toLowerCase() === truthKeyword.toLowerCase();
    player.round.submitted_lie = lieText;
    setRoom(roomCode, state);

    broadcastGameState(io, roomCode, state);
    checkAllLiesSubmitted(state, broadcast);
  });

  // ── SUBMIT_VOTE ────────────────────────────────────────────────────────────
  socket.on("SUBMIT_VOTE", (payload: unknown) => {
    const p = payload as { option_id?: string };

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.SELECTION) {
      socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in SELECTION phase" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player) {
      socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
      return;
    }

    if (player.round.voted_for_id !== null) {
      socket.emit("ERROR", { code: "ALREADY_VOTED", message: "Already voted" });
      return;
    }

    const optionId = p?.option_id;
    if (typeof optionId !== "string") {
      socket.emit("ERROR", { code: "INVALID_VOTE", message: "Invalid option_id" });
      return;
    }

    const option = state.vote_options.find((o) => o.option_id === optionId);
    if (!option) {
      socket.emit("ERROR", { code: "INVALID_OPTION", message: "Option not found" });
      return;
    }

    // Self-vote prevention: player cannot vote for their own lie (including merged duplicates)
    const isOwnOption =
      option.author_session_id === player.session_id ||
      option.co_author_session_ids.includes(player.session_id);
    if (isOwnOption) {
      socket.emit("ERROR", { code: "SELF_VOTE", message: "Cannot vote for your own lie" });
      return;
    }

    player.round.voted_for_id = optionId;
    setRoom(roomCode, state);

    broadcastGameState(io, roomCode, state);

    // Check if all eligible votes are in
    checkAllVotesSubmitted(state, broadcast);
  });

  // ── SUBMIT_FUNNY_VOTE ──────────────────────────────────────────────────────
  socket.on("SUBMIT_FUNNY_VOTE", (payload: unknown) => {
    const p = payload as { option_id?: string };

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.RESOLUTION) {
      socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in RESOLUTION phase" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player) {
      socket.emit("ERROR", { code: "PLAYER_NOT_FOUND", message: "Player not found" });
      return;
    }

    const optionId = p?.option_id;
    if (typeof optionId !== "string") {
      socket.emit("ERROR", { code: "INVALID_VOTE", message: "Invalid option_id" });
      return;
    }

    const option = state.vote_options.find((o) => o.option_id === optionId);
    if (!option) {
      socket.emit("ERROR", { code: "INVALID_OPTION", message: "Option not found" });
      return;
    }

    // Can't funny-vote your own answer
    const isOwnOption =
      option.author_session_id === player.session_id ||
      option.co_author_session_ids.includes(player.session_id);
    if (isOwnOption) {
      socket.emit("ERROR", { code: "SELF_VOTE", message: "Cannot funny-vote your own answer" });
      return;
    }

    // Can't funny-vote the same option twice
    if (option.funny_voter_session_ids.includes(player.session_id)) {
      socket.emit("ERROR", { code: "ALREADY_FUNNY_VOTED", message: "Already gave a funny vote to this answer" });
      return;
    }

    option.funny_voter_session_ids.push(player.session_id);

    // Award points immediately to all authors
    const allAuthors = [
      option.author_session_id,
      ...option.co_author_session_ids,
    ].filter((id): id is string => id !== null);

    for (const authorSessionId of allAuthors) {
      const author = state.players.find((pl) => pl.session_id === authorSessionId);
      if (author) {
        author.score += FUNNY_BONUS;
        author.funny_vote_count += 1;
      }
    }

    setRoom(roomCode, state);
    broadcastGameState(io, roomCode, state);
  });

  // ── SUBMIT_DEBUFF ──────────────────────────────────────────────────────────
  socket.on("SUBMIT_DEBUFF", (payload: unknown) => {
    const p = payload as { debuff_type?: string; target_session_id?: string; excluded_character?: string };

    const roomCode = getRoomCodeForSocket(socket);
    if (!roomCode) return;

    const state = getRoom(roomCode);
    if (!state || state.phase !== GamePhase.RESOLUTION) {
      socket.emit("ERROR", { code: "WRONG_PHASE", message: "Not in RESOLUTION phase" });
      return;
    }

    if (!state.debuffs_enabled || !state.debuff_award) {
      socket.emit("ERROR", { code: "NO_DEBUFF_AWARD", message: "No debuff award this round" });
      return;
    }

    const player = state.players.find((pl) => pl.id === socket.id);
    if (!player || player.session_id !== state.debuff_award.winner_session_id) {
      socket.emit("ERROR", { code: "NOT_DEBUFF_WINNER", message: "You did not earn the debuff this round" });
      return;
    }

    if (state.debuff_award.pending_debuff !== null) {
      socket.emit("ERROR", { code: "DEBUFF_ALREADY_CHOSEN", message: "Debuff already selected" });
      return;
    }

    const debuffType = p?.debuff_type as DebuffType | undefined;
    if (!debuffType || !Object.values(DebuffType).includes(debuffType)) {
      socket.emit("ERROR", { code: "INVALID_DEBUFF_TYPE", message: "Invalid debuff type" });
      return;
    }

    const targetId = p?.target_session_id;
    if (typeof targetId !== "string") {
      socket.emit("ERROR", { code: "INVALID_TARGET", message: "Invalid target" });
      return;
    }

    const target = state.players.find(
      (pl) => pl.session_id === targetId && pl.is_connected && pl.session_id !== player.session_id
    );
    if (!target) {
      socket.emit("ERROR", { code: "INVALID_TARGET", message: "Target player not found or invalid" });
      return;
    }

    let excludedChar: string | undefined;
    if (debuffType === DebuffType.CHARACTER_EXCLUDE) {
      const charOptions = CHARACTER_EXCLUDE_OPTIONS[state.language] ?? CHARACTER_EXCLUDE_OPTIONS["en"];
      excludedChar = typeof p?.excluded_character === "string" ? p.excluded_character : undefined;
      if (!excludedChar || !charOptions.includes(excludedChar)) {
        socket.emit("ERROR", { code: "INVALID_CHARACTER", message: "Invalid excluded character" });
        return;
      }
    }

    state.debuff_award.pending_debuff = {
      type: debuffType,
      target_session_id: targetId,
      target_display_name: target.display_name,
      ...(excludedChar ? { excluded_character: excludedChar } : {}),
    };

    setRoom(roomCode, state);
    broadcastGameState(io, roomCode, state);
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

    // Reset game state to LOBBY
    state.phase = GamePhase.LOBBY;
    state.round_number = 0;
    state.is_final_round = false;
    state.current_fact = null;
    state.vote_options = [];
    state.timer_ends_at = null;
    state.used_fact_ids = [];
    state.debuff_award = null;
    state.active_debuff_session_id = null;

    for (const p of state.players) {
      p.score = 0;
      p.deception_count = 0;
      p.funny_vote_count = 0;
      p.active_debuff = null;
      p.round = {
        submitted_lie: null,
        voted_for_id: null,
        great_minds: false,
        bamboozle_count: 0,
        truth_found: false,
      };
    }

    clearRoomTimers(roomCode);
    setRoom(roomCode, state);
    broadcastGameState(io, roomCode, state);
  });

  // ── LEAVE_ROOM ─────────────────────────────────────────────────────────────
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
  socket.on("disconnect", () => {
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

      // Schedule room cleanup if all players disconnected
      const anyConnected = state.players.some((p) => p.is_connected);
      if (!anyConnected) {
        scheduleCleanup(roomCode, ROOM_TTL_MS);
      }
    }
  });
}

// ─── Helper: find room code for a socket ────────────────────────────────────

function getRoomCodeForSocket(socket: Socket): string | null {
  for (const room of socket.rooms) {
    if (room !== socket.id) {
      return room;
    }
  }
  return null;
}
