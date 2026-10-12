import { handleRazorpayWebhook } from "./_central.js";
// Old webhook address (may still be set in Razorpay). Same central handling as /api/pay/webhook; defaults to Corporate Tambola.
export const onRequestPost = ({ request, env }) => handleRazorpayWebhook(request, env, "corporate-tambola.pages.dev");
export const onRequest = () => new Response("Not found", { status: 404 });
