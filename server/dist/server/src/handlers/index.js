"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandlers = registerHandlers;
const uuid_1 = require("uuid");
const types_1 = require("../../../shared/types");
const constants_1 = require("../../../shared/constants");
const roomStore_1 = require("../rooms/roomStore");
const stateMachine_1 = require("../rooms/stateMachine");
const validation_1 = require("../utils/validation");
// ─── Broadcasting helpers ────────────────────────────────────────────────────
/**
 * Strip session_id from player objects and mask sensitive fields based on phase.
 */
function sanitizeStateForClient(state) {
    const masked = {
        ...state,
        // Strip truth_keyword during phases where answer should be hidden
        current_fact: state.current_fact &&
            (state.phase === types_1.GamePhase.PROMPT ||
                state.phase === types_1.GamePhase.REVEAL ||
                state.phase === types_1.GamePhase.SELECTION)
            ? { ...state.current_fact, truth_keyword: "" }
            : state.current_fact,
        // Mask is_truth during REVEAL and SELECTION
        vote_options: state.vote_options.map((opt) => ({
            ...opt,
            is_truth: state.phase === types_1.GamePhase.REVEAL || state.phase === types_1.GamePhase.SELECTION
                ? false
                : opt.is_truth,
        })),
        // Strip session_id from all players
        players: state.players.map((p) => ({ ...p, session_id: "" })),
    };
    return masked;
}
function broadcastGameState(io, roomCode, state) {
    const sanitized = sanitizeStateForClient(state);
    io.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitized });
}
function broadcastToRoom(io) {
    return (roomCode, state) => {
        (0, roomStore_1.setRoom)(roomCode, state);
        broadcastGameState(io, roomCode, state);
    };
}
// ─── Handler registration ────────────────────────────────────────────────────
function registerHandlers(io, socket) {
    const broadcast = broadcastToRoom(io);
    // ── JOIN_ROOM ──────────────────────────────────────────────────────────────
    socket.on("JOIN_ROOM", (payload) => {
        const p = payload;
        const rawCode = typeof p?.room_code === "string" ? p.room_code.toUpperCase().trim() : "";
        // --- Create new room if code is empty or "NEW" ---
        let isNewRoom = false;
        let roomCode = rawCode;
        if (!rawCode || rawCode === "NEW") {
            // Create a new room
            roomCode = (0, roomStore_1.generateRoomCode)();
            isNewRoom = true;
        }
        // Validate room code format for join attempts
        if (!isNewRoom && !(0, validation_1.validateRoomCode)(roomCode)) {
            socket.emit("ERROR", { code: "INVALID_ROOM_CODE", message: "Invalid room code format" });
            return;
        }
        const nameResult = (0, validation_1.validateDisplayName)(p?.display_name);
        if (!nameResult.valid) {
            socket.emit("ERROR", { code: "INVALID_NAME", message: nameResult.error });
            return;
        }
        const displayName = nameResult.value;
        // --- REJOIN: session_id provided ---
        if (p?.session_id && !isNewRoom) {
            const state = (0, roomStore_1.getRoom)(roomCode);
            if (!state) {
                socket.emit("ERROR", { code: "ROOM_NOT_FOUND", message: "Room not found" });
                return;
            }
            const existingPlayer = state.players.find((pl) => pl.session_id === p.session_id);
            if (!existingPlayer) {
                socket.emit("ERROR", { code: "SESSION_NOT_FOUND", message: "Session not found in this room" });
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
            existingPlayer.display_name = displayName;
            socket.join(roomCode);
            (0, roomStore_1.cancelCleanup)(roomCode);
            (0, roomStore_1.setRoom)(roomCode, state);
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
        let state;
        const sessionId = (0, uuid_1.v4)();
        if (isNewRoom) {
            state = (0, roomStore_1.createInitialGameState)(roomCode, sessionId);
            (0, roomStore_1.setRoom)(roomCode, state);
        }
        else {
            const existing = (0, roomStore_1.getRoom)(roomCode);
            if (!existing) {
                socket.emit("ERROR", { code: "ROOM_NOT_FOUND", message: "Room not found" });
                return;
            }
            if (existing.phase !== types_1.GamePhase.LOBBY) {
                socket.emit("ERROR", { code: "GAME_IN_PROGRESS", message: "Game already in progress" });
                return;
            }
            state = existing;
        }
        const newPlayer = {
            id: socket.id,
            session_id: sessionId,
            display_name: displayName,
            score: 0,
            deception_count: 0,
            is_connected: true,
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
        (0, roomStore_1.setRoom)(roomCode, state);
        const sanitized = sanitizeStateForClient(state);
        socket.emit("ROOM_JOINED", {
            game_state: sanitized,
            your_session_id: sessionId,
        });
        // Notify others
        socket.to(roomCode).emit("GAME_STATE_UPDATE", { game_state: sanitized });
    });
    // ── START_GAME ─────────────────────────────────────────────────────────────
    socket.on("START_GAME", (payload) => {
        const p = payload;
        // Find room this socket is in
        const roomCode = getRoomCodeForSocket(socket);
        if (!roomCode) {
            socket.emit("ERROR", { code: "NOT_IN_ROOM", message: "You are not in a room" });
            return;
        }
        const state = (0, roomStore_1.getRoom)(roomCode);
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
        if (state.phase !== types_1.GamePhase.LOBBY) {
            socket.emit("ERROR", { code: "GAME_ALREADY_STARTED", message: "Game already started" });
            return;
        }
        const connectedCount = state.players.filter((pl) => pl.is_connected).length;
        if (connectedCount < constants_1.MIN_PLAYERS_TO_START) {
            socket.emit("ERROR", {
                code: "NOT_ENOUGH_PLAYERS",
                message: `Need at least ${constants_1.MIN_PLAYERS_TO_START} players to start`,
            });
            return;
        }
        let totalRounds = typeof p?.total_rounds === "number" ? p.total_rounds : constants_1.DEFAULT_TOTAL_ROUNDS;
        totalRounds = Math.max(constants_1.MIN_ROUNDS, Math.min(constants_1.MAX_ROUNDS, totalRounds));
        const updatedState = (0, stateMachine_1.startGame)(state, totalRounds, broadcast);
        (0, roomStore_1.setRoom)(roomCode, updatedState);
    });
    // ── SUBMIT_LIE ─────────────────────────────────────────────────────────────
    socket.on("SUBMIT_LIE", (payload) => {
        const p = payload;
        const roomCode = getRoomCodeForSocket(socket);
        if (!roomCode)
            return;
        const state = (0, roomStore_1.getRoom)(roomCode);
        if (!state || state.phase !== types_1.GamePhase.PROMPT) {
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
        const lieResult = (0, validation_1.validateLie)(p?.text);
        if (!lieResult.valid) {
            socket.emit("ERROR", { code: "INVALID_LIE", message: lieResult.error });
            return;
        }
        const lieText = lieResult.value;
        // Check for Great Minds: lie matches truth keyword (case-insensitive)
        const truthKeyword = state.current_fact.truth_keyword;
        if (lieText.toLowerCase() === truthKeyword.toLowerCase()) {
            player.round.great_minds = true;
        }
        player.round.submitted_lie = lieText;
        (0, roomStore_1.setRoom)(roomCode, state);
        // Broadcast updated state (players can see submission count)
        broadcastGameState(io, roomCode, state);
        // Check if all lies submitted
        (0, stateMachine_1.checkAllLiesSubmitted)(state, broadcast);
    });
    // ── SUBMIT_VOTE ────────────────────────────────────────────────────────────
    socket.on("SUBMIT_VOTE", (payload) => {
        const p = payload;
        const roomCode = getRoomCodeForSocket(socket);
        if (!roomCode)
            return;
        const state = (0, roomStore_1.getRoom)(roomCode);
        if (!state || state.phase !== types_1.GamePhase.SELECTION) {
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
        // Self-vote prevention: player cannot vote for their own lie
        if (option.author_session_id === player.session_id) {
            socket.emit("ERROR", { code: "SELF_VOTE", message: "Cannot vote for your own lie" });
            return;
        }
        player.round.voted_for_id = optionId;
        (0, roomStore_1.setRoom)(roomCode, state);
        broadcastGameState(io, roomCode, state);
        // Check if all eligible votes are in
        (0, stateMachine_1.checkAllVotesSubmitted)(state, broadcast);
    });
    // ── PLAY_AGAIN ─────────────────────────────────────────────────────────────
    socket.on("PLAY_AGAIN", (_payload) => {
        const roomCode = getRoomCodeForSocket(socket);
        if (!roomCode)
            return;
        const state = (0, roomStore_1.getRoom)(roomCode);
        if (!state || state.phase !== types_1.GamePhase.PODIUM) {
            socket.emit("ERROR", { code: "WRONG_PHASE", message: "Game not at PODIUM" });
            return;
        }
        const player = state.players.find((pl) => pl.id === socket.id);
        if (!player || player.session_id !== state.room_master_session_id) {
            socket.emit("ERROR", { code: "NOT_ROOM_MASTER", message: "Only the room master can start a new game" });
            return;
        }
        // Reset game state to LOBBY
        state.phase = types_1.GamePhase.LOBBY;
        state.round_number = 0;
        state.is_final_round = false;
        state.current_fact = null;
        state.vote_options = [];
        state.timer_ends_at = null;
        state.used_fact_ids = [];
        for (const p of state.players) {
            p.score = 0;
            p.deception_count = 0;
            p.round = {
                submitted_lie: null,
                voted_for_id: null,
                great_minds: false,
                bamboozle_count: 0,
                truth_found: false,
            };
        }
        (0, stateMachine_1.clearRoomTimers)(roomCode);
        (0, roomStore_1.setRoom)(roomCode, state);
        broadcastGameState(io, roomCode, state);
    });
    // ── DISCONNECT ─────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
        const roomCode = getRoomCodeForSocket(socket);
        if (!roomCode)
            return;
        const state = (0, roomStore_1.getRoom)(roomCode);
        if (!state)
            return;
        const player = state.players.find((pl) => pl.id === socket.id);
        if (player) {
            player.is_connected = false;
            (0, roomStore_1.setRoom)(roomCode, state);
            broadcastGameState(io, roomCode, state);
            // Schedule room cleanup if all players disconnected
            const anyConnected = state.players.some((p) => p.is_connected);
            if (!anyConnected) {
                (0, roomStore_1.scheduleCleanup)(roomCode, constants_1.ROOM_TTL_MS);
            }
        }
    });
}
// ─── Helper: find room code for a socket ────────────────────────────────────
function getRoomCodeForSocket(socket) {
    for (const room of socket.rooms) {
        if (room !== socket.id) {
            return room;
        }
    }
    return null;
}
