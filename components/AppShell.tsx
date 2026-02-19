"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

import { BottomTabBar, type TabId } from "@/components/BottomTabBar";
import { ChatInterface } from "@/components/ChatInterface";
import { DashboardPage } from "@/components/DashboardPage";
import { HistoryPage } from "@/components/HistoryPage";
import { SettingsPage } from "@/components/SettingsPage";
import { ProfilePage } from "@/components/ProfilePage";
import { ThemeToggle } from "@/components/ThemeToggle";

const MIGRATION_FLAG = "nova-health-data-migrated";

export function AppShell() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [chatSessionId, setChatSessionId] = useState<string | undefined>();

  // Populate localStorage profile from Google session data (first login)
  useEffect(() => {
    if (!session?.user) return;
    const existing = localStorage.getItem("nova-health-profile");
    if (existing) return; // Already has a profile

    const { name, image } = session.user;
    if (name || image) {
      localStorage.setItem("nova-health-profile", JSON.stringify({
        name: name ?? "",
        photo: image ?? undefined,
        createdAt: new Date().toISOString(),
      }));
      // Notify ProfilePage to re-read
      window.dispatchEvent(new Event("storage"));
    }
  }, [session?.user]);

  // Migrate localStorage data to DB on first authenticated visit
  useEffect(() => {
    if (!session?.user?.id) return;
    if (localStorage.getItem(MIGRATION_FLAG)) return;

    const profile = localStorage.getItem("nova-health-profile");
    const goals = localStorage.getItem("nova-health-goals");

    if (!profile && !goals) {
      localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }

    void fetch("/api/migrate-local-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: profile ? JSON.parse(profile) : undefined,
        goals: goals ? JSON.parse(goals) : undefined,
      }),
    }).then(() => {
      localStorage.setItem(MIGRATION_FLAG, "1");
    }).catch(() => {
      // Silently fail — will retry next visit
    });
  }, [session?.user?.id]);

  // Configure Android status bar — adapt to theme
  useEffect(() => {
    async function updateStatusBar(isDark: boolean) {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Light style = dark icons (for light bg), Dark style = light icons (for dark bg)
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        await StatusBar.setBackgroundColor({ color: isDark ? "#022c22" : "#ecfdf5" });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        // Web fallback — meta theme-color
        let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
        if (!meta) {
          meta = document.createElement("meta");
          meta.name = "theme-color";
          document.head.appendChild(meta);
        }
        meta.content = isDark ? "#022c22" : "#ecfdf5";
      }
    }

    // Initial sync
    const isDark = document.documentElement.classList.contains("dark");
    void updateStatusBar(isDark);

    // Listen for theme changes from Settings
    const handler = (e: Event) => {
      const theme = (e as CustomEvent).detail as string;
      void updateStatusBar(theme === "dark");
    };
    window.addEventListener("novafit-theme-change", handler);
    return () => window.removeEventListener("novafit-theme-change", handler);
  }, []);

  const switchToChat = useCallback((sessionId?: string) => {
    console.log("[AppShell] switchToChat called with:", sessionId);
    if (sessionId) {
      // Use unique string each time to force useEffect even if same sessionId
      const newId = sessionId + ":" + Date.now();
      console.log("[AppShell] Setting chatSessionId to:", newId);
      setChatSessionId(newId);
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session?.user && (
            <button
              onClick={() => void signOut({ callbackUrl: "/auth/login" })}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Sign out"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Content area */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Chat — always mounted, toggled via display for state preservation */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{ display: activeTab === "chat" ? "flex" : "none" }}
        >
          <ChatInterface voiceOutput={voiceOutput} loadSessionId={chatSessionId} />
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
