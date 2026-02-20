"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  MessageCircle,
  LayoutDashboard,
  Clock,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { t, type Lang, getLang } from "@/lib/i18n";

export type TabId = "chat" | "dashboard" | "history" | "settings" | "profile";

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

type TabLabelKey = "tab_chat" | "tab_dashboard" | "tab_history" | "tab_settings" | "tab_profile";

const tabDefs: { id: TabId; labelKey: TabLabelKey; icon: typeof MessageCircle }[] = [
  { id: "chat", labelKey: "tab_chat", icon: MessageCircle },
  { id: "dashboard", labelKey: "tab_dashboard", icon: LayoutDashboard },
  { id: "history", labelKey: "tab_history", icon: Clock },
  { id: "settings", labelKey: "tab_settings", icon: Settings },
  { id: "profile", labelKey: "tab_profile", icon: User },
];

interface PillStyle {
  left: number;
  width: number;
}

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<PillStyle>({ left: 0, width: 0 });
  const [lang, setLangState] = useState<Lang>("en");

  const activeIndex = useMemo(
    () => tabDefs.findIndex((td) => td.id === activeTab),
    [activeTab]
  );

  useEffect(() => {
    setLangState(getLang());
    const handler = (e: Event) => setLangState((e as CustomEvent).detail as Lang);
    window.addEventListener("novafit-lang-change", handler);
    return () => window.removeEventListener("novafit-lang-change", handler);
  }, []);

  const updatePill = useCallback(() => {
    const container = containerRef.current;
    const btn = buttonRefs.current[activeIndex];
    if (!container || !btn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    setPill({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [activeIndex]);

  useEffect(() => {
    updatePill();
    window.addEventListener("resize", updatePill);
    return () => window.removeEventListener("resize", updatePill);
  }, [updatePill]);

  return (
    <nav className="tab-bar-glass relative z-10 shrink-0 border-t border-white/20 dark:border-emerald-800/15" aria-label="Main navigation">
      <div ref={containerRef} className="relative flex items-center justify-around py-1.5" role="tablist">
        {/* Sliding pill — measured from actual button positions */}
        <div
          className="tab-pill pointer-events-none absolute inset-y-1 rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{
            left: pill.left + 4,
            width: pill.width - 8,
          }}
        />

        {tabDefs.map(({ id, labelKey, icon: Icon }, i) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              ref={(el) => { buttonRefs.current[i] = el; }}
              type="button"
              role="tab"
              onClick={() => onTabChange(id)}
              aria-selected={active}
              aria-label={t(labelKey, lang)}
              className={cn(
                "relative z-10 flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-all duration-300 ease-zen",
                active
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground/70 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] transition-all duration-300",
                  active && "stroke-[2.5] scale-110"
                )}
              />
              <span
                className={cn(
                  "text-[10px] leading-tight tracking-wide transition-all duration-300",
                  active ? "font-semibold" : "font-medium"
                )}
              >
                {t(labelKey, lang)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
