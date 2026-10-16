import { isAdmin, q } from "@/lib/db";

/** Hide, show or delete a post. Admin only. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return new Response("Not allowed", { status: 401 });
  const form = await req.formData();
  const id = Number(form.get("id"));
  const action = String(form.get("action"));
  if (!Number.isInteger(id)) return new Response("Bad id", { status: 400 });
  if (action === "hide") await q("hide", (db) => db`UPDATE submissions SET hidden = true WHERE id = ${id}`);
  else if (action === "show") await q("show", (db) => db`UPDATE submissions SET hidden = false WHERE id = ${id}`);
  else if (action === "delete") await q("delete", (db) => db`DELETE FROM submissions WHERE id = ${id}`);
  else return new Response("Bad action", { status: 400 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return Response.redirect(new URL(`/admin?key=${encodeURIComponent(key)}`, req.url), 303);
}
