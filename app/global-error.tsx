"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#fafafa" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: "1rem", padding: "1.5rem", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Critical Error</h2>
          <p style={{ fontSize: 14, color: "#a1a1aa", maxWidth: 320 }}>
            The application encountered a critical error. Please refresh to continue.
          </p>
          <button
            onClick={reset}
            style={{ padding: "10px 24px", borderRadius: 12, background: "#059669", color: "#fff", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
