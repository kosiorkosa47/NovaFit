"use client";

import { Activity, Bot, Brain, ClipboardList, Stethoscope, UserRound } from "lucide-react";

import { AgentReasoningPanel } from "@/components/AgentReasoningPanel";
import { PlanCards } from "@/components/PlanCards";
import type { PlanRecommendation } from "@/lib/types";
import type { WearableSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MessageBubbleProps {
  role: "user" | "assistant" | "agent";
  content: string;
  timestamp: string;
  agentLabel?: string;
  plan?: PlanRecommendation;
  wearable?: WearableSnapshot;
  analyzerSummary?: string;
  agentPayload?: unknown;
  route?: string;
  timing?: Record<string, number>;
  validated?: boolean;
  validatorConflicts?: string[];
}

function getAgentIcon(label?: string): React.ReactElement {
  const lower = label?.toLowerCase() ?? "";
  if (lower.includes("analyzer")) return <Brain className="h-3 w-3" />;
  if (lower.includes("planner")) return <ClipboardList className="h-3 w-3" />;
  if (lower.includes("monitor")) return <Stethoscope className="h-3 w-3" />;
  return <Activity className="h-3 w-3" />;
}

export function MessageBubble({
  role,
  content,
  timestamp,
  agentLabel,
  plan,
  wearable,
  analyzerSummary,
  agentPayload,
  route,
  timing,
  validated,
  validatorConflicts
}: MessageBubbleProps): React.ReactElement {
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Agent step updates: compact inline
  if (role === "agent") {
    return (
      <div className="animate-fade-in-up flex items-start gap-1.5 py-0.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
          {getAgentIcon(agentLabel)}
        </div>
        <div className="min-w-0">
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            {agentLabel ?? "Agent"}
          </span>
          <span className="ml-1.5 text-[10px] text-muted-foreground">{timeStr}</span>
          <p className="text-xs leading-relaxed text-muted-foreground">{content}</p>
          <AgentReasoningPanel agentLabel={agentLabel} payload={agentPayload} />
        </div>
      </div>
    );
  }

  // User messages
  if (role === "user") {
    return (
      <div className="animate-slide-right flex justify-end gap-2">
        <div className="user-bubble-glass max-w-[82%] rounded-2xl rounded-br-sm border border-white/20 bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-[0_8px_32px_-4px_rgba(16,185,129,0.30),inset_0_2px_0_rgba(255,255,255,0.20),inset_0_-1px_0_rgba(0,0,0,0.10)]">
          <p className="whitespace-pre-wrap">{content}</p>
          <p className="mt-1 text-right text-[10px] opacity-60">{timeStr}</p>
        </div>
        <div className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100">
          <UserRound className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  // Assistant (Nova) response — with optional plan cards
  const hasPlan = plan && (plan.diet.length > 0 || plan.exercise.length > 0);

  return (
    <div className="animate-slide-left flex justify-start gap-2">
      <div className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div
        className={cn(
          "rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] leading-relaxed",
          "liquid-bubble border-[1.5px] border-white/55 bg-gradient-to-br from-white/65 via-white/45 to-white/55 text-card-foreground shadow-[0_8px_32px_-4px_rgba(16,185,129,0.10),inset_0_2px_0_rgba(255,255,255,0.75),inset_0_-1px_0_rgba(255,255,255,0.15)] dark:border-emerald-700/25 dark:from-emerald-950/35 dark:via-emerald-900/25 dark:to-emerald-950/35 dark:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.3),inset_0_2px_0_rgba(255,255,255,0.08)]",
          hasPlan ? "max-w-[92%] sm:max-w-[85%]" : "max-w-[82%]"
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>

        {hasPlan && (
          <PlanCards
            plan={plan}
            wearable={wearable}
            analyzerSummary={analyzerSummary}
          />
        )}

        <p className="mt-1 text-[10px] text-muted-foreground">{timeStr}</p>

        {(route || timing || validated !== undefined) && (
          <AgentReasoningPanel route={route} timing={timing} validated={validated} validatorConflicts={validatorConflicts} />
        )}
      </div>
    </div>
  );
}
