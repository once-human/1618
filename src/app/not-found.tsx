import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col justify-between px-4 py-4">
      <p className="border-t border-ink pt-1.5">This page doesn&apos;t exist.</p>
      <p className="bigword tnum text-[clamp(6rem,30vw,30rem)]">04:04</p>
      <Link href="/" className="border-t border-ink pt-1.5 underline-offset-4 hover:underline">
        Back to the day
      </Link>
    </main>
  );
}
