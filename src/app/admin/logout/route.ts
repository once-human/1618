import { ADMIN_COOKIE } from "@/lib/db";

/** Log this browser out of /admin. */
export async function POST() {
  const res = new Response(null, { status: 303, headers: { Location: "/admin", "Cache-Control": "no-store" } });
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  return res;
}
