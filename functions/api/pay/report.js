import { json, same } from "../../_lib.js";
import { buildReport } from "../../_report.js";
// POST /api/pay/report?kind=daily|monthly|fy[&email=1]    header x-report-key: <REPORT_KEY>   (the private ledger-reports repository, on a schedule)
// Builds the owner's ledger report (A Razorpay / B central / C websites: revenue, expense, profit and loss) and answers it as JSON { subject, markdown, html }.
// With email=1 it is also e-mailed to the owner (fixed address, not a parameter). Nothing is stored except a line in report_log.
const OWNER_EMAIL = "raajat.agarwal@gmail.com";
export async function onRequestPost({ request, env }) {
  if (!env.REPORT_KEY || !same(request.headers.get("x-report-key") ?? "", env.REPORT_KEY)) return new Response("Not found", { status: 404 });
  const u = new URL(request.url), kind = ["daily", "monthly", "fy"].includes(u.searchParams.get("kind")) ? u.searchParams.get("kind") : "monthly";
  let rep;
  try { rep = await buildReport(env, kind); } catch (e) { return json({ error: "report failed: " + String(e.message ?? e).slice(0, 200) }, 500); }
  let emailed = 0, status = "not requested";
  if (u.searchParams.get("email") === "1") {
    if (!env.RESEND_API_KEY) status = "no mail key";
    else {
      try {
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({ from: env.MAIL_FROM ?? "IT Services Ledger <onboarding@resend.dev>", to: [OWNER_EMAIL], subject: rep.subject, html: rep.html, text: rep.markdown, headers: { "Auto-Submitted": "auto-generated" } }) });
        emailed = r.ok ? 1 : 0; status = r.ok ? "sent" : "refused " + r.status + " " + (await r.text()).slice(0, 160);
      } catch (e) { status = "mail error " + String(e.message ?? e).slice(0, 100); }
    }
  }
  await env.DB.prepare("INSERT INTO report_log(made_ms,kind,emailed,email_status,bytes) VALUES(?,?,?,?,?)").bind(Date.now(), kind, emailed, status, rep.markdown.length).run();
  return json({ ok: true, kind, emailed, email_status: status, subject: rep.subject, markdown: rep.markdown, html: rep.html });
}
export const onRequest = () => new Response("Not found", { status: 404 });
