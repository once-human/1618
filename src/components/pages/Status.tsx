"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SourceCheck } from "@/lib/history/sources";
import type { Feature } from "@/lib/features";
import { useHere } from "@/lib/presence/client";
import { useOthers } from "@/lib/presence/here";
import { hereLine } from "@/components/live/StatusLine";
import { projects } from "@/content/projects";

const cell = "border-t border-ink pt-1.5";
const GROUPS: Feature["group"][] = ["With you, live", "From my day", "Things you can do", "Outside the browser"];
const CURL = "curl -L onkaryaglewad.in";

interface Data {
  checks: SourceCheck[];
  features: Feature[];
  checkedAt: string;
}

/**
 * /status: everything this site does, where to find it, and what it's doing
 * right now; then every live source behind it. All of it is worked out from
 * the real thing, so anything that stops working shows up here.
 */
export function StatusPage({ initial = null }: { initial?: Data | null }) {
  // The first answer comes with the page; after that it refreshes every minute.
  const [data, setData] = useState<Data | null>(initial);
  const [curl, setCurl] = useState<{ ok: boolean; text: string } | null>(null);
  const here = useHere();
  const others = useOthers();

  useEffect(() => {
    const load = () => {
      fetch("/api/sources")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
      // The terminal version, fetched the way curl gets it, so its line below is a real check.
      fetch("/api/curl?plain", { cache: "no-store" })
        .then(async (r) => setCurl({ ok: r.ok, text: r.ok ? (await r.text()).replace(/^\n+|\n+$/g, "") : `answered ${r.status}` }))
        .catch(() => setCurl({ ok: false, text: "didn't answer" }));
    };
    if (!initial) load();
    else
      fetch("/api/curl?plain", { cache: "no-store" })
        .then(async (r) => setCurl({ ok: r.ok, text: r.ok ? (await r.text()).replace(/^\n+|\n+$/g, "") : `answered ${r.status}` }))
        .catch(() => setCurl({ ok: false, text: "didn't answer" }));
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [initial]);

  if (!data) return <div className="min-h-[60vh]" aria-hidden />;

  // Fill in the parts only this browser knows: who's here, and whether curl answered.
  const features = data.features.map((f) =>
    f.id === "here"
      ? { ...f, ok: here ? here.people > 0 : null, state: here && here.people > 0 ? hereLine(here, others) : "Connecting…" }
      : f.id === "curl"
        ? { ...f, ok: curl ? curl.ok : null, state: curl ? (curl.ok ? "Answering. Try it:" : `Not answering (${curl.text}).`) : "Checking…" }
        : f.id === "previews"
          ? { ...f, state: `${PREVIEWS.length} pages have their own card.` }
          : f,
  );
  const working = features.filter((f) => f.ok).length;
  const broken = features.filter((f) => f.ok === false);
  const waiting = features.filter((f) => f.ok === null).length;
  const up = data.checks.filter((c) => c.ok).length;
  const off = data.checks.filter((c) => c.ok === null).length;

  return (
    <div className="space-y-20">
      <p className={`${cell} text-[clamp(1.25rem,2.6vw,2rem)] leading-tight tracking-tight`}>
        {features.length} things this site does. {working} working right now
        {waiting ? <span className="text-quiet">, {waiting} waiting on something</span> : null}
        {broken.length ? <span>, {broken.length} not working ({broken.map((b) => b.name).join(", ")})</span> : null}.
        <span className="text-quiet block text-[0.6em] leading-snug">
          Behind them, {up} of {data.checks.length - off} live sources answering. Everything here is checked, not written by hand.
        </span>
      </p>

      {GROUPS.map((g) => {
        const list = features.filter((f) => f.group === g);
        if (!list.length) return null;
        return (
          <section key={g}>
            <h2 className={`${cell} mb-2 font-semibold`}>{g}</h2>
            <ol>
              {list.map((f) => (
                <li key={f.id} id={f.id} className="border-ink/20 grid scroll-mt-24 grid-cols-[1.25rem_1fr] gap-x-3 border-t py-3 md:grid-cols-[1.25rem_13rem_1fr]">
                  <Dot ok={f.ok} />
                  <span className="font-semibold">{f.name}</span>
                  <div className="col-start-2 md:col-start-3">
                    <p>{f.state}</p>
                    {f.id === "curl" && curl?.ok ? <Terminal text={curl.text} /> : null}
                    {f.id === "previews" ? <Previews /> : null}
                    <p className="text-quiet mt-1 max-w-[70ch] text-[14px] leading-snug">{f.what}</p>
                    {f.where.length ? (
                      <p className="text-quiet mt-1 text-[13px]">
                        {f.where.map((w, i) => (
                          <span key={w.href + w.label}>
                            {i ? ", " : ""}
                            <Link href={w.href} className="hover:text-ink underline decoration-1 underline-offset-4">
                              {w.label}
                            </Link>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <section>
        <h2 className={`${cell} mb-2 flex flex-wrap justify-between gap-x-4 font-semibold`}>
          Behind it
          <span className="text-quiet font-normal">
            {up} of {data.checks.length - off} answering{off ? `, ${off} not set up` : ""}
          </span>
        </h2>
        <ol>
          {data.checks.map((c) => (
            <li key={c.name} className="border-ink/20 grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t py-2.5 md:grid-cols-[1.25rem_13rem_1fr_1.5fr_4.5rem]">
              <Dot ok={c.ok} />
              <span className="font-semibold">{c.name}</span>
              <span className="text-quiet hidden md:block">{c.what}</span>
              <span className="text-quiet md:text-ink col-start-2 md:col-start-auto">{c.detail}</span>
              <span className="tnum text-quiet row-start-1 text-right md:row-start-auto">{c.ms != null ? `${c.ms} ms` : ""}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-quiet text-[13px]">
        Checked {new Date(data.checkedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" })} India time. Refreshes every minute.
      </p>
    </div>
  );
}

function Dot({ ok }: { ok: boolean | null }) {
  return (
    <span
      role="img"
      aria-label={ok ? "working" : ok === false ? "not working" : "waiting"}
      className={`mt-[0.45em] inline-block size-2.5 rounded-full border-2 ${ok ? "border-ink bg-ink" : ok === false ? "border-[#d33]" : "border-ink"}`}
    />
  );
}

/** The command, copyable, and what it prints right now. */
function Terminal({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-ink text-paper mt-3 max-w-[80ch] overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 px-4 py-2 font-mono text-[13px]">
        <span>
          <span className="opacity-50">$ </span>
          {CURL}
        </span>
        <button
          type="button"
          className="opacity-70 hover:opacity-100"
          onClick={() => {
            void navigator.clipboard?.writeText(CURL).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="max-h-[50vh] overflow-auto px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre">{text}</pre>
    </div>
  );
}

const PREVIEWS = [
  { href: "/", img: "/opengraph-image", label: "home" },
  { href: "/now", img: "/now/opengraph-image", label: "/now" },
  { href: "/history", img: "/history/opengraph-image", label: "/history" },
  { href: "/talk", img: "/talk/opengraph-image", label: "/talk" },
  { href: "/status", img: "/status/opengraph-image", label: "/status" },
  ...projects.slice(0, 1).map((p) => ({ href: `/work/${p.slug}`, img: `/work/${p.slug}/opengraph-image`, label: `each project, like ${p.name}` })),
];

function Previews() {
  return (
    <ul id="previews" className="mt-3 grid scroll-mt-24 grid-cols-2 gap-3 md:grid-cols-3">
      {PREVIEWS.map((p) => (
        <li key={p.href}>
          <Link href={p.href} className="group block">
            {/* eslint-disable-next-line @next/next/no-img-element -- a plain picture of the card, exactly as it's served */}
            <img src={p.img} alt={`The link preview for ${p.label}`} width={1200} height={630} loading="lazy" className="border-ink/20 aspect-[1200/630] w-full border object-cover" />
            <span className="text-quiet group-hover:text-ink mt-1 block text-[13px]">{p.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
