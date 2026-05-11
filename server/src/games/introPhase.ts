import { GameState, GamePhase } from "../../../shared/types";
import { INTRO_TIMER_MS } from "../../../shared/constants";

type BroadcastFn = (roomCode: string, state: GameState) => void;

const introTimers = new Map<string, NodeJS.Timeout>();

function clearIntroTimer(roomCode: string): void {
  const t = introTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    introTimers.delete(roomCode);
  }
}

export function startIntroPhase(
  state: GameState,
  broadcast: BroadcastFn,
  onComplete: () => void
): void {
  state.phase = GamePhase.INTRO;
  state.intro_skipped_by = [];
  state.timer_ends_at = Date.now() + INTRO_TIMER_MS;

  clearIntroTimer(state.room_code);
  const roomCode = state.room_code;
  introTimers.set(
    roomCode,
    setTimeout(() => {
      introTimers.delete(roomCode);
      onComplete();
    }, INTRO_TIMER_MS)
  );

  broadcast(state.room_code, state);
}

export function handleIntroSkip(
  state: GameState,
  sessionId: string,
  broadcast: BroadcastFn,
  onComplete: () => void
): void {
  if (state.phase !== GamePhase.INTRO) return;

  if (!state.intro_skipped_by.includes(sessionId)) {
    state.intro_skipped_by.push(sessionId);
  }

  const connected = state.players.filter((p) => p.is_connected);
  if (connected.length > 0 && connected.every((p) => state.intro_skipped_by.includes(p.session_id))) {
    clearIntroTimer(state.room_code);
    onComplete();
  } else {
    broadcast(state.room_code, state);
  }
}

export function checkIntroSkipAfterDisconnect(
  state: GameState,
  onComplete: () => void
): void {
  if (state.phase !== GamePhase.INTRO) return;

  const connected = state.players.filter((p) => p.is_connected);
  if (connected.length > 0 && connected.every((p) => state.intro_skipped_by.includes(p.session_id))) {
    clearIntroTimer(state.room_code);
    onComplete();
  }
}

export function clearIntroTimerForRoom(roomCode: string): void {
  clearIntroTimer(roomCode);
}
