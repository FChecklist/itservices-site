/* The Rs 1 payment test of IT Services by Rajat Agarwal. A real payment that buys nothing. The order and the check of the payment are done by our own service
   (/api/pay/paytest and /api/pay/paytest-verify); Razorpay's own window takes the payment. Nothing is stored in this browser. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var FROMS = ["COA", "IDX", "DPD", "ITS"];
  var from = (new URLSearchParams(location.search).get("from") || "ITS").toUpperCase();
  if (FROMS.indexOf(from) < 0) from = "ITS";
  var form = $("pt-form"), box = $("pt-consent"), go = $("pt-go"), msg = $("pt-msg"), done = $("pt-done"), busy = false;
  if (!form) return;
  var say = function (t, kind) { msg.textContent = t || ""; msg.className = "pt-msg" + (t ? " " + (kind || "bad") : ""); msg.hidden = !t; };
  var sync = function () { go.disabled = busy || !box.checked; go.setAttribute("aria-disabled", String(go.disabled)); };
  var post = function (path, body) {
    return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "Something went wrong. Please try again."); e.status = r.status; throw e; } return j; });
    });
  };
  var loadRazorpay = function () {
    return new Promise(function (ok, no) {
      if (window.Razorpay) return ok();
      var s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = ok;
      s.onerror = function () { no(new Error("Could not reach the payment service. Check your internet and try again.")); };
      document.head.appendChild(s);
    });
  };
  var finish = function (r) {
    form.hidden = true; done.hidden = false;
    $("pt-ref").textContent = r.txn_id || "";
    $("pt-mail").textContent = r.receipt === "emailed" ? "We also e-mailed the receipt." : "Your receipt will be e-mailed to you shortly.";
    done.focus();
  };
  var confirm = function (resp, tries) {
    return post("/api/pay/paytest-verify", { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }).then(function (r) {
      if (r.paid) return finish(r);
      if (r.confirming && tries < 15) return new Promise(function (ok) { setTimeout(ok, 4000); }).then(function () { return confirm(resp, tries + 1); });
      throw new Error("Razorpay has not confirmed the payment yet. If money was taken it will be returned, and the receipt is e-mailed once it is confirmed.");
    });
  };
  box.addEventListener("change", sync); sync();
  $("pt-again").addEventListener("click", function () { done.hidden = true; form.hidden = false; box.checked = false; say(""); sync(); $("pt-name").focus(); });
  form.addEventListener("submit", function (e) {
    e.preventDefault(); if (busy) return;
    var name = $("pt-name").value.trim(), email = $("pt-email").value.trim();
    if (!box.checked) return say("Please tick the box to continue.");
    if (name.length < 2) return say("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say("Please enter a valid e-mail address.");
    busy = true; sync(); say("Opening the payment window...", "info"); go.textContent = "Please wait...";
    var reset = function () { busy = false; go.textContent = "Pay Rs 1 (test)"; sync(); };
    post("/api/pay/paytest", { name: name, email: email, consent: true, from: from }).then(function (o) {
      return loadRazorpay().then(function () {
        var rz = new window.Razorpay({
          key: o.keyId, order_id: o.orderId, amount: o.amount_minor, currency: o.currency, name: "IT Services by Rajat Agarwal", description: "Payment test (buys nothing)",
          prefill: o.prefill, theme: { color: "#0E7C6E" },
          handler: function (resp) { say("Confirming your payment with Razorpay. Please keep this page open.", "info"); confirm(resp, 0).catch(function (er) { say(er.message); }).then(reset); },
          modal: { ondismiss: function () { say("The payment window was closed. Nothing was charged."); reset(); } }
        });
        if (rz.on) rz.on("payment.failed", function (r) { say((r && r.error && r.error.description) || "The payment failed. Nothing was charged."); reset(); });
        say(""); rz.open();
      });
    }).catch(function (er) { say(er.message); reset(); });
  });
})();
