import { describe, it, expect } from "vitest";
import { applyProfileUpdates } from "@/lib/health-twin/storage-utils";
import { createEmptyProfile } from "@/lib/health-twin/types";
import type { ProfileUpdates } from "@/lib/health-twin/types";

describe("applyProfileUpdates", () => {
  it("adds conditions to empty profile", () => {
    const profile = createEmptyProfile();
    const updates: ProfileUpdates = { addConditions: ["chronic back pain"] };
    const result = applyProfileUpdates(profile, updates);
    expect(result.conditions).toContain("chronic back pain");
  });

  it("adds allergies", () => {
    const profile = createEmptyProfile();
    const updates: ProfileUpdates = { addAllergies: ["shellfish", "peanuts"] };
    const result = applyProfileUpdates(profile, updates);
    expect(result.allergies).toEqual(["shellfish", "peanuts"]);
  });

  it("deduplicates case-insensitively", () => {
    const profile = createEmptyProfile();
    profile.allergies = ["Shellfish"];
    const updates: ProfileUpdates = { addAllergies: ["shellfish", "Peanuts"] };
    const result = applyProfileUpdates(profile, updates);
    expect(result.allergies).toEqual(["Shellfish", "Peanuts"]);
  });

  it("adds food preferences", () => {
    const profile = createEmptyProfile();
    const updates: ProfileUpdates = {
      addFoodLikes: ["chicken", "rice"],
      addFoodDislikes: ["tofu"],
    };
    const result = applyProfileUpdates(profile, updates);
    expect(result.preferences.foodLikes).toEqual(["chicken", "rice"]);
    expect(result.preferences.foodDislikes).toEqual(["tofu"]);
  });

  it("adds exercise preferences", () => {
    const profile = createEmptyProfile();
    const updates: ProfileUpdates = {
      addExerciseLikes: ["walking", "yoga"],
      addExerciseDislikes: ["running"],
    };
    const result = applyProfileUpdates(profile, updates);
    expect(result.preferences.exerciseLikes).toEqual(["walking", "yoga"]);
    expect(result.preferences.exerciseDislikes).toEqual(["running"]);
  });

  it("adds patterns and lifestyle", () => {
    const profile = createEmptyProfile();
    const updates: ProfileUpdates = {
      addPatterns: ["poor sleep on weekdays"],
      addLifestyle: ["desk worker", "lives alone"],
    };
    const result = applyProfileUpdates(profile, updates);
    expect(result.patterns).toContain("poor sleep on weekdays");
    expect(result.lifestyle).toHaveLength(2);
  });

  it("updates lastUpdatedAt", async () => {
    const profile = createEmptyProfile();
    const before = profile.lastUpdatedAt;
    // Wait 2ms to ensure different timestamp
    await new Promise(r => setTimeout(r, 2));
    const updates: ProfileUpdates = { addConditions: ["test"] };
    const result = applyProfileUpdates(profile, updates);
    expect(result.lastUpdatedAt).not.toBe(before);
  });

  it("handles empty updates gracefully", () => {
    const profile = createEmptyProfile();
    const updates: ProfileUpdates = {};
    const result = applyProfileUpdates(profile, updates);
    expect(result.conditions).toEqual([]);
    expect(result.allergies).toEqual([]);
  });

  it("caps lists at 30 items", () => {
    const profile = createEmptyProfile();
    const longList = Array.from({ length: 35 }, (_, i) => `condition-${i}`);
    const updates: ProfileUpdates = { addConditions: longList };
    const result = applyProfileUpdates(profile, updates);
    expect(result.conditions.length).toBeLessThanOrEqual(30);
  });
});
