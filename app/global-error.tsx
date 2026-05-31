"use client";

import { useEffect } from "react";

// Catches errors in the root layout itself, so it must render its own <html>/<body>
// and cannot rely on globals.css/Tailwind. Inline styles keep it self-contained.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          padding: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "#fffbeb",
          color: "#1c1917",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 48 }}>😶‍🌫️</div>
          <h1 style={{ marginTop: 16, fontSize: 28, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#78716c" }}>
            The app hit an unexpected error. Your data is safe.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              background: "#f43f5e",
              color: "white",
              border: 0,
              borderRadius: 16,
              padding: "12px 20px",
              fontSize: 14,
              minHeight: 44,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
