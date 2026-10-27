// The owner's private console. Runs only for the one signed-in owner; every number comes from /api/console/data. Nothing is stored in the browser.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var num = function (n) { return n == null ? "–" : Number(n).toLocaleString("en-IN"); };
  var inr = function (minor) { return "₹" + (Number(minor || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }); };
  var day = function (iso) { return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "–"; };
  var tile = function (label, value, sub) { return '<div class="tile"><div class="v">' + esc(value) + '</div><div class="l">' + esc(label) + '</div>' + (sub ? '<div class="s">' + esc(sub) + '</div>' : "") + "</div>"; };
  var table = function (head, rows) { return '<div class="scroll"><table><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + (rows.length ? rows.join("") : '<tr><td colspan="' + head.length + '">Nothing yet</td></tr>') + "</tbody></table></div>"; };

  function render(d) {
    var t = d.tambola || {}, g = t.games || {}, p = t.players || {}, o = t.organizers || {};
    var tiles = [];
    if (!t.error) {
      tiles.push(tile("Games made (Tambola)", num(g.made), num(g.kept) + " still kept"));
      tiles.push(tile("Games completed", num(g.completed), num(g.started) + " started, " + num(g.cancelled) + " cancelled"));
      tiles.push(tile("Players ever joined", num(p.everJoined), "biggest game " + num(p.biggestGame)));
      tiles.push(tile("Organizers", num(o.distinct), num(o.paying) + " paying"));
      tiles.push(tile("Version live", t.release ? t.release.version : "–", t.release ? t.release.date + " · " + t.release.releases + " releases" : ""));
    }
    var paid = 0, rev = 0, pass = 0, fail = 0;
    (d.sites || []).forEach(function (s) { paid += s.paidOrders || 0; rev += s.revenueMinor || 0; if (s.tests) { pass += s.tests.passed || 0; fail += s.tests.failed || 0; } });
    tiles.push(tile("Paid orders, all sites", num(paid), inr(rev)));
    tiles.push(tile("Tests passed (recorded)", num(pass), num(fail) + " failing · as of " + d.factsAsOf));
    $("tiles").innerHTML = tiles.join("");
    $("tambolaNote").textContent = t.error ? "Corporate Tambola numbers: " + t.error : "";
    $("sites").innerHTML = table(["Website", "Live", "Version / build", "Tests", "Paid orders", "Money", "Last payment"], (d.sites || []).map(function (s) {
      var lv = s.live ? (s.live.up ? "up" : "DOWN " + (s.live.status || "")) : "–";
      var ver = s.host === "corporate-tambola.pages.dev" && t.release ? t.release.version + (s.live && s.live.commit ? " · " + String(s.live.commit).slice(0, 7) : "") : (s.live && s.live.commit ? String(s.live.commit).slice(0, 7) : "–");
      var ts = s.tests ? (s.tests.passed != null ? num(s.tests.passed) + " pass / " + num(s.tests.failed) + " fail" : "see note") : "not recorded";
      return "<tr><td>" + (s.url ? '<a href="' + esc(s.url) + '" rel="noreferrer" target="_blank">' + esc(s.name) + "</a>" : esc(s.name)) + "</td><td>" + esc(lv) + "</td><td>" + esc(ver) + "</td><td>" + esc(ts) + "</td><td>" + num(s.paidOrders) + "</td><td>" + inr(s.revenueMinor) + "</td><td>" + esc(day(s.lastPaid)) + "</td></tr>";
    }));
    $("upcoming").innerHTML = t.error ? "" : table(["Upcoming game", "Size", "Pack", "Starts"], (t.upcoming || []).map(function (u) { return "<tr><td>" + esc(u.id) + "</td><td>" + num(u.cap) + "</td><td>" + num(u.pack) + "</td><td>" + esc(day(u.starts)) + "</td></tr>"; }));
    var rows = (d.payers || []).map(function (x) { return "<tr><td>" + esc(x.email || "–") + "</td><td>" + esc(x.phone || "not given") + "</td><td>" + esc(x.site) + "</td><td>" + esc(x.currency) + " " + num(x.amount) + "</td><td>" + esc(day(x.paid)) + "</td></tr>"; });
    $("people").innerHTML = table(["E-mail", "Mobile", "Site", "Paid", "When"], rows);
    $("peopleNote").textContent = "Organizers and hosts who PAID, from the central ledger. " + (t.mobileNote || "") + " Organizers who never paid are not listed (Tambola keeps their sign-in e-mail only as a one-way hash).";
    $("asOf").textContent = "Updated " + day(d.asOf);
  }
  var STATE = { active: "Ready", used: "Used", expired: "Ended", off: "Switched off" };
  function renderLinks(d) {
    var html = "";
    (d.games || []).forEach(function (g) {
      html += "<h3>" + esc(g.name) + "</h3>";
      if (g.error) { html += '<p class="note">' + esc(g.error) + "</p>"; return; }
      html += table(["For", "People", "State", "Ends", "Link", ""], (g.links || []).map(function (l) {
        var on = l.state !== "off";
        return "<tr><td>" + esc(l.label) + "</td><td>" + num(l.cap) + "</td><td>" + esc(STATE[l.state] || l.state) + (l.usedAt ? " · " + esc(day(l.usedAt)) : "") + "</td><td>" + esc(day(l.expires)) + '</td><td><button type="button" data-copy="' + esc(l.link) + '">Copy link</button></td><td><button type="button" class="quiet" data-game="' + esc(g.game) + '" data-id="' + esc(l.id) + '" data-act="' + (on ? "disable" : "enable") + '">' + (on ? "Switch off" : "Switch on") + "</button></td></tr>";
      }));
    });
    $("links").innerHTML = html;
  }
  function loadLinks() { fetch("/api/console/links", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) renderLinks(d); }).catch(function () {}); }
  $("links").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.getAttribute("data-copy")) { var t = b.getAttribute("data-copy"); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { $("lmsg").textContent = "Link copied."; }, function () { window.prompt("Copy this link:", t); }); return; }
    if (b.getAttribute("data-act")) post({ game: b.getAttribute("data-game"), action: b.getAttribute("data-act"), id: b.getAttribute("data-id") }, "Done.");
  });
  function post(body, ok) {
    $("lmsg").textContent = "Working…";
    fetch("/api/console/links", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { $("lmsg").textContent = x.ok ? (x.j.link ? "Link made. Press Copy link below." : ok) : (x.j.error || "Could not do that."); loadLinks(); })
      .catch(function () { $("lmsg").textContent = "No connection."; });
  }
  $("lform").addEventListener("submit", function (e) { e.preventDefault(); post({ game: "corporate-tambola", action: "create", label: $("llabel").value, cap: Number($("lcap").value), days: Number($("ldays").value) }, "Link made."); $("llabel").value = ""; });
  function show(inside) { $("login").hidden = inside; $("app").hidden = !inside; }
  function load() {
    $("asOf").textContent = "Loading…";
    fetch("/api/console/data", { credentials: "same-origin", cache: "no-store" }).then(function (r) {
      if (r.status === 404) { show(false); return null; } return r.json();
    }).then(function (d) { if (d) { show(true); render(d); loadLinks(); } }).catch(function () { $("asOf").textContent = "Could not load. Try again."; });
  }
  $("form").addEventListener("submit", function (e) {
    e.preventDefault(); $("err").textContent = "";
    fetch("/api/console/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: $("email").value, passcode: $("pass").value }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) { $("pass").value = ""; if (x.s === 200) load(); else $("err").textContent = x.s === 429 ? "Locked for " + x.j.minutes + " more minutes." : "Wrong e-mail or passcode."; })
      .catch(function () { $("err").textContent = "No connection."; });
  });
  $("fform").addEventListener("submit", function (e) {
    e.preventDefault(); var g = $("fgame").value.trim(); if (!g) return;
    if (!window.confirm("Make game " + g + " free (Rs 0)? This cannot be undone from here.")) return;
    $("fmsg").textContent = "Working…";
    fetch("/api/console/links", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "corporate-tambola", action: "free", eid: g, reason: $("freason").value }) })
      .then(function (r) { return r.json().then(function (x) { return { ok: r.ok, j: x }; }); })
      .then(function (x) { $("fmsg").textContent = x.ok ? (x.j.again ? "That game was already paid up. Nothing changed." : "Done: game " + g + " is now free and published (pack " + x.j.pack + ").") : (x.j.error === "Not found" ? "No game with that id." : (x.j.error || "Could not do that.")); })
      .catch(function () { $("fmsg").textContent = "No connection."; });
  });
  $("refresh").addEventListener("click", load);
  $("out").addEventListener("click", function () { fetch("/api/console/logout", { method: "POST", credentials: "same-origin" }).then(function () { show(false); }); });
  load();
})();
