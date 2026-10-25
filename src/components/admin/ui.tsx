"use client";

import { useEffect, useState } from "react";

/* ---- words and numbers ---- */

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function ago(iso: string | number | null | undefined, now = Date.now()) {
  if (iso == null) return "never";
  const s = Math.max(0, Math.round((now - (typeof iso === "number" ? iso : Date.parse(iso))) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function until(iso: string | number) {
  const m = Math.round(((typeof iso === "number" ? iso : Date.parse(iso)) - Date.now()) / 60000);
  if (m <= 0) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h < 48 ? `${h} h${r ? ` ${r} min` : ""}` : `${Math.round(h / 24)} days`;
}

export const clockIn = (tz: string, at = new Date()) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(at);

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });

/** 🇮🇳 from "IN". */
export const flag = (cc: string | null | undefined) =>
  cc && /^[A-Z]{2}$/i.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";

const regions = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export const town = (city: string | null | undefined, cc: string | null | undefined) => {
  const country = cc ? (regions?.of(cc.toUpperCase()) ?? cc) : null;
  return city ? `${city}${country ? `, ${country}` : ""}` : (country ?? "Somewhere unknown");
};

/** Re-render every few seconds, for "x min ago". */
export function useTick(ms = 10_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/* ---- pieces ---- */

/** A section: a rule, a bold label, a quiet note on the right. Like the site's own sections. */
export function Panel({ title, aside, children, className = "", id }: { title?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`min-w-0 scroll-mt-24 ${className}`}>
      {title ? (
        <header className="border-a-ink mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-1.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {aside ? <div className="text-a-quiet text-[13px]">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** A big number with a label under it, like the site's stats. */
export function Stat({ value, label, sub }: { value: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border-a-line min-w-0 border-t pt-1.5">
      <p className="wide truncate text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.05] font-bold tracking-tight tabular-nums">{value}</p>
      <p className="text-a-quiet mt-1 text-[13px]">{label}</p>
      {sub ? <p className="text-a-quiet text-[12.5px]">{sub}</p> : null}
    </div>
  );
}

type BtnKind = "primary" | "plain" | "quiet" | "danger" | "signal";
const BTN: Record<BtnKind, string> = {
  primary: "bg-a-ink text-a-bg hover:opacity-85",
  signal: "bg-a-signal text-white hover:opacity-90",
  plain: "border border-a-line hover:border-a-ink",
  quiet: "text-a-quiet hover:text-a-ink",
  danger: "border border-a-bad/50 text-a-bad hover:bg-a-bad hover:text-white",
};
export function Button({ kind = "plain", busy, className = "", children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 px-3 text-[14px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${BTN[kind]} ${className}`}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export function Chip({ on, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...rest}
      className={`min-h-8 border px-2.5 text-[13.5px] transition-colors ${on ? "border-a-ink bg-a-ink text-a-bg" : "border-a-line hover:border-a-ink"} ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** One of a few, as a row of words: "24 hours · 7 days · 30 days". */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`border-b-2 pb-0.5 ${value === o.id ? "border-a-ink font-semibold" : "text-a-quiet hover:text-a-ink border-transparent"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dot({ tone }: { tone: "ok" | "bad" | "off" | "signal" | "live" }) {
  const c = { ok: "bg-a-ok", bad: "bg-a-bad", off: "border border-a-quiet", signal: "bg-a-signal", live: "bg-a-ok" }[tone];
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {tone === "live" ? <span className="bg-a-ok absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:hidden" /> : null}
      <span className={`relative size-2 rounded-full ${c}`} />
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-a-quiet py-5 text-[14px]">{children}</p>;
}

/** A text field: just a line to write on. */
export const input =
  "border-a-line focus:border-a-ink w-full border-b bg-transparent px-0 py-2.5 text-[16px] outline-none placeholder:text-a-quiet focus-visible:outline-none";
/** A boxed field, for longer writing. */
export const box = "border-a-line focus:border-a-ink w-full border bg-transparent px-3 py-2.5 text-[16px] outline-none placeholder:text-a-quiet focus-visible:outline-none";

/** "Delete?" → "Yes, delete" / "Keep", inline, so a slip of the thumb never deletes anything. */
export function Confirm({ label, yes, onYes, busy }: { label: string; yes: string; onYes: () => void; busy?: boolean }) {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="inline-flex gap-1">
      <Button kind="danger" onClick={onYes} busy={busy}>
        {yes}
      </Button>
      <Button kind="quiet" onClick={() => setAsking(false)}>
        Keep
      </Button>
    </span>
  ) : (
    <Button kind="quiet" onClick={() => setAsking(true)}>
      {label}
    </Button>
  );
}

/* ---- icons (one stroke weight, 20px box) ---- */

const P: Record<string, string> = {
  now: "M10 3v2M10 15v2M3 10h2M15 10h2M10 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  talk: "M4 4h12v9H9l-4 3v-3H4z",
  posts: "M7 14.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm0 0V5l9-2v9.5M16 12.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  you: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 7c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5",
  site: "M3 5h14v10H3zM3 8h14M6 6.5h.01M8 6.5h.01",
  ext: "M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8",
  back: "M12 4l-6 6 6 6",
  pin: "M10 18s5-5.2 5-9a5 5 0 0 0-10 0c0 3.8 5 9 5 9Zm0-7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  play: "M7 4.5v11l9-5.5z",
  pause: "M6.5 4.5v11M13.5 4.5v11",
  refresh: "M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4",
  search: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm8 2-3.5-3.5",
  locate: "M10 2v3M10 15v3M2 10h3M15 10h3M10 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  send: "M3 10l14-6-5 14-2.5-5.5z",
  sun: "M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1 1M14.7 14.7l1 1M4.3 15.7l1-1M14.7 5.3l1-1",
  moon: "M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z",
  shield: "M10 2.5 4 5v4.5c0 3.8 2.6 6.6 6 8 3.4-1.4 6-4.2 6-8V5z",
  chevron: "M8 5l5 5-5 5",
};
export function Icon({ name, className = "size-5" }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name] ?? ""} />
    </svg>
  );
}
