export interface WearableSnapshot {
  steps: number;
  averageHeartRate: number;
  restingHeartRate: number;
  sleepHours: number;
  stressLevel: "low" | "moderate" | "high";
  capturedAt: string;
}

function seededInt(seed: string, min: number, max: number): number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const normalized = Math.abs(hash % 10_000) / 10_000;
  return Math.floor(normalized * (max - min + 1)) + min;
}

export async function getWearableSnapshot(sessionId: string): Promise<WearableSnapshot> {
  const useMock = process.env.USE_MOCK_WEARABLES !== "false";

  if (!useMock) {
    // Placeholder for future Fitbit/HealthKit/Garmin integration.
    // When implementing, add OAuth token management here.
  }

  return {
    steps: seededInt(`${sessionId}-steps`, 2400, 9800),
    averageHeartRate: seededInt(`${sessionId}-avg-hr`, 74, 108),
    restingHeartRate: seededInt(`${sessionId}-rest-hr`, 56, 76),
    sleepHours: seededInt(`${sessionId}-sleep`, 5, 8),
    stressLevel: (["low", "moderate", "high"] as const)[
      seededInt(`${sessionId}-stress`, 0, 2)
    ],
    capturedAt: new Date().toISOString()
  };
}

export function formatWearableForPrompt(snapshot: WearableSnapshot): string {
  return [
    `Steps today: ${snapshot.steps}`,
    `Average heart rate: ${snapshot.averageHeartRate} bpm`,
    `Resting heart rate: ${snapshot.restingHeartRate} bpm`,
    `Sleep last night: ${snapshot.sleepHours}h`,
    `Stress level: ${snapshot.stressLevel}`,
    `Captured at: ${snapshot.capturedAt}`
  ].join("\n");
}
