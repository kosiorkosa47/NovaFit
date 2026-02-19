import type { Tool, ToolResultBlock } from "@aws-sdk/client-bedrock-runtime";
import { getNutritionContext } from "@/lib/integrations/nutritionix";
import { getWearableSnapshot } from "@/lib/integrations/wearables.mock";
import { log } from "@/lib/utils/logging";

/**
 * Nova tool definitions for the Converse API.
 * These let the model decide WHEN to call external tools.
 */
export const AGENT_TOOLS: Tool[] = [
  {
    toolSpec: {
      name: "get_health_data",
      description: "Get the user's current health metrics from their wearable/phone sensors: steps, heart rate, sleep hours, stress level.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "The current session ID",
            },
          },
          required: ["sessionId"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "get_nutrition_info",
      description: "Look up nutritional information (calories, protein, carbs, fat) for a specific food item. Returns data from Nutritionix or USDA database.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            foodQuery: {
              type: "string",
              description: "The food item to look up, e.g. 'chicken breast 200g' or 'pizza slice'",
            },
          },
          required: ["foodQuery"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "get_daily_progress",
      description: "Get the user's progress toward their daily health goals (steps, calories, water, sleep).",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            currentSteps: { type: "number", description: "Current step count from sensors" },
            goalSteps: { type: "number", description: "Daily step goal" },
            currentCalories: { type: "number", description: "Estimated calories consumed" },
            goalCalories: { type: "number", description: "Daily calorie goal" },
          },
          required: [],
        },
      },
    },
  },
];

/**
 * Execute a tool call requested by Nova.
 * Returns the tool result to be sent back to the model.
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string
): Promise<ToolResultBlock> {
  log({ level: "info", agent: "tools", message: `Executing tool: ${toolName}(${JSON.stringify(toolInput).slice(0, 100)})` });

  try {
    switch (toolName) {
      case "get_health_data": {
        const wearable = await getWearableSnapshot(sessionId);
        return {
          toolUseId: "",
          content: [{ text: JSON.stringify(wearable) }],
        };
      }
      case "get_nutrition_info": {
        const query = typeof toolInput.foodQuery === "string" ? toolInput.foodQuery : "balanced meal";
        const nutrition = await getNutritionContext(query);
        return {
          toolUseId: "",
          content: [{ text: JSON.stringify({ items: nutrition }) }],
        };
      }
      case "get_daily_progress": {
        const steps = typeof toolInput.currentSteps === "number" ? toolInput.currentSteps : 0;
        const goalSteps = typeof toolInput.goalSteps === "number" ? toolInput.goalSteps : 8000;
        const cals = typeof toolInput.currentCalories === "number" ? toolInput.currentCalories : 0;
        const goalCals = typeof toolInput.goalCalories === "number" ? toolInput.goalCalories : 2000;
        return {
          toolUseId: "",
          content: [{ text: JSON.stringify({
            steps: { current: steps, goal: goalSteps, percent: Math.round((steps / goalSteps) * 100) },
            calories: { current: cals, goal: goalCals, percent: Math.round((cals / goalCals) * 100) },
            message: steps >= goalSteps ? "Step goal reached!" : `${goalSteps - steps} steps remaining today`,
          }) }],
        };
      }
      default:
        return {
          toolUseId: "",
          content: [{ text: `Unknown tool: ${toolName}` }],
        };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Tool execution failed";
    log({ level: "error", agent: "tools", message: `Tool ${toolName} failed: ${msg}` });
    return {
      toolUseId: "",
      content: [{ text: `Error: ${msg}` }],
    };
  }
}
