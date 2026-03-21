"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeHtml = sanitizeHtml;
exports.validateDisplayName = validateDisplayName;
exports.validateLie = validateLie;
exports.validateRoomCode = validateRoomCode;
const constants_1 = require("../../../shared/constants");
/**
 * Strip HTML tags and dangerous characters from user input.
 */
function sanitizeHtml(input) {
    return input
        .replace(/<[^>]*>/g, "") // strip HTML tags
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;")
        .trim();
}
/**
 * Validate and sanitize a display name.
 * Returns { valid: true, value } or { valid: false, error }.
 */
function validateDisplayName(raw) {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        return { valid: false, error: "Display name is required" };
    }
    const cleaned = sanitizeHtml(raw.trim());
    if (cleaned.length === 0) {
        return { valid: false, error: "Display name cannot be empty" };
    }
    if (cleaned.length > constants_1.MAX_DISPLAY_NAME_LENGTH) {
        return {
            valid: false,
            error: `Display name must be ${constants_1.MAX_DISPLAY_NAME_LENGTH} characters or fewer`,
        };
    }
    return { valid: true, value: cleaned };
}
/**
 * Validate and sanitize a lie submission.
 */
function validateLie(raw) {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        return { valid: false, error: "Lie text is required" };
    }
    const cleaned = sanitizeHtml(raw.trim());
    if (cleaned.length === 0) {
        return { valid: false, error: "Lie cannot be empty" };
    }
    if (cleaned.length > constants_1.MAX_LIE_LENGTH) {
        return {
            valid: false,
            error: `Lie must be ${constants_1.MAX_LIE_LENGTH} characters or fewer`,
        };
    }
    return { valid: true, value: cleaned };
}
/**
 * Validate a room code format.
 */
function validateRoomCode(raw) {
    return typeof raw === "string" && /^[A-Z0-9]{4}$/.test(raw);
}
