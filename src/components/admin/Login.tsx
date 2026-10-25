"use client";

import { useState } from "react";

/** The one door into /admin. */
export function Login({ note }: { note: string | null }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-svh place-items-center px-5">
      <form method="post" action="/admin/login" onSubmit={() => setBusy(true)} className="w-full max-w-[22rem]">
        <p className="wide text-[44px] leading-none font-bold tracking-tight">1618</p>
        <p className="text-a-quiet mt-2 mb-8">Admin. Only Onkar gets past here.</p>
        {note ? (
          <p role="alert" className="bg-a-bad/10 text-a-bad mb-4 rounded-lg px-3 py-2 text-[14px]">
            {note}
          </p>
        ) : null}
        <label htmlFor="key" className="mb-1.5 block text-[14px] font-medium">
          Site key
        </label>
        <div className="border-a-line bg-a-panel focus-within:border-a-signal focus-within:ring-a-signal/25 flex rounded-xl border focus-within:ring-4">
          <input
            id="key"
            name="key"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-[16px] outline-none focus-visible:outline-none"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="text-a-quiet hover:text-a-ink px-3.5 text-[14px]">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <button disabled={busy} className="bg-a-ink text-a-bg mt-4 w-full rounded-xl py-3 text-[16px] font-semibold disabled:opacity-60">
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="text-a-quiet mt-5 text-[13px] leading-snug">
          You stay logged in on this browser for 30 days. Five wrong tries locks this network out for 15 minutes.
        </p>
      </form>
    </main>
  );
}
