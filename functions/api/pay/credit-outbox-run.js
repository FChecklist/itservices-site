import { json, same } from "../../_lib.js";
import { runCreditOutbox } from "../../_mnp.js";
// POST /api/pay/credit-outbox-run   header x-reconcile-key: <RECONCILE_KEY>   (the scheduler calls it every 30 minutes, with /api/pay/reconcile)
// Tells Moneypenny about captured credit payments it has not been told about yet (a webhook that never came, or Moneypenny was down).
// Counts only in the answer; no e-mail leaves this route.
//   ?requeue=1  gives every dead row a fresh start (after a person fixed the key, the clock or Moneypenny).
// ALERT: when any row is dead, the answer is HTTP 503 with alert "credit_push_dead", so the scheduler's own failure notice reaches the owner
// (a customer paid and the credits did not arrive). It stays 503 until the rows are sent or dealt with.
export async function onRequestPost({ request, env }) {
  if (!env.RECONCILE_KEY || !same(request.headers.get("x-reconcile-key") ?? "", env.RECONCILE_KEY)) return new Response("Not found", { status: 404 });
  const out = await runCreditOutbox(env, env.DB, Date.now(), 25, { requeue: new URL(request.url).searchParams.get("requeue") === "1" });
  return json(out.dead_total > 0 ? { ok: false, alert: "credit_push_dead", ...out } : { ok: true, ...out }, out.dead_total > 0 ? 503 : 200);
}
export const onRequest = () => new Response("Not found", { status: 404 });
