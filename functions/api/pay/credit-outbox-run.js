import { json, same } from "../../_lib.js";
import { runCreditOutbox } from "../../_mnp.js";
// POST /api/pay/credit-outbox-run   header x-reconcile-key: <RECONCILE_KEY>   (the scheduler calls it every 30 minutes, with /api/pay/reconcile)
// Tells Moneypenny about captured credit payments it has not been told about yet (a webhook that never came, or Moneypenny was down).
// Counts only in the answer; no e-mail leaves this route.
export async function onRequestPost({ request, env }) {
  if (!env.RECONCILE_KEY || !same(request.headers.get("x-reconcile-key") ?? "", env.RECONCILE_KEY)) return new Response("Not found", { status: 404 });
  return json({ ok: true, ...(await runCreditOutbox(env, env.DB)) });
}
export const onRequest = () => new Response("Not found", { status: 404 });
