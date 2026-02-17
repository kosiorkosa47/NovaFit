import { invokeNovaLite } from "@/lib/bedrock/invoke";
import type { AnalyzerResult, PlanRecommendation } from "@/lib/orchestrator/types";
import { PLANNER_SYSTEM_PROMPT } from "@/lib/orchestrator/prompts";
import type { ChatMessage } from "@/lib/session/session.types";
import { logAgentStart, logAgentDone, logAgentError } from "@/lib/utils/logging";

function extractJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function parsePlanResult(raw: string, nutritionContext: string[]): PlanRecommendation {
  const parsed = extractJsonObject(raw);

  return {
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "A light recovery-first plan balancing energy support and movement.",
    diet: Array.isArray(parsed?.diet)
      ? parsed.diet.map(String).slice(0, 6)
      : [
          "Post-work meal: lean protein + whole grains + vegetables.",
          "Evening snack: Greek yogurt with berries or nuts."
        ],
    exercise: Array.isArray(parsed?.exercise)
      ? parsed.exercise.map(String).slice(0, 6)
      : [
          "15-20 minute low-intensity walk after work.",
          "6 minutes of mobility and breathing before bed."
        ],
    hydration:
      typeof parsed?.hydration === "string"
        ? parsed.hydration
        : "Spread water intake across afternoon and evening.",
    recovery:
      typeof parsed?.recovery === "string"
        ? parsed.recovery
        : "Aim for consistent bedtime and 7+ hours sleep opportunity.",
    nutritionContext: Array.isArray(parsed?.nutritionContext)
      ? parsed.nutritionContext.map(String).slice(0, 6)
      : nutritionContext
  };
}

export interface PlannerInput {
  message: string;
  feedback?: string;
  analyzer: AnalyzerResult;
  nutritionContext: string[];
  history: ChatMessage[];
  adaptationNotes: string[];
  userFacts: string[];
  sessionId: string;
}

export async function runPlanner(input: PlannerInput): Promise<{ raw: string; parsed: PlanRecommendation }> {
  const startTime = logAgentStart("Planner", input.sessionId);

  const userPrompt = [
    `User message: ${input.message}`,
    input.feedback ? `User feedback on previous plan: ${input.feedback}` : "",
    `\nAnalyzer assessment: ${JSON.stringify(input.analyzer)}`,
    `Energy score: ${input.analyzer.energyScore}/100`,
    `\nNutrition context: ${input.nutritionContext.join(" | ")}`,
    input.adaptationNotes.length
      ? `\nAdaptation notes:\n- ${input.adaptationNotes.join("\n- ")}`
      : "",
    input.userFacts.length
      ? `\nKnown user preferences/restrictions:\n- ${input.userFacts.join("\n- ")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await invokeNovaLite({
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      userPrompt,
      history: input.history,
      maxTokens: 600,
      temperature: 0.35
    });

    const parsed = parsePlanResult(result.text, input.nutritionContext);
    logAgentDone("Planner", startTime, input.sessionId);
    return { raw: result.text, parsed };
  } catch (error) {
    logAgentError("Planner", error, input.sessionId);
    throw error;
  }
}
