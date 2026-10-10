// Razorpay only accepts webhook addresses on the approved website, so this passes Razorpay's message on to Corporate Tambola untouched.
// The body and the x-razorpay-signature header go through byte for byte; Corporate Tambola checks the signature itself, so nothing here can be forged.
const TARGET = "https://corporate-tambola.pages.dev/api/payments/webhook";
export async function onRequestPost({ request }) {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 100_000) return new Response("Too large", { status: 413 });
  const sig = request.headers.get("x-razorpay-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  try {
    const r = await fetch(TARGET, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig }, body: raw });
    return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
  } catch {
    return new Response("Upstream unavailable", { status: 502 }); // Razorpay retries a non-2xx answer
  }
}
export const onRequest = () => new Response("Not found", { status: 404 });
