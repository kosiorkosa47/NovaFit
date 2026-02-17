"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle(): React.ReactElement {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Sync theme from localStorage/system preference after hydration
    const stored = localStorage.getItem("nova-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = stored === "dark" || (!stored && prefersDark);
    setDark(shouldBeDark); // eslint-disable-line react-hooks/set-state-in-effect
    document.documentElement.classList.toggle("dark", shouldBeDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("nova-theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-xl border-[1.5px] border-white/40 bg-white/40 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_8px_-2px_rgba(16,185,129,0.08)] backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/55 hover:text-foreground hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_16px_-2px_rgba(16,185,129,0.12)] dark:border-emerald-700/25 dark:bg-emerald-900/25 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-emerald-600/30 dark:hover:bg-emerald-800/30"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
