"use client";

import { useEffect, useRef, useState } from "react";
import { User, Heart, Target, Save, Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PROFILE_KEY = "nova-health-profile";

interface ProfileData {
  name: string;
  photo?: string; // base64 data URL
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

function getUserFacts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("nova-health-user-facts");
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

/** Check if running inside Capacitor native app */
function isNative(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;
}

/** Resize image to max 200x200 and return as base64 data URL */
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
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const profile = getProfile();
    if (profile) {
      setName(profile.name);
      setPhoto(profile.photo);
      setProfileExists(true);
    }
    setFacts(getUserFacts());
  }, []);

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
          quality: 80,
          allowEditing: true,
          resultType: CameraResultType.Base64,
          source: CameraSource.Prompt,
          width: 400,
          height: 400,
          promptLabelHeader: "Profile Photo",
          promptLabelPhoto: "Take Photo",
          promptLabelPicture: "Choose from Gallery",
          promptLabelCancel: "Cancel",
        });
        if (!result.base64String) return;
        const byteString = atob(result.base64String);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const mime = result.format === "png" ? "image/png" : "image/jpeg";
        imageFile = new File([ab], `photo.${result.format}`, { type: mime });
      } catch {
        return; // cancelled
      }
    } else if (file) {
      imageFile = file;
    }

    if (!imageFile) return;
    const dataUrl = await resizeImage(imageFile);
    setPhoto(dataUrl);
    // Auto-save if profile already exists
    if (profileExists && name.trim()) {
      saveProfile({ name: name.trim(), photo: dataUrl, createdAt: new Date().toISOString() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handlePhotoClick = () => {
    if (isNative()) {
      void handlePhotoSelect("native");
    } else {
      photoInputRef.current?.click();
    }
  };

  const goals = [
    { label: "Steps", value: "8,000 / day" },
    { label: "Water", value: "8 glasses / day" },
    { label: "Sleep", value: "7 hours / night" },
    { label: "Exercise", value: "30 min / day" },
  ];

  // Setup view — only shown when no profile has been saved yet
  if (!profileExists) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        {/* Avatar with photo option */}
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
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
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
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </button>
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
