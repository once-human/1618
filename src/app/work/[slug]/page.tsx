import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { projectBySlug, projects } from "@/content/projects";
import { RepoPulse } from "@/components/live/RepoPulse";
import { LivingProfile } from "@/components/live/LivingProfile";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const p = projectBySlug(slug);
  if (!p) return {};
  return { title: `${p.name} · Onkar Yaglewad`, description: p.tagline };
}

export default async function CaseStudy({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const p = projectBySlug(slug);
  if (!p) notFound();

  const i = projects.findIndex((x) => x.slug === p.slug);
  const next = projects[(i + 1) % projects.length];

  return (
    <main className="mx-auto max-w-3xl px-5 pt-24 pb-36 sm:px-8">
      <Link href="/work" className="font-mono text-xs text-muted hover:text-foreground">
        ← All work
      </Link>

      <p className="mt-12 flex flex-wrap items-center gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-200/75">
          {p.status}
        </span>
        <RepoPulse repo={p.repo} />
      </p>
      <h1 className="mt-3 text-4xl font-light tracking-tight sm:text-6xl">{p.name}</h1>
      <p className="mt-5 text-xl font-light leading-snug text-foreground/85">{p.tagline}</p>

      <dl className="mt-10 grid gap-6 border-y border-white/10 py-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Role</dt>
          <dd className="mt-1.5">{p.role}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Tags</dt>
          <dd className="mt-1.5 flex flex-wrap gap-2">
            {p.tags.map((t) => (
              <span key={t} className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <p className="mt-10 text-lg leading-relaxed text-foreground/90">{p.summary}</p>

      <div className="mt-14 space-y-12">
        {p.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted">{s.heading}</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-foreground/85">
              {s.body.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {p.links.length > 0 && (
        <ul className="mt-14 flex flex-wrap gap-3">
          {p.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full border border-white/25 px-4 py-2 font-mono text-xs transition-colors hover:bg-white/10"
              >
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-20 border-t border-white/10 pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Next</p>
        <Link
          href={`/work/${next.slug}`}
          className="mt-2 inline-block text-2xl font-light tracking-tight hover:text-amber-200"
        >
          {next.name} →
        </Link>
      </nav>
      <LivingProfile />
    </main>
  );
}
