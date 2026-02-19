"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Footprints,
  Heart,
  BedDouble,
  Gauge,
  Droplets,
  Dumbbell,
  RefreshCw,
  Smartphone,
  Wifi,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Flame,
  Route,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { WearableSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getHealthData, isNativeApp, getAvailableSensors, startWebStepTracking, type HealthData } from "@/lib/sensors/health-bridge";

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

function barColor(value: number, max: number): string {
  const pct = (value / max) * 100;
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-400";
}

// ---------------------------------------------------------------------------
// Metric card with trend indicator
// ---------------------------------------------------------------------------

function MetricCard({
  icon,
  label,
  value,
  unit,
  color,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  color: string;
  trend?: "up" | "down" | "stable";
}) {
  return (
    <div className="glass-panel tap-feedback flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", color)}>
        {icon}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xl font-semibold tabular-nums tracking-tight">{value}</span>
        {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
        {trend === "down" && <TrendingDown className="h-3 w-3 text-red-400" />}
        {trend === "stable" && <Minus className="h-3 w-3 text-muted-foreground/50" />}
      </div>
      <span className="text-[10px] font-light text-muted-foreground/70">{unit}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart component — proper vertical bars
// ---------------------------------------------------------------------------

function BarChart({
  title,
  data,
  labels,
  maxVal,
  unit,
  colorFn,
  todayIndex,
}: {
  title: string;
  data: number[];
  labels: string[];
  maxVal: number;
  unit: string;
  colorFn: (val: number) => string;
  todayIndex?: number;
}) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-xs font-medium tracking-wide text-foreground/80">{title}</h3>
        <span className="text-[10px] text-muted-foreground/50">
          avg: {Math.round(data.reduce((a, b) => a + b, 0) / data.length)}{unit}
        </span>
      </div>

      {/* Y-axis labels + bars */}
      <div className="flex gap-1">
        {/* Y-axis */}
        <div className="flex flex-col justify-between py-1 text-[8px] text-muted-foreground/40" style={{ height: 100 }}>
          <span>{maxVal}</span>
          <span>{Math.round(maxVal / 2)}</span>
          <span>0</span>
        </div>

        {/* Bars */}
        <div className="flex flex-1 items-end gap-1" style={{ height: 100 }}>
          {data.map((val, i) => {
            const pct = Math.min((val / maxVal) * 100, 100);
            const isToday = todayIndex !== undefined && i === todayIndex;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all duration-500",
                      colorFn(val),
                      isToday && "ring-2 ring-emerald-400 ring-offset-1"
                    )}
                    style={{ height: `${Math.max(pct, 3)}%`, maxWidth: 24 }}
                  />
                </div>
                <span className={cn(
                  "text-[9px]",
                  isToday ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60"
                )}>
                  {labels[i]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent analysis card
// ---------------------------------------------------------------------------

function AgentInsight({
  title,
  message,
  type,
}: {
  title: string;
  message: string;
  type: "positive" | "warning" | "info";
}) {
  const colors = {
    positive: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/30",
    warning: "border-amber-200 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/30",
    info: "border-blue-200 bg-blue-50/50 dark:border-blue-800/30 dark:bg-blue-950/30",
  };
  const iconColors = {
    positive: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  return (
    <div className={cn("rounded-xl border p-3", colors[type])}>
      <div className="mb-1 flex items-center gap-1.5">
        <Brain className={cn("h-3.5 w-3.5", iconColors[type])} />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", iconColors[type])}>{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{message}</p>
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
// Generate agent insights from health data
// ---------------------------------------------------------------------------

function generateInsights(health: HealthData, snapshot: WearableSnapshot | null): { title: string; message: string; type: "positive" | "warning" | "info" }[] {
  const insights: { title: string; message: string; type: "positive" | "warning" | "info" }[] = [];

  // Steps analysis
  if (health.steps >= 8000) {
    insights.push({ title: "Cel kroków", message: `Gratulacje! Zrobiłeś ${health.steps.toLocaleString()} kroków — cel dzienny osiągnięty. Utrzymaj to tempo!`, type: "positive" });
  } else if (health.steps >= 4000) {
    insights.push({ title: "Kroki", message: `Masz ${health.steps.toLocaleString()} kroków. Do celu 8 000 brakuje ${(8000 - health.steps).toLocaleString()}. Spróbuj 15-min spaceru.`, type: "warning" });
  } else {
    insights.push({ title: "Aktywność", message: `Tylko ${health.steps.toLocaleString()} kroków. Rekomendacja: wstań i przejdź się — nawet krótki spacer poprawi samopoczucie.`, type: "warning" });
  }

  // Heart rate
  if (health.heartRate) {
    if (health.heartRate < 60) {
      insights.push({ title: "Tętno", message: `Spoczynkowe tętno ${health.heartRate} bpm — bardzo dobre, świadczy o dobrej kondycji.`, type: "positive" });
    } else if (health.heartRate > 90) {
      insights.push({ title: "Tętno", message: `Tętno ${health.heartRate} bpm jest podwyższone. Rozważ ćwiczenia oddechowe lub redukcję kofeiny.`, type: "warning" });
    } else {
      insights.push({ title: "Tętno", message: `Tętno ${health.heartRate} bpm — w normie. Regularna aktywność fizyczna może je jeszcze obniżyć.`, type: "info" });
    }
  }

  // Sleep
  if (health.sleep >= 7) {
    insights.push({ title: "Sen", message: `${health.sleep}h snu — doskonale. Dobry sen to fundament zdrowia i regeneracji.`, type: "positive" });
  } else if (health.sleep >= 5) {
    insights.push({ title: "Sen", message: `Tylko ${health.sleep}h snu. Cel to 7-9h. Spróbuj kłaść się 30 min wcześniej.`, type: "warning" });
  }

  // Calories
  if (health.calories > 0) {
    insights.push({ title: "Kalorie", message: `Spalone: ~${health.calories} kcal z aktywności. Pamiętaj o nawodnieniu!`, type: "info" });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<WearableSnapshot | null>(null);
  const [sensorData, setSensorData] = useState<HealthData | null>(null);
  const [sensorSource, setSensorSource] = useState<string>("loading");
  const [loading, setLoading] = useState(true);

  const sessionId =
    typeof window !== "undefined"
      ? window.localStorage.getItem("nova-health-session-id") ?? "demo"
      : "demo";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const health = await getHealthData();
      setSensorData(health);
      setSensorSource(health.source);

      const res = await fetch(`/api/wearable?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const snap = await res.json() as WearableSnapshot;
        if (health.source !== "mock") {
          snap.steps = health.steps;
          if (health.heartRate) snap.averageHeartRate = health.heartRate;
          if (health.sleep) snap.sleepHours = health.sleep;
        }
        setSnapshot(snap);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchData();
    startWebStepTracking();
    void getAvailableSensors();
  }, [fetchData]);

  // 7-day data: today is last element, use sensor data for today
  const todayIdx = 6;
  const dayLabels = (() => {
    const days = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
    const today = new Date().getDay();
    return Array.from({ length: 7 }, (_, i) => {
      const d = (today - 6 + i + 7) % 7;
      return i === 6 ? "Dziś" : days[d];
    });
  })();

  const stepsWeek = Array.from({ length: 7 }, (_, i) =>
    i === 6 ? (sensorData?.steps ?? seededInt(`${sessionId}-steps-d${i}`, 3000, 12000))
      : seededInt(`${sessionId}-steps-d${i}`, 3000, 12000)
  );
  const sleepWeek = Array.from({ length: 7 }, (_, i) =>
    i === 6 ? (sensorData?.sleep ?? seededInt(`${sessionId}-sleep-d${i}`, 4, 9))
      : seededInt(`${sessionId}-sleep-d${i}`, 4, 9)
  );
  const hrWeek = Array.from({ length: 7 }, (_, i) =>
    i === 6 ? (sensorData?.heartRate ?? seededInt(`${sessionId}-hr-d${i}`, 62, 100))
      : seededInt(`${sessionId}-hr-d${i}`, 62, 100)
  );
  const caloriesWeek = Array.from({ length: 7 }, (_, i) =>
    i === 6 ? (sensorData?.calories ?? seededInt(`${sessionId}-cal-d${i}`, 100, 500))
      : seededInt(`${sessionId}-cal-d${i}`, 100, 500)
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  const health = sensorData ?? {
    steps: snapshot?.steps ?? 0,
    heartRate: snapshot?.averageHeartRate ?? null,
    sleep: snapshot?.sleepHours ?? 7,
    calories: 0,
    distance: 0,
    stress: 35,
    lastUpdated: new Date().toISOString(),
    source: "mock" as const,
  };

  const insights = generateInsights(health, snapshot);

  // Determine trends (today vs yesterday)
  const stepsTrend = stepsWeek[6] > stepsWeek[5] ? "up" : stepsWeek[6] < stepsWeek[5] ? "down" : "stable";
  const hrTrend = hrWeek[6] < hrWeek[5] ? "up" : hrWeek[6] > hrWeek[5] ? "down" : "stable"; // lower HR = better
  const sleepTrend = sleepWeek[6] > sleepWeek[5] ? "up" : sleepWeek[6] < sleepWeek[5] ? "down" : "stable";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="stagger-children mx-auto max-w-lg space-y-4 pb-4">

        {/* Source indicator */}
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            Dane z telefonu
          </h2>
          <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[10px] text-muted-foreground/60">
            {sensorSource === "android-sensors" ? (
              <><Smartphone className="h-3 w-3 text-emerald-500" /> Sensory telefonu</>
            ) : sensorSource === "health-connect" ? (
              <><Smartphone className="h-3 w-3 text-emerald-500" /> Health Connect</>
            ) : sensorSource === "web-sensors" ? (
              <><Activity className="h-3 w-3 text-blue-500" /> Sensory web</>
            ) : (
              <><Wifi className="h-3 w-3" /> Symulacja</>
            )}
          </div>
        </div>

        {/* Metric cards */}
        <div className="stagger-children grid grid-cols-3 gap-2">
          <MetricCard
            icon={<Footprints className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            label="Kroki"
            value={health.steps.toLocaleString()}
            unit="kroków"
            color="bg-emerald-100 dark:bg-emerald-900/60"
            trend={stepsTrend}
          />
          <MetricCard
            icon={<Heart className="h-4 w-4 text-rose-500" />}
            label="Tętno"
            value={health.heartRate ?? "—"}
            unit="bpm"
            color="bg-rose-100 dark:bg-rose-900/60"
            trend={hrTrend}
          />
          <MetricCard
            icon={<BedDouble className="h-4 w-4 text-indigo-500" />}
            label="Sen"
            value={health.sleep}
            unit="godz"
            color="bg-indigo-100 dark:bg-indigo-900/60"
            trend={sleepTrend}
          />
        </div>

        {/* Secondary metrics row */}
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            icon={<Flame className="h-4 w-4 text-orange-500" />}
            label="Kalorie"
            value={health.calories}
            unit="kcal"
            color="bg-orange-100 dark:bg-orange-900/60"
          />
          <MetricCard
            icon={<Route className="h-4 w-4 text-sky-500" />}
            label="Dystans"
            value={(health.distance / 1000).toFixed(1)}
            unit="km"
            color="bg-sky-100 dark:bg-sky-900/60"
          />
          <MetricCard
            icon={<Gauge className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
            label="Stres"
            value={health.stress}
            unit="/100"
            color="bg-amber-100 dark:bg-amber-900/60"
          />
        </div>

        {/* Agent analysis */}
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-emerald-500" />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            Analiza AI agentów
          </h2>
        </div>
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <AgentInsight key={i} title={insight.title} message={insight.message} type={insight.type} />
          ))}
        </div>

        {/* Bar charts */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          Wykresy — 7 dni
        </h2>

        <BarChart
          title="Kroki"
          data={stepsWeek}
          labels={dayLabels}
          maxVal={12000}
          unit=""
          colorFn={(v) => barColor(v, 8000)}
          todayIndex={todayIdx}
        />

        <BarChart
          title="Sen (godz)"
          data={sleepWeek}
          labels={dayLabels}
          maxVal={10}
          unit="h"
          colorFn={(v) => v >= 7 ? "bg-indigo-500" : v >= 5 ? "bg-amber-400" : "bg-red-400"}
          todayIndex={todayIdx}
        />

        <BarChart
          title="Tętno (bpm)"
          data={hrWeek}
          labels={dayLabels}
          maxVal={120}
          unit=""
          colorFn={(v) => v <= 70 ? "bg-emerald-500" : v <= 85 ? "bg-amber-400" : "bg-rose-400"}
          todayIndex={todayIdx}
        />

        <BarChart
          title="Kalorie spalone"
          data={caloriesWeek}
          labels={dayLabels}
          maxVal={600}
          unit=" kcal"
          colorFn={() => "bg-orange-400"}
          todayIndex={todayIdx}
        />

        {/* Daily goals */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          Cele dzienne
        </h2>
        <div className="glass-panel space-y-4 rounded-2xl px-4 py-4">
          <GoalRow
            icon={<Footprints className="h-4 w-4 text-emerald-600" />}
            label="Kroki"
            current={health.steps}
            target={8000}
            unit=""
          />
          <GoalRow
            icon={<Droplets className="h-4 w-4 text-sky-500" />}
            label="Woda"
            current={seededInt(`${sessionId}-water`, 2, 8)}
            target={8}
            unit="szklanek"
          />
          <GoalRow
            icon={<BedDouble className="h-4 w-4 text-indigo-500" />}
            label="Sen"
            current={health.sleep}
            target={7}
            unit="h"
          />
          <GoalRow
            icon={<Dumbbell className="h-4 w-4 text-blue-500" />}
            label="Ćwiczenia"
            current={seededInt(`${sessionId}-exercise`, 0, 45)}
            target={30}
            unit="min"
          />
          <GoalRow
            icon={<Flame className="h-4 w-4 text-orange-500" />}
            label="Kalorie"
            current={health.calories}
            target={400}
            unit="kcal"
          />
        </div>
      </div>
    </div>
  );
}
