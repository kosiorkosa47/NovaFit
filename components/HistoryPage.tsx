"use client";

import { useEffect, useState } from "react";
import { Clock, MessageCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { t, getLang, type Lang } from "@/lib/i18n";

const STORAGE_KEY = "nova-health-history";

export interface HistoryEntry {
  sessionId: string;
  timestamp: string;
  firstMessage: string;
  messageCount: number;
  topics: string[];
}

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry) {
  const existing = getHistory();
  const idx = existing.findIndex((e) => e.sessionId === entry.sessionId);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.unshift(entry);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 50)));
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteHistoryEntry(sessionId: string) {
  const existing = getHistory();
  const filtered = existing.filter((e) => e.sessionId !== sessionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  // Also remove persisted messages for that session
  localStorage.removeItem(`nova-health-messages-${sessionId}`);
}

// ---------------------------------------------------------------------------

interface HistoryPageProps {
  onOpenSession: (sessionId?: string) => void;
}

export function HistoryPage({ onOpenSession }: HistoryPageProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setEntries(getHistory()); // eslint-disable-line react-hooks/set-state-in-effect
    setLangState(getLang());
    const handler = (e: Event) => setLangState((e as CustomEvent).detail as Lang);
    window.addEventListener("novafit-lang-change", handler);
    return () => window.removeEventListener("novafit-lang-change", handler);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Clock className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t("no_conversations", lang)}
        </p>
        <button
          type="button"
          onClick={() => onOpenSession()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("start_conversation", lang)}
        </button>
      </div>
    );
  }

  const dateLang = lang === "pl" ? "pl-PL" : "en-US";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="stagger-children mx-auto max-w-lg space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            {t("conversation_history", lang)}
          </h2>
          <button
            type="button"
            onClick={() => {
              clearHistory();
              setEntries([]);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            {t("clear", lang)}
          </button>
        </div>

        {entries.map((entry) => {
          const date = new Date(entry.timestamp);
          return (
            <div key={entry.sessionId + entry.timestamp} className="relative">
              <button
                type="button"
                onClick={() => onOpenSession(entry.sessionId)}
                className="glass-panel tap-feedback flex w-full flex-col gap-1.5 rounded-2xl px-4 py-3.5 pr-10 text-left transition-all duration-300 hover:shadow-zen"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {date.toLocaleDateString(dateLang)} {date.toLocaleTimeString(dateLang, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MessageCircle className="h-3 w-3" />
                    {entry.messageCount}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-foreground/80">
                  {entry.firstMessage}
                </p>
                {entry.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.topics.map((topic) => (
                      <Badge key={topic} variant="secondary" className="text-[9px] px-1.5 py-0">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteHistoryEntry(entry.sessionId);
                  setEntries((prev) => prev.filter((x) => x.sessionId !== entry.sessionId));
                }}
                className="absolute right-2 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
