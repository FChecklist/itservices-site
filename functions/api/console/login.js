import { readJson } from "../../_lib.js";
import { signIn, reply } from "../../_console.js";
// POST /api/console/login {email, passcode}: the owner's private console. Anything else answers the plain 404 of an unknown address.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 1024);
  if (!b) return reply({ error: "Not found" }, 404);
  const r = await signIn(env, Date.now(), b.email, b.passcode);
  return reply(r.body, r.status, r.cookie);
}
export const onRequest = () => new Response("Not found", { status: 404 });
