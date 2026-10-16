"use client";

import { useEffect, useState } from "react";
import type { SourceCheck } from "@/lib/history/sources";

/** Every live source: answering or not, how fast, and what it last said. */
export function StatusPage() {
  const [data, setData] = useState<{ checks: SourceCheck[]; checkedAt: string } | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/sources")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!data) return <div className="min-h-[40vh]" aria-hidden />;
  const up = data.checks.filter((c) => c.ok).length;
  const off = data.checks.filter((c) => c.ok === null).length;
  return (
    <div>
      <p className="mb-10 border-t border-ink pt-1.5 text-[clamp(1.25rem,2.6vw,2rem)] leading-tight tracking-tight">
        {up} of {data.checks.length - off} sources answering
        {off ? <span className="text-quiet">, {off} not set up yet</span> : null}.
      </p>
      <ol>
        {data.checks.map((c) => (
          <li key={c.name} className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-ink py-2.5 md:grid-cols-[1.25rem_1fr_1fr_1.5fr_auto]">
            <span aria-label={c.ok ? "answering" : c.ok === false ? "not answering" : "not set up"} className={`inline-block size-2.5 rounded-full border-2 border-ink ${c.ok ? "bg-ink" : ""} ${c.ok === false ? "border-[#d33]" : ""}`} />
            <span className="font-semibold">{c.name}</span>
            <span className="hidden text-quiet md:block">{c.what}</span>
            <span className="col-start-2 text-quiet md:col-start-auto md:text-ink">{c.detail}</span>
            <span className="tnum row-start-1 text-right text-quiet md:row-start-auto">{c.ms != null ? `${c.ms} ms` : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[13px] text-quiet">Checked {new Date(data.checkedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" })} Pune time. Refreshes every minute.</p>
    </div>
  );
}
