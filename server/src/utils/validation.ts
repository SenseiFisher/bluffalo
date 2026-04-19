import { MAX_DISPLAY_NAME_LENGTH, MAX_LIE_LENGTH } from "../../../shared/constants";

/**
 * Strip HTML tags and dangerous characters from user input.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")           // strip HTML tags
    .trim();
}

/**
 * Validate and sanitize a display name.
 * Returns { valid: true, value } or { valid: false, error }.
 */
export function validateDisplayName(
  raw: unknown
): { valid: true; value: string } | { valid: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { valid: false, error: "Display name is required" };
  }
  const cleaned = sanitizeHtml(raw.trim());
  if (cleaned.length === 0) {
    return { valid: false, error: "Display name cannot be empty" };
  }
  if (cleaned.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      valid: false,
      error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, value: cleaned };
}

/**
 * Validate and sanitize a lie submission.
 */
export function validateLie(
  raw: unknown
): { valid: true; value: string } | { valid: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { valid: false, error: "Lie text is required" };
  }
  const cleaned = sanitizeHtml(raw.trim());
  if (cleaned.length === 0) {
    return { valid: false, error: "Lie cannot be empty" };
  }
  if (cleaned.length > MAX_LIE_LENGTH) {
    return {
      valid: false,
      error: `Lie must be ${MAX_LIE_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, value: cleaned };
}

/**
 * Validate a room code format.
 */
export function validateRoomCode(raw: unknown): boolean {
  return typeof raw === "string" && /^[A-Z0-9]{4}$/.test(raw);
}
