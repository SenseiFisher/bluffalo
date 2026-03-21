"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOM_CODE_LENGTH = exports.ROOM_CODE_ALPHABET = exports.MAX_LIE_LENGTH = exports.MAX_DISPLAY_NAME_LENGTH = exports.MIN_PLAYERS_TO_START = exports.MAX_ROUNDS = exports.MIN_ROUNDS = exports.DEFAULT_TOTAL_ROUNDS = exports.ROOM_TTL_MS = exports.RESOLUTION_TIMER_MS = exports.SELECTION_TIMER_MS = exports.REVEAL_TIMER_MS = exports.PROMPT_TIMER_MS = exports.FINAL_ROUND_MULTIPLIER = exports.GREAT_MINDS_BONUS = exports.BAMBOOZLE_BONUS = exports.TRUTH_SEEKER_BONUS = void 0;
// Scoring constants
exports.TRUTH_SEEKER_BONUS = 500;
exports.BAMBOOZLE_BONUS = 250;
exports.GREAT_MINDS_BONUS = 1000;
exports.FINAL_ROUND_MULTIPLIER = 2.0;
// Phase timer durations (milliseconds)
exports.PROMPT_TIMER_MS = 60000;
exports.REVEAL_TIMER_MS = 5000;
exports.SELECTION_TIMER_MS = 30000;
exports.RESOLUTION_TIMER_MS = 6000;
// Room settings
exports.ROOM_TTL_MS = parseInt(process.env?.ROOM_TTL_MS ?? "300000", 10);
exports.DEFAULT_TOTAL_ROUNDS = 7;
exports.MIN_ROUNDS = 3;
exports.MAX_ROUNDS = 20;
exports.MIN_PLAYERS_TO_START = 2;
// Input validation
exports.MAX_DISPLAY_NAME_LENGTH = 20;
exports.MAX_LIE_LENGTH = 50;
// Room code alphabet (no ambiguous chars: 0, O, I, 1)
exports.ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
exports.ROOM_CODE_LENGTH = 4;
