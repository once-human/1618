import type { Metadata } from "next";
import Link from "next/link";
import { projects } from "@/content/projects";
import { RepoPulse } from "@/components/live/RepoPulse";
import { LivingProfile } from "@/components/live/LivingProfile";

export const metadata: Metadata = {
  title: "Work · Onkar Yaglewad",
  description: "Everything I've been making, as a plain list.",
};

export default function WorkIndex() {
  return (
    <main className="mx-auto max-w-4xl px-5 pt-24 pb-36 sm:px-8">
      <Link href="/" className="font-mono text-xs text-muted hover:text-foreground">
        ← Back to the day
      </Link>
      <h1 className="mt-10 text-4xl font-light tracking-tight sm:text-5xl">Work</h1>
      <p className="mt-4 max-w-xl text-muted">
        The same projects as the bag on the counter, without the scroll.
      </p>
      <ul className="mt-14 divide-y divide-white/10 border-y border-white/10">
        {projects.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/work/${p.slug}`}
              className="group flex flex-col gap-2 py-7 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
            >
              <div>
                <h2 className="text-2xl font-medium tracking-tight transition-colors group-hover:text-amber-200">
                  {p.name}
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{p.tagline}</p>
              </div>
              <span className="flex shrink-0 flex-col gap-1.5 sm:items-end">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  {p.status}
                </span>
                <RepoPulse repo={p.repo} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <LivingProfile />
    </main>
  );
}
