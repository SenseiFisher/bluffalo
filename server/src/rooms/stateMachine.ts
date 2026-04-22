import { v4 as uuidv4 } from "uuid";
import { GameState, GamePhase, VoteOption, Fact } from "../../../shared/types";
import {
  PROMPT_TIMER_MS,
  REVEAL_TIMER_MS,
  SELECTION_TIMER_MS,
  RESOLUTION_TIMER_MS,
} from "../../../shared/constants";
import { shuffle } from "../utils/shuffle";
import { calculateRoundScores } from "../utils/scoring";
import { getRandomFact } from "../content/loader";

// Phase timers: roomCode → timeout handle
const phaseTimers = new Map<string, NodeJS.Timeout>();

function clearTimer(roomCode: string): void {
  const t = phaseTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    phaseTimers.delete(roomCode);
  }
}

function setTimer(roomCode: string, ms: number, cb: () => void): void {
  clearTimer(roomCode);
  const t = setTimeout(cb, ms);
  phaseTimers.set(roomCode, t);
}

export function clearRoomTimers(roomCode: string): void {
  clearTimer(roomCode);
}

type BroadcastFn = (roomCode: string, state: GameState) => void;

/**
 * Reset per-round fields on all players.
 */
function resetPlayerRounds(state: GameState): void {
  for (const p of state.players) {
    p.round = {
      submitted_lie: null,
      voted_for_id: null,
      great_minds: false,
      bamboozle_count: 0,
      truth_found: false,
    };
  }
}

/**
 * Check if all connected players (who haven't gone great-minds) have submitted a lie.
 */
export function allLiesSubmitted(state: GameState): boolean {
  const eligible = state.players.filter(
    (p) => p.is_connected && !p.round.great_minds
  );
  return (
    eligible.length > 0 &&
    eligible.every((p) => p.round.submitted_lie !== null)
  );
}

/**
 * Check if all eligible voters have voted.
 * Eligible = connected + did not go great_minds (their lie is removed from options).
 */
function allVotesSubmitted(state: GameState): boolean {
  // Players who need to vote: connected players who are not great_minds
  // AND whose own lie is in the list (i.e., they have a lie option to skip)
  // Actually: everyone connected can vote unless they went great_minds
  // AND they can't vote for their own lie
  // So eligible voters = connected players who are NOT great_minds
  const eligible = state.players.filter(
    (p) => p.is_connected && !p.round.great_minds
  );
  return (
    eligible.length > 0 &&
    eligible.every((p) => p.round.voted_for_id !== null)
  );
}

/**
 * LOBBY → PROMPT
 */
export function startGame(
  state: GameState,
  totalRounds: number,
  broadcast: BroadcastFn
): GameState {
  clearTimer(state.room_code);

  state.total_rounds = totalRounds;
  state.round_number = 1;
  state.is_final_round = totalRounds === 1;
  state.used_fact_ids = [];
  state.vote_options = [];

  // Reset all scores
  for (const p of state.players) {
    p.score = 0;
    p.deception_count = 0;
  }

  resetPlayerRounds(state);
  startPromptPhase(state, broadcast);
  return state;
}

function startPromptPhase(state: GameState, broadcast: BroadcastFn): void {
  const fact = getRandomFact(state.used_fact_ids, state.language);
  if (!fact) {
    console.error(`[StateMachine] No facts available for room ${state.room_code}`);
    return;
  }

  state.current_fact = fact;
  state.used_fact_ids.push(fact.content_id);
  state.phase = GamePhase.PROMPT;
  state.vote_options = [];
  const promptTimerMs = state.prompt_timer_seconds * 1000;
  state.timer_ends_at = Date.now() + promptTimerMs;

  broadcast(state.room_code, state);

  setTimer(state.room_code, promptTimerMs, () => {
    const currentState = getCurrentState(state.room_code);
    if (currentState && currentState.phase === GamePhase.PROMPT) {
      advanceToReveal(currentState, broadcast);
    }
  });
}

// We need a way to get the current state from the timer callback
// Import roomStore lazily to avoid circular dependency
let _getRoomFn: ((code: string) => GameState | undefined) | null = null;
export function registerGetRoom(fn: (code: string) => GameState | undefined): void {
  _getRoomFn = fn;
}

function getCurrentState(roomCode: string): GameState | undefined {
  return _getRoomFn ? _getRoomFn(roomCode) : undefined;
}

/**
 * PROMPT → REVEAL
 */
export function advanceToReveal(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  // Build vote options: all submitted lies + truth, deduplicating identical lies
  const liesByText = new Map<string, VoteOption>();

  for (const p of state.players) {
    if (p.round.submitted_lie === null) continue;
    if (p.round.great_minds) continue; // Great Minds lie removed from voting

    const key = p.round.submitted_lie.trim().toLowerCase();
    const existing = liesByText.get(key);
    if (existing) {
      existing.co_author_session_ids.push(p.session_id);
    } else {
      liesByText.set(key, {
        option_id: uuidv4(),
        text: p.round.submitted_lie,
        is_truth: false,
        author_session_id: p.session_id,
        author_display_name: null,
        co_author_session_ids: [],
        co_author_display_names: [],
        funny_voter_session_ids: [],
      });
    }
  }

  const lies = Array.from(liesByText.values());

  const truthOption: VoteOption = {
    option_id: uuidv4(),
    text: state.current_fact!.truth_keyword,
    is_truth: true,
    author_session_id: null,
    author_display_name: null,
    co_author_session_ids: [],
    co_author_display_names: [],
    funny_voter_session_ids: [],
  };

  state.vote_options = shuffle([...lies, truthOption]);
  state.phase = GamePhase.REVEAL;
  state.timer_ends_at = Date.now() + REVEAL_TIMER_MS;

  broadcast(state.room_code, state);

  setTimer(state.room_code, REVEAL_TIMER_MS, () => {
    const currentState = getCurrentState(state.room_code);
    if (currentState && currentState.phase === GamePhase.REVEAL) {
      advanceToSelection(currentState, broadcast);
    }
  });
}

/**
 * REVEAL → SELECTION
 */
export function advanceToSelection(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  state.phase = GamePhase.SELECTION;
  state.timer_ends_at = Date.now() + SELECTION_TIMER_MS;

  broadcast(state.room_code, state);

  setTimer(state.room_code, SELECTION_TIMER_MS, () => {
    const currentState = getCurrentState(state.room_code);
    if (currentState && currentState.phase === GamePhase.SELECTION) {
      advanceToResolution(currentState, broadcast);
    }
  });
}

/**
 * SELECTION → RESOLUTION
 */
export function advanceToResolution(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  // Calculate scores
  const scored = calculateRoundScores(state);
  // Copy scored fields back to state
  Object.assign(state, scored);

  // Dynamic timer: 4s per option (2 steps × 2s each) + 6s buffer, minimum 12s
  const resolutionMs = Math.max(12_000, state.vote_options.length * 4_000 + 6_000);
  state.phase = GamePhase.RESOLUTION;
  state.timer_ends_at = Date.now() + resolutionMs;

  broadcast(state.room_code, state);

  setTimer(state.room_code, resolutionMs, () => {
    const currentState = getCurrentState(state.room_code);
    if (currentState && currentState.phase === GamePhase.RESOLUTION) {
      advanceToNextRound(currentState, broadcast);
    }
  });
}

/**
 * RESOLUTION → PROMPT (next round) or PODIUM (final round)
 */
export function advanceToNextRound(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  if (state.is_final_round) {
    state.phase = GamePhase.PODIUM;
    state.timer_ends_at = null;
    broadcast(state.room_code, state);
    return;
  }

  state.round_number += 1;
  state.is_final_round = state.round_number === state.total_rounds;
  resetPlayerRounds(state);
  startPromptPhase(state, broadcast);
}

/**
 * Try to advance from PROMPT→REVEAL if all lies are in.
 */
export function checkAllLiesSubmitted(
  state: GameState,
  broadcast: BroadcastFn
): void {
  if (state.phase === GamePhase.PROMPT && allLiesSubmitted(state)) {
    advanceToReveal(state, broadcast);
  }
}

/**
 * Try to advance from SELECTION→RESOLUTION if all votes are in.
 */
export function checkAllVotesSubmitted(
  state: GameState,
  broadcast: BroadcastFn
): void {
  if (state.phase === GamePhase.SELECTION && allVotesSubmitted(state)) {
    advanceToResolution(state, broadcast);
  }
}
