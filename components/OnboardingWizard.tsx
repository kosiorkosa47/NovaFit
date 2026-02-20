"use client";

import { useState, useCallback } from "react";
import { Heart, ShieldAlert, Utensils, Dumbbell, Target, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { saveHealthTwin, loadHealthTwin, applyProfileUpdates } from "@/lib/health-twin/storage";
import type { ProfileUpdates } from "@/lib/health-twin/types";

const ONBOARDING_DONE_KEY = "nova-health-onboarded";

export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
}

export function markOnboardingDone(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_DONE_KEY, "1");
}

interface OnboardingWizardProps {
  onComplete: () => void;
}

// Chip that toggles on/off
function ToggleChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
        selected
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 shadow-sm dark:border-emerald-400 dark:bg-emerald-400/15 dark:text-emerald-300"
          : "border-white/40 bg-white/30 text-foreground/70 hover:bg-white/50 dark:border-emerald-800/20 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30"
      }`}
    >
      {selected && <Check className="mr-1 inline h-3 w-3" />}
      {label}
    </button>
  );
}

const COMMON_CONDITIONS = [
  "Back pain", "Knee pain", "Migraines", "Asthma", "Diabetes",
  "High blood pressure", "Insomnia", "Anxiety", "Depression", "Arthritis",
];

const COMMON_ALLERGIES = [
  "Peanuts", "Tree nuts", "Shellfish", "Dairy", "Gluten",
  "Eggs", "Soy", "Fish", "Wheat", "Sesame",
];

const FOOD_LIKES = [
  "Chicken", "Fish", "Rice", "Pasta", "Salads",
  "Fruit", "Yogurt", "Eggs", "Soup", "Steak",
];

const FOOD_DISLIKES = [
  "Tofu", "Liver", "Mushrooms", "Olives", "Broccoli",
  "Spicy food", "Raw fish", "Beans", "Eggplant", "Beets",
];

const EXERCISE_LIKES = [
  "Walking", "Running", "Yoga", "Swimming", "Cycling",
  "Gym/weights", "Dancing", "Hiking", "Stretching", "Pilates",
];

const EXERCISE_DISLIKES = [
  "Running", "HIIT", "Swimming", "Heavy lifting", "Jumping",
  "Burpees", "Planks", "Squats", "Treadmill", "CrossFit",
];

const LIFESTYLE_OPTIONS = [
  "Desk/office worker", "Remote worker", "Physical job", "Student",
  "Lives alone", "Has family", "Cooks regularly", "Eats out often",
  "Night owl", "Early riser", "Shift worker", "Frequent traveler",
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);

  // Step 1: Name + conditions
  const [name, setName] = useState("");
  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set());
  const [customCondition, setCustomCondition] = useState("");
  const [selectedAllergies, setSelectedAllergies] = useState<Set<string>>(new Set());

  // Step 2: Preferences
  const [foodLikes, setFoodLikes] = useState<Set<string>>(new Set());
  const [foodDislikes, setFoodDislikes] = useState<Set<string>>(new Set());
  const [exerciseLikes, setExerciseLikes] = useState<Set<string>>(new Set());
  const [exerciseDislikes, setExerciseDislikes] = useState<Set<string>>(new Set());

  // Step 3: Lifestyle + goals
  const [lifestyle, setLifestyle] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState({ calories: 2000, steps: 8000, sleep: 8, water: 2000 });

  const toggleSet = useCallback((set: Set<string>, item: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setter(next);
  }, []);

  const handleFinish = useCallback(() => {
    // Build profile updates
    const updates: ProfileUpdates = {};
    const conditions = [...selectedConditions];
    if (customCondition.trim()) conditions.push(customCondition.trim());
    if (conditions.length) updates.addConditions = conditions;
    if (selectedAllergies.size) updates.addAllergies = [...selectedAllergies];
    if (foodLikes.size) updates.addFoodLikes = [...foodLikes];
    if (foodDislikes.size) updates.addFoodDislikes = [...foodDislikes];
    if (exerciseLikes.size) updates.addExerciseLikes = [...exerciseLikes];
    if (exerciseDislikes.size) updates.addExerciseDislikes = [...exerciseDislikes];
    if (lifestyle.size) updates.addLifestyle = [...lifestyle];

    // Apply to Health Twin
    const twin = loadHealthTwin();
    const updated = applyProfileUpdates(twin, updates);
    saveHealthTwin(updated);

    // Save name to profile
    if (name.trim()) {
      const existing = JSON.parse(localStorage.getItem("nova-health-profile") || "{}");
      localStorage.setItem("nova-health-profile", JSON.stringify({
        ...existing,
        name: name.trim(),
        createdAt: existing.createdAt || new Date().toISOString(),
      }));
    }

    // Save goals
    localStorage.setItem("nova-health-goals", JSON.stringify(goals));

    // Also sync to server (fire-and-forget)
    void fetch("/api/wearable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ healthTwin: updated }),
    }).catch(() => {});

    markOnboardingDone();
    onComplete();
  }, [name, selectedConditions, customCondition, selectedAllergies, foodLikes, foodDislikes, exerciseLikes, exerciseDislikes, lifestyle, goals, onComplete]);

  const stepTitles = [
    "About You",
    "Your Preferences",
    "Goals & Lifestyle",
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 px-4 pt-4 pb-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step
                ? "w-8 bg-emerald-500"
                : i < step
                ? "w-2 bg-emerald-500/60"
                : "w-2 bg-foreground/15"
            }`}
          />
        ))}
      </div>

      <h2 className="px-6 pt-1 text-center text-xl font-light text-foreground/90">
        {stepTitles[step]}
      </h2>
      <p className="px-6 pb-3 text-center text-xs text-muted-foreground">
        {step === 0 && "Help Nova personalize your coaching from day one"}
        {step === 1 && "What foods and activities do you prefer?"}
        {step === 2 && "Set your targets and tell us about your lifestyle"}
      </p>

      {/* Content — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {step === 0 && (
          <div className="mx-auto max-w-sm space-y-4">
            {/* Name */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <Heart className="h-3.5 w-3.5 text-emerald-500" />
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should Nova call you?"
                className="w-full rounded-xl border border-white/40 bg-white/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus-zen dark:border-emerald-800/20 dark:bg-emerald-950/20"
              />
            </div>

            {/* Conditions */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                Health conditions <span className="text-foreground/40">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_CONDITIONS.map((c) => (
                  <ToggleChip
                    key={c}
                    label={c}
                    selected={selectedConditions.has(c)}
                    onToggle={() => toggleSet(selectedConditions, c, setSelectedConditions)}
                  />
                ))}
              </div>
              <input
                type="text"
                value={customCondition}
                onChange={(e) => setCustomCondition(e.target.value)}
                placeholder="Other condition..."
                className="mt-2 w-full rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus-zen dark:border-emerald-800/20 dark:bg-emerald-950/20"
              />
            </div>

            {/* Allergies */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                Allergies <span className="text-foreground/40">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ALLERGIES.map((a) => (
                  <ToggleChip
                    key={a}
                    label={a}
                    selected={selectedAllergies.has(a)}
                    onToggle={() => toggleSet(selectedAllergies, a, setSelectedAllergies)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mx-auto max-w-sm space-y-4">
            {/* Food likes */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <Utensils className="h-3.5 w-3.5 text-emerald-500" />
                Foods you enjoy
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FOOD_LIKES.map((f) => (
                  <ToggleChip key={f} label={f} selected={foodLikes.has(f)} onToggle={() => toggleSet(foodLikes, f, setFoodLikes)} />
                ))}
              </div>
            </div>

            {/* Food dislikes */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <Utensils className="h-3.5 w-3.5 text-red-400" />
                Foods you avoid
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FOOD_DISLIKES.map((f) => (
                  <ToggleChip key={f} label={f} selected={foodDislikes.has(f)} onToggle={() => toggleSet(foodDislikes, f, setFoodDislikes)} />
                ))}
              </div>
            </div>

            {/* Exercise likes */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <Dumbbell className="h-3.5 w-3.5 text-blue-500" />
                Activities you enjoy
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_LIKES.map((e) => (
                  <ToggleChip key={e} label={e} selected={exerciseLikes.has(e)} onToggle={() => toggleSet(exerciseLikes, e, setExerciseLikes)} />
                ))}
              </div>
            </div>

            {/* Exercise dislikes */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <Dumbbell className="h-3.5 w-3.5 text-red-400" />
                Activities you avoid
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_DISLIKES.map((e) => (
                  <ToggleChip key={e} label={e} selected={exerciseDislikes.has(e)} onToggle={() => toggleSet(exerciseDislikes, e, setExerciseDislikes)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mx-auto max-w-sm space-y-4">
            {/* Daily goals */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                <Target className="h-3.5 w-3.5 text-emerald-500" />
                Daily goals
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">Calories</label>
                  <input
                    type="number"
                    value={goals.calories}
                    onChange={(e) => setGoals((g) => ({ ...g, calories: parseInt(e.target.value) || 2000 }))}
                    className="w-full rounded-lg border border-white/40 bg-white/30 px-2.5 py-1.5 text-sm focus-zen dark:border-emerald-800/20 dark:bg-emerald-950/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Steps</label>
                  <input
                    type="number"
                    value={goals.steps}
                    onChange={(e) => setGoals((g) => ({ ...g, steps: parseInt(e.target.value) || 8000 }))}
                    className="w-full rounded-lg border border-white/40 bg-white/30 px-2.5 py-1.5 text-sm focus-zen dark:border-emerald-800/20 dark:bg-emerald-950/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Sleep (hours)</label>
                  <input
                    type="number"
                    value={goals.sleep}
                    onChange={(e) => setGoals((g) => ({ ...g, sleep: parseInt(e.target.value) || 8 }))}
                    className="w-full rounded-lg border border-white/40 bg-white/30 px-2.5 py-1.5 text-sm focus-zen dark:border-emerald-800/20 dark:bg-emerald-950/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Water (ml)</label>
                  <input
                    type="number"
                    value={goals.water}
                    onChange={(e) => setGoals((g) => ({ ...g, water: parseInt(e.target.value) || 2000 }))}
                    className="w-full rounded-lg border border-white/40 bg-white/30 px-2.5 py-1.5 text-sm focus-zen dark:border-emerald-800/20 dark:bg-emerald-950/20"
                  />
                </div>
              </div>
            </div>

            {/* Lifestyle */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                About your lifestyle
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LIFESTYLE_OPTIONS.map((l) => (
                  <ToggleChip key={l} label={l} selected={lifestyle.has(l)} onToggle={() => toggleSet(lifestyle, l, setLifestyle)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex shrink-0 items-center justify-between border-t border-white/20 px-5 py-3 dark:border-emerald-800/15">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/30 active:scale-95 dark:hover:bg-emerald-900/30"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { markOnboardingDone(); onComplete(); }}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            Skip
          </button>
        )}

        {step < 2 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex items-center gap-1 rounded-xl bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95"
          >
            <Check className="h-4 w-4" />
            Start Coaching
          </button>
        )}
      </div>
    </div>
  );
}
