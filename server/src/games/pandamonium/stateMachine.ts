import { v4 as uuidv4 } from "uuid";
import { GameState, GamePhase, PandamoniumMatchup } from "../../../../shared/types";
import {
  PM_WRITING_TIMER_MS,
  PM_MATCHUP_TIMER_MS,
  PM_MATCHUP_RESULT_TIMER_MS,
  PM_FINAL_WRITING_TIMER_MS,
  PM_FINAL_REVEAL_TIMER_MS,
} from "../../../../shared/constants";
import { shuffle } from "../../utils/shuffle";
import { getRandomFact } from "../bluffalo/content/loader";
import { applyMatchupScores, applyMedalScores } from "./scoring";

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
  phaseTimers.set(roomCode, setTimeout(cb, ms));
}

export function clearRoomTimersPM(roomCode: string): void {
  clearTimer(roomCode);
}

type BroadcastFn = (roomCode: string, state: GameState) => void;

let _getRoomFn: ((code: string) => GameState | undefined) | null = null;
export function registerGetRoomPM(fn: (code: string) => GameState | undefined): void {
  _getRoomFn = fn;
}

function getCurrentState(roomCode: string): GameState | undefined {
  return _getRoomFn ? _getRoomFn(roomCode) : undefined;
}

function resetPlayerRoundsPM(state: GameState): void {
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

function buildMatchups(state: GameState): PandamoniumMatchup[] {
  const connected = state.players.filter((p) => p.is_connected);
  const shuffled = shuffle([...connected]);
  const n = shuffled.length;
  const matchups: PandamoniumMatchup[] = [];

  for (let i = 0; i < n; i++) {
    const fact = getRandomFact(state.used_fact_ids, state.language);
    if (!fact) break;
    state.used_fact_ids.push(fact.content_id);

    const playerA = shuffled[i];
    const playerB = shuffled[(i + 1) % n];

    matchups.push({
      matchup_id: uuidv4(),
      prompt_content_id: fact.content_id,
      prompt_text: fact.fact_template,
      player_a_session_id: playerA.session_id,
      player_a_display_name: playerA.display_name,
      player_a_answer: null,
      player_a_submitted: false,
      player_b_session_id: playerB.session_id,
      player_b_display_name: playerB.display_name,
      player_b_answer: null,
      player_b_submitted: false,
      votes: {},
      player_a_vote_count: 0,
      player_b_vote_count: 0,
      winner: null,
      a_hidden: false,
      b_hidden: false,
    });
  }

  return matchups;
}

export function initPMGame(
  state: GameState,
  totalRounds: number,
  promptTimerSeconds: number
): void {
  clearTimer(state.room_code);

  state.total_rounds = totalRounds;
  state.round_number = 1;
  state.is_final_round = totalRounds === 1;
  state.used_fact_ids = [];
  state.vote_options = [];
  state.pm_medals = undefined;
  state.pm_final_answers = undefined;
  state.pm_final_answer_cards = undefined;
  state.prompt_timer_seconds = promptTimerSeconds;

  for (const p of state.players) {
    p.score = 0;
    p.deception_count = 0;
    p.funny_vote_count = 0;
  }

  resetPlayerRoundsPM(state);
}

export function startFirstPMPhase(state: GameState, broadcast: BroadcastFn): void {
  if (state.is_final_round) {
    startPMFinalWritingPhase(state, broadcast);
  } else {
    startPMWritingPhase(state, broadcast);
  }
}

function startPMWritingPhase(state: GameState, broadcast: BroadcastFn): void {
  resetPlayerRoundsPM(state);
  state.pm_matchups = buildMatchups(state);
  state.pm_matchup_index = 0;
  state.phase = GamePhase.PM_WRITING;
  const timerMs = state.prompt_timer_seconds * 1000;
  state.timer_ends_at = Date.now() + timerMs;

  broadcast(state.room_code, state);

  setTimer(state.room_code, timerMs, () => {
    const s = getCurrentState(state.room_code);
    if (s && s.phase === GamePhase.PM_WRITING) {
      advancePMWritingToMatchup(s, broadcast);
    }
  });
}

export function advancePMWritingToMatchup(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);
  state.pm_matchup_index = 0;
  state.phase = GamePhase.PM_MATCHUP;
  state.timer_ends_at = Date.now() + PM_MATCHUP_TIMER_MS;

  broadcast(state.room_code, state);

  setTimer(state.room_code, PM_MATCHUP_TIMER_MS, () => {
    const s = getCurrentState(state.room_code);
    if (s && s.phase === GamePhase.PM_MATCHUP) {
      advancePMMatchupToResult(s, broadcast);
    }
  });
}

export function advancePMMatchupToResult(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  const idx = state.pm_matchup_index ?? 0;
  const matchup = state.pm_matchups?.[idx];
  if (matchup) {
    // Tally vote counts for current matchup
    const votes = Object.values(matchup.votes);
    matchup.player_a_vote_count = votes.filter((v) => v === "a").length;
    matchup.player_b_vote_count = votes.filter((v) => v === "b").length;
  }

  state.phase = GamePhase.PM_MATCHUP_RESULT;
  state.timer_ends_at = Date.now() + PM_MATCHUP_RESULT_TIMER_MS;

  broadcast(state.room_code, state);

  setTimer(state.room_code, PM_MATCHUP_RESULT_TIMER_MS, () => {
    const s = getCurrentState(state.room_code);
    if (s && s.phase === GamePhase.PM_MATCHUP_RESULT) {
      advancePMMatchupResult(s, broadcast);
    }
  });
}

function advancePMMatchupResult(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  const idx = state.pm_matchup_index ?? 0;
  const matchups = state.pm_matchups ?? [];

  if (idx + 1 < matchups.length) {
    // More matchups to show
    state.pm_matchup_index = idx + 1;
    state.phase = GamePhase.PM_MATCHUP;
    state.timer_ends_at = Date.now() + PM_MATCHUP_TIMER_MS;

    broadcast(state.room_code, state);

    setTimer(state.room_code, PM_MATCHUP_TIMER_MS, () => {
      const s = getCurrentState(state.room_code);
      if (s && s.phase === GamePhase.PM_MATCHUP) {
        advancePMMatchupToResult(s, broadcast);
      }
    });
  } else {
    // All matchups done — apply scores for this round
    applyMatchupScores(state, state.round_number);

    if (state.is_final_round) {
      startPMFinalWritingPhase(state, broadcast);
    } else {
      state.round_number += 1;
      state.is_final_round = state.round_number === state.total_rounds;
      if (state.is_final_round) {
        startPMFinalWritingPhase(state, broadcast);
      } else {
        startPMWritingPhase(state, broadcast);
      }
    }
  }
}

function startPMFinalWritingPhase(state: GameState, broadcast: BroadcastFn): void {
  const fact = getRandomFact(state.used_fact_ids, state.language);
  if (!fact) {
    state.phase = GamePhase.PODIUM;
    state.timer_ends_at = null;
    broadcast(state.room_code, state);
    return;
  }
  state.used_fact_ids.push(fact.content_id);

  resetPlayerRoundsPM(state);
  state.current_fact = fact;
  state.pm_final_answers = {};
  state.pm_final_answer_cards = undefined;
  state.pm_medals = {};
  state.phase = GamePhase.PM_FINAL_WRITING;
  const timerMs = state.prompt_timer_seconds * 1000;
  state.timer_ends_at = Date.now() + timerMs;

  broadcast(state.room_code, state);

  setTimer(state.room_code, timerMs, () => {
    const s = getCurrentState(state.room_code);
    if (s && s.phase === GamePhase.PM_FINAL_WRITING) {
      advancePMFinalWritingToReveal(s, broadcast);
    }
  });
}

export function advancePMFinalWritingToReveal(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);

  const answers = state.pm_final_answers ?? {};
  const cards = shuffle(
    Object.entries(answers).map(([sessionId, answer]) => {
      const player = state.players.find((p) => p.session_id === sessionId);
      return {
        session_id: sessionId,
        display_name: player?.display_name ?? "?",
        answer,
      };
    })
  );
  state.pm_final_answer_cards = cards;
  state.phase = GamePhase.PM_FINAL_REVEAL;
  state.timer_ends_at = Date.now() + PM_FINAL_REVEAL_TIMER_MS;

  broadcast(state.room_code, state);

  setTimer(state.room_code, PM_FINAL_REVEAL_TIMER_MS, () => {
    const s = getCurrentState(state.room_code);
    if (s && s.phase === GamePhase.PM_FINAL_REVEAL) {
      advancePMFinalRevealToPodium(s, broadcast);
    }
  });
}

function advancePMFinalRevealToPodium(state: GameState, broadcast: BroadcastFn): void {
  clearTimer(state.room_code);
  applyMedalScores(state);
  state.phase = GamePhase.PODIUM;
  state.timer_ends_at = null;
  broadcast(state.room_code, state);
}

export function checkAllPMAnswersSubmitted(state: GameState, broadcast: BroadcastFn): void {
  if (state.phase !== GamePhase.PM_WRITING) return;
  const matchups = state.pm_matchups ?? [];
  const connected = new Set(state.players.filter((p) => p.is_connected).map((p) => p.session_id));

  const allDone = matchups.every((m) => {
    const aNeeded = connected.has(m.player_a_session_id);
    const bNeeded = connected.has(m.player_b_session_id);
    return (!aNeeded || m.player_a_submitted) && (!bNeeded || m.player_b_submitted);
  });

  if (allDone) {
    advancePMWritingToMatchup(state, broadcast);
  }
}

export function checkAllPMMatchupVotesSubmitted(state: GameState, broadcast: BroadcastFn): void {
  if (state.phase !== GamePhase.PM_MATCHUP) return;
  const idx = state.pm_matchup_index ?? 0;
  const matchup = state.pm_matchups?.[idx];
  if (!matchup) return;

  const eligible = state.players.filter(
    (p) =>
      p.is_connected &&
      p.session_id !== matchup.player_a_session_id &&
      p.session_id !== matchup.player_b_session_id
  );
  if (eligible.length === 0) {
    advancePMMatchupToResult(state, broadcast);
    return;
  }
  const allVoted = eligible.every((p) => matchup.votes[p.session_id] !== undefined);
  if (allVoted) {
    advancePMMatchupToResult(state, broadcast);
  }
}

export function checkAllPMFinalAnswersSubmitted(state: GameState, broadcast: BroadcastFn): void {
  if (state.phase !== GamePhase.PM_FINAL_WRITING) return;
  const answers = state.pm_final_answers ?? {};
  const connected = state.players.filter((p) => p.is_connected);
  if (connected.length > 0 && connected.every((p) => answers[p.session_id] !== undefined)) {
    advancePMFinalWritingToReveal(state, broadcast);
  }
}
