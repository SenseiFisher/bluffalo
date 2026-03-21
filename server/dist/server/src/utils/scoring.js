"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRoundScores = calculateRoundScores;
const constants_1 = require("../../../shared/constants");
/**
 * Calculate and apply scores for the current round.
 * Mutates a deep-cloned copy of state and returns it.
 *
 * Order of operations:
 *  1. Great Minds bonus (already flagged on player.round.great_minds)
 *  2. Truth Seeker bonus
 *  3. Bamboozle bonus
 *  4. Final Round Multiplier (applied to this round's gains only)
 */
function calculateRoundScores(state) {
    // Deep clone to avoid mutation
    const s = JSON.parse(JSON.stringify(state));
    const multiplier = s.is_final_round ? constants_1.FINAL_ROUND_MULTIPLIER : 1.0;
    // Build a map of option_id → author_session_id for lie options
    const optionAuthorMap = new Map();
    for (const opt of s.vote_options) {
        optionAuthorMap.set(opt.option_id, opt.author_session_id);
    }
    // Find the truth option
    const truthOption = s.vote_options.find((o) => o.is_truth);
    // Track round earnings per player (for multiplier application)
    const roundEarnings = new Map();
    for (const p of s.players) {
        roundEarnings.set(p.session_id, 0);
    }
    const addEarning = (sessionId, amount) => {
        const current = roundEarnings.get(sessionId) ?? 0;
        roundEarnings.set(sessionId, current + amount);
    };
    // 1. Great Minds bonus
    for (const p of s.players) {
        if (p.round.great_minds) {
            addEarning(p.session_id, constants_1.GREAT_MINDS_BONUS);
        }
    }
    // 2. Truth Seeker bonus — players who voted for the truth
    if (truthOption) {
        for (const p of s.players) {
            if (p.round.voted_for_id === truthOption.option_id) {
                p.round.truth_found = true;
                addEarning(p.session_id, constants_1.TRUTH_SEEKER_BONUS);
            }
        }
    }
    // 3. Bamboozle bonus — count votes each lie received
    // Build map of session_id → bamboozle count
    const bamboozleMap = new Map();
    for (const p of s.players) {
        const votedId = p.round.voted_for_id;
        if (!votedId)
            continue;
        const votedOption = s.vote_options.find((o) => o.option_id === votedId);
        if (!votedOption || votedOption.is_truth)
            continue;
        const authorSessionId = votedOption.author_session_id;
        if (!authorSessionId)
            continue;
        // Don't count if the voter voted for their own lie (server should prevent this,
        // but double-check here)
        if (p.session_id === authorSessionId)
            continue;
        const current = bamboozleMap.get(authorSessionId) ?? 0;
        bamboozleMap.set(authorSessionId, current + 1);
    }
    for (const [sessionId, count] of bamboozleMap.entries()) {
        const player = s.players.find((p) => p.session_id === sessionId);
        if (player) {
            player.round.bamboozle_count = count;
            player.deception_count += count;
            addEarning(sessionId, count * constants_1.BAMBOOZLE_BONUS);
        }
    }
    // 4. Apply multiplier and add earnings to scores
    for (const p of s.players) {
        const earned = roundEarnings.get(p.session_id) ?? 0;
        p.score += Math.round(earned * multiplier);
    }
    return s;
}
