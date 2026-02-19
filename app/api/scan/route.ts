import { NextResponse } from "next/server";

import {
  analyzeIngredients,
  parseNutritionFacts,
  type IngredientWarning,
  type NutritionFacts,
} from "@/lib/integrations/ingredients-db";
import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { requireAuth } from "@/lib/auth/helpers";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_LENGTH = 5000;

export const runtime = "nodejs";

export interface ScanResponse {
  success: boolean;
  nutritionFacts: NutritionFacts;
  warnings: IngredientWarning[];
  ingredientsRaw: string;
  healthScore: number;
  summary: string;
}

function computeHealthScore(
  facts: NutritionFacts,
  warnings: IngredientWarning[]
): number {
  let score = 80; // Start decent

  // Penalize based on warnings
  for (const w of warnings) {
    if (w.risk === "high") score -= 20;
    else if (w.risk === "moderate") score -= 10;
    else score -= 3;
  }

  // Penalize high sugar
  if (facts.totalSugars) {
    const sugars = parseFloat(facts.totalSugars);
    if (sugars > 20) score -= 15;
    else if (sugars > 10) score -= 8;
  }

  // Penalize high sodium
  if (facts.sodium) {
    const sodium = parseFloat(facts.sodium);
    if (sodium > 600) score -= 12;
    else if (sodium > 300) score -= 5;
  }

  // Penalize trans fat
  if (facts.transFat) {
    const trans = parseFloat(facts.transFat);
    if (trans > 0) score -= 20;
  }

  // Bonus for fiber
  if (facts.dietaryFiber) {
    const fiber = parseFloat(facts.dietaryFiber);
    if (fiber >= 5) score += 8;
    else if (fiber >= 3) score += 4;
  }

  // Bonus for protein
  if (facts.protein) {
    const protein = parseFloat(facts.protein);
    if (protein >= 15) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function generateSummary(
  facts: NutritionFacts,
  warnings: IngredientWarning[],
  score: number
): string {
  const parts: string[] = [];

  if (score >= 70) {
    parts.push("This product is relatively acceptable.");
  } else if (score >= 40) {
    parts.push("This product has several concerns — consume in moderation.");
  } else {
    parts.push("WARNING: This product contains multiple harmful ingredients. Consider healthier alternatives.");
  }

  const highRisk = warnings.filter((w) => w.risk === "high");
  if (highRisk.length > 0) {
    parts.push(
      `Found ${highRisk.length} high-risk ingredient${highRisk.length > 1 ? "s" : ""}: ${highRisk.map((w) => w.name).join(", ")}.`
    );
  }

  if (facts.calories) {
    parts.push(`${facts.calories} calories per serving.`);
  }

  if (facts.totalSugars) {
    const sugars = parseFloat(facts.totalSugars);
    if (sugars > 20) {
      parts.push(`Very high sugar content (${facts.totalSugars}) — exceeds recommended daily limit per serving.`);
    }
  }

  return parts.join(" ");
}

/**
 * POST /api/scan
 * Accepts: { ingredientsText: string } or multipart form with image
 * For now: text-based analysis. Image OCR will use Nova multimodal when quota available.
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  try {
    // Rate limit: 30 requests per minute per userId:IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`${authResult.userId}:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait a moment." },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";

    let ingredientsText = "";
    let imageBase64: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      ingredientsText = (formData.get("ingredients") as string) ?? "";
      const imageFile = formData.get("image") as File | null;

      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_SIZE) {
          return NextResponse.json(
            { success: false, error: "Image too large. Maximum size is 5 MB." },
            { status: 413 }
          );
        }
        const buffer = await imageFile.arrayBuffer();
        imageBase64 = Buffer.from(buffer).toString("base64");

        // Try Nova multimodal OCR if available
        const ocrText = await tryNovaOcr(imageBase64, imageFile.type);
        if (ocrText) {
          ingredientsText = ocrText;
        }
      }
    } else {
      const body = (await request.json().catch(() => null)) as {
        ingredientsText?: string;
      } | null;
      ingredientsText = (body?.ingredientsText ?? "").slice(0, MAX_TEXT_LENGTH);
    }

    if (!ingredientsText.trim()) {
      return NextResponse.json(
        { success: false, error: "No ingredients text provided. Please type or scan the ingredients list." },
        { status: 400 }
      );
    }

    log({ level: "info", agent: "scan", message: `Analyzing ${ingredientsText.length} chars of ingredients` });

    const nutritionFacts = parseNutritionFacts(ingredientsText);
    const warnings = analyzeIngredients(ingredientsText);
    const healthScore = computeHealthScore(nutritionFacts, warnings);
    const summary = generateSummary(nutritionFacts, warnings, healthScore);

    const response: ScanResponse = {
      success: true,
      nutritionFacts,
      warnings,
      ingredientsRaw: ingredientsText.slice(0, 2000),
      healthScore,
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    log({ level: "error", agent: "scan", message: `Scan error: ${error}` });
    return NextResponse.json(
      { success: false, error: "Failed to analyze the product." },
      { status: 500 }
    );
  }
}

/**
 * Try to OCR an image using Nova multimodal via Bedrock.
 * Returns extracted text or null if unavailable.
 */
async function tryNovaOcr(
  imageBase64: string,
  mimeType: string
): Promise<string | null> {
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });

    const mediaType = mimeType.startsWith("image/")
      ? (mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif")
      : "image/jpeg";

    const command = new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID_LITE ?? "us.amazon.nova-2-lite-v1:0",
      messages: [
        {
          role: "user",
          content: [
            {
              image: {
                format: mediaType.replace("image/", "") as "jpeg" | "png" | "webp" | "gif",
                source: { bytes: Buffer.from(imageBase64, "base64") },
              },
            },
            {
              text: `You are a nutrition label OCR specialist. Extract ALL text from this food product image. Include:
1. ALL ingredients listed (exactly as printed)
2. ALL Nutrition Facts values (calories, fat, sodium, sugars, protein, etc.)
3. Any allergen warnings
4. Serving size information

Return the extracted text as-is, preserving the original language. Do NOT summarize or interpret — just extract the raw text.`,
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 2000 },
    });

    const response = await client.send(command);
    const text = response.output?.message?.content?.[0]?.text;
    return text ?? null;
  } catch (error) {
    log({
      level: "warn",
      agent: "scan",
      message: `Nova OCR unavailable (falling back to manual input): ${error instanceof Error ? error.message : "unknown"}`,
    });
    return null;
  }
}
