/**
 * Lightweight prompt injection detection.
 * Returns null if safe, or a warning string if injection suspected.
 */
export function detectPromptInjection(message: string): string | null {
  const lower = message.toLowerCase();

  const patterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?above/i,
    /disregard\s+(all\s+)?previous/i,
    /you\s+are\s+now\s+(?:a|an|the)/i,
    /new\s+system\s+prompt/i,
    /override\s+(?:your|the)\s+(?:system|instructions|prompt)/i,
    /forget\s+(?:all|your)\s+(?:previous|instructions|rules)/i,
    /act\s+as\s+(?:a\s+)?(?:different|new)\s+(?:ai|assistant|bot)/i,
    /\bsystem:\s/i,
    /\bassistant:\s/i,
    /\bdo not\s+follow\s+(?:your|the)\s+(?:instructions|rules|guidelines)/i,
    /jailbreak/i,
    /dan\s+mode/i,
    /developer\s+mode\s+enabled/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(lower)) {
      return "potential_injection";
    }
  }

  // Suspicious: very long messages with many instruction-like phrases
  if (message.length > 500) {
    const instructionPhrases = (lower.match(/\b(you must|you should|you will|always|never|important|rule|instruction)\b/g) || []).length;
    if (instructionPhrases >= 5) {
      return "suspicious_instructions";
    }
  }

  return null;
}
