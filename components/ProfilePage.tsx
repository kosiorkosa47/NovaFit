"use client";

import { useEffect, useState } from "react";
import { User, Heart, Target, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PROFILE_KEY = "nova-health-profile";

interface ProfileData {
  name: string;
  createdAt: string;
}

function getProfile(): ProfileData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as ProfileData) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: ProfileData) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Try to extract user facts from session memory (localStorage)
function getUserFacts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    // Check for facts stored by the agent pipeline
    const raw = localStorage.getItem("nova-health-user-facts");
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

export function ProfilePage() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [facts, setFacts] = useState<string[]>([]);

  useEffect(() => {
    // Client-only read from localStorage on mount
    const profile = getProfile();
    if (profile) {
      setName(profile.name); // eslint-disable-line react-hooks/set-state-in-effect
      setIsNew(false);
    }
    setFacts(getUserFacts());
  }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveProfile({ name: trimmed, createdAt: new Date().toISOString() });
    setIsNew(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const goals = [
    { label: "Steps", value: "8,000 / day" },
    { label: "Water", value: "8 glasses / day" },
    { label: "Sleep", value: "7 hours / night" },
    { label: "Exercise", value: "30 min / day" },
  ];

  if (isNew && !name) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60">
          <User className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Set up your profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your name to personalize your experience
          </p>
        </div>
        <div className="flex w-full max-w-xs gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Your name"
            className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="stagger-children mx-auto max-w-lg space-y-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-xl font-light tracking-wide text-emerald-700 shadow-zen dark:bg-emerald-400/10 dark:text-emerald-300">
            {getInitials(name || "U")}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-48 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={handleSave}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Save className="h-3.5 w-3.5" />
            </button>
          </div>
          {saved && (
            <span className="animate-fade-in-up text-xs text-emerald-600 dark:text-emerald-400">
              Saved!
            </span>
          )}
        </div>

        {/* Health facts */}
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-rose-400" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Health Facts</span>
          </div>
          {facts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {facts.map((fact) => (
                <Badge key={fact} variant="secondary" className="text-[10px]">
                  {fact}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Chat with Nova to discover your health preferences and allergies. They will appear here.
            </p>
          )}
        </div>

        {/* Goals summary */}
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Daily Goals</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {goals.map((g) => (
              <div
                key={g.label}
                className="rounded-lg bg-muted/50 px-2.5 py-2 text-center"
              >
                <span className="text-xs font-medium">{g.label}</span>
                <p className="text-[11px] text-muted-foreground">{g.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
