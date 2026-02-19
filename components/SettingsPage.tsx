"use client";

import { Volume2, Watch, Globe, Palette, Info, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { clearHistory } from "@/components/HistoryPage";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";

interface SettingsPageProps {
  voiceOutput: boolean;
  onVoiceOutputChange: (v: boolean) => void;
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-white/35 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-sm dark:border-emerald-800/20 dark:bg-emerald-950/25 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {icon}
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({ voiceOutput, onVoiceOutputChange }: SettingsPageProps) {
  const [dark, setDark] = useState(false);
  const [mockWearable, setMockWearable] = useState(true);
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark")); // eslint-disable-line react-hooks/set-state-in-effect
    setLangState(getLang()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const toggleLang = () => {
    const newLang: Lang = lang === "en" ? "pl" : "en";
    setLangState(newLang);
    setLang(newLang);
    window.dispatchEvent(new CustomEvent("novafit-lang-change", { detail: newLang }));
  };

  const toggleTheme = (checked: boolean) => {
    setDark(checked);
    // Kill all transitions/animations while theme flips — prevents GPU stutter
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.classList.toggle("dark", checked);
    localStorage.setItem("nova-theme", checked ? "dark" : "light");
    window.dispatchEvent(new CustomEvent("novafit-theme-change", { detail: checked ? "dark" : "light" }));
    // Re-enable transitions after repaint settles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("theme-switching");
      });
    });
  };

  const handleClearSession = () => {
    localStorage.removeItem("nova-health-session-id");
    window.location.reload();
  };

  const handleClearHistory = () => {
    clearHistory();
    window.location.reload();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div className="stagger-children mx-auto max-w-lg space-y-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          {t("settings", lang)}
        </h2>

        {/* Voice */}
        <div className="glass-panel divide-y divide-border/30 rounded-2xl px-4">
          <SettingRow
            icon={<Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            label={t("voice_output", lang)}
            description={t("voice_output_desc", lang)}
          >
            <Switch checked={voiceOutput} onCheckedChange={onVoiceOutputChange} />
          </SettingRow>
        </div>

        {/* Wearable */}
        <div className="glass-panel divide-y divide-border/30 rounded-2xl px-4">
          <SettingRow
            icon={<Watch className="h-4 w-4 text-blue-500" />}
            label={t("mock_wearable", lang)}
            description={t("mock_wearable_desc", lang)}
          >
            <Switch checked={mockWearable} onCheckedChange={setMockWearable} />
          </SettingRow>
        </div>

        {/* Language */}
        <div className="glass-panel divide-y divide-border/30 rounded-2xl px-4">
          <SettingRow
            icon={<Globe className="h-4 w-4 text-indigo-500" />}
            label={t("language", lang)}
            description={t("language_desc", lang)}
          >
            <button
              type="button"
              onClick={toggleLang}
              className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted/80"
            >
              {lang === "en" ? "EN" : "PL"}
            </button>
          </SettingRow>
        </div>

        {/* Theme */}
        <div className="glass-panel divide-y divide-border/30 rounded-2xl px-4">
          <SettingRow
            icon={<Palette className="h-4 w-4 text-violet-500" />}
            label={t("dark_mode", lang)}
            description={t("dark_mode_desc", lang)}
          >
            <Switch checked={dark} onCheckedChange={toggleTheme} />
          </SettingRow>
        </div>

        {/* About */}
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">{t("about", lang)}</span>
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <p>Nova Health Agent v0.1.0</p>
            <p>Powered by Amazon Nova AI</p>
            <p>Amazon Nova AI Hackathon 2026</p>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-destructive/20 px-4 py-4">
          <span className="text-xs font-semibold text-destructive">{t("danger_zone", lang)}</span>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleClearSession}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              {t("clear_session", lang)}
            </button>
            <button
              type="button"
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              {t("clear_history", lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
