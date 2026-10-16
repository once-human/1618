import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { projectBySlug, projects } from "@/content/projects";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { Updated } from "@/components/live/Updated";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const p = projectBySlug(slug);
  if (!p) return {};
  return { title: `${p.name}, Onkar Yaglewad`, description: p.tagline };
}

const cell = "border-t border-ink pt-1.5";

export default async function CaseStudy({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const p = projectBySlug(slug);
  if (!p) notFound();

  const i = projects.findIndex((x) => x.slug === p.slug);
  const next = projects[(i + 1) % projects.length];

  return (
    <>
      <Nav />
      <main className="px-4 pt-24 pb-32">
        <h1 className="bigword mb-10 -ml-[0.04em] text-[clamp(3.5rem,12vw,12rem)] whitespace-normal">{p.name}</h1>

        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className={cell}>
            <dt className="text-quiet">Status</dt>
            <dd>{p.status}</dd>
          </div>
          <div className={cell}>
            <dt className="text-quiet">Role</dt>
            <dd>{p.role}</dd>
          </div>
          <div className={cell}>
            <dt className="text-quiet">Kind</dt>
            <dd>{p.tags.join(", ")}</dd>
          </div>
          <div className={cell}>
            <dt className="text-quiet">Activity</dt>
            <dd>
              <Updated repo={p.repo} />
              {!p.repo && <span>No public repository</span>}
            </dd>
          </div>
        </dl>

        <p className="mt-16 max-w-[30ch] text-[clamp(1.4rem,2.6vw,2.2rem)] leading-[1.15] font-medium tracking-[-0.02em] md:ml-[calc(25%+0.25rem)]">
          {p.summary}
        </p>

        <div className="mt-20 space-y-12">
          {p.sections.map((s) => (
            <section key={s.heading} className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <h2 className={`${cell} col-span-2 font-semibold md:col-span-1`}>{s.heading}</h2>
              <div className={`${cell} col-span-2 max-w-[62ch] space-y-3`}>
                {s.body.map((para) => (
                  <p key={para}>{para}</p>
                ))}
              </div>
            </section>
          ))}

          {p.links.length > 0 && (
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <h2 className={`${cell} col-span-2 font-semibold md:col-span-1`}>Links</h2>
              <ul className={`${cell} col-span-2`}>
                {p.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-4 hover:decoration-2">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <Link href={`/work/${next.slug}`} className="group mt-28 block border-t border-ink pt-1.5">
          <span className="text-quiet">Next</span>
          <span className="bigword mt-4 block text-[clamp(3rem,10vw,10rem)] whitespace-normal group-hover:underline group-hover:decoration-4 group-hover:underline-offset-8">
            {next.name}
          </span>
        </Link>
      </main>
      <Footer />
    </>
  );
}
