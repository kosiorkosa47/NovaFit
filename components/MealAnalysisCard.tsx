"use client";

import type { MealAnalysis } from "@/app/api/meal/route";

function ScoreRing({ score }: { score: number }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-red-500";

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg className="-rotate-90" width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-200 dark:text-gray-700" />
        <circle
          cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className={`${color} transition-all duration-700`}
        />
      </svg>
      <span className="absolute text-lg font-semibold">{score}</span>
    </div>
  );
}

function MacroBar({ label, value, unit, max, color }: { label: string; value: number; unit: string; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}{unit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function MealAnalysisCard({ data }: { data: MealAnalysis }) {
  if (!data.success) return null;

  return (
    <div className="animate-fade-in-up mt-2 overflow-hidden rounded-2xl border border-white/30 bg-white/50 shadow-sm backdrop-blur-md dark:border-emerald-800/20 dark:bg-emerald-950/30">
      {/* Header: Score + Total Calories */}
      <div className="flex items-center gap-4 border-b border-white/20 px-4 py-3 dark:border-emerald-800/15">
        <ScoreRing score={data.healthScore} />
        <div className="flex-1">
          <div className="text-2xl font-semibold">{data.totalCalories} <span className="text-sm font-normal text-muted-foreground">kcal</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary}</p>
        </div>
      </div>

      {/* Macros */}
      <div className="space-y-2 px-4 py-3">
        <MacroBar label="Protein" value={data.totalProtein} unit="g" max={60} color="bg-blue-500" />
        <MacroBar label="Carbs" value={data.totalCarbs} unit="g" max={100} color="bg-amber-500" />
        <MacroBar label="Fat" value={data.totalFat} unit="g" max={70} color="bg-red-400" />
      </div>

      {/* Food items */}
      {data.foods.length > 0 && (
        <div className="border-t border-white/20 px-4 py-3 dark:border-emerald-800/15">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Detected Foods</h4>
          <div className="space-y-1.5">
            {data.foods.map((food, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{food.name}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">({food.portion})</span>
                </div>
                <span className="text-xs text-muted-foreground">{food.calories} kcal</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {data.suggestions.length > 0 && (
        <div className="border-t border-white/20 px-4 py-3 dark:border-emerald-800/15">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Suggestions</h4>
          <ul className="space-y-1">
            {data.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-0.5 text-emerald-500">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
