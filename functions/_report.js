import { rzpFetch } from "./_lib.js";
// The owner's ledger report for A (Razorpay), B (this central ledger) and C (each website's own ledger): revenue, expense, profit and loss.
// Built from the database and Razorpay's API only; nothing is typed in. Returns { subject, markdown, html }.
const IST = 19800_000;
const money = (n, cur = "INR") => (cur === "USD" ? "US$ " : "Rs ") + (Math.round(Number(n || 0) * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const istDate = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const istStamp = (ms) => new Date(ms + IST).toISOString().replace("T", " ").slice(0, 16) + " IST";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function periodOf(kind, now) {
  const d = new Date(now + IST), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const midnight = Date.UTC(y, m, d.getUTCDate()) - IST;
  if (kind === "daily") return { label: "Yesterday", from: midnight - 86400_000, to: midnight, key: istDate(midnight - 86400_000) };
  if (kind === "fy") { const fy = m >= 3 ? y : y - 1; return { label: `Financial year ${fy}-${String(fy + 1).slice(2)} to date`, from: Date.UTC(fy, 3, 1) - IST, to: now, key: `${fy}-${String(fy + 1).slice(2)}` }; }
  return { label: "This month to date", from: Date.UTC(y, m, 1) - IST, to: now, key: `${y}-${String(m + 1).padStart(2, "0")}` };
}
const table = (head, rows) => ({ head, rows });
function md(t) { return t.rows.length ? `| ${t.head.join(" | ")} |\n|${t.head.map(() => "---").join("|")}|\n` + t.rows.map((r) => `| ${r.join(" | ")} |`).join("\n") : "_none_"; }
function html(t) { return t.rows.length ? `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font:13px Arial,sans-serif"><tr>${t.head.map((h) => `<th style="border:1px solid #ccc;background:#f2f2f2;text-align:left">${esc(h)}</th>`).join("")}</tr>${t.rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>` : "<p><i>none</i></p>"; }

export async function buildReport(env, kind, now = Date.now()) {
  const db = env.DB, P = periodOf(kind, now), sites = ((await db.prepare("SELECT host, name FROM site ORDER BY name").all()).results ?? []);
  const nameOf = Object.fromEntries(sites.map((s) => [s.host, s.name]));
  const sections = [];
  const add = (title, note, tbl) => sections.push({ title, note, tbl });

  // ---- B: central ledger -------------------------------------------------------
  const lines = ((await db.prepare("SELECT site, currency, line_type, ROUND(SUM(amount),2) AS amt, COUNT(*) AS n FROM pnl_lines WHERE date_ms >= ? AND date_ms < ? GROUP BY site, currency, line_type").bind(P.from, P.to).all()).results ?? []);
  const bySite = {};
  for (const l of lines) { const k = `${l.site ?? "company"}|${l.currency}`; (bySite[k] ??= { site: l.site, cur: l.currency }); bySite[k][l.line_type] = l.amt; bySite[k]["n_" + l.line_type] = l.n; }
  const pnlRows = Object.values(bySite).map((r) => {
    const rev = r.sale || 0, exp = (r.gateway_fee || 0) + (r.gateway_tax || 0) + (r.refund || 0) + (r.dispute_lost || 0) + (r.commission_paid || 0) + (r.expense || 0), accr = r.commission_accrued || 0;
    return [nameOf[r.site] ?? r.site ?? "Company", r.cur, money(rev, r.cur), money((r.gateway_fee || 0) + (r.gateway_tax || 0), r.cur), money(r.refund || 0, r.cur), money(r.commission_paid || 0, r.cur), money(r.commission_accrued || 0, r.cur), money(r.expense || 0, r.cur), money(rev - exp, r.cur), money(rev - exp - accr, r.cur)];
  });
  add(`B. Profit and loss: ${P.label} (${istDate(P.from)} to ${istDate(P.to - 1)})`, "Revenue = captured sales. Expense = Razorpay fee and GST on the fee, refunds, lost disputes, commission paid, bills entered. Net cash = revenue - expense. After accrued also takes off commission earned but not yet paid.",
    table(["Website", "Cur", "Revenue", "Gateway fee+GST", "Refunds", "Commission paid", "Commission accrued", "Other expense", "Net cash", "Net after accrued"], pnlRows));
  const fyRows = ((await db.prepare("SELECT * FROM pnl_summary WHERE financial_year=? ORDER BY site").bind(periodOf("fy", now).key).all()).results ?? []).map((r) => [nameOf[r.site] ?? r.site, r.currency, money(r.revenue, r.currency), money(r.gateway_fee + r.gateway_tax, r.currency), money(r.refunds, r.currency), money(r.commission_paid, r.currency), money(r.commission_accrued, r.currency), money(r.other_expense, r.currency), money(r.net_cash, r.currency), money(r.net_after_accrued, r.currency)]);
  add(`B. Financial year ${periodOf("fy", now).key} to date, per website`, "Same columns, whole financial year.", table(["Website", "Cur", "Revenue", "Gateway fee+GST", "Refunds", "Commission paid", "Commission accrued", "Other expense", "Net cash", "Net after accrued"], fyRows));
  const att = ((await db.prepare("SELECT site, status, COUNT(*) AS n FROM payment WHERE is_test=0 AND COALESCE(captured_ms,failed_ms,created_ms) >= ? AND COALESCE(captured_ms,failed_ms,created_ms) < ? GROUP BY site, status").bind(P.from, P.to).all()).results ?? []).map((r) => [nameOf[r.site] ?? r.site, r.status, String(r.n)]);
  add("B. Payment attempts in the period (success and failure)", "A website payment can have several attempts; only a captured one is revenue. Payment tests are on their own line below.", table(["Website", "Status", "Attempts"], att));
  const fails = ((await db.prepare("SELECT COALESCE(error_reason,error_code,'unknown') AS why, COUNT(*) AS n FROM payment WHERE status='failed' AND is_test=0 AND COALESCE(failed_ms,created_ms) >= ? AND COALESCE(failed_ms,created_ms) < ? GROUP BY 1 ORDER BY n DESC LIMIT 8").bind(P.from, P.to).all()).results ?? []).map((r) => [r.why, String(r.n)]);
  add("B. Why payments failed", "From Razorpay's error fields.", table(["Reason", "Attempts"], fails));
  const tests = ((await db.prepare("SELECT site, COALESCE(test_from,'-') AS from_site, SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_n, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_n, COALESCE(SUM(CASE WHEN status='paid' THEN amount_minor ELSE 0 END),0) AS amt, COALESCE(SUM(CASE WHEN status='paid' THEN fee_minor ELSE 0 END),0) AS fee, COALESCE(SUM(refunded_minor),0) AS ref FROM payment WHERE is_test=1 AND COALESCE(captured_ms,failed_ms,created_ms) >= ? AND COALESCE(captured_ms,failed_ms,created_ms) < ? GROUP BY site, COALESCE(test_from,'-') ORDER BY site").bind(P.from, P.to).all()).results ?? []).map((r) => [nameOf[r.site] ?? r.site, r.from_site, String(r.paid_n), String(r.failed_n), money(r.amt / 100), money(r.fee / 100), money(r.ref / 100)]);
  add("B. Payment tests (Rs 1, buy nothing, not sales)", "Real money in Razorpay but not revenue: they are left out of the profit and loss, tax, commission and the website comparison. Fee includes GST on the fee.", table(["Website", "Started from", "Tests paid", "Tests failed", "Amount received", "Razorpay fee", "Refunded"], tests));
  const com = ((await db.prepare("SELECT site, status, COUNT(*) AS n, ROUND(SUM(amount_minor)/100.0,2) AS amt FROM payout GROUP BY site, status ORDER BY site").all()).results ?? []).map((r) => [nameOf[r.site] ?? r.site, r.status, String(r.n), money(r.amt)]);
  add("B. Commission and payouts (all time)", "planned/approved = accrued, not paid yet. paid needs a bank or Razorpay reference.", table(["Website", "Status", "Rows", "Amount"], com));
  const exp = ((await db.prepare("SELECT incurred_ms, site, category, description, amount_minor, tax_minor, currency, doc_ref FROM expense WHERE incurred_ms >= ? AND incurred_ms < ? ORDER BY incurred_ms").bind(P.from, P.to).all()).results ?? []).map((r) => [istDate(r.incurred_ms), nameOf[r.site] ?? r.site ?? "Company", r.category, r.description, money((r.amount_minor + r.tax_minor) / 100, r.currency), r.doc_ref]);
  add("B. Expenses entered (bills)", "Razorpay fees are not listed here; they come from each payment.", table(["Date", "Website", "Category", "Description", "Amount", "Bill no."], exp));
  const dsp = ((await db.prepare("SELECT rzp_dispute_id, site, status, phase, amount_minor, currency, reason_description FROM dispute WHERE status IN ('open','under_review') ORDER BY created_ms").all()).results ?? []).map((r) => [r.rzp_dispute_id, nameOf[r.site] ?? r.site, r.status, r.phase ?? "", money(r.amount_minor / 100, r.currency), r.reason_description ?? ""]);
  add("B. Disputes waiting for a reply", "Reply in the Razorpay dashboard before the deadline.", table(["Dispute", "Website", "Status", "Phase", "Amount", "Reason"], dsp));

  // ---- A: Razorpay itself ------------------------------------------------------
  let aRows = [], aNote = "Read from Razorpay's API for the same period. Includes the Rs 1 payment tests.";
  try {
    const sums = {}; let skip = 0;
    for (let page = 0; page < 10; page++, skip += 100) {
      const d = await rzpFetch(env, `/payments?from=${Math.floor(P.from / 1000)}&to=${Math.floor(P.to / 1000)}&count=100&skip=${skip}`);
      for (const p of d.items ?? []) { const s = (sums[p.currency] ??= { n: 0, cap: 0, capAmt: 0, failed: 0, fee: 0, tax: 0, ref: 0, none: 0 }); s.n++; if (p.status === "captured" || p.status === "refunded") { s.cap++; s.capAmt += p.amount; s.fee += p.fee || 0; s.tax += p.tax || 0; s.ref += p.amount_refunded || 0; if (!p.notes?.site) s.none++; } else if (p.status === "failed") s.failed++; }
      if ((d.items ?? []).length < 100) break;
    }
    aRows = Object.entries(sums).map(([c, s]) => [c, String(s.n), String(s.cap), money(s.capAmt / 100, c), String(s.failed), money(s.fee / 100, c), money(s.tax / 100, c), money(s.ref / 100, c), String(s.none)]);
  } catch (e) { aNote = "Razorpay could not be read just now: " + String(e.message ?? e).slice(0, 120); }
  add(`A. Razorpay's own figures: ${P.label}`, aNote, table(["Cur", "All attempts", "Captured", "Captured amount", "Failed", "Fee incl. GST", "GST on fee", "Refunded", "Captured but no website tag"], aRows));
  const settle = ((await db.prepare("SELECT settlement_id, utr, status, amount_minor, fees_minor, tax_minor, created_ms FROM settlement WHERE created_ms >= ? AND created_ms < ? ORDER BY created_ms").bind(P.from, P.to).all()).results ?? []).map((r) => [r.settlement_id, r.utr ?? "", r.status ?? "", money((r.amount_minor ?? 0) / 100), money((r.fees_minor ?? 0) / 100), istDate(r.created_ms)]);
  add("A. Settlements to the bank (from Razorpay's settlement events)", "The UTR matches the bank statement.", table(["Settlement", "UTR", "Status", "Amount", "Fees", "Date"], settle));

  // ---- A vs B vs C --------------------------------------------------------------
  const siteSum = new Map(((await db.prepare("SELECT * FROM site_summary WHERE period_key=?").bind(P.key).all()).results ?? []).map((r) => [r.site, r]));
  const bMonth = ((await db.prepare("SELECT site, currency, ROUND(SUM(CASE WHEN line_type='sale' THEN amount ELSE 0 END)*100) AS rev, SUM(CASE WHEN line_type='sale' THEN 1 ELSE 0 END) AS n FROM pnl_lines WHERE date_ms >= ? AND date_ms < ? GROUP BY site, currency").bind(P.from, P.to).all()).results ?? []);
  // Payment tests are not sales in B. A website may still count its own Rs 1 test in C (the games do), so C matches when it equals B, or B plus the tests.
  const tMonth = ((await db.prepare("SELECT site, COUNT(*) AS n, COALESCE(SUM(amount_minor),0) AS rev FROM payment WHERE is_test=1 AND status='paid' AND currency='INR' AND captured_ms >= ? AND captured_ms < ? GROUP BY site").bind(P.from, P.to).all()).results ?? []);
  const abc = sites.map((s) => {
    const b = bMonth.find((x) => x.site === s.host && x.currency === "INR") ?? { rev: 0, n: 0 }, t = tMonth.find((x) => x.site === s.host) ?? { rev: 0, n: 0 }, c = siteSum.get(s.host);
    const same = c && c.paid_count === b.n && c.revenue_minor === b.rev, withTests = c && t.n > 0 && c.paid_count === b.n + t.n && c.revenue_minor === b.rev + t.rev;
    return [s.name, `${b.n} / ${money(b.rev / 100)}` + (t.n ? ` (+${t.n} payment tests)` : ""), c ? `${c.paid_count} / ${money(c.revenue_minor / 100)}` : "not reported yet", c ? (same ? "match" : withTests ? "match (counts its payment tests)" : "DIFFERENT") : "-"];
  });
  add("A / B / C check: sales count / revenue, central ledger (B) against each website's own ledger (C)", kind === "daily" ? "Daily check uses the yesterday period; the websites report their month." : "Each website reports its own totals to the central ledger every day.", table(["Website", "B central", "C website", "Result"], abc));
  const issues = ((await db.prepare("SELECT issue, site, ref, ids FROM ledger_issues").all()).results ?? []).map((r) => [r.issue, nameOf[r.site] ?? r.site ?? "", r.ref ?? "", r.ids ?? ""]);
  add("Ledger problems (this list should be empty)", "Anything here needs a look: duplicates, missing ids, commission without a paid sale, disputes waiting.", table(["Problem", "Website", "Reference", "Ids"], issues));
  const rec = (await db.prepare("SELECT * FROM recon_run ORDER BY id DESC LIMIT 1").first());
  add("Last comparison with Razorpay", "Runs every 30 minutes.", table(["Run at", "Razorpay payments seen", "Filed now", "Without website", "Missing in Razorpay", "Amount differences", "Duplicates"], rec ? [[istStamp(rec.run_ms), String(rec.razorpay_seen), String(rec.filed), String(JSON.parse(rec.unassigned || "[]").length), String(JSON.parse(rec.missing_in_razorpay || "[]").length), String(JSON.parse(rec.amount_mismatch || "[]").length), String(JSON.parse(rec.duplicate_paid || "[]").length)]] : []));

  const title = `Ledger report (${kind}) - ${P.label} - IT SERVICES BY RAJAT AGARWAL`;
  const markdown = `# ${title}\n\nGenerated ${istStamp(now)}. Owner only. A = Razorpay, B = central ledger of IT Services by Rajat Agarwal, C = each website's own ledger.\n\n` + sections.map((s) => `## ${s.title}\n\n_${s.note}_\n\n${md(s.tbl)}\n`).join("\n");
  const htmlOut = `<div style="font:14px Arial,sans-serif;max-width:900px"><h2>${esc(title)}</h2><p style="color:#555">Generated ${esc(istStamp(now))}. Owner only. A = Razorpay, B = central ledger of IT Services by Rajat Agarwal, C = each website's own ledger.</p>` + sections.map((s) => `<h3>${esc(s.title)}</h3><p style="color:#555;margin:2px 0 8px"><i>${esc(s.note)}</i></p>${html(s.tbl)}`).join("") + "</div>";
  return { subject: title, markdown, html: htmlOut, period: P };
}
