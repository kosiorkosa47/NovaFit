const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;
const TAG_REGEX = /<[^>]+>/g;
const SCRIPT_URI_REGEX = /(javascript:|data:text\/html)/gi;
const SESSION_ID_REGEX = /^[a-zA-Z0-9-]{8,80}$/;

export const MAX_MESSAGE_LENGTH = 600;
export const MAX_FEEDBACK_LENGTH = 300;

export function sanitizeInput(value: string, maxLength = MAX_MESSAGE_LENGTH): string {
  return value
    .replace(CONTROL_CHAR_REGEX, " ")
    .replace(TAG_REGEX, " ")
    .replace(SCRIPT_URI_REGEX, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMessageInput(value: string): string {
  return sanitizeInput(value, MAX_MESSAGE_LENGTH);
}

export function sanitizeFeedbackInput(value: string): string {
  return sanitizeInput(value, MAX_FEEDBACK_LENGTH);
}

export function isValidSessionId(candidate: string): boolean {
  return SESSION_ID_REGEX.test(candidate);
}
