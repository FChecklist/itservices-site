import { json, same } from "../../_lib.js";
import { runRetention, RETENTION } from "../../_retention.js";
// POST /api/pay/retention[?apply=1]   header x-reconcile-key: <RECONCILE_KEY>   (the scheduler, once a day; NOT scheduled yet)
// Removes orders that were opened and never paid, after 30 days (functions/_retention.js). Billing data is never removed. It only COUNTS unless ?apply=1 is given AND the secret RETENTION_LIVE is "1".
export async function onRequestPost({ request, env }) {
  if (!env.RECONCILE_KEY || !same(request.headers.get("x-reconcile-key") ?? "", env.RECONCILE_KEY)) return new Response("Not found", { status: 404 });
  if (!env.DB) return json({ error: "no database" }, 503);
  const live = env.RETENTION_LIVE === "1", apply = live && new URL(request.url).searchParams.get("apply") === "1";
  try { return json({ ok: true, live, applied: apply, dry_run: !apply, periods: RETENTION, result: await runRetention(env, { apply }) }); }
  catch (e) { return json({ error: String(e.message ?? e).slice(0, 200) }, 500); }
}
export const onRequest = () => new Response("Not found", { status: 404 });
