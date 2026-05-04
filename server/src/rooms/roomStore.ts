import { GameState, GamePhase, GeoLocation } from "../../../shared/types";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  DEFAULT_LANGUAGE,
} from "../../../shared/constants";

const roomStore = new Map<string, GameState>();
const cleanupTimers = new Map<string, NodeJS.Timeout>();

export function generateRoomCode(): string {
  let code: string;
  let attempts = 0;
  do {
    code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    attempts++;
    if (attempts > 1000) {
      throw new Error("Could not generate unique room code");
    }
  } while (roomStore.has(code));
  return code;
}

export function getRoom(code: string): GameState | undefined {
  return roomStore.get(code);
}

export function setRoom(code: string, state: GameState): void {
  roomStore.set(code, state);
}

export function deleteRoom(code: string): void {
  roomStore.delete(code);
  cancelCleanup(code);
}

export function getAllRoomCodes(): string[] {
  return Array.from(roomStore.keys());
}

export function scheduleCleanup(code: string, ttlMs: number): void {
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

export function cancelCleanup(code: string): void {
  const timer = cleanupTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(code);
  }
}

export function createInitialGameState(
  roomCode: string,
  roomMasterSessionId: string,
  location?: GeoLocation
): GameState {
  return {
    room_code: roomCode,
    phase: GamePhase.LOBBY,
    players: [],
    current_fact: null,
    vote_options: [],
    timer_ends_at: null,
    round_number: 0,
    total_rounds: 7,
    prompt_timer_seconds: 60,
    is_final_round: false,
    used_fact_ids: [],
    room_master_session_id: roomMasterSessionId,
    language: DEFAULT_LANGUAGE,
    debuffs_enabled: false,
    debuff_award: null,
    active_debuff_session_id: null,
    ...(location ? { location } : {}),
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearbyRoom(lat: number, lng: number, radiusKm: number): string | null {
  let bestCode: string | null = null;
  let bestDist = Infinity;
  for (const [code, state] of roomStore) {
    if (state.phase !== GamePhase.LOBBY || !state.location) continue;
    const dist = haversineKm(lat, lng, state.location.lat, state.location.lng);
    if (dist <= radiusKm && dist < bestDist) {
      bestDist = dist;
      bestCode = code;
    }
  }
  return bestCode;
}
