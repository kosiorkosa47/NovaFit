import { NextResponse } from "next/server";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getBedrockClient } from "@/lib/bedrock/client";
import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { requireAuth } from "@/lib/auth/helpers";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface MealAnalysis {
  success: boolean;
  foods: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  healthScore: number;
  summary: string;
  suggestions: string[];
}

export interface FoodItem {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * POST /api/meal
 * Accepts multipart form with image of a meal.
 * Uses Nova 2 Lite multimodal to analyze food in the photo.
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  try {
    // Rate limit: 20 requests per minute per userId:IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`${authResult.userId}:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait a moment." },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, error: "Please upload a photo of your meal." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile || !imageFile.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "No valid image provided." },
        { status: 400 }
      );
    }

    if (imageFile.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Image too large. Maximum size is 5 MB." },
        { status: 413 }
      );
    }

    log({ level: "info", agent: "meal", message: `Analyzing meal photo (${(imageFile.size / 1024).toFixed(0)} KB)` });

    const buffer = await imageFile.arrayBuffer();
    const imageBytes = new Uint8Array(buffer);

    const mediaType = imageFile.type.startsWith("image/")
      ? (imageFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif")
      : "image/jpeg";

    const client = getBedrockClient();

    const command = new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID_LITE ?? "us.amazon.nova-2-lite-v1:0",
      messages: [
        {
          role: "user",
          content: [
            {
              image: {
                format: mediaType.replace("image/", "") as "jpeg" | "png" | "webp" | "gif",
                source: { bytes: imageBytes },
              },
            },
            {
              text: `You are an expert nutritionist AI. Analyze this meal photo and provide a detailed nutritional breakdown.

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "foods": [
    {
      "name": "food item name",
      "portion": "estimated portion size",
      "calories": 250,
      "protein": 15,
      "carbs": 30,
      "fat": 8
    }
  ],
  "totalCalories": 500,
  "totalProtein": 30,
  "totalCarbs": 60,
  "totalFat": 16,
  "healthScore": 75,
  "summary": "Brief 1-2 sentence health assessment of this meal",
  "suggestions": ["suggestion 1 for improvement", "suggestion 2"]
}

Guidelines:
- Identify ALL visible food items
- Estimate realistic portion sizes
- Provide accurate calorie and macro estimates
- healthScore: 0-100 (100 = very healthy)
- Give 2-3 practical suggestions to make this meal healthier
- Be specific about food items, not generic`,
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 1500, temperature: 0.3 },
    });

    const response = await client.send(command);
    const rawText = response.output?.message?.content?.[0]?.text ?? "";

    log({ level: "info", agent: "meal", message: `Nova response: ${rawText.slice(0, 100)}...` });

    // Parse JSON from Nova response
    let analysis: MealAnalysis;
    try {
      // Try to extract JSON from response (Nova sometimes wraps in markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      const parsed = JSON.parse(jsonMatch[0]);

      analysis = {
        success: true,
        foods: parsed.foods ?? [],
        totalCalories: parsed.totalCalories ?? 0,
        totalProtein: parsed.totalProtein ?? 0,
        totalCarbs: parsed.totalCarbs ?? 0,
        totalFat: parsed.totalFat ?? 0,
        healthScore: Math.max(0, Math.min(100, parsed.healthScore ?? 50)),
        summary: parsed.summary ?? "Meal analyzed successfully.",
        suggestions: parsed.suggestions ?? [],
      };
    } catch {
      // Fallback: return the raw text as summary
      analysis = {
        success: true,
        foods: [],
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        healthScore: 50,
        summary: rawText.slice(0, 500),
        suggestions: [],
      };
    }

    return NextResponse.json(analysis);
  } catch (error) {
    log({ level: "error", agent: "meal", message: `Meal analysis error: ${error}` });
    return NextResponse.json(
      { success: false, error: "Failed to analyze the meal photo. Please try again." },
      { status: 500 }
    );
  }
}
