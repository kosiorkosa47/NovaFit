import { NextResponse } from "next/server";
import { z } from "zod";
import { dynamodb, AUTH_TABLE } from "@/lib/db/dynamodb";
import { requireAuth } from "@/lib/auth/helpers";

const migrateSchema = z.object({
  profile: z
    .object({
      name: z.string().optional(),
      age: z.number().optional(),
      weight: z.number().optional(),
      height: z.number().optional(),
      activityLevel: z.string().optional(),
    })
    .optional(),
  goals: z.record(z.unknown()).optional(),
  healthFacts: z.array(z.string()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  try {
    const body = await request.json().catch(() => null);
    const parsed = migrateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid migration data." },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    const expressionParts: string[] = [];
    const attrNames: Record<string, string> = {};
    const attrValues: Record<string, unknown> = {};

    if (parsed.data.profile?.name) {
      expressionParts.push("#n = :name");
      attrNames["#n"] = "name";
      attrValues[":name"] = parsed.data.profile.name;
    }
    if (parsed.data.goals) {
      expressionParts.push("goals = :goals");
      attrValues[":goals"] = parsed.data.goals;
    }
    if (parsed.data.healthFacts) {
      expressionParts.push("healthFacts = :hf");
      attrValues[":hf"] = parsed.data.healthFacts;
    }

    if (expressionParts.length > 0) {
      await dynamodb.update({
        TableName: AUTH_TABLE,
        Key: {
          pk: `USER#${authResult.userId}`,
          sk: `USER#${authResult.userId}`,
        },
        UpdateExpression: `SET ${expressionParts.join(", ")}`,
        ...(Object.keys(attrNames).length > 0
          ? { ExpressionAttributeNames: attrNames }
          : {}),
        ExpressionAttributeValues: attrValues,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Migration failed." },
      { status: 500 }
    );
  }
}
