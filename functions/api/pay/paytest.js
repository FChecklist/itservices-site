import { json, readJson } from "../../_lib.js";
import { startPaytest } from "../../_paytest.js";
// POST /api/pay/paytest   (public, no key)  { name, email, consent: true, from?: "COA"|"IDX"|"DPD"|"ITS" }
// Opens a REAL Razorpay order of Rs 1 that buys nothing (the payment test on /paytest/). The Terms-and-refund box must be ticked: the server refuses an order without it.
// The answer is what the page needs to open Razorpay Checkout: { keyId, orderId, amount_minor, currency, txn_id, prefill }. The test is filed in the central ledger as is_test = 1.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 4096);
  const r = await startPaytest(env, b);
  return r.ok ? json(r) : json({ error: r.error }, r.status ?? 400);
}
export const onRequest = () => new Response("Not found", { status: 404 });
