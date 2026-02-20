"use client";

import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
  Flame,
  Droplets,
  Wheat,
  Dna,
} from "lucide-react";
import { useState } from "react";

import type { ScanResponse } from "@/app/api/scan/route";
import type { RiskLevel } from "@/lib/integrations/ingredients-db";

const riskColors: Record<RiskLevel, { bg: string; text: string; border: string; icon: string }> = {
  high: {
    bg: "bg-red-50/60 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200/60 dark:border-red-800/40",
    icon: "text-red-500",
  },
  moderate: {
    bg: "bg-amber-50/60 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200/60 dark:border-amber-800/40",
    icon: "text-amber-500",
  },
  low: {
    bg: "bg-blue-50/60 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200/60 dark:border-blue-800/40",
    icon: "text-blue-500",
  },
};

function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "stroke-emerald-500" : score >= 40 ? "stroke-amber-500" : "stroke-red-500";

  return (
    <div className="relative flex h-[72px] w-[72px] items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-muted/20"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${color} transition-all duration-1000 ease-out`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold leading-none">{score}</span>
        <span className="text-[8px] uppercase tracking-wide text-muted-foreground">score</span>
      </div>
    </div>
  );
}

function NutritionRow({
  label,
  value,
  bold,
  indent,
  warn,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-border/20 py-1 ${indent ? "pl-3" : ""}`}
    >
      <span
        className={`text-[10px] ${bold ? "font-semibold text-foreground/90" : "text-foreground/70"}`}
      >
        {label}
      </span>
      <span
        className={`text-[10px] font-medium ${warn ? "text-red-500 dark:text-red-400" : "text-foreground/80"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function NutritionScanCard({ data }: { data: ScanResponse }) {
  const [showDetails, setShowDetails] = useState(false);

  const { nutritionFacts: facts, warnings, healthScore, summary } = data;

  return (
    <div className="animate-scale-in mt-2 space-y-2.5">
      {/* Health Score + Summary */}
      <div className="glass-panel rounded-2xl p-4">
        <div className="flex items-start gap-4">
          <ScoreRing score={healthScore} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              {healthScore >= 70 ? (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              ) : healthScore >= 40 ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs font-semibold">
                {healthScore >= 70
                  ? "Acceptable"
                  : healthScore >= 40
                    ? "Caution"
                    : "Avoid"}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
          </div>
        </div>
      </div>

      {/* Quick Nutrition Facts */}
      {(facts.calories || facts.protein || facts.totalSugars || facts.sodium) && (
        <div className="glass-panel rounded-2xl p-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            {facts.calories != null && (
              <div className="flex flex-col items-center gap-0.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-sm font-bold">{facts.calories}</span>
                <span className="text-[9px] text-muted-foreground">kcal</span>
              </div>
            )}
            {facts.protein && (
              <div className="flex flex-col items-center gap-0.5">
                <Dna className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm font-bold">{facts.protein}</span>
                <span className="text-[9px] text-muted-foreground">protein</span>
              </div>
            )}
            {facts.totalCarbs && (
              <div className="flex flex-col items-center gap-0.5">
                <Wheat className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-bold">{facts.totalCarbs}</span>
                <span className="text-[9px] text-muted-foreground">carbs</span>
              </div>
            )}
            {facts.totalSugars && (
              <div className="flex flex-col items-center gap-0.5">
                <Droplets className="h-3.5 w-3.5 text-pink-500" />
                <span className="text-sm font-bold">{facts.totalSugars}</span>
                <span className="text-[9px] text-muted-foreground">sugar</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ingredient Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
              {warnings.length} harmful ingredient{warnings.length > 1 ? "s" : ""} detected
            </span>
          </div>
          {warnings.map((w) => {
            const colors = riskColors[w.risk];
            return (
              <div
                key={w.name}
                className={`rounded-xl border ${colors.border} ${colors.bg} p-2.5`}
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colors.icon}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${colors.text}`}>{w.name}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${colors.bg} ${colors.text} border ${colors.border}`}
                      >
                        {w.risk}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-foreground/70">
                      {w.reason}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.effects.map((e) => (
                        <span
                          key={e}
                          className="rounded-full border border-current/10 bg-white/30 px-1.5 py-0.5 text-[8px] font-medium dark:bg-white/5"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {warnings.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3 dark:border-emerald-800/30 dark:bg-emerald-950/25">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            No harmful additives detected in this product
          </span>
        </div>
      )}

      {/* Show full details toggle */}
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Info className="h-3 w-3" />
        {showDetails ? "Hide details" : "Show full nutrition facts"}
        {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showDetails && (
        <div className="animate-fade-in-up space-y-3">
          {/* Nutrition Facts Table */}
          {Object.values(facts).some(Boolean) && (
            <div className="rounded-xl border border-border/50 bg-white/30 p-3 dark:bg-white/5">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-foreground/80">
                Nutrition Facts
              </h4>
              {facts.servingSize && (
                <p className="mb-2 border-b border-border/30 pb-1.5 text-[10px] text-muted-foreground">
                  Serving size: {facts.servingSize}
                </p>
              )}
              <div className="space-y-0">
                {facts.calories != null && (
                  <NutritionRow label="Calories" value={String(facts.calories)} bold />
                )}
                {facts.totalFat && <NutritionRow label="Total Fat" value={facts.totalFat} bold />}
                {facts.saturatedFat && (
                  <NutritionRow label="Saturated Fat" value={facts.saturatedFat} indent />
                )}
                {facts.transFat && (
                  <NutritionRow
                    label="Trans Fat"
                    value={facts.transFat}
                    indent
                    warn={parseFloat(facts.transFat) > 0}
                  />
                )}
                {facts.cholesterol && (
                  <NutritionRow label="Cholesterol" value={facts.cholesterol} bold />
                )}
                {facts.sodium && (
                  <NutritionRow
                    label="Sodium"
                    value={facts.sodium}
                    bold
                    warn={parseFloat(facts.sodium) > 600}
                  />
                )}
                {facts.totalCarbs && (
                  <NutritionRow label="Total Carbs" value={facts.totalCarbs} bold />
                )}
                {facts.dietaryFiber && (
                  <NutritionRow label="Dietary Fiber" value={facts.dietaryFiber} indent />
                )}
                {facts.totalSugars && (
                  <NutritionRow
                    label="Total Sugars"
                    value={facts.totalSugars}
                    indent
                    warn={parseFloat(facts.totalSugars) > 20}
                  />
                )}
                {facts.addedSugars && (
                  <NutritionRow label="Added Sugars" value={facts.addedSugars} indent />
                )}
                {facts.protein && <NutritionRow label="Protein" value={facts.protein} bold />}
              </div>
            </div>
          )}

          {/* Raw ingredients */}
          {data.ingredientsRaw && (
            <div className="rounded-xl border border-border/50 bg-white/30 p-3 dark:bg-white/5">
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground/80">
                Ingredients
              </h4>
              <p className="text-[10px] leading-relaxed text-foreground/70">
                {data.ingredientsRaw}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
