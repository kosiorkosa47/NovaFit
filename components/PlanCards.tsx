"use client";

import {
  Apple,
  Dumbbell,
  Droplets,
  Moon,
  Footprints,
  Heart,
  BedDouble,
  Gauge,
  Leaf,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";

import type { PlanRecommendation } from "@/lib/types";
import type { WearableSnapshot } from "@/lib/types";

// ---------------------------------------------------------------------------
// Wearable summary strip
// ---------------------------------------------------------------------------

function WearableStrip({ data }: { data: WearableSnapshot }) {
  const stressColor =
    data.stressLevel === "low"
      ? "text-emerald-600 dark:text-emerald-400"
      : data.stressLevel === "moderate"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-500 dark:text-red-400";

  const sleepColor =
    data.sleepHours >= 7
      ? "text-emerald-600 dark:text-emerald-400"
      : data.sleepHours >= 6
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-500 dark:text-red-400";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200/40 bg-emerald-50/40 px-4 py-2.5 backdrop-blur-sm dark:border-emerald-800/30 dark:bg-emerald-950/25">
      <div className="flex items-center gap-1.5">
        <Footprints className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-xs font-medium">{data.steps.toLocaleString()}</span>
        <span className="text-[10px] text-muted-foreground">steps</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Heart className="h-3.5 w-3.5 text-rose-500" />
        <span className="text-xs font-medium">{data.averageHeartRate}</span>
        <span className="text-[10px] text-muted-foreground">bpm</span>
      </div>
      <div className="flex items-center gap-1.5">
        <BedDouble className={`h-3.5 w-3.5 ${sleepColor}`} />
        <span className="text-xs font-medium">{data.sleepHours}h</span>
        <span className="text-[10px] text-muted-foreground">sleep</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Gauge className={`h-3.5 w-3.5 ${stressColor}`} />
        <span className="text-xs font-medium capitalize">{data.stressLevel}</span>
        <span className="text-[10px] text-muted-foreground">stress</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible card wrapper
// ---------------------------------------------------------------------------

function PlanSection({
  icon,
  title,
  color,
  children,
  defaultOpen = true
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-2xl border ${color} overflow-hidden transition-all duration-300`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {icon}
        <span className="flex-1 text-xs font-semibold">{title}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-3 pb-2.5">{children}</div>}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-40" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main PlanCards component
// ---------------------------------------------------------------------------

export interface PlanCardsProps {
  plan: PlanRecommendation;
  wearable?: WearableSnapshot;
  analyzerSummary?: string;
}

export function PlanCards({ plan, wearable, analyzerSummary }: PlanCardsProps) {
  return (
    <div className="mt-2 space-y-2">
      {/* Wearable data strip */}
      {wearable && <WearableStrip data={wearable} />}

      {/* Analyzer summary */}
      {analyzerSummary && (
        <p className="rounded-lg bg-emerald-50/50 px-3 py-1.5 text-[11px] italic text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {analyzerSummary}
        </p>
      )}

      {/* Diet */}
      {plan.diet.length > 0 && (
        <PlanSection
          icon={<Apple className="h-3.5 w-3.5 text-orange-500" />}
          title="Nutrition Plan"
          color="border-orange-200/60 bg-orange-50/30 dark:border-orange-900/30 dark:bg-orange-950/20"
        >
          <BulletList items={plan.diet} />
        </PlanSection>
      )}

      {/* Exercise */}
      {plan.exercise.length > 0 && (
        <PlanSection
          icon={<Dumbbell className="h-3.5 w-3.5 text-blue-500" />}
          title="Exercise"
          color="border-blue-200/60 bg-blue-50/30 dark:border-blue-900/30 dark:bg-blue-950/20"
        >
          <BulletList items={plan.exercise} />
        </PlanSection>
      )}

      {/* Hydration */}
      {plan.hydration && (
        <PlanSection
          icon={<Droplets className="h-3.5 w-3.5 text-sky-500" />}
          title="Hydration"
          color="border-sky-200/60 bg-sky-50/30 dark:border-sky-900/30 dark:bg-sky-950/20"
          defaultOpen={false}
        >
          <p className="text-xs leading-relaxed text-foreground/80">{plan.hydration}</p>
        </PlanSection>
      )}

      {/* Recovery */}
      {plan.recovery && (
        <PlanSection
          icon={<Moon className="h-3.5 w-3.5 text-violet-500" />}
          title="Recovery"
          color="border-violet-200/60 bg-violet-50/30 dark:border-violet-900/30 dark:bg-violet-950/20"
          defaultOpen={false}
        >
          <p className="text-xs leading-relaxed text-foreground/80">{plan.recovery}</p>
        </PlanSection>
      )}

      {/* Nutritionix context */}
      {plan.nutritionContext.length > 0 && !plan.nutritionContext[0].includes("general nutrition guidelines") && (
        <PlanSection
          icon={<Leaf className="h-3.5 w-3.5 text-lime-600 dark:text-lime-400" />}
          title="Nutrition Insights"
          color="border-lime-200/60 bg-lime-50/30 dark:border-lime-900/30 dark:bg-lime-950/20"
          defaultOpen={false}
        >
          <BulletList items={plan.nutritionContext} />
        </PlanSection>
      )}
    </div>
  );
}
