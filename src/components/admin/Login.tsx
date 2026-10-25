"use client";

import { useState } from "react";

/** The one door into /admin. */
export function Login({ note }: { note: string | null }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-svh place-items-center px-5">
      <form method="post" action="/admin/login" onSubmit={() => setBusy(true)} className="w-full max-w-[22rem]">
        <p className="bigword text-[clamp(4.5rem,22vw,8rem)]">admin</p>
        <p className="text-a-quiet border-a-ink mt-6 mb-8 border-t pt-1.5">1618. Only Onkar gets past here.</p>
        {note ? (
          <p role="alert" className="border-a-bad text-a-bad mb-4 border-l-2 py-1 pl-3 text-[14px]">
            {note}
          </p>
        ) : null}
        <label htmlFor="key" className="text-a-quiet block text-[14px]">
          Site key
        </label>
        <div className="border-a-line focus-within:border-a-ink flex border-b">
          <input
            id="key"
            name="key"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3 text-[18px] outline-none focus-visible:outline-none"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="text-a-quiet hover:text-a-ink pl-3.5 text-[14px]">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <button disabled={busy} className="bg-a-ink text-a-bg mt-6 w-full py-3 text-[16px] font-semibold disabled:opacity-60">
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="text-a-quiet mt-5 text-[13px] leading-snug">
          You stay logged in on this browser for 30 days. Five wrong tries locks this network out for 15 minutes.
        </p>
      </form>
    </main>
  );
}
