"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRoomCode = generateRoomCode;
exports.getRoom = getRoom;
exports.setRoom = setRoom;
exports.deleteRoom = deleteRoom;
exports.getAllRoomCodes = getAllRoomCodes;
exports.scheduleCleanup = scheduleCleanup;
exports.cancelCleanup = cancelCleanup;
exports.createInitialGameState = createInitialGameState;
const types_1 = require("../../../shared/types");
const constants_1 = require("../../../shared/constants");
const roomStore = new Map();
const cleanupTimers = new Map();
function generateRoomCode() {
    let code;
    let attempts = 0;
    do {
        code = "";
        for (let i = 0; i < constants_1.ROOM_CODE_LENGTH; i++) {
            code += constants_1.ROOM_CODE_ALPHABET[Math.floor(Math.random() * constants_1.ROOM_CODE_ALPHABET.length)];
        }
        attempts++;
        if (attempts > 1000) {
            throw new Error("Could not generate unique room code");
        }
    } while (roomStore.has(code));
    return code;
}
function getRoom(code) {
    return roomStore.get(code);
}
function setRoom(code, state) {
    roomStore.set(code, state);
}
function deleteRoom(code) {
    roomStore.delete(code);
    cancelCleanup(code);
}
function getAllRoomCodes() {
    return Array.from(roomStore.keys());
}
function scheduleCleanup(code, ttlMs) {
    cancelCleanup(code);
    const timer = setTimeout(() => {
        const state = roomStore.get(code);
        if (state) {
            const anyConnected = state.players.some((p) => p.is_connected);
            if (!anyConnected) {
                roomStore.delete(code);
                cleanupTimers.delete(code);
                console.log(`[RoomStore] Room ${code} cleaned up after inactivity`);
            }
        }
    }, ttlMs);
    cleanupTimers.set(code, timer);
}
function cancelCleanup(code) {
    const timer = cleanupTimers.get(code);
    if (timer) {
        clearTimeout(timer);
        cleanupTimers.delete(code);
    }
}
function createInitialGameState(roomCode, roomMasterSessionId) {
    return {
        room_code: roomCode,
        phase: types_1.GamePhase.LOBBY,
        players: [],
        current_fact: null,
        vote_options: [],
        timer_ends_at: null,
        round_number: 0,
        total_rounds: 7,
        is_final_round: false,
        used_fact_ids: [],
        room_master_session_id: roomMasterSessionId,
    };
}
