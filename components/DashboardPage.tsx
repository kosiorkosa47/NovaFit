"use client";

import { useEffect, useState } from "react";
import {
  Footprints,
  Heart,
  BedDouble,
  Gauge,
  Droplets,
  Dumbbell,
  RefreshCw,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { WearableSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seededRand(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

function seededInt(seed: string, min: number, max: number): number {
  return Math.floor(seededRand(seed) * (max - min + 1)) + min;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

function progressBarClass(pct: number): string {
  if (pct >= 80) return "[&>div]:bg-emerald-500";
  if (pct >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

// ---------------------------------------------------------------------------
// Wearable metric card
// ---------------------------------------------------------------------------

function MetricCard({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  color: string;
}) {
  return (
    <div className="glass-panel tap-feedback flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", color)}>
        {icon}
      </div>
      <span className="text-xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-[10px] font-light text-muted-foreground/70">{unit}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7-day trend bar chart (pure CSS)
// ---------------------------------------------------------------------------

function TrendChart({
  title,
  data,
  maxVal,
  unit,
  color,
}: {
  title: string;
  data: number[];
  maxVal: number;
  unit: string;
  color: string;
}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="glass-panel rounded-2xl px-4 py-4">
      <h3 className="mb-3 text-xs font-medium tracking-wide text-foreground/80">{title}</h3>
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {data.map((val, i) => {
          const pct = Math.min((val / maxVal) * 100, 100);
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] font-medium text-muted-foreground">
                {val}{unit}
              </span>
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={cn("w-full max-w-[18px] rounded-full transition-all", color)}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">{days[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily goal row
// ---------------------------------------------------------------------------

function GoalRow({
  icon,
  label,
  current,
  target,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  target: number;
  unit: string;
}) {
  const pct = Math.min(Math.round((current / target) * 100), 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium">{label}</span>
          <span className={cn("text-xs font-semibold", progressColor(pct))}>
            {current}/{target} {unit}
          </span>
        </div>
        <Progress value={pct} className={cn("mt-1 h-2", progressBarClass(pct))} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<WearableSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionId =
    typeof window !== "undefined"
      ? window.localStorage.getItem("nova-health-session-id") ?? "demo"
      : "demo";

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wearable?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        setSnapshot(await res.json() as WearableSnapshot);
      }
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate 7-day trend data from session seed
  const stepsWeek = Array.from({ length: 7 }, (_, i) =>
    seededInt(`${sessionId}-steps-d${i}`, 3000, 12000)
  );
  const sleepWeek = Array.from({ length: 7 }, (_, i) =>
    seededInt(`${sessionId}-sleep-d${i}`, 4, 9)
  );
  const hrWeek = Array.from({ length: 7 }, (_, i) =>
    seededInt(`${sessionId}-hr-d${i}`, 62, 110)
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Heart className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          No wearable data available yet. Start a conversation to generate your health snapshot.
        </p>
      </div>
    );
  }

  const stressColorBg =
    snapshot?.stressLevel === "low"
      ? "bg-emerald-100 dark:bg-emerald-900/60"
      : snapshot?.stressLevel === "moderate"
        ? "bg-amber-100 dark:bg-amber-900/60"
        : "bg-red-100 dark:bg-red-900/60";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="stagger-children mx-auto max-w-lg space-y-4">
        {/* Section: Wearable data */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          Today&apos;s Snapshot
        </h2>
        {snapshot && (
          <div className="stagger-children grid grid-cols-2 gap-2">
            <MetricCard
              icon={<Footprints className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              label="Steps"
              value={snapshot.steps.toLocaleString()}
              unit="steps"
              color="bg-emerald-100 dark:bg-emerald-900/60"
            />
            <MetricCard
              icon={<Heart className="h-4 w-4 text-rose-500" />}
              label="Heart Rate"
              value={snapshot.averageHeartRate}
              unit="bpm"
              color="bg-rose-100 dark:bg-rose-900/60"
            />
            <MetricCard
              icon={<BedDouble className="h-4 w-4 text-indigo-500" />}
              label="Sleep"
              value={snapshot.sleepHours}
              unit="hours"
              color="bg-indigo-100 dark:bg-indigo-900/60"
            />
            <MetricCard
              icon={<Gauge className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              label="Stress"
              value={snapshot.stressLevel}
              unit=""
              color={stressColorBg}
            />
          </div>
        )}

        {/* Section: 7-day trends */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          7-Day Trends
        </h2>
        <TrendChart title="Steps" data={stepsWeek} maxVal={12000} unit="" color="bg-emerald-500" />
        <TrendChart title="Sleep (hours)" data={sleepWeek} maxVal={10} unit="h" color="bg-indigo-500" />
        <TrendChart title="Heart Rate (bpm)" data={hrWeek} maxVal={120} unit="" color="bg-rose-400" />

        {/* Section: Daily goals */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          Daily Goals
        </h2>
        <div className="glass-panel space-y-4 rounded-2xl px-4 py-4">
          <GoalRow
            icon={<Footprints className="h-4 w-4 text-emerald-600" />}
            label="Steps"
            current={snapshot?.steps ?? 0}
            target={8000}
            unit=""
          />
          <GoalRow
            icon={<Droplets className="h-4 w-4 text-sky-500" />}
            label="Water"
            current={seededInt(`${sessionId}-water`, 2, 8)}
            target={8}
            unit="glasses"
          />
          <GoalRow
            icon={<BedDouble className="h-4 w-4 text-indigo-500" />}
            label="Sleep"
            current={snapshot?.sleepHours ?? 0}
            target={7}
            unit="h"
          />
          <GoalRow
            icon={<Dumbbell className="h-4 w-4 text-blue-500" />}
            label="Exercise"
            current={seededInt(`${sessionId}-exercise`, 0, 45)}
            target={30}
            unit="min"
          />
        </div>
      </div>
    </div>
  );
}
