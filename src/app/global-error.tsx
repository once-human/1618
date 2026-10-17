"use client";

/** The last resort, when even the page frame fails: no site styles to lean on, so it brings its own. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", background: "#fff", color: "#000" }}>
        <main style={{ minHeight: "100svh", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 16, boxSizing: "border-box" }}>
          <p style={{ borderTop: "1px solid #000", paddingTop: 6, margin: 0 }}>The site hit a problem. It&apos;s not you.</p>
          <p style={{ fontSize: "clamp(6rem, 30vw, 30rem)", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 0.78, margin: 0 }}>05:00</p>
          <p style={{ borderTop: "1px solid #000", paddingTop: 6, margin: 0, display: "flex", gap: 24 }}>
            <button type="button" onClick={reset} style={{ font: "inherit", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point when the app itself has failed */}
            <a href="/" style={{ color: "inherit" }}>
              Back to the day
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
