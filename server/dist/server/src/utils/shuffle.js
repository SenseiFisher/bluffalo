"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shuffle = shuffle;
/**
 * Fisher-Yates shuffle — returns a new shuffled array.
 */
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
