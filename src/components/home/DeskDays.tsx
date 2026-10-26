"use client";

import { useEffect, useState } from "react";
import { useDeskDays, useNow } from "@/lib/presence/client";
import type { Span } from "@/lib/desk/model";
import type { DeskDays as Days } from "@/lib/desk/server";

const IST = 5.5 * 3600_000;
const COLOR: Record<string, string> = {
  claude: "bg-ink",
  coding: "bg-ink/80",
  terminal: "bg-ink/60",
  watching: "bg-ink/45",
  browsing: "bg-ink/35",
  chat: "bg-ink/30",
  writing: "bg-ink/50",
  design: "bg-ink/40",
  music: "bg-ink/25",
  ai: "bg-ink/70",
  files: "bg-ink/20",
  tool: "bg-ink/20",
  other: "bg-ink/20",
  idle: "bg-transparent",
};
const WORDS: Record<string, string> = { claude: "with Claude Code", coding: "coding", terminal: "in the terminal", watching: "watching", browsing: "browsing", chat: "chatting", writing: "writing", design: "designing", music: "music sites", ai: "with Claude", files: "in files", tool: "in settings", other: "other" };
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);
const clock = (iso: string | null) => (iso ? new Date(Date.parse(iso) + IST).toISOString().slice(11, 16) : "");
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const frac = (iso: string) => ((Date.parse(iso) + IST) % 86_400_000) / 86_400_000;

/** Seven days of the laptop, one bar per day (midnight to midnight, Pune time); one button opens the rest of the thirty. */
export function DeskDays() {
  const week = useDeskDays();
  const now = useNow();
  const [more, setMore] = useState(false);
  const [month, setMonth] = useState<Days | null>(null);
  useEffect(() => {
    if (!more) return;
    let live = true;
    fetch("/api/desk/days?days=30")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setMonth(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [more]);
  const d = more && month ? month : week;
  if (!d || !now || !d.days.length) return null;
  return (
    <section>
      <h2 className="border-ink mb-6 flex justify-between gap-4 border-t pt-1.5 font-semibold">
        The laptop
        <span className="font-normal text-quiet">the last {more && month ? "thirty" : "seven"} days, midnight to midnight</span>
      </h2>
      <ol className="space-y-5">
        {[...d.days].reverse().map(({ day, spans, summary }) => (
          <li key={day}>
            <div className="flex flex-wrap justify-between gap-x-4">
              <span className="font-semibold">{dayLabel(day)}</span>
              <span className="tnum text-quiet">
                {hm(summary.activeMin)} at the laptop{summary.first ? `, ${clock(summary.first)}–${clock(summary.last)}` : ""}
              </span>
            </div>
            <Bar spans={spans} />
            <p className="text-quiet mt-1">
              {Object.entries(summary.byKind)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([k, v]) => `${hm(v)} ${WORDS[k] ?? k}`)
                .join(", ")}
              {summary.repos.length ? `. Repos: ${summary.repos.map((r) => r.name).join(", ")}` : ""}
              {summary.sites.length ? `. Sites: ${summary.sites.map((r) => r.name).join(", ")}` : ""}
              {summary.youtubeMin ? `. ${hm(summary.youtubeMin)} on YouTube` : ""}
              {summary.tracks.length ? `. Played ${summary.tracks.map((t) => t.label).join(", ")}` : ""}.
            </p>
          </li>
        ))}
      </ol>
      {!more ? (
        <button type="button" onClick={() => setMore(true)} className="mt-6 cursor-pointer text-left font-semibold underline decoration-1 underline-offset-4">
          Show the earlier days, up to 30
        </button>
      ) : null}
    </section>
  );
}

function Bar({ spans }: { spans: Span[] }) {
  return (
    <div className="border-ink/30 relative mt-1.5 h-3 w-full overflow-hidden border" role="img" aria-label="When the laptop was in use">
      {spans
        .filter((s) => s.lane === "doing" && s.kind !== "idle")
        .map((s, i) => {
          const a = frac(s.start);
          const w = Math.max(0.002, (Date.parse(s.end) - Date.parse(s.start)) / 86_400_000);
          return <span key={i} className={`absolute inset-y-0 ${COLOR[s.kind] ?? "bg-ink/20"}`} style={{ left: `${a * 100}%`, width: `${Math.min(w, 1 - a) * 100}%` }} title={s.label} />;
        })}
    </div>
  );
}
