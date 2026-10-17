"use client";

import { useState } from "react";

/**
 * A message, readable: `inline code`, ```fenced blocks``` (with a copy
 * button), and links that open. Built from React elements, never raw HTML,
 * so nothing anyone types can run on the page.
 */
const FENCE = /```([\w+#.-]*)\n?([\s\S]*?)```/g;
const INLINE = /(`[^`\n]+`)/g;
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

export function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    if (m.index! > last) out.push(<Inline key={`t${last}`} text={text.slice(last, m.index)} />);
    out.push(<Code key={`c${m.index}`} lang={m[1]} code={m[2].replace(/\n$/, "")} />);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(<Inline key={`t${last}`} text={text.slice(last)} />);
  return <>{out}</>;
}

function Inline({ text }: { text: string }) {
  const trimmed = text.replace(/^\n+|\n+$/g, "");
  if (!trimmed) return null;
  return (
    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {trimmed.split(INLINE).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="bg-ink/[0.07] rounded-[3px] px-1 py-px font-mono text-[0.88em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part.split(URL_RE).map((p, j) =>
            j % 2 ? (
              <a key={`${i}-${j}`} href={p} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline decoration-1 underline-offset-2 hover:decoration-2">
                {p.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ) : (
              p
            ),
          )
        ),
      )}
    </span>
  );
}

function Code({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="bg-ink text-paper my-2 block overflow-hidden rounded-[4px] text-left">
      <span className="flex items-center justify-between gap-3 border-b border-white/15 px-3 py-1 font-mono text-[11px] opacity-70">
        <span>{lang || "code"}</span>
        <button
          type="button"
          className="hover:opacity-100"
          onClick={() =>
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            })
          }
        >
          {copied ? "copied" : "copy"}
        </button>
      </span>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed">{code}</pre>
    </span>
  );
}
