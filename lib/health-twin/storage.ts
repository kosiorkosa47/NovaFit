import type { HealthTwinProfile, ProfileUpdates, SessionSummary } from "./types";
import { createEmptyProfile } from "./types";

const STORAGE_KEY = "nova-health-twin";
const MAX_SESSIONS = 20;
const MAX_LIST_ITEMS = 30;

/** Load the Health Twin profile from localStorage (defensive — handles corrupted/flat data) */
export function loadHealthTwin(): HealthTwinProfile {
  if (typeof window === "undefined") return createEmptyProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyProfile();
    const p = JSON.parse(raw) as Record<string, unknown>;

    const empty = createEmptyProfile();

    // Migrate flat foodLikes/foodDislikes → nested preferences
    const prefs = (p.preferences && typeof p.preferences === "object")
      ? p.preferences as Record<string, unknown>
      : {};

    const profile: HealthTwinProfile = {
      version: 1,
      createdAt: (p.createdAt as string) ?? empty.createdAt,
      lastUpdatedAt: (p.lastUpdatedAt as string) ?? empty.lastUpdatedAt,
      conditions: Array.isArray(p.conditions) ? p.conditions as string[] : [],
      allergies: Array.isArray(p.allergies) ? p.allergies as string[] : [],
      medications: Array.isArray(p.medications) ? p.medications as string[] : [],
      preferences: {
        foodLikes: Array.isArray(prefs.foodLikes) ? prefs.foodLikes as string[] : (Array.isArray(p.foodLikes) ? p.foodLikes as string[] : []),
        foodDislikes: Array.isArray(prefs.foodDislikes) ? prefs.foodDislikes as string[] : (Array.isArray(p.foodDislikes) ? p.foodDislikes as string[] : []),
        exerciseLikes: Array.isArray(prefs.exerciseLikes) ? prefs.exerciseLikes as string[] : (Array.isArray(p.exerciseLikes) ? p.exerciseLikes as string[] : []),
        exerciseDislikes: Array.isArray(prefs.exerciseDislikes) ? prefs.exerciseDislikes as string[] : (Array.isArray(p.exerciseDislikes) ? p.exerciseDislikes as string[] : []),
      },
      patterns: Array.isArray(p.patterns) ? p.patterns as string[] : [],
      lifestyle: Array.isArray(p.lifestyle) ? p.lifestyle as string[] : [],
      sessionSummaries: Array.isArray(p.sessionSummaries)
        ? (p.sessionSummaries as Record<string, unknown>[]).map(s => ({
            date: (s.date as string) ?? new Date().toISOString(),
            topics: Array.isArray(s.topics) ? s.topics as string[] : (s.topic ? [s.topic as string] : []),
            energyScore: (typeof s.energyScore === "number") ? s.energyScore : 70,
            keyFinding: (s.keyFinding as string) ?? (s.topic as string) ?? "",
          }))
        : [],
      averages: (p.averages && typeof p.averages === "object")
        ? {
            energyScore: ((p.averages as Record<string, unknown>).energyScore as number | null) ?? null,
            sleepHours: ((p.averages as Record<string, unknown>).sleepHours as number | null) ?? null,
            dailySteps: ((p.averages as Record<string, unknown>).dailySteps as number | null) ?? null,
            sessionsCount: ((p.averages as Record<string, unknown>).sessionsCount as number) ?? 0,
          }
        : empty.averages,
    };

    return profile;
  } catch {
    return createEmptyProfile();
  }
}

/** Save the Health Twin profile to localStorage */
export function saveHealthTwin(profile: HealthTwinProfile): void {
  if (typeof window === "undefined") return;
  profile.lastUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** Add unique items to an array, keeping it capped */
function addUnique(existing: string[], newItems: string[], max = MAX_LIST_ITEMS): string[] {
  const lower = new Set(existing.map(s => s.toLowerCase()));
  for (const item of newItems) {
    const trimmed = item.trim();
    if (trimmed && !lower.has(trimmed.toLowerCase())) {
      existing.push(trimmed);
      lower.add(trimmed.toLowerCase());
    }
  }
  return existing.slice(-max);
}

/** Apply profile updates from agent extraction */
export function applyProfileUpdates(profile: HealthTwinProfile, updates: ProfileUpdates): HealthTwinProfile {
  if (updates.addConditions?.length) {
    profile.conditions = addUnique(profile.conditions, updates.addConditions);
  }
  if (updates.addAllergies?.length) {
    profile.allergies = addUnique(profile.allergies, updates.addAllergies);
  }
  if (updates.addMedications?.length) {
    profile.medications = addUnique(profile.medications, updates.addMedications);
  }
  if (updates.addFoodLikes?.length) {
    profile.preferences.foodLikes = addUnique(profile.preferences.foodLikes, updates.addFoodLikes);
  }
  if (updates.addFoodDislikes?.length) {
    profile.preferences.foodDislikes = addUnique(profile.preferences.foodDislikes, updates.addFoodDislikes);
  }
  if (updates.addExerciseLikes?.length) {
    profile.preferences.exerciseLikes = addUnique(profile.preferences.exerciseLikes, updates.addExerciseLikes);
  }
  if (updates.addExerciseDislikes?.length) {
    profile.preferences.exerciseDislikes = addUnique(profile.preferences.exerciseDislikes, updates.addExerciseDislikes);
  }
  if (updates.addPatterns?.length) {
    profile.patterns = addUnique(profile.patterns, updates.addPatterns);
  }
  if (updates.addLifestyle?.length) {
    profile.lifestyle = addUnique(profile.lifestyle, updates.addLifestyle);
  }
  return profile;
}

/** Add a session summary and update running averages */
export function addSessionSummary(
  profile: HealthTwinProfile,
  energyScore: number,
  topics: string[],
  keyFinding: string
): HealthTwinProfile {
  const summary: SessionSummary = {
    date: new Date().toISOString(),
    topics,
    energyScore,
    keyFinding,
  };

  profile.sessionSummaries.push(summary);
  if (profile.sessionSummaries.length > MAX_SESSIONS) {
    profile.sessionSummaries = profile.sessionSummaries.slice(-MAX_SESSIONS);
  }

  // Update running averages
  const n = profile.averages.sessionsCount;
  const prev = profile.averages.energyScore ?? energyScore;
  profile.averages.energyScore = Math.round((prev * n + energyScore) / (n + 1));
  profile.averages.sessionsCount = n + 1;

  return profile;
}

/** Format the Health Twin profile as context for agent prompts */
export function formatHealthTwinForPrompt(profile: HealthTwinProfile): string {
  const parts: string[] = [];

  if (profile.conditions.length) {
    parts.push(`Health conditions: ${profile.conditions.join(", ")}`);
  }
  if (profile.allergies.length) {
    parts.push(`Allergies: ${profile.allergies.join(", ")}`);
  }
  if (profile.medications.length) {
    parts.push(`Medications/supplements: ${profile.medications.join(", ")}`);
  }

  const prefs: string[] = [];
  if (profile.preferences.foodLikes.length) prefs.push(`Likes: ${profile.preferences.foodLikes.join(", ")}`);
  if (profile.preferences.foodDislikes.length) prefs.push(`Dislikes: ${profile.preferences.foodDislikes.join(", ")}`);
  if (profile.preferences.exerciseLikes.length) prefs.push(`Enjoys: ${profile.preferences.exerciseLikes.join(", ")}`);
  if (profile.preferences.exerciseDislikes.length) prefs.push(`Avoids: ${profile.preferences.exerciseDislikes.join(", ")}`);
  if (prefs.length) parts.push(`Preferences: ${prefs.join("; ")}`);

  if (profile.patterns.length) {
    parts.push(`Known patterns: ${profile.patterns.join("; ")}`);
  }
  if (profile.lifestyle.length) {
    parts.push(`Lifestyle: ${profile.lifestyle.join("; ")}`);
  }

  // Recent session summaries (last 5)
  if (profile.sessionSummaries.length) {
    const recent = profile.sessionSummaries.slice(-5);
    const lines = recent.map(s => {
      const d = new Date(s.date);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      return `  ${dateStr}: ${s.keyFinding} (energy: ${s.energyScore}/100)`;
    });
    parts.push(`Recent sessions:\n${lines.join("\n")}`);
  }

  if (profile.averages.sessionsCount > 1) {
    const avg = profile.averages;
    const avgParts: string[] = [];
    if (avg.energyScore !== null) avgParts.push(`energy ${avg.energyScore}/100`);
    if (avg.sleepHours !== null) avgParts.push(`sleep ${avg.sleepHours}h`);
    if (avg.dailySteps !== null) avgParts.push(`${avg.dailySteps} steps`);
    if (avgParts.length) parts.push(`Averages (${avg.sessionsCount} sessions): ${avgParts.join(", ")}`);
  }

  if (!parts.length) return "";
  return `HEALTH TWIN PROFILE (what you know about this user from past conversations):\n${parts.join("\n")}`;
}
