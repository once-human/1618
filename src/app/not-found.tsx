import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-6xl font-extralight tabular-nums text-muted">04:04</p>
      <p className="mt-6 text-lg font-light">Nothing here. It&apos;s the middle of the night.</p>
      <Link href="/" className="mt-8 font-mono text-xs text-muted hover:text-foreground">
        ← Back to the day
      </Link>
    </main>
  );
}
