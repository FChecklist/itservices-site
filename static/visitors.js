// The owner's private visitor dashboard. Runs only for the signed-in owner; every number comes from /api/console/visitors. Nothing is stored in the browser.
// Everything is written as plain text (textContent), never as markup, so a value that came from a visitor can never run as a page.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var num = function (n) { return n == null ? "–" : Number(n).toLocaleString("en-IN"); };
  var pct = function (n) { return n == null ? "–" : n + "%"; };
  var secs = function (ms) { return ms ? Math.round(ms / 1000) + " s" : "–"; };
  var when = function (ms) { return ms ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "never"; };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = String(text); if (cls) e.className = cls; return e; };
  var STEP = { visit: "Visited", pricing: "Looked at pricing", signin: "Signed in", create: "Created something", published: "Published", paypage: "Reached the pay page", paid: "Paid" };
  var KIND = { pv: "Opened page", exit: "Left page", sec: "Read section", act: "Clicked / did" };
  var state = { site: "", from: "", to: "" };

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function tile(label, value, sub) { var t = el("div", null, "tile"); t.appendChild(el("div", value, "v")); t.appendChild(el("div", label, "l")); if (sub) t.appendChild(el("div", sub, "s")); return t; }
  function table(into, head, rows, numFrom) {
    clear(into); var w = el("div", null, "scroll"), t = el("table"), h = el("tr");
    head.forEach(function (x, i) { h.appendChild(el("th", x, numFrom != null && i >= numFrom ? "n" : "")); }); var th = el("thead"); th.appendChild(h); t.appendChild(th);
    var b = el("tbody");
    if (!rows.length) { var r0 = el("tr"), c0 = el("td", "Nothing yet"); c0.colSpan = head.length; r0.appendChild(c0); b.appendChild(r0); }
    rows.forEach(function (r) { var tr = el("tr"); r.forEach(function (v, i) { tr.appendChild(el("td", v, numFrom != null && i >= numFrom ? "n" : "")); }); b.appendChild(tr); });
    t.appendChild(b); w.appendChild(t); into.appendChild(w);
  }
  var tally = function (id, rows) { table($(id), ["Name", "Visitors"], (rows || []).map(function (x) { return [x.k, num(x.n)]; }), 1); };
  var trend = function (id, rows) { table($(id), ["Period", "Visits", "People", "New", "Back again", "Robots"], (rows || []).slice().reverse().slice(0, 60).map(function (x) { return [x.period, num(x.sessions), num(x.visitors), num(x.newVisitors), num(x.returningVisitors), num(x.bots)]; }), 1); };

  function query(extra) {
    var q = []; if (state.site) q.push("site=" + encodeURIComponent(state.site)); if (state.from) q.push("from=" + encodeURIComponent(state.from)); if (state.to) q.push("to=" + encodeURIComponent(state.to));
    return "/api/console/visitors" + (q.length || extra ? "?" + q.concat(extra ? [extra] : []).join("&") : "");
  }

  var filled = false;
  function render(d) {
    $("gate").hidden = true;
    if (!filled) { filled = true; (d.coverage || []).forEach(function (c) { var o = el("option", c.name); o.value = c.site; $("site").appendChild(o); }); } // the website list comes from the first answer, so it cannot drift from the real list
    $("asOf").textContent = "Dates " + d.fromDay + " to " + d.toDay + ", " + (d.site === "all" ? "all websites" : d.site) + ". Updated " + when(d.asOf) + ".";
    var h = d.humans, tl = $("tiles"); clear(tl);
    tl.appendChild(tile("People", num(h.visitors), num(h.newVisitors) + " new, " + num(h.returningVisitors) + " came back"));
    tl.appendChild(tile("Visits", num(h.sessions), num(h.returningIps) + " network addresses came again"));
    tl.appendChild(tile("Pages per visit", h.avgPagesPerSession, pct(h.singlePageShare) + " left after one page"));
    tl.appendChild(tile("Time on last page", secs(h.avgTimeOnLastPageMs), "scrolled " + pct(h.avgScrollPct)));
    tl.appendChild(tile("Robots and crawlers", num(d.bots.sessions), "not counted as people"));
    var p = $("privacy"), priv = 0; (d.privateCounts || []).forEach(function (x) { if (x.dim === "gpc_visit") priv += x.n || 0; });
    p.hidden = !priv; p.textContent = priv ? num(priv) + " visits came from people who asked not to be tracked (Global Privacy Control or Do Not Track). They are only counted here, with no path, no address, nothing else." : "";
    var csv = $("csv"); clear(csv);
    [["sessions", "Every visit"], ["events", "Every click and page"], ["pages", "Pages"], ["daily", "Day by day"]].forEach(function (k, i) { var a = el("a", k[1]); a.href = query("csv=" + k[0]); a.download = ""; if (i) csv.appendChild(document.createTextNode("  ·  ")); csv.appendChild(a); });
    table($("coverage"), ["Website", "Reporting", "Visits ever seen", "Last visit"], (d.coverage || []).map(function (c) { return [c.name, c.sessionsEver ? "Yes" : "Not yet", num(c.sessionsEver), when(c.lastSeenMs)]; }), 2);
    table($("bySite"), ["Website", "People", "New", "Back", "Visits", "Pages/visit", "Signed in", "Paid", "Robots", "Last visit"], (d.bySite || []).map(function (s) { return [s.name, num(s.visitors), num(s.newVisitors), num(s.returningVisitors), num(s.sessions), s.avgPages, num(s.reachedSignin), num(s.paid), num(s.bots), when(s.lastSeenMs)]; }), 1);
    var f = $("funnel"); clear(f); var top = Math.max(1, (d.funnel[0] || {}).visitors || 1);
    (d.funnel || []).forEach(function (x) { var r = el("div"), t = el("div", null, "t"), i = el("i"); i.style.width = Math.max(0, Math.round((x.visitors / top) * 100)) + "%"; t.appendChild(i); r.appendChild(el("span", STEP[x.step] || x.step)); r.appendChild(t); r.appendChild(el("span", num(x.visitors) + (x.ofVisits == null ? "" : " (" + x.ofVisits + "%)"))); f.appendChild(r); });
    trend("daily", d.daily); trend("weekly", d.weekly);
    table($("pages"), ["Website", "Page", "Views", "Visits", "Left here", "Seconds", "Scroll"], (d.pages || []).map(function (x) { return [x.site, x.path, num(x.views), num(x.sessions), num(x.leaves), Math.round(x.avgTimeMs / 1000), pct(x.avgScrollPct)]; }), 2);
    table($("sections"), ["Website", "Section", "Visits that read it", "Average seconds"], (d.sections || []).map(function (x) { return [x.site, x.section, num(x.views), Math.round(x.avgDwellMs / 1000)]; }), 2);
    table($("actions"), ["Website", "What", "Where to", "Times"], (d.actions || []).map(function (x) { return [x.site, x.name, x.dest || "", num(x.n)]; }), 3);
    tally("sources", d.sources); tally("campaigns", d.campaigns);
    table($("conv"), ["Source", "People", "Signed in", "Published", "Paid"], (d.convertedBySource || []).map(function (x) { return [x.src + (x.label ? " / " + x.label : ""), num(x.visitors), num(x.signin), num(x.published), num(x.paid)]; }), 1);
    tally("entry", d.entryPages); tally("exit", d.exitPages); tally("exitsec", d.exitSections);
    ["countries", "cities", "networks", "devices", "browsers", "systems", "languages"].forEach(function (k) { tally(k, d[k]); });
    table($("bots"), ["Robot", "Visits", "Last seen", "Pages it opened"], ((d.bots || {}).crawlers || []).map(function (c) { return [c.name, num(c.sessions), when(c.lastMs), c.pages.join(", ")]; }), 1);
    ipBox(d.fullIp);
  }

  function ipBox(on) {
    $("ipnote").textContent = on ? "Full network addresses are being KEPT (for 30 days, then erased)." : "Only a shortened address (the last part hidden) and a scrambled code are kept. Full addresses are not stored.";
    var b = $("ipbox"); clear(b);
    if (on) { var w = el("div", "This is ON. Every website's privacy text must say that full network addresses are kept for 30 days. Turn it off unless that is the case.", "warn"); b.appendChild(w); }
    var btn = el("button", on ? "Turn full addresses OFF" : "Turn full addresses ON", on ? "" : "quiet"); btn.type = "button";
    btn.addEventListener("click", function () {
      if (!on && !window.confirm("Keep full network addresses for 30 days? Each website's privacy text must say so first. Nothing already stored changes.")) return;
      fetch("/api/console/visitors", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullIp: !on }) })
        .then(function (r) { return r.json(); }).then(function (j) { ipBox(!!j.fullIp); }).catch(function () { $("ipnote").textContent = "No connection."; });
    });
    b.appendChild(btn);
  }

  function showJourney(j) {
    var box = $("journey"); clear(box);
    box.appendChild(el("p", "Found by " + j.by + ". First seen " + when(j.firstSeenMs) + ". " + j.visits + " visit(s) on " + (j.sites.join(", ") || "no website") + ".", "note"));
    (j.sessions || []).forEach(function (s) {
      var v = el("div", null, "vis");
      v.appendChild(el("div", s.site + " · " + when(s.first_ms) + " · " + (s.is_bot ? "robot" : "person") + " · visit " + s.visit_no + " · " + [s.country, s.city, s.network].filter(Boolean).join(" / ") + " · " + [s.device, s.browser, s.os].filter(Boolean).join(" / ")));
      v.appendChild(el("div", "Came from: " + (s.src || "direct") + (s.ref_host ? " / " + s.ref_host : "") + (s.utm_campaign ? " · campaign " + s.utm_campaign : "") + " · address " + (s.ip_full || s.ipshort || "–") + " · steps: " + ((s.stepNames || []).map(function (x) { return STEP[x] || x; }).join(", ") || "–"), "note"));
      (s.events || []).forEach(function (e) {
        var t = e.at_ms ? new Date(e.at_ms).toLocaleTimeString("en-IN") : "";
        var what = (KIND[e.kind] || e.kind) + (e.path ? " " + e.path : "") + (e.name ? " · " + e.name : "") + (e.val ? " → " + e.val : "") + (e.kind === "exit" && e.n ? " · " + Math.round(e.n / 1000) + " s" : "") + (e.kind === "exit" && e.x != null ? " · scrolled " + e.x + "%" : "") + (e.kind === "sec" && e.n ? " · " + Math.round(e.n / 1000) + " s" : "");
        v.appendChild(el("div", t + "  " + what, "ev"));
      });
      box.appendChild(v);
    });
  }

  function load() {
    $("asOf").textContent = "Loading…";
    fetch(query(), { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { if (r.status === 404) { $("gate").hidden = false; $("asOf").textContent = ""; return null; } return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (!x) return; if (!x.ok) { $("asOf").textContent = x.j.error || "Could not load."; return; } render(x.j); })
      .catch(function () { $("asOf").textContent = "No connection. Try again."; });
  }

  $("go").addEventListener("click", function () { state.site = $("site").value; state.from = $("from").value; state.to = $("to").value; load(); });
  $("jform").addEventListener("submit", function (e) {
    e.preventDefault(); var id = $("jid").value.trim(); if (!id) return; $("jmsg").textContent = "Looking…"; clear($("journey"));
    fetch("/api/console/visitors?journey=" + encodeURIComponent(id), { credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (!x.ok) { $("jmsg").textContent = "Nobody found with that code."; return; } $("jmsg").textContent = ""; showJourney(x.j); })
      .catch(function () { $("jmsg").textContent = "No connection."; });
  });
  load();
})();
