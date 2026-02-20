import { invokeNovaLite } from "@/lib/bedrock/invoke";
import { extractJsonObject } from "@/lib/utils/json";
import type { PlanRecommendation, AnalyzerResult } from "@/lib/orchestrator/types";
import { log } from "@/lib/utils/logging";

export interface ValidationResult {
  approved: boolean;
  conflicts: string[];
  suggestions: string[];
  reasoning: string;
}

/**
 * Fast local validation — checks plan against known allergies/dislikes
 * without an API call. Catches obvious conflicts instantly.
 */
function localValidation(
  plan: PlanRecommendation,
  healthTwinContext: string
): { conflicts: string[] } {
  const conflicts: string[] = [];
  const lower = healthTwinContext.toLowerCase();

  // Extract allergies
  const allergyMatch = lower.match(/allergies?:\s*([^\n]+)/);
  const allergies = allergyMatch
    ? allergyMatch[1].split(",").map(a => a.trim().toLowerCase()).filter(Boolean)
    : [];

  // Extract food dislikes
  const dislikeMatch = lower.match(/dislikes?:\s*([^\n;]+)/);
  const dislikes = dislikeMatch
    ? dislikeMatch[1].split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
    : [];

  // Extract exercise dislikes
  const exDislikeMatch = lower.match(/avoids?:\s*([^\n;]+)/);
  const exDislikes = exDislikeMatch
    ? exDislikeMatch[1].split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
    : [];

  // Extract conditions
  const condMatch = lower.match(/conditions?:\s*([^\n]+)/);
  const conditions = condMatch
    ? condMatch[1].split(",").map(c => c.trim().toLowerCase()).filter(Boolean)
    : [];

  const allDietText = plan.diet.join(" ").toLowerCase();
  const allExerciseText = plan.exercise.join(" ").toLowerCase();

  // Check diet against allergies
  for (const allergy of allergies) {
    if (allDietText.includes(allergy)) {
      conflicts.push(`ALLERGY CONFLICT: Plan suggests "${allergy}" but user is allergic`);
    }
  }

  // Check diet against dislikes
  for (const dislike of dislikes) {
    if (allDietText.includes(dislike)) {
      conflicts.push(`PREFERENCE CONFLICT: Plan suggests "${dislike}" but user dislikes it`);
    }
  }

  // Check exercise against dislikes
  for (const exDislike of exDislikes) {
    if (allExerciseText.includes(exDislike)) {
      conflicts.push(`EXERCISE CONFLICT: Plan suggests "${exDislike}" but user avoids it`);
    }
  }

  // Check for high-intensity exercise when user has relevant conditions
  const highIntensityWords = ["hiit", "sprint", "intense", "heavy", "crossfit"];
  const limitingConditions = ["back pain", "knee pain", "injury", "chronic pain", "arthritis"];
  const hasLimitingCondition = conditions.some(c => limitingConditions.some(lc => c.includes(lc)));
  if (hasLimitingCondition) {
    for (const word of highIntensityWords) {
      if (allExerciseText.includes(word)) {
        conflicts.push(`SAFETY CONFLICT: Plan suggests "${word}" exercise but user has ${conditions.filter(c => limitingConditions.some(lc => c.includes(lc))).join(", ")}`);
      }
    }
  }

  return { conflicts };
}

/**
 * Nova-based deep validation — for when Health Twin has complex data
 * that regex can't catch (e.g., "lactose intolerant" vs "cheese suggestion").
 * Only called when Health Twin has substantial data AND local check passes.
 */
async function novaValidation(
  plan: PlanRecommendation,
  analyzer: AnalyzerResult,
  healthTwinContext: string
): Promise<ValidationResult> {
  const systemPrompt = `You are a Plan Validator agent in a multi-agent health coaching system.
Your job: Check if the Planner's recommendations are SAFE and APPROPRIATE for this specific user.

You receive:
1. The user's Health Twin profile (allergies, conditions, dislikes, patterns)
2. The Analyzer's assessment (energy, risks)
3. The Planner's recommendations (diet, exercise)

Check for:
- Allergy conflicts (suggesting foods the user is allergic to)
- Preference violations (suggesting foods/exercises the user explicitly dislikes)
- Safety issues (high-intensity exercise for someone with injuries/conditions)
- Energy mismatch (intense activity when energy < 30)

Output JSON only:
{
  "approved": true/false,
  "conflicts": ["List of specific conflicts found"],
  "suggestions": ["Alternative recommendations to replace conflicting items"],
  "reasoning": "Brief explanation of your validation decision"
}
If no conflicts found, return approved: true with empty conflicts/suggestions.`;

  const userPrompt = `HEALTH TWIN PROFILE:
${healthTwinContext}

ANALYZER ASSESSMENT:
Energy: ${analyzer.energyScore}/100
Risks: ${analyzer.riskFlags.join(", ") || "none"}

PLANNER RECOMMENDATIONS:
Diet: ${plan.diet.join("; ")}
Exercise: ${plan.exercise.join("; ")}
Recovery: ${plan.recovery}`;

  try {
    const result = await invokeNovaLite({
      systemPrompt,
      userPrompt,
      maxTokens: 200,
      temperature: 0.1,
    });

    const parsed = extractJsonObject(result.text);
    return {
      approved: parsed?.approved !== false,
      conflicts: Array.isArray(parsed?.conflicts) ? parsed.conflicts.map(String) : [],
      suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions.map(String) : [],
      reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : "Validation complete",
    };
  } catch (error) {
    log({
      level: "warn",
      agent: "validator",
      message: `Nova validation failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
    return { approved: true, conflicts: [], suggestions: [], reasoning: "Validation skipped (error)" };
  }
}

/**
 * Validate a plan against the user's Health Twin profile.
 * Two-tier: fast local check first, Nova deep check for complex cases.
 */
export async function validatePlan(
  plan: PlanRecommendation,
  analyzer: AnalyzerResult,
  healthTwinContext?: string
): Promise<ValidationResult> {
  if (!healthTwinContext || healthTwinContext.length < 30) {
    return { approved: true, conflicts: [], suggestions: [], reasoning: "No Health Twin data — skipping validation" };
  }

  // Tier 1: Fast local validation (0ms, no API cost)
  const local = localValidation(plan, healthTwinContext);
  if (local.conflicts.length > 0) {
    log({
      level: "info",
      agent: "validator",
      message: `Local validation found ${local.conflicts.length} conflicts`,
    });
    return {
      approved: false,
      conflicts: local.conflicts,
      suggestions: [],
      reasoning: "Local validation found direct conflicts with Health Twin profile",
    };
  }

  // Tier 2: Nova deep validation (only if Health Twin has rich data)
  const hasRichProfile = healthTwinContext.length > 150;
  if (hasRichProfile) {
    return novaValidation(plan, analyzer, healthTwinContext);
  }

  return { approved: true, conflicts: [], suggestions: [], reasoning: "Plan validated — no conflicts detected" };
}
