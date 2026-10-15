import Link from "next/link";
import { profile } from "@/content/profile";

export function Closing() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-black/80 px-5 py-16 text-center">
      <p className="text-lg font-light tracking-tight text-foreground">
        {profile.name}. {profile.role}, {profile.city}.
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted">{profile.tagline}</p>
      <nav className="mt-8 flex justify-center gap-6 font-mono text-xs text-muted">
        <Link href="/work" className="hover:text-foreground">
          All work
        </Link>
        {profile.links.github && (
          <a
            href={profile.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            GitHub ↗
          </a>
        )}
      </nav>
      <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/60">
        Built end to end. Frames still being shot.
      </p>
    </footer>
  );
}
