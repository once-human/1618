import Link from "next/link";
import { ViewTransition } from "react";
import { projects } from "@/content/projects";
import { Updated } from "@/components/live/Updated";

/** The index of work: one ruled row per project, linking to its page. */
export function WorkList() {
  return (
    <ul>
      {projects.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/work/${p.slug}`}
            transitionTypes={["nav-forward"]}
            className="group border-ink grid grid-cols-2 gap-x-4 gap-y-1 border-t py-4 md:grid-cols-4"
          >
            <span className="col-span-2 text-[clamp(1.6rem,3.2vw,2.6rem)] leading-none font-bold tracking-[-0.03em] md:col-span-1">
              <ViewTransition name={`project-${p.slug}`} share="morph" default="none">
                <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_2px] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 group-hover:bg-[length:100%_2px] motion-reduce:transition-none">
                  {p.name}
                </span>
              </ViewTransition>
            </span>
            <span className="col-span-2 max-w-[44ch] md:pt-1">{p.tagline}</span>
            <span className="text-quiet col-span-2 md:col-span-1 md:pt-1 md:text-right">
              {p.status}
              <Updated repo={p.repo} className="block" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
