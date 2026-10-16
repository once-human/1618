import { connection } from "next/server";
import { getIssue } from "@/lib/presence/issues";

/** One monthly issue. */
export async function GET(_req: Request, ctx: RouteContext<"/api/issues/[month]">) {
  await connection();
  const { month } = await ctx.params;
  const issue = await getIssue(month);
  if (!issue) return new Response("No issue for that month", { status: 404 });
  return Response.json(issue, {
    headers: { "Cache-Control": issue.complete ? "public, s-maxage=86400" : "public, s-maxage=600" },
  });
}
