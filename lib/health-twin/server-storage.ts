import { dynamodb, SESSIONS_TABLE } from "@/lib/db/dynamodb";
import type { HealthTwinProfile } from "./types";
import { createEmptyProfile } from "./types";

/**
 * Save Health Twin profile to DynamoDB (keyed by userId).
 * Uses the sessions table with a special PK: "twin:{userId}"
 */
export async function saveHealthTwinServer(
  userId: string,
  profile: HealthTwinProfile
): Promise<void> {
  try {
    await dynamodb.put({
      TableName: SESSIONS_TABLE,
      Item: {
        sessionId: `twin:${userId}`,
        healthTwin: profile,
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 365 * 86400, // 1 year
      },
    });
  } catch (error) {
    console.warn("[health-twin-server] save failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * Load Health Twin profile from DynamoDB for a user.
 */
export async function loadHealthTwinServer(
  userId: string
): Promise<HealthTwinProfile> {
  try {
    const result = await dynamodb.get({
      TableName: SESSIONS_TABLE,
      Key: { sessionId: `twin:${userId}` },
    });
    if (result.Item?.healthTwin) {
      return result.Item.healthTwin as HealthTwinProfile;
    }
  } catch (error) {
    console.warn("[health-twin-server] load failed:", error instanceof Error ? error.message : error);
  }
  return createEmptyProfile();
}
