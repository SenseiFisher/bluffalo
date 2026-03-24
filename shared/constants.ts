// Scoring constants
export const TRUTH_SEEKER_BONUS = 500;
export const BAMBOOZLE_BONUS = 250;
export const GREAT_MINDS_BONUS = 1000;
export const FINAL_ROUND_MULTIPLIER = 2.0;

// Phase timer durations (milliseconds)
export const PROMPT_TIMER_MS = 60_000;
export const REVEAL_TIMER_MS = 5_000;
export const SELECTION_TIMER_MS = 30_000;
export const RESOLUTION_TIMER_MS = 6_000;

// Room settings
export const ROOM_TTL_MS = parseInt(process.env?.ROOM_TTL_MS ?? "300000", 10);
export const DEFAULT_TOTAL_ROUNDS = 7;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 20;
export const DEFAULT_PROMPT_TIMER_SECONDS = 60;
export const PROMPT_TIMER_PRESETS = [30, 45, 60, 90, 120, 150] as const;
export const MIN_PLAYERS_TO_START = 2;

// Input validation
export const MAX_DISPLAY_NAME_LENGTH = 20;
export const MAX_LIE_LENGTH = 50;

// Room code alphabet (no ambiguous chars: 0, O, I, 1)
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;

// Rejoin expiry: max time a disconnected player can return to a game in progress
export const REJOIN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// Language support
export const SUPPORTED_LANGUAGES = ['en', 'he'] as const;
export type Language = typeof SUPPORTED_LANGUAGES[number];
export const DEFAULT_LANGUAGE: Language = 'en';
