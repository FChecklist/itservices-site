import { reply, COOKIE } from "../../_console.js";
export const onRequestPost = () => reply({ ok: true }, 200, `${COOKIE}=; Max-Age=0; Path=/api/console; HttpOnly; Secure; SameSite=Strict`);
export const onRequest = () => new Response("Not found", { status: 404 });
