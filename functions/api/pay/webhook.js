import { handleRazorpayWebhook } from "../../_central.js";
// The one webhook address for every website: Razorpay -> here -> ledger -> the website named in the order notes (notes.site, or the product's site).
export const onRequestPost = ({ request, env }) => handleRazorpayWebhook(request, env, "corporate-tambola.pages.dev");
export const onRequest = () => new Response("Not found", { status: 404 });
