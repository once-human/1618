import { connection } from "next/server";
import { postMessage, readThreads, THREAD } from "@/lib/talk/server";
import { SITE_URL } from "@/lib/site";

/**
 * Talk from a terminal. Terminals asking for /talk or /talk/<code> land here
 * (see next.config.ts).
 *
 *   curl -L -d "text=hey, loved the site&name=Ana" onkaryaglewad.in/talk  start a chat (name, or &anon=1)
 *   curl -L onkaryaglewad.in/talk/<code>                                 read it, with my replies
 *   curl -L -d "one more thing" onkaryaglewad.in/talk/<code>             keep going
 */
const host = SITE_URL.replace("https://", "");
const text = (s: string, status = 200) =>
  new Response(s.endsWith("\n") ? s : `${s}\n`, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const HELP = `
  Talk to Onkar from your terminal. It goes to his phone.

    curl -L -d "text=hey, loved the site&name=YourName" ${host}/talk
    curl -L -d "text=hey, loved the site&anon=1" ${host}/talk        (to stay anonymous)

  You'll get a code back. Then:

    curl -L ${host}/talk/<code>                 see the chat, with his replies
    curl -L -d "one more thing" ${host}/talk/<code>

  Or open ${SITE_URL}/talk in a browser.
`;

function codeFrom(req: Request): string | null {
  const t = new URL(req.url).searchParams.get("t");
  return t && THREAD.test(t) ? t : null;
}

function render(code: string, name: string | null, msgs: { side: string; text: string; at: string }[]) {
  const time = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
  const lines = msgs.map((m) => {
    const who = m.side === "me" ? "onkar" : (name ?? "you").toLowerCase();
    const body = m.text.split("\n").join("\n" + " ".repeat(14));
    return `  ${who.padEnd(10).slice(0, 10)}  ${body}\n  ${" ".repeat(10)}  \x1b[2m${time(m.at)} Pune time\x1b[22m`;
  });
  const waiting = msgs.at(-1)?.side !== "me";
  return `\n${lines.join("\n\n")}\n\n  ${waiting ? "No reply yet. Run this again in a bit." : ""}\n  write more:  curl -L -d "..." ${host}/talk/${code}\n  in a browser: ${SITE_URL}/talk#${code}\n`;
}

export async function GET(req: Request) {
  await connection();
  const code = codeFrom(req);
  if (!code) return text(HELP);
  const t = (await readThreads([{ id: code, after: 0 }]))[code];
  if (!t) return text("  Couldn't reach the chat store just now. Try again in a minute.", 503);
  if (!t.exists) return text("  No chat with that code (it may have been deleted).", 404);
  return text(render(code, t.name, t.messages));
}

export async function POST(req: Request) {
  const raw = (await req.text()).slice(0, 8000);
  // `-d "text=…&name=…"` or just `-d "your message"`.
  const form = new URLSearchParams(raw);
  const asForm = form.has("text");
  const input = asForm
    ? { text: form.get("text") ?? "", name: form.get("name") ?? undefined, anon: form.get("anon") ?? undefined }
    : { text: raw }; // curl -d sends the words as they are
  const code = codeFrom(req);
  const r = await postMessage(req, { ...input, thread: code ?? undefined }, "terminal");
  if (!r.ok) return text(`  ${r.reason}`, r.status);
  const note = r.live ? "It's on his phone." : "He'll see it soon and reply here.";
  return text(
    r.isNew
      ? `\n  Sent. ${note}\n\n  Your chat code: ${r.thread}\n  Keep it: it's the only key to this chat.\n\n    curl -L ${host}/talk/${r.thread}                 check for replies\n    curl -L -d "more" ${host}/talk/${r.thread}       write more\n    ${SITE_URL}/talk#${r.thread}   open it in a browser\n`
      : `  Sent. ${note}  (curl -L ${host}/talk/${r.thread} to read the chat)`,
  );
}
