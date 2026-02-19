import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { dynamodb, AUTH_TABLE } from "@/lib/db/dynamodb";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`reg:${ip}`, 5, 3_600_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many registration attempts. Try again later." },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input.", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Check if user already exists via GSI1
    const existing = await dynamodb.query({
      TableName: AUTH_TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
      ExpressionAttributeValues: {
        ":pk": `USER#${parsed.data.email}`,
        ":sk": `USER#${parsed.data.email}`,
      },
      Limit: 1,
    });

    if (existing.Items && existing.Items.length > 0) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

    // Create user in DynamoDB (same format as NextAuth DynamoDB adapter)
    await dynamodb.put({
      TableName: AUTH_TABLE,
      Item: {
        pk: `USER#${userId}`,
        sk: `USER#${userId}`,
        GSI1PK: `USER#${parsed.data.email}`,
        GSI1SK: `USER#${parsed.data.email}`,
        id: userId,
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashedPassword,
        emailVerified: null,
        image: null,
        type: "USER",
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
