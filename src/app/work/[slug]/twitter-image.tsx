import { ogCard, OG_SIZE } from "@/lib/og";
import { projectBySlug, projects } from "@/content/projects";

export const alt = "A project by Onkar Yaglewad";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = projectBySlug(slug);
  return ogCard({ word: p?.name.toLowerCase() ?? "work", line: p?.tagline ?? "Things I've built." , corner: p?.status ?? undefined });
}
