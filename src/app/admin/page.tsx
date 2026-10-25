import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, kvGet, sessionValid } from "@/lib/db";
import { AdminApp, type Theme } from "@/components/admin/AdminApp";
import { Login } from "@/components/admin/Login";

export const metadata: Metadata = {
  title: "Admin, 1618",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#000000" };

/** My control room. Behind a login; see /admin/login. */
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function AdminPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<div className="admin min-h-svh" />}>
      <Gate searchParams={searchParams} />
    </Suspense>
  );
}

async function Gate({ searchParams }: { searchParams: SP }) {
  const jar = await cookies();
  // Light or dark: whichever I picked last, on any device. Dark until I pick.
  const [ok, saved] = await Promise.all([sessionValid(jar.get(ADMIN_COOKIE)?.value), kvGet<Theme>("admin:theme")]);
  const theme: Theme = saved?.value === "light" ? "light" : "dark";
  const sp = ok ? null : await searchParams;
  return (
    <div className="admin min-h-svh" data-theme={theme}>
      {ok ? (
        <AdminApp theme={theme} />
      ) : (
        <Login note={sp && "wrong" in sp ? "That's not the key." : sp && "wait" in sp ? "Too many tries from this network. Wait 15 minutes." : null} />
      )}
    </div>
  );
}
