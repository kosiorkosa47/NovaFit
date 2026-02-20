import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export const dynamodb = DynamoDBDocument.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const AUTH_TABLE = process.env.DYNAMODB_AUTH_TABLE ?? "novafit-auth";
export const SESSIONS_TABLE = process.env.DYNAMODB_SESSIONS_TABLE ?? "novafit-sessions";

// ── Session helpers ──

export interface DynamoSession {
  sessionId: string;
  userId?: string;
  messages: unknown[];
  adaptationNotes: string[];
  userFacts: string[];
  healthTwin?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

const SESSION_TTL_DAYS = 7;

function ttlEpoch(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 86400;
}

export async function getSession(sessionId: string): Promise<DynamoSession | null> {
  try {
    const result = await dynamodb.get({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    });
    return (result.Item as DynamoSession) ?? null;
  } catch (error) {
    console.warn("[dynamodb] getSession failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function putSession(sessionId: string, data: Partial<DynamoSession>): Promise<void> {
  try {
    const now = new Date().toISOString();
    await dynamodb.put({
      TableName: SESSIONS_TABLE,
      Item: {
        sessionId,
        messages: data.messages ?? [],
        adaptationNotes: data.adaptationNotes ?? [],
        userFacts: data.userFacts ?? [],
        healthTwin: data.healthTwin,
        userId: data.userId,
        createdAt: data.createdAt ?? now,
        updatedAt: now,
        ttl: ttlEpoch(),
      },
    });
  } catch (error) {
    console.warn("[dynamodb] putSession failed:", error instanceof Error ? error.message : error);
  }
}

export async function updateSessionField(
  sessionId: string,
  field: string,
  value: unknown
): Promise<void> {
  try {
    await dynamodb.update({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
      UpdateExpression: `SET #f = :v, updatedAt = :now, #ttl = :ttl`,
      ExpressionAttributeNames: { "#f": field, "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":v": value,
        ":now": new Date().toISOString(),
        ":ttl": ttlEpoch(),
      },
    });
  } catch (error) {
    console.warn("[dynamodb] updateSessionField failed:", error instanceof Error ? error.message : error);
  }
}
