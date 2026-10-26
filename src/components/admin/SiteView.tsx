"use client";

import { useState } from "react";
import { act, type AdminState } from "./store";
import { useDesk } from "@/lib/presence/client";
import { Button, Dot, Panel, ago, fmt } from "./ui";

const SHORTCUTS: { id: "health" | "location" | "status" | "goodnight" | "goodmorning"; name: string; what: string; automate: string }[] = [
  { id: "health", name: "1618 Health", what: "Today's steps, distance and active calories.", automate: "Automation → App → Is Opened (an app you open a lot) → Run Immediately. Health can't be read while the phone is locked, so a time-of-day automation won't work." },
  { id: "location", name: "1618 Location", what: "Your town, for the clock and weather.", automate: "Automation → Time of Day, a few times a day, or Arrive at a place. Holding a place in You stops it for a while." },
  { id: "status", name: "1618 Status", what: "Set or clear the status line from your phone.", automate: "Put it on the Action Button or Back Tap." },
  {
    id: "goodnight",
    name: "Good Night",
    what: "Say “Hey Siri, good night”: Siri wishes you good night and the site says you went to bed, for seven hours (sooner if you say good morning, or do something after the first two hours).",
    automate: "No automation needed: Siri runs it by its name. Keep the name exactly “Good Night”. If you have a Home scene with the same name, rename one of them.",
  },
  {
    id: "goodmorning",
    name: "Good Morning",
    what: "Say “Hey Siri, good morning”: Siri greets you and the site says you're up, with your wake time on last night's sleep.",
    automate: "No automation needed: Siri runs it by its name. Keep the name exactly “Good Morning”.",
  },
];

export function SiteView({ data }: { data: AdminState }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const checks = data.sources.checks;
  const tg = data.talk.telegram;
  const s = data.store;
  const desk = useDesk();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Laptop agent" aside={desk?.online ? "online" : desk?.lastSeen ? `last seen ${ago(desk.lastSeen)}` : "never seen"}>
          <p className="text-[14.5px]">
            {desk?.online ? `Reporting now: ${desk.doing?.label ?? "at the laptop"}.` : "Not reporting right now."} Samples go to /api/ingest/desk with the site key. Apps and sites by name, never window titles; YouTube is only &ldquo;YouTube&rdquo;.
          </p>
          <p className="mt-2 text-[14px]">
            <a className="underline" href="https://github.com/once-human/desk-agent" target="_blank" rel="noreferrer">
              github.com/once-human/desk-agent
            </a>{" "}
            <span className="text-a-quiet">to install it on a new laptop</span>
          </p>
        </Panel>

        <Panel title="Live sources" aside={`Checked ${ago(data.sources.checkedAt)}`}>
          <ul className="divide-a-line divide-y">
            {checks.map((c) => (
              <li key={c.name} className="grid grid-cols-[1rem_8.5rem_1fr_auto] items-baseline gap-x-2 py-2 text-[14px]">
                <span className="self-center">
                  <Dot tone={c.ok ? "ok" : c.ok === false ? "bad" : "off"} />
                </span>
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-a-quiet min-w-0 truncate" title={c.detail}>
                  {c.detail}
                </span>
                <span className="text-a-quiet text-[12.5px] tabular-nums">{c.ms != null ? `${c.ms} ms` : ""}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="History store" aside="Neon Postgres">
          {s ? (
            <>
              <p className="text-[14.5px]">
                {fmt(s.plays)} plays since {s.first ?? "–"}, {fmt(s.pins)} pins, {fmt(s.events)} pushes and workouts.
              </p>
              <p className="text-a-quiet mt-1 text-[13.5px]">
                Last sync {ago(s.lastSync)}. Last.fm backfill {s.backfillDone ? "complete" : "still running"}. It syncs on its own every day.
              </p>
            </>
          ) : (
            <p className="text-a-bad">The database isn&apos;t answering.</p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <Button
              busy={busy === "sync"}
              onClick={async () => {
                setBusy("sync");
                const r = await act<{ report: Record<string, unknown> }>("sync", {}, "Synced");
                setBusy(null);
                if (r) setReport(Object.entries(r.report).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · "));
              }}
            >
              Sync now
            </Button>
            {report ? <p className="text-a-quiet min-w-0 truncate text-[12.5px]" title={report}>{report}</p> : null}
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Telegram" aside="Talk messages to your phone">
          {!tg.configured ? (
            <ol className="list-inside list-decimal space-y-1 text-[14.5px]">
              <li>Make a bot with @BotFather and copy its token.</li>
              <li>Add it in Vercel as TELEGRAM_BOT_TOKEN, then redeploy.</li>
              <li>Come back here and connect.</li>
            </ol>
          ) : tg.owner ? (
            <>
              <p className="flex items-center gap-2 text-[14.5px]">
                <Dot tone="ok" /> Connected to {tg.owner.name || "you"}. New chats, songs and guestbook notes arrive there.
              </p>
              <p className="text-a-quiet mt-1 text-[13px]">In Telegram: swipe-reply to answer, /chats for open chats, /block as a reply to close one.</p>
              <div className="mt-3 flex gap-2">
                <Button busy={busy === "tg"} onClick={async () => (setBusy("tg"), await act("telegramTest", {}, "Sent. Check Telegram."), setBusy(null))}>
                  Send a test
                </Button>
                <a href="/api/telegram/connect" className="text-a-quiet hover:text-a-ink hover:bg-a-soft inline-flex min-h-9 items-center rounded-lg px-3 text-[14px]">
                  Reconnect
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14.5px]">The bot is ready. Connect it, then press Start in the chat that opens.</p>
              <a href="/api/telegram/connect" className="bg-a-signal mt-3 inline-flex min-h-9 items-center rounded-lg px-4 text-[14px] font-semibold text-white">
                Connect Telegram
              </a>
            </>
          )}
        </Panel>

        <Panel title="iPhone shortcuts" aside="Open this page on your iPhone to install">
          <ul className="divide-a-line divide-y">
            {SHORTCUTS.map((sc) => (
              <Shortcut key={sc.id} sc={sc} ready={data.shortcuts[sc.id]} />
            ))}
          </ul>
          <p className="text-a-quiet mt-2 text-[13px]">Each one asks for the site key once, when you add it, and keeps it on your phone.</p>
        </Panel>

      </div>
    </div>
  );
}

function Shortcut({ sc, ready }: { sc: (typeof SHORTCUTS)[number]; ready: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = `${typeof location !== "undefined" ? location.origin : ""}/api/shortcuts/${sc.id}`;
  async function showQr() {
    if (qr) return setQr(null);
    const QR = await import("qrcode");
    setQr(await QR.toString(url, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }));
  }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-medium">{sc.name}</p>
          <p className="text-a-quiet text-[13.5px]">{sc.what}</p>
        </div>
        {ready ? (
          <div className="flex gap-1">
            <a href={`/api/shortcuts/${sc.id}`} className="bg-a-soft hover:bg-a-line inline-flex min-h-9 items-center rounded-lg px-3 text-[14px] font-medium">
              Install
            </a>
            <Button kind="quiet" onClick={showQr} className="hidden md:inline-flex">
              {qr ? "Hide QR" : "QR"}
            </Button>
          </div>
        ) : (
          <span className="text-a-quiet text-[13px]">Not uploaded yet</span>
        )}
      </div>
      {qr ? (
        <div className="mt-3 flex items-center gap-4">
          <div className="size-32 shrink-0 rounded-lg bg-white p-1.5 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-a-quiet text-[13px]">Point your iPhone camera at this to install it.</p>
        </div>
      ) : null}
      <p className="text-a-quiet mt-1.5 text-[12.5px] leading-snug">{sc.automate}</p>
    </li>
  );
}
