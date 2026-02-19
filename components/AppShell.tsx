"use client";

import { useState, useCallback, useEffect } from "react";

import { BottomTabBar, type TabId } from "@/components/BottomTabBar";
import { ChatInterface } from "@/components/ChatInterface";
import { DashboardPage } from "@/components/DashboardPage";
import { HistoryPage } from "@/components/HistoryPage";
import { SettingsPage } from "@/components/SettingsPage";
import { ProfilePage } from "@/components/ProfilePage";
import { ThemeToggle } from "@/components/ThemeToggle";

const SESSION_STORAGE_KEY = "nova-health-session-id";

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [voiceOutput, setVoiceOutput] = useState(true);

  // Configure Android status bar — dark icons on light background
  useEffect(() => {
    async function configureStatusBar() {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Light }); // Dark icons
        await StatusBar.setBackgroundColor({ color: "#ecfdf5" }); // Emerald-50
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        // Not in native app — use meta tag fallback
        let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
        if (!meta) {
          meta = document.createElement("meta");
          meta.name = "theme-color";
          document.head.appendChild(meta);
        }
        meta.content = "#ecfdf5";
      }
    }
    void configureStatusBar();
  }, []);

  const switchToChat = useCallback((sessionId?: string) => {
    if (sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    setActiveTab("chat");
  }, []);

  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden bg-background">
      {/* Ambient floating orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
        <div className="ambient-orb ambient-orb-3" />
      </div>

      {/* Thin top bar */}
      <header className="liquid-glass relative z-10 flex shrink-0 items-center justify-between border-b border-white/20 px-4 py-2.5 dark:border-emerald-800/15">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-light tracking-wide text-foreground/90">
              Nova Health
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60 sm:block">
              Powered by Amazon Nova
            </span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Content area */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Chat — always mounted, toggled via display for state preservation */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{ display: activeTab === "chat" ? "flex" : "none" }}
        >
          <ChatInterface voiceOutput={voiceOutput} />
        </div>

        {activeTab === "dashboard" && (
          <div className="animate-tab-fade flex min-h-0 flex-1 flex-col"><DashboardPage /></div>
        )}
        {activeTab === "history" && (
          <div className="animate-tab-fade flex min-h-0 flex-1 flex-col"><HistoryPage onOpenSession={switchToChat} /></div>
        )}
        {activeTab === "settings" && (
          <div className="animate-tab-fade flex min-h-0 flex-1 flex-col">
            <SettingsPage voiceOutput={voiceOutput} onVoiceOutputChange={setVoiceOutput} />
          </div>
        )}
        {activeTab === "profile" && (
          <div className="animate-tab-fade flex min-h-0 flex-1 flex-col"><ProfilePage /></div>
        )}
      </div>

      {/* Bottom tab navigation */}
      <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
