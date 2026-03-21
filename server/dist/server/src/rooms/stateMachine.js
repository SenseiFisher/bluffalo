"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearRoomTimers = clearRoomTimers;
exports.startGame = startGame;
exports.registerGetRoom = registerGetRoom;
exports.advanceToReveal = advanceToReveal;
exports.advanceToSelection = advanceToSelection;
exports.advanceToResolution = advanceToResolution;
exports.advanceToNextRound = advanceToNextRound;
exports.checkAllLiesSubmitted = checkAllLiesSubmitted;
exports.checkAllVotesSubmitted = checkAllVotesSubmitted;
const uuid_1 = require("uuid");
const types_1 = require("../../../shared/types");
const constants_1 = require("../../../shared/constants");
const shuffle_1 = require("../utils/shuffle");
const scoring_1 = require("../utils/scoring");
const loader_1 = require("../content/loader");
// Phase timers: roomCode → timeout handle
const phaseTimers = new Map();
function clearTimer(roomCode) {
    const t = phaseTimers.get(roomCode);
    if (t) {
        clearTimeout(t);
        phaseTimers.delete(roomCode);
    }
}
function setTimer(roomCode, ms, cb) {
    clearTimer(roomCode);
    const t = setTimeout(cb, ms);
    phaseTimers.set(roomCode, t);
}
function clearRoomTimers(roomCode) {
    clearTimer(roomCode);
}
/**
 * Reset per-round fields on all players.
 */
function resetPlayerRounds(state) {
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
function allLiesSubmitted(state) {
    const eligible = state.players.filter((p) => p.is_connected && !p.round.great_minds);
    return (eligible.length > 0 &&
        eligible.every((p) => p.round.submitted_lie !== null));
}
/**
 * Check if all eligible voters have voted.
 * Eligible = connected + did not go great_minds (their lie is removed from options).
 */
function allVotesSubmitted(state) {
    // Players who need to vote: connected players who are not great_minds
    // AND whose own lie is in the list (i.e., they have a lie option to skip)
    // Actually: everyone connected can vote unless they went great_minds
    // AND they can't vote for their own lie
    // So eligible voters = connected players who are NOT great_minds
    const eligible = state.players.filter((p) => p.is_connected && !p.round.great_minds);
    return (eligible.length > 0 &&
        eligible.every((p) => p.round.voted_for_id !== null));
}
/**
 * LOBBY → PROMPT
 */
function startGame(state, totalRounds, broadcast) {
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
function startPromptPhase(state, broadcast) {
    const fact = (0, loader_1.getRandomFact)(state.used_fact_ids);
    if (!fact) {
        console.error(`[StateMachine] No facts available for room ${state.room_code}`);
        return;
    }
    state.current_fact = fact;
    state.used_fact_ids.push(fact.content_id);
    state.phase = types_1.GamePhase.PROMPT;
    state.vote_options = [];
    state.timer_ends_at = Date.now() + constants_1.PROMPT_TIMER_MS;
    broadcast(state.room_code, state);
    setTimer(state.room_code, constants_1.PROMPT_TIMER_MS, () => {
        const currentState = getCurrentState(state.room_code);
        if (currentState && currentState.phase === types_1.GamePhase.PROMPT) {
            advanceToReveal(currentState, broadcast);
        }
    });
}
// We need a way to get the current state from the timer callback
// Import roomStore lazily to avoid circular dependency
let _getRoomFn = null;
function registerGetRoom(fn) {
    _getRoomFn = fn;
}
function getCurrentState(roomCode) {
    return _getRoomFn ? _getRoomFn(roomCode) : undefined;
}
/**
 * PROMPT → REVEAL
 */
function advanceToReveal(state, broadcast) {
    clearTimer(state.room_code);
    // Build vote options: all submitted lies + truth
    const lies = [];
    for (const p of state.players) {
        if (p.round.submitted_lie === null)
            continue;
        if (p.round.great_minds)
            continue; // Great Minds lie removed from voting
        lies.push({
            option_id: (0, uuid_1.v4)(),
            text: p.round.submitted_lie,
            is_truth: false,
            author_session_id: p.session_id,
        });
    }
    const truthOption = {
        option_id: (0, uuid_1.v4)(),
        text: state.current_fact.truth_keyword,
        is_truth: true,
        author_session_id: null,
    };
    state.vote_options = (0, shuffle_1.shuffle)([...lies, truthOption]);
    state.phase = types_1.GamePhase.REVEAL;
    state.timer_ends_at = Date.now() + constants_1.REVEAL_TIMER_MS;
    broadcast(state.room_code, state);
    setTimer(state.room_code, constants_1.REVEAL_TIMER_MS, () => {
        const currentState = getCurrentState(state.room_code);
        if (currentState && currentState.phase === types_1.GamePhase.REVEAL) {
            advanceToSelection(currentState, broadcast);
        }
    });
}
/**
 * REVEAL → SELECTION
 */
function advanceToSelection(state, broadcast) {
    clearTimer(state.room_code);
    state.phase = types_1.GamePhase.SELECTION;
    state.timer_ends_at = Date.now() + constants_1.SELECTION_TIMER_MS;
    broadcast(state.room_code, state);
    setTimer(state.room_code, constants_1.SELECTION_TIMER_MS, () => {
        const currentState = getCurrentState(state.room_code);
        if (currentState && currentState.phase === types_1.GamePhase.SELECTION) {
            advanceToResolution(currentState, broadcast);
        }
    });
}
/**
 * SELECTION → RESOLUTION
 */
function advanceToResolution(state, broadcast) {
    clearTimer(state.room_code);
    // Calculate scores
    const scored = (0, scoring_1.calculateRoundScores)(state);
    // Copy scored fields back to state
    Object.assign(state, scored);
    state.phase = types_1.GamePhase.RESOLUTION;
    state.timer_ends_at = Date.now() + constants_1.RESOLUTION_TIMER_MS;
    broadcast(state.room_code, state);
    setTimer(state.room_code, constants_1.RESOLUTION_TIMER_MS, () => {
        const currentState = getCurrentState(state.room_code);
        if (currentState && currentState.phase === types_1.GamePhase.RESOLUTION) {
            advanceToNextRound(currentState, broadcast);
        }
    });
}
/**
 * RESOLUTION → PROMPT (next round) or PODIUM (final round)
 */
function advanceToNextRound(state, broadcast) {
    clearTimer(state.room_code);
    if (state.is_final_round) {
        state.phase = types_1.GamePhase.PODIUM;
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
function checkAllLiesSubmitted(state, broadcast) {
    if (state.phase === types_1.GamePhase.PROMPT && allLiesSubmitted(state)) {
        advanceToReveal(state, broadcast);
    }
}
/**
 * Try to advance from SELECTION→RESOLUTION if all votes are in.
 */
function checkAllVotesSubmitted(state, broadcast) {
    if (state.phase === types_1.GamePhase.SELECTION && allVotesSubmitted(state)) {
        advanceToResolution(state, broadcast);
    }
}
