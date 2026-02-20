import { describe, it, expect, vi } from "vitest";

// Mock bedrock to avoid real API calls
vi.mock("@/lib/bedrock/invoke", () => ({
  invokeNovaLite: vi.fn().mockResolvedValue({ text: '{"approved":true,"conflicts":[],"suggestions":[],"reasoning":"ok"}' }),
}));
vi.mock("@/lib/utils/logging", () => ({
  log: vi.fn(),
}));

import { validatePlan } from "@/lib/agents/validator";
import type { PlanRecommendation, AnalyzerResult } from "@/lib/orchestrator/types";

const basePlan: PlanRecommendation = {
  summary: "Recovery plan",
  diet: ["Grilled chicken with rice", "Greek yogurt with berries"],
  exercise: ["20 min walk", "Light stretching"],
  hydration: "Drink 2L water",
  recovery: "Sleep 8 hours",
  nutritionContext: [],
};

const baseAnalyzer: AnalyzerResult = {
  summary: "Moderate fatigue",
  energyScore: 55,
  keySignals: ["Poor sleep"],
  riskFlags: [],
};

describe("validatePlan", () => {
  it("approves plan with no Health Twin data", async () => {
    const result = await validatePlan(basePlan, baseAnalyzer, undefined);
    expect(result.approved).toBe(true);
  });

  it("approves plan with short Health Twin data", async () => {
    const result = await validatePlan(basePlan, baseAnalyzer, "No data yet");
    expect(result.approved).toBe(true);
  });

  it("detects allergy conflict in diet", async () => {
    const healthTwin = "Allergies: chicken, shellfish\nConditions: none";
    const result = await validatePlan(basePlan, baseAnalyzer, healthTwin);
    expect(result.approved).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]).toContain("chicken");
  });

  it("detects food dislike conflict", async () => {
    const healthTwin = "Preferences: Dislikes: yogurt, tofu";
    const result = await validatePlan(basePlan, baseAnalyzer, healthTwin);
    expect(result.approved).toBe(false);
    expect(result.conflicts.some(c => c.toLowerCase().includes("yogurt"))).toBe(true);
  });

  it("detects exercise dislike conflict", async () => {
    const plan = { ...basePlan, exercise: ["30 min running", "Yoga"] };
    const healthTwin = "Preferences: Avoids: running, swimming";
    const result = await validatePlan(plan, baseAnalyzer, healthTwin);
    expect(result.approved).toBe(false);
    expect(result.conflicts.some(c => c.toLowerCase().includes("running"))).toBe(true);
  });

  it("detects safety conflict with conditions", async () => {
    const plan = { ...basePlan, exercise: ["HIIT training", "Heavy deadlifts"] };
    const healthTwin = "Conditions: chronic back pain, knee injury\nLifestyle: desk worker";
    const result = await validatePlan(plan, baseAnalyzer, healthTwin);
    expect(result.approved).toBe(false);
    expect(result.conflicts.some(c => c.includes("SAFETY"))).toBe(true);
  });

  it("approves plan with no conflicts", async () => {
    const healthTwin = "Conditions: none\nAllergies: peanuts\nPreferences: Likes: chicken, rice";
    const result = await validatePlan(basePlan, baseAnalyzer, healthTwin);
    expect(result.approved).toBe(true);
  });
});
