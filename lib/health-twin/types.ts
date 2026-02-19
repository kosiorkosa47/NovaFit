/** Health Twin — persistent user health profile that grows over time */

export interface HealthTwinProfile {
  version: 1;
  createdAt: string;
  lastUpdatedAt: string;

  /** Chronic conditions, ongoing health issues */
  conditions: string[];
  /** Food/drug/environmental allergies */
  allergies: string[];
  /** Current medications or supplements */
  medications: string[];

  /** What the user likes/dislikes */
  preferences: {
    foodLikes: string[];
    foodDislikes: string[];
    exerciseLikes: string[];
    exerciseDislikes: string[];
  };

  /** Discovered behavioral/health patterns */
  patterns: string[];

  /** Lifestyle notes: job, habits, equipment */
  lifestyle: string[];

  /** Session-by-session summaries (last 20) */
  sessionSummaries: SessionSummary[];

  /** Running averages */
  averages: {
    energyScore: number | null;
    sleepHours: number | null;
    dailySteps: number | null;
    sessionsCount: number;
  };
}

export interface SessionSummary {
  date: string;
  topics: string[];
  energyScore: number;
  keyFinding: string;
}

/** Profile updates extracted by the Monitor agent after each message */
export interface ProfileUpdates {
  addConditions?: string[];
  addAllergies?: string[];
  addMedications?: string[];
  addFoodLikes?: string[];
  addFoodDislikes?: string[];
  addExerciseLikes?: string[];
  addExerciseDislikes?: string[];
  addPatterns?: string[];
  addLifestyle?: string[];
  sessionNote?: string;
}

export function createEmptyProfile(): HealthTwinProfile {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    conditions: [],
    allergies: [],
    medications: [],
    preferences: {
      foodLikes: [],
      foodDislikes: [],
      exerciseLikes: [],
      exerciseDislikes: [],
    },
    patterns: [],
    lifestyle: [],
    sessionSummaries: [],
    averages: {
      energyScore: null,
      sleepHours: null,
      dailySteps: null,
      sessionsCount: 0,
    },
  };
}
