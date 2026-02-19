"use client";

import { useEffect, useRef, useState } from "react";
import { User, Heart, Target, Camera, Check, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { t, getLang, type Lang } from "@/lib/i18n";

const PROFILE_KEY = "nova-health-profile";
const GOALS_KEY = "nova-health-goals";

interface ProfileData {
  name: string;
  photo?: string;
  createdAt: string;
}

interface GoalItem {
  key: string;
  label: { en: string; pl: string };
  value: string;
  unit: { en: string; pl: string };
}

const DEFAULT_GOALS: GoalItem[] = [
  { key: "steps", label: { en: "Steps", pl: "Kroki" }, value: "8000", unit: { en: "/ day", pl: "/ dzień" } },
  { key: "water", label: { en: "Water", pl: "Woda" }, value: "8", unit: { en: "glasses", pl: "szklanek" } },
  { key: "sleep", label: { en: "Sleep", pl: "Sen" }, value: "7", unit: { en: "hours", pl: "godz" } },
  { key: "exercise", label: { en: "Exercise", pl: "Ćwiczenia" }, value: "30", unit: { en: "min", pl: "min" } },
];

function getProfile(): ProfileData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as ProfileData) : null;
  } catch { return null; }
}

function saveProfile(profile: ProfileData) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function getGoals(): GoalItem[] {
  if (typeof window === "undefined") return DEFAULT_GOALS;
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    return raw ? (JSON.parse(raw) as GoalItem[]) : DEFAULT_GOALS;
  } catch { return DEFAULT_GOALS; }
}

function saveGoals(goals: GoalItem[]) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function getUserFacts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("nova-health-user-facts");
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

function isNative(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 200;
        let w = img.width, h = img.height;
        if (w > h) { h = (h / w) * MAX; w = MAX; } else { w = (w / h) * MAX; h = MAX; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfilePage() {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [profileExists, setProfileExists] = useState(false);
  const [facts, setFacts] = useState<string[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>(DEFAULT_GOALS);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [lang, setLangState] = useState<Lang>("en");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const goalInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const profile = getProfile();
    if (profile) {
      setName(profile.name);
      setPhoto(profile.photo);
      setProfileExists(true);
    }
    setFacts(getUserFacts());
    setGoals(getGoals());
    setLangState(getLang());
    const handler = (e: Event) => setLangState((e as CustomEvent).detail as Lang);
    window.addEventListener("novafit-lang-change", handler);
    return () => window.removeEventListener("novafit-lang-change", handler);
  }, []);

  // Focus goal input when editing
  useEffect(() => {
    if (editingGoal) goalInputRef.current?.focus();
  }, [editingGoal]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveProfile({ name: trimmed, photo, createdAt: new Date().toISOString() });
    setProfileExists(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePhotoSelect = async (source: "native" | "file", file?: File) => {
    let imageFile: File | null = null;
    if (source === "native") {
      try {
        const { Camera: CapCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const result = await CapCamera.getPhoto({
          quality: 80, allowEditing: true, resultType: CameraResultType.Base64,
          source: CameraSource.Prompt, width: 400, height: 400,
        });
        if (!result.base64String) return;
        const byteString = atob(result.base64String);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const mime = result.format === "png" ? "image/png" : "image/jpeg";
        imageFile = new File([ab], `photo.${result.format}`, { type: mime });
      } catch { return; }
    } else if (file) {
      imageFile = file;
    }
    if (!imageFile) return;
    const dataUrl = await resizeImage(imageFile);
    setPhoto(dataUrl);
    if (profileExists && name.trim()) {
      saveProfile({ name: name.trim(), photo: dataUrl, createdAt: new Date().toISOString() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handlePhotoClick = () => {
    if (isNative()) void handlePhotoSelect("native");
    else photoInputRef.current?.click();
  };

  const startEditGoal = (key: string) => {
    const goal = goals.find((g) => g.key === key);
    if (!goal) return;
    setEditingGoal(key);
    setEditValue(goal.value);
  };

  const saveGoalEdit = () => {
    if (!editingGoal || !editValue.trim()) {
      setEditingGoal(null);
      return;
    }
    const updated = goals.map((g) =>
      g.key === editingGoal ? { ...g, value: editValue.trim() } : g
    );
    setGoals(updated);
    saveGoals(updated);
    setEditingGoal(null);
  };

  const photoInput = (
    <input
      ref={photoInputRef}
      type="file"
      accept="image/*"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handlePhotoSelect("file", f);
        e.target.value = "";
      }}
      className="hidden"
    />
  );

  // Setup view
  if (!profileExists) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <button
          type="button"
          onClick={handlePhotoClick}
          className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60"
        >
          {photo ? (
            <img src={photo} alt="Profile" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <User className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-active:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
        {photoInput}
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t("setup_profile", lang)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("enter_name", lang)}</p>
        </div>
        <div className="flex w-full max-w-xs items-center justify-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={t("your_name", lang)}
            className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {t("save", lang)}
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
          <button
            type="button"
            onClick={handlePhotoClick}
            className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 shadow-zen dark:bg-emerald-400/10"
          >
            {photo ? (
              <img src={photo} alt="Profile" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span className="text-xl font-light tracking-wide text-emerald-700 dark:text-emerald-300">
                {getInitials(name || "U")}
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-active:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </button>
          {photoInput}
          {/* Name input — symmetric padding so text is truly centered */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              onBlur={handleSave}
              className="w-44 rounded-lg border border-input bg-background px-3 py-1.5 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {saved && (
            <span className="animate-fade-in-up text-xs text-emerald-600 dark:text-emerald-400">
              {t("saved", lang)}
            </span>
          )}
        </div>

        {/* Health facts */}
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-rose-400" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">{t("health_facts", lang)}</span>
          </div>
          {facts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {facts.map((fact) => (
                <Badge key={fact} variant="secondary" className="text-[10px]">{fact}</Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">{t("health_facts_empty", lang)}</p>
          )}
        </div>

        {/* Editable goals */}
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">{t("daily_goals_label", lang)}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {goals.map((g) => {
              const isEditing = editingGoal === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => !isEditing && startEditGoal(g.key)}
                  className="relative rounded-lg bg-muted/50 px-2.5 py-2 text-center transition-colors hover:bg-muted/80 active:bg-muted"
                >
                  <span className="text-xs font-medium">{g.label[lang]}</span>
                  {isEditing ? (
                    <div className="mt-0.5 flex items-center justify-center gap-1">
                      <input
                        ref={goalInputRef}
                        type="text"
                        inputMode="numeric"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveGoalEdit();
                          if (e.key === "Escape") setEditingGoal(null);
                        }}
                        onBlur={saveGoalEdit}
                        className="w-14 rounded border border-input bg-background px-1 py-0.5 text-center text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-[10px] text-muted-foreground">{g.unit[lang]}</span>
                      <Check
                        className="h-3 w-3 text-emerald-500"
                        onClick={(e) => { e.stopPropagation(); saveGoalEdit(); }}
                      />
                    </div>
                  ) : (
                    <div className="mt-0.5 flex items-center justify-center gap-1">
                      <p className="text-[11px] text-muted-foreground">
                        {g.value} {g.unit[lang]}
                      </p>
                      <Pencil className="h-2.5 w-2.5 text-muted-foreground/40" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
