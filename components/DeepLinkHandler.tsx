"use client";

import { useEffect } from "react";

export function DeepLinkHandler() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("appUrlOpen", (event) => {
          // OAuth callback from Chrome → navigate WebView to complete login
          if (event.url.includes("/api/nextauth/")) {
            window.location.href = event.url;
          }
        });
        cleanup = () => listener.remove();
      } catch {
        // Not running in Capacitor — ignore
      }
    })();
    return () => cleanup?.();
  }, []);

  return null;
}
