import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, sessionValid } from "@/lib/db";
import { AdminApp } from "@/components/admin/AdminApp";
import { Login } from "@/components/admin/Login";

export const metadata: Metadata = {
  title: "Admin, 1618",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f12" },
  ],
};

/** My control room. Behind a login; see /admin/login. */
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function AdminPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="admin min-h-svh">
      <Suspense fallback={null}>
        <Gate searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Gate({ searchParams }: { searchParams: SP }) {
  const jar = await cookies();
  if (await sessionValid(jar.get(ADMIN_COOKIE)?.value)) return <AdminApp />;
  const sp = await searchParams;
  return <Login note={"wrong" in sp ? "That's not the key." : "wait" in sp ? "Too many tries from this network. Wait 15 minutes." : null} />;
}
