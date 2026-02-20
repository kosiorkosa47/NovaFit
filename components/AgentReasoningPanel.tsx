"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Zap, AlertTriangle, Utensils, Dumbbell, Droplets, Moon, Brain, Route, Clock, Cpu, ShieldCheck, ShieldAlert } from "lucide-react";

interface AnalyzerPayload {
  summary: string;
  energyScore: number;
  keySignals: string[];
  riskFlags: string[];
}

interface PlannerPayload {
  summary: string;
  diet: string[];
  exercise: string[];
  hydration: string;
  recovery: string;
}

interface MonitorPayload {
  tone: string;
  adaptationNote: string;
}

function isAnalyzer(p: unknown): p is AnalyzerPayload {
  return !!p && typeof p === "object" && "energyScore" in p && "keySignals" in p;
}

function isPlanner(p: unknown): p is PlannerPayload {
  return !!p && typeof p === "object" && "diet" in p && "exercise" in p;
}

function isMonitor(p: unknown): p is MonitorPayload {
  return !!p && typeof p === "object" && "tone" in p && "adaptationNote" in p;
}

function EnergyGauge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor = score >= 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="flex items-center gap-2">
      <Zap className={`h-3 w-3 ${textColor}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-medium text-foreground/70">Energy</span>
          <span className={`font-bold ${textColor}`}>{score}/100</span>
        </div>
        <div className="mt-0.5 h-1 rounded-full bg-gray-200 dark:bg-gray-700">
          <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.min(100, score)}%` }} />
        </div>
      </div>
    </div>
  );
}

const ROUTE_LABELS: Record<string, { label: string; color: string }> = {
  greeting: { label: "Direct", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  quick: { label: "Direct", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  followup: { label: "Follow-up", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  full: { label: "Full Pipeline", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  photo: { label: "Photo Analysis", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

function RouteBadge({ route }: { route: string }) {
  const info = ROUTE_LABELS[route] ?? { label: route, color: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${info.color}`}>
      <Route className="h-2.5 w-2.5" />
      {info.label}
    </span>
  );
}

function AgentBadges({ timing }: { timing: Record<string, number> }) {
  const agents: { key: string; label: string; color: string }[] = [
    { key: "dispatcher", label: "Dispatcher", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
    { key: "analyzer", label: "Analyzer", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
    { key: "planner", label: "Planner", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    { key: "validator", label: "Validator", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
    { key: "monitor", label: "Monitor", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  ];

  const activeAgents = agents.filter((a) => timing[a.key] !== undefined);
  if (!activeAgents.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {activeAgents.map((a) => (
        <span key={a.key} className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${a.color}`}>
          <Cpu className="h-2 w-2" />
          {a.label} {(timing[a.key] / 1000).toFixed(1)}s
        </span>
      ))}
    </div>
  );
}

function TimingBar({ timing }: { timing: Record<string, number> }) {
  const total = timing.total;
  if (!total) return null;

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-foreground/60">
      <Clock className="h-2.5 w-2.5" />
      <span>Total: {(total / 1000).toFixed(1)}s</span>
    </div>
  );
}

function AnalyzerDetails({ data }: { data: AnalyzerPayload }) {
  return (
    <div className="space-y-2">
      <EnergyGauge score={data.energyScore} />
      {data.keySignals.length > 0 && (
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Key Signals</span>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {data.keySignals.map((s, i) => (
              <span key={i} className="rounded-md bg-emerald-100/80 px-1.5 py-0.5 text-[9px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{s}</span>
            ))}
          </div>
        </div>
      )}
      {data.riskFlags.length > 0 && (
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />Risk Flags
          </span>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {data.riskFlags.map((f, i) => (
              <span key={i} className="rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[9px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlannerDetails({ data }: { data: PlannerPayload }) {
  return (
    <div className="space-y-1.5">
      {data.diet.length > 0 && (
        <div className="flex items-start gap-1">
          <Utensils className="mt-0.5 h-2.5 w-2.5 shrink-0 text-orange-500" />
          <span className="text-[10px] text-foreground/70">{data.diet.length} meal suggestions</span>
        </div>
      )}
      {data.exercise.length > 0 && (
        <div className="flex items-start gap-1">
          <Dumbbell className="mt-0.5 h-2.5 w-2.5 shrink-0 text-blue-500" />
          <span className="text-[10px] text-foreground/70">{data.exercise.length} exercises</span>
        </div>
      )}
      {data.hydration && (
        <div className="flex items-start gap-1">
          <Droplets className="mt-0.5 h-2.5 w-2.5 shrink-0 text-sky-500" />
          <span className="text-[10px] text-foreground/70 line-clamp-1">{data.hydration}</span>
        </div>
      )}
      {data.recovery && (
        <div className="flex items-start gap-1">
          <Moon className="mt-0.5 h-2.5 w-2.5 shrink-0 text-indigo-500" />
          <span className="text-[10px] text-foreground/70 line-clamp-1">{data.recovery}</span>
        </div>
      )}
    </div>
  );
}

function MonitorDetails({ data }: { data: MonitorPayload }) {
  const toneEmoji: Record<string, string> = {
    empathetic: "Empathetic",
    encouraging: "Encouraging",
    celebratory: "Celebratory",
    gentle: "Gentle",
    direct: "Direct",
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">Tone</span>
        <span className="rounded-md bg-purple-100/80 px-1.5 py-0.5 text-[9px] font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
          {toneEmoji[data.tone] ?? data.tone}
        </span>
      </div>
      {data.adaptationNote && (
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-foreground/50">
            <Brain className="mr-0.5 inline h-2.5 w-2.5" />Learning
          </span>
          <p className="mt-0.5 text-[10px] italic text-foreground/60 line-clamp-2">{data.adaptationNote}</p>
        </div>
      )}
    </div>
  );
}

function ValidatorBadge({ validated, conflicts }: { validated?: boolean; conflicts?: string[] }) {
  if (validated === undefined) return null;
  if (validated) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <ShieldCheck className="h-2.5 w-2.5" />
        Plan Validated
      </span>
    );
  }
  return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <ShieldAlert className="h-2.5 w-2.5" />
        Plan Revised
      </span>
      {conflicts && conflicts.length > 0 && (
        <div className="ml-0.5 space-y-0.5">
          {conflicts.slice(0, 3).map((c, i) => (
            <p key={i} className="text-[9px] text-amber-600 dark:text-amber-400">- {c}</p>
          ))}
        </div>
      )}
    </div>
  );
}

interface AgentReasoningPanelProps {
  agentLabel?: string;
  payload?: unknown;
  route?: string;
  timing?: Record<string, number>;
  validated?: boolean;
  validatorConflicts?: string[];
}

export function AgentReasoningPanel({ agentLabel, payload, route, timing, validated, validatorConflicts }: AgentReasoningPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const hasRoute = !!route;
  const hasTiming = timing && Object.keys(timing).length > 0;
  const hasValidator = validated !== undefined;
  const label = agentLabel?.toLowerCase() ?? "";
  const hasDetails = isAnalyzer(payload) || isPlanner(payload) || isMonitor(payload);

  if (!hasDetails && !hasRoute && !hasTiming && !hasValidator) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex min-h-[36px] items-center gap-1.5 rounded-lg px-1.5 text-[11px] font-medium text-emerald-600/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 active:bg-emerald-500/20 dark:text-emerald-400/70 dark:hover:text-emerald-400"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide reasoning" : "Show reasoning"}
        {/* Inline badges when collapsed */}
        {!expanded && hasRoute && (
          <RouteBadge route={route} />
        )}
        {!expanded && hasTiming && timing.total && (
          <span className="ml-1 text-[9px] font-normal text-foreground/40">
            {(timing.total / 1000).toFixed(1)}s
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1 animate-fade-in-up space-y-2 rounded-lg border border-emerald-200/40 bg-emerald-50/30 px-2 py-1.5 dark:border-emerald-800/20 dark:bg-emerald-950/20">
          {/* Route + Timing badges */}
          {(hasRoute || hasTiming) && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {hasRoute && <RouteBadge route={route} />}
                {hasTiming && <TimingBar timing={timing} />}
              </div>
              {hasTiming && <AgentBadges timing={timing} />}
            </div>
          )}
          {hasValidator && <ValidatorBadge validated={validated} conflicts={validatorConflicts} />}
          {label.includes("analyzer") && isAnalyzer(payload) && <AnalyzerDetails data={payload} />}
          {label.includes("planner") && isPlanner(payload) && <PlannerDetails data={payload} />}
          {label.includes("monitor") && isMonitor(payload) && <MonitorDetails data={payload} />}
          {/* Show all details for non-labeled panels (assistant messages) */}
          {!label.includes("analyzer") && !label.includes("planner") && !label.includes("monitor") && (
            <>
              {isAnalyzer(payload) && <AnalyzerDetails data={payload} />}
              {isPlanner(payload) && <PlannerDetails data={payload} />}
              {isMonitor(payload) && <MonitorDetails data={payload} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
