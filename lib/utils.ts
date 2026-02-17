// Barrel re-export for frontend components.
// Backend modules should import directly from lib/utils/sanitize, lib/utils/sse, etc.

import { clsx, type ClassValue } from "clsx";
import { v4 as uuidv4 } from "uuid";
import { twMerge } from "tailwind-merge";

export { sanitizeMessageInput, sanitizeFeedbackInput, isValidSessionId } from "@/lib/utils/sanitize";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function ensureSessionId(candidate?: string): string {
  const SESSION_ID_REGEX = /^[a-zA-Z0-9-]{8,80}$/;

  if (candidate && SESSION_ID_REGEX.test(candidate)) {
    return candidate;
  }

  return uuidv4();
}
