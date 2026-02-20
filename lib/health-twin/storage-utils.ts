import type { HealthTwinProfile, ProfileUpdates } from "./types";

const MAX_LIST_ITEMS = 30;

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

/** Apply profile updates from agent extraction (server-safe, no browser APIs) */
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
  profile.lastUpdatedAt = new Date().toISOString();
  return profile;
}
