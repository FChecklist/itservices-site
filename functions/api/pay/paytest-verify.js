import { json, readJson } from "../../_lib.js";
import { confirmPaytest } from "../../_paytest.js";
// POST /api/pay/paytest-verify   (public)  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Checks Razorpay's signature AND asks Razorpay what really happened, files the test payment, and e-mails the receipt once. Safe to call again for the same payment.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 4096);
  const r = await confirmPaytest(env, b);
  return r.ok ? json(r) : json({ error: r.error }, r.status ?? 400);
}
export const onRequest = () => new Response("Not found", { status: 404 });
