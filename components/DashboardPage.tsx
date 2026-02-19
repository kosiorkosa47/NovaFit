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
  ChevronDown,
  Target,
  Lightbulb,
  BarChart3,
  Calendar,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { WearableSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getHealthData, isNativeApp, getAvailableSensors, startWebStepTracking, type HealthData } from "@/lib/sensors/health-bridge";
import { t, tt, getLang, getDayLabels, type Lang } from "@/lib/i18n";

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

function barColor(value: number, target: number): string {
  const pct = (value / target) * 100;
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-400";
}

// ---------------------------------------------------------------------------
// Expandable Metric Card — the main interactive component
// ---------------------------------------------------------------------------

interface MetricDetail {
  goal: number;
  unit: string;
  weekData: number[];
  hourlyData?: number[];
  tips: string[];
  color: string;
  bgColor: string;
  invertProgress?: boolean;
}

function ExpandableMetricCard({
  icon,
  label,
  value,
  unit,
  color,
  trend,
  detail,
  expanded,
  onToggle,
  lang,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  color: string;
  trend?: "up" | "down" | "stable";
  detail?: MetricDetail;
  expanded: boolean;
  onToggle: () => void;
  lang: Lang;
}) {
  return (
    <div
      className={cn(
        "glass-panel tap-feedback rounded-2xl transition-all duration-300 ease-out",
        expanded ? "col-span-3 shadow-lg" : ""
      )}
    >
      {/* Collapsed card */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col items-center gap-1.5 px-3 py-4"
      >
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
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">{label}</span>
          <ChevronDown className={cn(
            "h-2.5 w-2.5 text-muted-foreground/40 transition-transform duration-300",
            expanded && "rotate-180"
          )} />
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && detail && (
        <div className="animate-fade-in-up border-t border-white/20 px-4 py-4 dark:border-emerald-800/15">
          {/* Goal progress */}
          <div className="mb-4">
            <div className="mb-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {detail.invertProgress ? t("target", lang) : t("goal", lang)}
              </span>
            </div>
            {(() => {
              const numVal = Number(String(value).replace(/,/g, ""));
              let pct: number;
              if (detail.invertProgress) {
                // Lower is better: at/below goal = 100%, double goal = 0%
                pct = numVal <= detail.goal ? 100 : Math.max(0, 100 - ((numVal - detail.goal) / detail.goal) * 100);
              } else {
                pct = Math.min(100, Math.round((numVal / detail.goal) * 100));
              }
              return (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">
                      {value} {detail.invertProgress ? `(${detail.invertProgress ? (numVal <= detail.goal ? "good" : "high") : ""})` : `/ ${detail.goal.toLocaleString()}`} {detail.unit}
                    </span>
                    <span className={cn("text-xs font-semibold", progressColor(Math.round(pct)))}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className={cn("mt-1.5 h-2.5 rounded-full", progressBarClass(Math.round(pct)))}
                  />
                </>
              );
            })()}
          </div>

          {/* Weekly mini chart */}
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("charts_7d", lang)}</span>
            </div>
            <div className="flex items-end gap-1" style={{ height: 60 }}>
              {detail.weekData.map((val, i) => {
                const max = Math.max(...detail.weekData) * 1.2;
                const pct = Math.min((val / max) * 100, 100);
                const isToday = i === 6;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                    <span className="text-[8px] font-medium text-muted-foreground/50">
                      {val > 999 ? `${(val / 1000).toFixed(1)}k` : val}
                    </span>
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div
                        className={cn(
                          "w-full rounded-t-sm transition-all",
                          isToday ? detail.color : "bg-muted-foreground/15",
                          isToday && "ring-1 ring-offset-1"
                        )}
                        style={{ height: `${Math.max(pct, 5)}%`, maxWidth: 16 }}
                      />
                    </div>
                    <span className={cn("text-[8px]", isToday ? "font-bold text-foreground" : "text-muted-foreground/40")}>
                      {getDayLabels(lang)[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats summary */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
              <span className="block text-[9px] text-muted-foreground/60">{t("weekly_avg", lang)}</span>
              <span className="text-sm font-semibold">{Math.round(detail.weekData.reduce((a, b) => a + b, 0) / 7).toLocaleString()}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
              <span className="block text-[9px] text-muted-foreground/60">{t("best_day", lang)}</span>
              <span className="text-sm font-semibold">{Math.max(...detail.weekData).toLocaleString()}</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
              <span className="block text-[9px] text-muted-foreground/60">{t("trend", lang)}</span>
              <span className={cn("text-sm font-semibold", trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-400" : "")}>
                {trend === "up" ? t("improving", lang) : trend === "down" ? t("declining", lang) : t("stable", lang)}
              </span>
            </div>
          </div>

          {/* Tips */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("tips", lang)}</span>
            </div>
            <ul className="space-y-1">
              {detail.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/70">
                  <span className="mt-0.5 text-emerald-500">+</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-center text-[9px] text-muted-foreground/40">{t("tap_collapse", lang)}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart
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
      <div className="flex gap-1">
        <div className="flex flex-col justify-between py-1 text-[8px] text-muted-foreground/40" style={{ height: 100 }}>
          <span>{maxVal}</span>
          <span>{Math.round(maxVal / 2)}</span>
          <span>0</span>
        </div>
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
// Agent insight card
// ---------------------------------------------------------------------------

function AgentInsight({ title, message, type }: { title: string; message: string; type: "positive" | "warning" | "info" }) {
  const colors = {
    positive: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/30",
    warning: "border-amber-200 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/30",
    info: "border-blue-200 bg-blue-50/50 dark:border-blue-800/30 dark:bg-blue-950/30",
  };
  const ic = {
    positive: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  return (
    <div className={cn("rounded-xl border p-3", colors[type])}>
      <div className="mb-1 flex items-center gap-1.5">
        <Brain className={cn("h-3.5 w-3.5", ic[type])} />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", ic[type])}>{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal row
// ---------------------------------------------------------------------------

function GoalRow({ icon, label, current, target, unit }: { icon: React.ReactNode; label: string; current: number; target: number; unit: string }) {
  const pct = Math.min(Math.round((current / target) * 100), 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">{icon}</div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium">{label}</span>
          <span className={cn("text-xs font-semibold", progressColor(pct))}>{current}/{target} {unit}</span>
        </div>
        <Progress value={pct} className={cn("mt-1 h-2", progressBarClass(pct))} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights generator
// ---------------------------------------------------------------------------

function generateInsights(health: HealthData, lang: Lang): { title: string; message: string; type: "positive" | "warning" | "info" }[] {
  const ins: { title: string; message: string; type: "positive" | "warning" | "info" }[] = [];

  if (health.steps >= 8000) {
    ins.push({ title: t("steps_goal_reached", lang), message: tt("steps_goal_msg_good", { steps: health.steps.toLocaleString() }, lang), type: "positive" });
  } else if (health.steps >= 4000) {
    ins.push({ title: t("steps", lang), message: tt("steps_goal_msg_mid", { steps: health.steps.toLocaleString(), remaining: (8000 - health.steps).toLocaleString() }, lang), type: "warning" });
  } else {
    ins.push({ title: t("activity", lang), message: tt("steps_goal_msg_low", { steps: health.steps.toLocaleString() }, lang), type: "warning" });
  }

  if (health.heartRate) {
    if (health.heartRate < 60) ins.push({ title: t("hr_label", lang), message: tt("hr_msg_low", { bpm: health.heartRate }, lang), type: "positive" });
    else if (health.heartRate > 90) ins.push({ title: t("hr_label", lang), message: tt("hr_msg_high", { bpm: health.heartRate }, lang), type: "warning" });
    else ins.push({ title: t("hr_label", lang), message: tt("hr_msg_normal", { bpm: health.heartRate }, lang), type: "info" });
  }

  if (health.sleep >= 7) ins.push({ title: t("sleep_label", lang), message: tt("sleep_msg_good", { hours: health.sleep }, lang), type: "positive" });
  else if (health.sleep >= 5) ins.push({ title: t("sleep_label", lang), message: tt("sleep_msg_mid", { hours: health.sleep }, lang), type: "warning" });

  if (health.calories > 0) ins.push({ title: t("cal_label", lang), message: tt("cal_msg", { cals: health.calories }, lang), type: "info" });

  return ins;
}

// ---------------------------------------------------------------------------
// Tips per metric (EN/PL)
// ---------------------------------------------------------------------------

function getTips(metric: string, lang: Lang): string[] {
  const tips: Record<string, Record<Lang, string[]>> = {
    steps: {
      en: ["Take a 10-min walk after each meal", "Use stairs instead of elevator", "Set hourly reminders to move"],
      pl: ["Spacer 10 min po każdym posiłku", "Schody zamiast windy", "Przypomnienia co godzinę żeby się ruszyć"],
    },
    heart_rate: {
      en: ["Practice deep breathing exercises", "Regular cardio lowers resting HR", "Reduce caffeine and alcohol intake"],
      pl: ["Ćwiczenia głębokiego oddychania", "Regularny kardio obniża tętno", "Ogranicz kofeinę i alkohol"],
    },
    sleep: {
      en: ["No screens 30 min before bed", "Keep bedroom cool (18-20°C)", "Consistent sleep/wake schedule"],
      pl: ["Bez ekranów 30 min przed snem", "Chłodna sypialnia (18-20°C)", "Stały harmonogram snu"],
    },
    calories: {
      en: ["High-intensity intervals burn more", "Post-workout protein within 30 min", "Track meals for accurate balance"],
      pl: ["Interwały spalają więcej kalorii", "Białko do 30 min po treningu", "Śledź posiłki dla dokładnego bilansu"],
    },
    distance: {
      en: ["Aim for 5+ km daily", "Walk meetings boost creativity", "Weekend hikes for endurance"],
      pl: ["Cel: 5+ km dziennie", "Spotkania na spacerze", "Weekendowe wycieczki na wytrzymałość"],
    },
    stress: {
      en: ["5-min meditation reduces cortisol", "Nature walks lower stress by 20%", "Social connection is a stress buffer"],
      pl: ["5 min medytacji obniża kortyzol", "Spacer w naturze -20% stresu", "Kontakt z ludźmi buforuje stres"],
    },
  };
  return tips[metric]?.[lang] ?? tips[metric]?.en ?? [];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<WearableSnapshot | null>(null);
  const [sensorData, setSensorData] = useState<HealthData | null>(null);
  const [sensorSource, setSensorSource] = useState<string>("loading");
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("en");

  const sessionId = typeof window !== "undefined" ? window.localStorage.getItem("nova-health-session-id") ?? "demo" : "demo";

  // Listen for language changes from Settings
  useEffect(() => {
    setLangState(getLang());
    const handler = (e: Event) => setLangState((e as CustomEvent).detail as Lang);
    window.addEventListener("novafit-lang-change", handler);
    return () => window.removeEventListener("novafit-lang-change", handler);
  }, []);

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
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { void fetchData(); startWebStepTracking(); void getAvailableSensors(); }, [fetchData]);

  // Week data
  const stepsWeek = Array.from({ length: 7 }, (_, i) => i === 6 ? (sensorData?.steps ?? seededInt(`${sessionId}-steps-d${i}`, 3000, 12000)) : seededInt(`${sessionId}-steps-d${i}`, 3000, 12000));
  const sleepWeek = Array.from({ length: 7 }, (_, i) => i === 6 ? (sensorData?.sleep ?? seededInt(`${sessionId}-sleep-d${i}`, 4, 9)) : seededInt(`${sessionId}-sleep-d${i}`, 4, 9));
  const hrWeek = Array.from({ length: 7 }, (_, i) => i === 6 ? (sensorData?.heartRate ?? seededInt(`${sessionId}-hr-d${i}`, 62, 100)) : seededInt(`${sessionId}-hr-d${i}`, 62, 100));
  const caloriesWeek = Array.from({ length: 7 }, (_, i) => i === 6 ? (sensorData?.calories ?? seededInt(`${sessionId}-cal-d${i}`, 100, 500)) : seededInt(`${sessionId}-cal-d${i}`, 100, 500));
  const distanceWeek = Array.from({ length: 7 }, (_, i) => i === 6 ? (sensorData?.distance ?? seededInt(`${sessionId}-dist-d${i}`, 1000, 8000)) : seededInt(`${sessionId}-dist-d${i}`, 1000, 8000));
  const stressWeek = Array.from({ length: 7 }, (_, i) => i === 6 ? (sensorData?.stress ?? seededInt(`${sessionId}-str-d${i}`, 20, 70)) : seededInt(`${sessionId}-str-d${i}`, 20, 70));

  const dayLabels = getDayLabels(lang);

  if (loading) return <div className="flex flex-1 flex-col items-center justify-center gap-3"><RefreshCw className="h-6 w-6 animate-spin text-emerald-500" /><span className="text-xs font-medium text-muted-foreground/70">{lang === "pl" ? "Ładowanie danych zdrowia..." : "Loading health data..."}</span></div>;

  const health = sensorData ?? { steps: snapshot?.steps ?? 0, heartRate: snapshot?.averageHeartRate ?? null, sleep: snapshot?.sleepHours ?? 7, calories: 0, distance: 0, stress: 35, lastUpdated: new Date().toISOString(), source: "mock" as const };
  const insights = generateInsights(health, lang);

  const stepsTrend = stepsWeek[6] > stepsWeek[5] ? "up" as const : stepsWeek[6] < stepsWeek[5] ? "down" as const : "stable" as const;
  const hrTrend = hrWeek[6] < hrWeek[5] ? "up" as const : hrWeek[6] > hrWeek[5] ? "down" as const : "stable" as const;
  const sleepTrend = sleepWeek[6] > sleepWeek[5] ? "up" as const : sleepWeek[6] < sleepWeek[5] ? "down" as const : "stable" as const;

  const toggleCard = (id: string) => setExpandedCard(expandedCard === id ? null : id);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="stagger-children mx-auto max-w-lg space-y-4 pb-4">

        {/* Source */}
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{t("phone_data", lang)}</h2>
          <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[10px] text-muted-foreground/60">
            {sensorSource === "android-sensors" ? <><Smartphone className="h-3 w-3 text-emerald-500" /> {t("phone_sensors", lang)}</>
              : sensorSource === "health-connect" ? <><Smartphone className="h-3 w-3 text-emerald-500" /> {t("health_connect", lang)}</>
              : sensorSource === "web-sensors" ? <><Activity className="h-3 w-3 text-blue-500" /> {t("web_sensors", lang)}</>
              : <><Wifi className="h-3 w-3" /> {t("simulated", lang)}</>}
          </div>
        </div>

        {/* Top 3 expandable metric cards */}
        <div className={cn("stagger-children grid gap-2", expandedCard && ["steps", "heart_rate", "sleep"].includes(expandedCard) ? "grid-cols-1" : "grid-cols-3")}>
          {(!expandedCard || expandedCard === "steps") && (
            <ExpandableMetricCard
              icon={<Footprints className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              label={t("steps", lang)} value={health.steps.toLocaleString()} unit={t("steps_unit", lang)}
              color="bg-emerald-100 dark:bg-emerald-900/60" trend={stepsTrend}
              expanded={expandedCard === "steps"} onToggle={() => toggleCard("steps")} lang={lang}
              detail={{ goal: 8000, unit: t("steps_unit", lang), weekData: stepsWeek, tips: getTips("steps", lang), color: "bg-emerald-500", bgColor: "bg-emerald-50" }}
            />
          )}
          {(!expandedCard || expandedCard === "heart_rate") && (
            <ExpandableMetricCard
              icon={<Heart className="h-4 w-4 text-rose-500" />}
              label={t("heart_rate", lang)} value={health.heartRate ?? "—"} unit="bpm"
              color="bg-rose-100 dark:bg-rose-900/60" trend={hrTrend}
              expanded={expandedCard === "heart_rate"} onToggle={() => toggleCard("heart_rate")} lang={lang}
              detail={{ goal: 80, unit: "bpm", weekData: hrWeek, tips: getTips("heart_rate", lang), color: "bg-rose-400", bgColor: "bg-rose-50", invertProgress: true }}
            />
          )}
          {(!expandedCard || expandedCard === "sleep") && (
            <ExpandableMetricCard
              icon={<BedDouble className="h-4 w-4 text-indigo-500" />}
              label={t("sleep", lang)} value={health.sleep} unit={t("hours", lang)}
              color="bg-indigo-100 dark:bg-indigo-900/60" trend={sleepTrend}
              expanded={expandedCard === "sleep"} onToggle={() => toggleCard("sleep")} lang={lang}
              detail={{ goal: 8, unit: "h", weekData: sleepWeek, tips: getTips("sleep", lang), color: "bg-indigo-500", bgColor: "bg-indigo-50" }}
            />
          )}
        </div>

        {/* Bottom 3 expandable */}
        <div className={cn("grid gap-2", expandedCard && ["calories", "distance", "stress"].includes(expandedCard) ? "grid-cols-1" : "grid-cols-3")}>
          {(!expandedCard || expandedCard === "calories") && (
            <ExpandableMetricCard
              icon={<Flame className="h-4 w-4 text-orange-500" />}
              label={t("calories", lang)} value={health.calories} unit="kcal"
              color="bg-orange-100 dark:bg-orange-900/60"
              expanded={expandedCard === "calories"} onToggle={() => toggleCard("calories")} lang={lang}
              detail={{ goal: 400, unit: "kcal", weekData: caloriesWeek, tips: getTips("calories", lang), color: "bg-orange-400", bgColor: "bg-orange-50" }}
            />
          )}
          {(!expandedCard || expandedCard === "distance") && (
            <ExpandableMetricCard
              icon={<Route className="h-4 w-4 text-sky-500" />}
              label={t("distance", lang)} value={(health.distance / 1000).toFixed(1)} unit="km"
              color="bg-sky-100 dark:bg-sky-900/60"
              expanded={expandedCard === "distance"} onToggle={() => toggleCard("distance")} lang={lang}
              detail={{ goal: 5, unit: "km", weekData: distanceWeek.map(d => Number((d / 1000).toFixed(1))), tips: getTips("distance", lang), color: "bg-sky-500", bgColor: "bg-sky-50" }}
            />
          )}
          {(!expandedCard || expandedCard === "stress") && (
            <ExpandableMetricCard
              icon={<Gauge className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              label={t("stress", lang)} value={health.stress} unit="/100"
              color="bg-amber-100 dark:bg-amber-900/60"
              expanded={expandedCard === "stress"} onToggle={() => toggleCard("stress")} lang={lang}
              detail={{ goal: 40, unit: "/100", weekData: stressWeek, tips: getTips("stress", lang), color: "bg-amber-400", bgColor: "bg-amber-50", invertProgress: true }}
            />
          )}
        </div>

        {/* AI Analysis */}
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-emerald-500" />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{t("ai_analysis", lang)}</h2>
        </div>
        <div className="space-y-2">
          {insights.map((ins, i) => <AgentInsight key={i} title={ins.title} message={ins.message} type={ins.type} />)}
        </div>

        {/* Bar charts */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{t("charts_7d", lang)}</h2>
        <BarChart title={t("steps", lang)} data={stepsWeek} labels={dayLabels} maxVal={12000} unit="" colorFn={(v) => barColor(v, 8000)} todayIndex={6} />
        <BarChart title={t("sleep_hours", lang)} data={sleepWeek} labels={dayLabels} maxVal={10} unit="h" colorFn={(v) => v >= 7 ? "bg-indigo-500" : v >= 5 ? "bg-amber-400" : "bg-red-400"} todayIndex={6} />
        <BarChart title={t("heart_rate_bpm", lang)} data={hrWeek} labels={dayLabels} maxVal={120} unit="" colorFn={(v) => v <= 70 ? "bg-emerald-500" : v <= 85 ? "bg-amber-400" : "bg-rose-400"} todayIndex={6} />
        <BarChart title={t("calories_burned", lang)} data={caloriesWeek} labels={dayLabels} maxVal={600} unit=" kcal" colorFn={() => "bg-orange-400"} todayIndex={6} />

        {/* Daily goals */}
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{t("daily_goals", lang)}</h2>
        <div className="glass-panel space-y-4 rounded-2xl px-4 py-4">
          <GoalRow icon={<Footprints className="h-4 w-4 text-emerald-600" />} label={t("steps", lang)} current={health.steps} target={8000} unit="" />
          <GoalRow icon={<Droplets className="h-4 w-4 text-sky-500" />} label={t("water", lang)} current={seededInt(`${sessionId}-water`, 2, 8)} target={8} unit={t("glasses", lang)} />
          <GoalRow icon={<BedDouble className="h-4 w-4 text-indigo-500" />} label={t("sleep", lang)} current={health.sleep} target={7} unit="h" />
          <GoalRow icon={<Dumbbell className="h-4 w-4 text-blue-500" />} label={t("exercise", lang)} current={seededInt(`${sessionId}-exercise`, 0, 45)} target={30} unit="min" />
          <GoalRow icon={<Flame className="h-4 w-4 text-orange-500" />} label={t("calories", lang)} current={health.calories} target={400} unit="kcal" />
        </div>
      </div>
    </div>
  );
}
