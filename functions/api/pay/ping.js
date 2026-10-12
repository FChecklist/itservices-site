export const onRequest = () => new Response(JSON.stringify({ ok: true, service: "IT Services payments" }), { headers: { "content-type": "application/json" } });
