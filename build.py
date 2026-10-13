#!/usr/bin/env python3
"""Builds the website of "IT Services by Rajat Agarwal" into ./dist (plain HTML + CSS, no scripts, no cookies).
This is a payment-collection site. It carries the pages Razorpay asks for: About, Contact, Pricing, Terms and Conditions, Privacy Policy,
Cancellation and Refund Policy, Shipping Policy. The site is generic: it names no product or project. Run: python build.py   (SITE_URL=https://... python build.py also sets canonical links and a sitemap)."""
import os, shutil, html, json

SITE_URL = os.environ.get("SITE_URL", "https://itservices-rajat-agarwal.pages.dev").rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
CO = "IT Services by Rajat Agarwal"
OWNER = "Rajat Agarwal"
PHONE_TXT, PHONE_TEL = "(+91) 96503 97480", "+919650397480"
EMAIL = "rajatsiroffice@gmail.com"
PLACE = "B-1105, Shipra Krishna Vista, Indirapuram, Ghaziabad, Uttar Pradesh, 201014, India"
ADDR = os.environ.get("ADDR", "").strip()  # the street address, only if the owner decides to publish it (Razorpay may ask for one)
WHERE = ADDR or PLACE
EFFECTIVE = "9 October 2026"
PACKS = [(100, 2399), (250, 3499), (500, 4699), (750, 5899), (1000, 7099), (2500, 11799), (5000, 17699), (10000, 29499)]  # the price of an online software service by size (users); a copy of the prices on the payment page
e = html.escape
inr = lambda n: "&#8377;" + format(n, ",")

LD = '<script type="application/ld+json">' + json.dumps([
    {"@context": "https://schema.org", "@type": "Organization", "name": CO, "url": SITE_URL + "/", "logo": SITE_URL + "/logo.svg", "email": EMAIL, "telephone": PHONE_TXT,
     "address": {"@type": "PostalAddress", "streetAddress": "B-1105, Shipra Krishna Vista, Indirapuram", "postalCode": "201014", "addressLocality": "Ghaziabad", "addressRegion": "Uttar Pradesh", "addressCountry": "IN"},
     "contactPoint": {"@type": "ContactPoint", "telephone": PHONE_TEL, "email": EMAIL, "contactType": "customer support", "areaServed": "IN", "availableLanguage": ["en", "hi"]}},
    {"@context": "https://schema.org", "@type": "WebSite", "name": CO, "url": SITE_URL + "/"},
], ensure_ascii=False, separators=(",", ":")) + '</script>'

NAV = [("/#what", "What we do"), ("/pricing/", "Pricing"), ("/about/", "About us"), ("/contact/", "Contact")]
LEGAL = [("/about/", "About Us"), ("/terms/", "Terms and Conditions"), ("/privacy/", "Privacy Policy"), ("/refund/", "Cancellation and Refund Policy"), ("/shipping/", "Shipping and Delivery Policy"), ("/policies/", "Product Policies"), ("/pricing/", "Pricing Details"), ("/contact/", "Contact Us"), ("/contact/#grievance", "Grievance Redressal")]
MAIL = lambda subj: f"mailto:{EMAIL}?subject={subj.replace(' ', '%20')}"

LOGO = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="IT"><rect width="64" height="64" rx="14" fill="#1a1a17"/><text x="32" y="42" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="30" fill="#F4F1E8">IT</text></svg>'''

def head(title, desc, path):
    canon = f'<link rel="canonical" href="{SITE_URL}{path}">'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#F4F1E8"><meta name="robots" content="index, follow">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="{CO}"><meta property="og:url" content="{SITE_URL}{path}"><meta property="og:locale" content="en_IN"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="{e(title)}"><meta name="twitter:description" content="{e(desc)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">{canon}
<link rel="preload" href="/fonts/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">{LD if path == "/" else ""}</head><body>
<a class="skip" href="#main">Skip to content</a>
<nav class="top" aria-label="Main"><div class="wrap in">
<a class="brand" href="/"><img src="/logo.svg" width="30" height="30" alt=""><span>{CO}<small>Software &amp; IT services</small></span></a>
<div class="links">{"".join(f'<a href="{h}">{t}</a>' for h, t in NAV)}</div>
<a class="pill" href="/contact/">Contact us</a></div></nav>
'''

def foot():
    links = "".join(f'<a href="{h}">{t}</a>' for h, t in LEGAL)
    return f'''<footer class="f"><div class="wrap"><div class="row"><div class="brand" style="pointer-events:none"><img src="/logo.svg" width="26" height="26" alt=""><span>{CO}</span></div>
<nav aria-label="Policies and contact">{links}</nav><div style="font-size:.875rem;color:var(--soft)">&copy; 2026 {CO}</div></div>
<div class="legal">{CO} is the trade name of {OWNER}, an individual running a sole proprietorship in India. Online payments for our services are collected here. Based in {e(WHERE)}. Phone <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>. Email <a href="mailto:{EMAIL}">{EMAIL}</a>. Website: <a href="{SITE_URL}/">{SITE_URL.replace("https://", "")}</a>. GST is not charged. All rights reserved.</div></div></footer>
</body></html>'''

def doc(title, desc, path, version_line, short, inner):
    return head(f"{title} · {CO}", desc, path) + f'''<main id="main"><article class="doc"><h1>{title}</h1>
<p class="ver">{version_line}</p><p class="intro">{short}</p>
{inner}
<h2>Who we are</h2><p>{CO}, the trade name of {OWNER}, an individual (sole proprietor) in India. Based in {e(WHERE)}. Contact: <a href="mailto:{EMAIL}">{EMAIL}</a>, <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>.</p>
</article></main>''' + foot()

PAGES = {}
TERMS_LINK = 'Read together with the <a href="/terms/">Terms and Conditions</a>.'
pack_rows = "".join(f"<tr><td>Up to {n:,} users</td><td>{inr(p)}</td></tr>" for n, p in PACKS)

# ---------------------------------------------------------------- home
PAGES["index.html"] = head(f"{CO}: software and IT services", f"{CO} provides software and IT services. Online payments for our services are collected on this website.", "/") + f'''<main id="main">
<section class="wrap hero" aria-labelledby="h1"><div class="eyebrow">Software · IT services</div>
<h1 id="h1">Software and IT services for businesses.</h1>
<p>{CO} builds and runs software for businesses, and provides IT services. Online payments for our services are collected on this website, with the price shown before you pay.</p>
<div class="cta"><a class="pill solid" href="/pricing/">Pricing</a><a class="pill" href="/contact/">Contact us</a></div></section>

<section class="s wrap" id="what" aria-labelledby="what-h"><div class="eyebrow">What we do</div><h2 id="what-h">We provide software and IT services.</h2>
<div class="grid three">
<div class="cell"><h3>Online software services</h3><p>Web software that you set up yourself and pay for online, by size. The price is shown before you pay, and the service is ready within minutes of payment.</p></div>
<div class="cell"><h3>Custom software</h3><p>Software built to order for a problem that is only yours, with the scope and price agreed in writing first.</p></div>
<div class="cell"><h3>Plain dealing</h3><p>The price is shown before you pay, you get an invoice for every payment, and our policies on <a href="/refund/">refunds</a>, <a href="/shipping/">delivery</a>, <a href="/policies/">each product</a> and <a href="/privacy/">privacy</a> are written in plain words.</p></div>
</div></section>

<section class="s alt" id="contact" aria-labelledby="ct-h"><div class="wrap"><div class="eyebrow">Contact</div><h2 id="ct-h">Write to us or call.</h2>
<dl class="facts"><div><dt>Business</dt><dd>{CO}<br>Sole proprietorship of {OWNER}</dd></div><div><dt>Based in</dt><dd>{e(WHERE)}</dd></div>
<div><dt>Phone</dt><dd><a href="tel:{PHONE_TEL}">{PHONE_TXT}</a></dd></div><div><dt>Email</dt><dd><a href="mailto:{EMAIL}">{EMAIL}</a></dd></div>
<div><dt>Grievance Officer</dt><dd>{OWNER}<br><a href="mailto:{EMAIL}?subject=Grievance">{EMAIL}</a> (subject: Grievance)</dd></div></dl></div></section>
</main>''' + foot()

# ---------------------------------------------------------------- about
PAGES["about/index.html"] = doc("About Us", f"About {CO}: software and IT services from India.", "/about/", f"Version 1.0 · Effective {EFFECTIVE}",
  f"{CO} is the trade name of {OWNER}, an individual in India. We build software and provide IT services.",
  f'''<h2>What we do</h2><p>We build and run software for businesses and provide IT services. Some of our services are online software that you set up yourself and pay for online. We also build custom software to order, to a scope and price agreed in writing.</p>
<h2>How we work</h2><ul><li><b>Price first.</b> You see the price before you pay. See <a href="/pricing/">Pricing Details</a>.</li><li><b>Plain policies.</b> <a href="/refund/">Cancellation and refunds</a>, <a href="/shipping/">delivery</a> and <a href="/privacy/">privacy</a> are written in plain words.</li><li><b>A record of every payment.</b> You get an invoice by e-mail for every payment.</li></ul>
<h2>The business</h2><table><tbody><tr><th>Name</th><td>{CO}</td></tr><tr><th>Type</th><td>Sole proprietorship of an individual, {OWNER}, India</td></tr><tr><th>GST</th><td>Not registered. GST is not charged on our prices.</td></tr><tr><th>Based in</th><td>{e(WHERE)}</td></tr><tr><th>Phone</th><td><a href="tel:{PHONE_TEL}">{PHONE_TXT}</a></td></tr><tr><th>Email</th><td><a href="mailto:{EMAIL}">{EMAIL}</a></td></tr><tr><th>Grievance Officer</th><td>{OWNER}</td></tr></tbody></table>
<h2>Talk to us</h2><p>Write to <a href="mailto:{EMAIL}?subject=Enquiry">{EMAIL}</a> or call <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>.</p>''')

# ---------------------------------------------------------------- contact
PAGES["contact/index.html"] = doc("Contact Us", f"How to reach {CO}: phone, email and Grievance Officer.", "/contact/", f"Version 1.0 · Effective {EFFECTIVE}",
  f'Write to <a href="mailto:{EMAIL}">{EMAIL}</a> or call <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>. Put the subject that fits at the start of the subject line so the right message is seen first.',
  f'''<h2>1. Email and phone</h2><table><thead><tr><th>Subject</th><th>Use it for</th></tr></thead><tbody>
<tr><td>Enquiry</td><td>Questions about our services, quotes for custom software, meetings</td></tr>
<tr><td>Billing</td><td>Invoices, payments, receipts, credit and a wrong or double charge (see the <a href="/refund/">Cancellation and Refund Policy</a>)</td></tr>
<tr><td>Support</td><td>A problem with a service or with something we delivered</td></tr>
<tr><td>Grievance</td><td>A complaint about how we handled personal data</td></tr>
<tr><td>Data request</td><td>To see, correct or erase your personal data, or withdraw consent (see the <a href="/privacy/">Privacy Policy</a>)</td></tr></tbody></table>
<p>Email: <a href="mailto:{EMAIL}">{EMAIL}</a><br>Phone: <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a><br>Support hours: Monday to Saturday, 10:00 to 18:00 Indian Standard Time (closed on public holidays). We reply to every email within 2 working days.</p>
<h2 id="grievance">2. Grievance Redressal Officer</h2><p><b>{OWNER}</b>, Grievance Redressal Officer, {CO}.<br>Email: <a href="mailto:{EMAIL}?subject=Grievance">{EMAIL}</a> (subject: Grievance)<br>Phone: <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a></p><p>We acknowledge every grievance within 48 hours of receiving it and resolve it within 30 days. If you are not satisfied with the outcome you can complain to the Data Protection Board of India (for personal data) or to the relevant regulator or consumer forum.</p>
<h2>3. Business details</h2><p>{CO}<br>Sole proprietorship of {OWNER}<br>Based in {e(WHERE)}<br>Not registered for GST: GST is not charged.</p>
<h2>4. Payments</h2><p>Online payments are processed by our payment partner Razorpay. We never see or keep your card number. For anything about a payment, write to us with the payment reference.</p>''')

# ---------------------------------------------------------------- pricing
PAGES["pricing/index.html"] = doc("Pricing Details", f"Pricing details of {CO}: the price of our online software services by size, in Indian rupees, with no GST added.", "/pricing/", f"Version 1.0 · Effective {EFFECTIVE} · {TERMS_LINK}",
  "The price of an online software service depends on its size, meaning how many users it is set up for. The price is in Indian rupees and is the whole amount: no GST is added. Custom software is quoted in writing before you pay.",
  f'''<h2>1. Online software services</h2><p>One payment is for one order. Setting up an order is free. You pay before it starts; an order that is not paid for does not begin and nothing is charged. The price depends on the number of users you choose:</p>
<table><thead><tr><th>Size</th><th>Price (INR)</th></tr></thead><tbody>{pack_rows}</tbody></table>
<p>The number you choose does not have to match a size in the list: you pay for the smallest size that covers it. The price shown on the payment page is the amount you pay.</p>
<h2>2. Currency and tax</h2><p>All amounts are in Indian rupees. {CO} is not registered for GST, so no GST is added and none is shown on the invoice. The amount on the payment page is the whole amount.</p>
<h2>3. How you pay</h2><ul><li><b>Online</b> by UPI, debit card, credit card, net banking or wallet through our payment partner Razorpay, on the payment page.</li><li><b>Credit.</b> If you cancelled an earlier paid order, the credit pays first (see the <a href="/refund/">Cancellation and Refund Policy</a>).</li></ul>
<p>We never see or keep your card number or bank login; Razorpay handles the payment under its own terms and security. Payment is confirmed when Razorpay confirms it, and we then e-mail the invoice to the address you gave.</p>
<h2>4. Custom software</h2><p>Custom work is priced for the job. After you tell us what you need, we send a written quotation with what is included, the delivery time and the amount in Indian rupees. The price is the one in your accepted quotation. There are no hidden charges.</p>
<h2>5. Changes</h2><p>The price of an order you have paid for does not change. We may change the prices of future orders at any time; the price shown on the payment page when you pay is the price that applies.</p>
<h2>6. Other online services</h2><p><b>VERIDIAN DPDP</b> (veridian-aios.com), a yearly software subscription for data-protection compliance. The yearly price is ten times the monthly price of the plan you choose, in Indian rupees, with no GST added. Introductory monthly prices: Starter and Institution Rs 399, Growth Rs 999, Practice Rs 1,999, Large Rs 2,999. The price shown on the payment page is the amount you pay.</p>
<p><b>Startup coaching program</b> (rajat-agarwal-startup-coach.pages.dev): Rs 19,999 per startup, with no GST added.</p>''')

# ---------------------------------------------------------------- refund and delivery (digital products only; rewritten 13 Oct 2026)
EFF2 = "13 October 2026"
GAME_POLICY = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "policy_game.html"), encoding="utf-8").read()
GAMES = [("tambola", "Corporate Tambola", "https://corporate-tambola.pages.dev"), ("bingo", "Corporate Bingo", "https://corporate-bingo.pages.dev"),
         ("tic-tac-toe", "Corporate Tic Tac Toe", "https://corporate-tic-tac-toe.pages.dev"), ("snakes-and-ladders", "Corporate Snakes and Ladders", "https://corporate-snakes-and-ladders.pages.dev"),
         ("luck-by-chance", "Corporate Luck by Chance", "https://corporate-luck-by-chance.pages.dev")]
COACH_URL, DPDP_URL = "https://rajat-agarwal-startup-coach.pages.dev", "https://veridian-aios.com"
VER2 = f"Version 2.0 · Effective {EFF2} · {TERMS_LINK}"

PAGES["refund/index.html"] = doc("Cancellation and Refund Policy", f"Cancellation, rescheduling and refund policy of {CO}: for the Corporate Games, the Startup Coach and Veridian DPDP. We sell digital products only.", "/refund/", VER2,
  "We are a software company. Everything we sell is digital and delivered over the internet. For our games you pay per game: there is no refund after payment, and the game can be rescheduled to any date within 365 days of payment. The Startup Coach and Veridian DPDP follow their own product policies.",
  f'''<h2>At a glance</h2><div class="tw"><table><thead><tr><th>Product</th><th>You pay for</th><th>After payment</th><th>Rescheduling</th><th>Full policy</th></tr></thead><tbody>
<tr><td>Corporate Tambola, Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance</td><td>One game</td><td>No refund</td><td>Free, to any date within 365 days of payment</td><td><a href="#games">Section 2</a></td></tr>
<tr><td>Startup Coach</td><td>Each startup seat</td><td>No refund once the access link is issued, except a wrong or double charge</td><td>Not applicable</td><td><a href="#coach">Section 3</a></td></tr>
<tr><td>Veridian DPDP</td><td>A yearly subscription</td><td>As its own policy</td><td>Not applicable</td><td><a href="#dpdp">Section 4</a></td></tr>
<tr><td>Custom software</td><td>The quotation</td><td>As the quotation</td><td>As the quotation</td><td><a href="#custom">Section 5</a></td></tr></tbody></table></div>
<h2>1. All our products are digital</h2><p>We are a software company. We do not sell physical goods and we do not deliver physical products or services. Everything is delivered online (see the <a href="/shipping/">Shipping and Delivery Policy</a>). Each product has its own policy page in <a href="/policies/">Product Policies</a>.</p>
<h2 id="games">2. Corporate Games (Tambola, Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance)</h2>
''' + GAME_POLICY.replace("{NAME}", "the game").replace("<h2>", "<h3>").replace("</h2>", "</h3>") + f'''
<h2 id="coach">3. Startup Coach</h2><p>The Startup Coach is a coaching programme delivered online. Access is given at once, so a booking cannot be cancelled and no refund is given after the access link has been issued. A wrong or double charge is always put right, and if the access link cannot be delivered or does not work and we cannot fix it within 7 days of your report, we refund the fee for the affected seats. The full policy is in clause 8 of the <a href="{COACH_URL}/terms.html">Startup Coach Terms and Conditions</a>.</p>
<h2 id="dpdp">4. Veridian DPDP</h2><p>Veridian DPDP is a yearly subscription with its own cancellation and refund policy, published on its own website: <a href="{DPDP_URL}/refund/">{DPDP_URL.replace("https://", "")}/refund/</a>. That policy applies to it.</p>
<h2 id="custom">5. Custom software</h2><p>For custom work, the cancellation terms are in your written quotation. If none are stated, you can stop at any time, you pay for the work already done, and we refund any advance beyond that.</p>
<h2>6. If you disagree</h2><p>Write to us first, and please contact us before raising a dispute with your bank so that we can fix a wrong charge quickly. For anything about personal data, use the grievance route in the <a href="/privacy/">Privacy Policy</a>.</p>''')

PAGES["shipping/index.html"] = doc("Shipping and Delivery Policy", f"Shipping and delivery policy of {CO}: we are a software company, we deliver no physical products or services, and everything is delivered online.", "/shipping/", VER2,
  "We are a software company. We do not deliver physical products or services. Everything we provide is a digital service or product delivered over the internet. Nothing is shipped and there are no shipping charges.",
  f'''<h2>1. What we deliver</h2><div class="tw"><table><thead><tr><th>Product</th><th>What is delivered</th><th>How and when</th></tr></thead><tbody>
<tr><td>Corporate Tambola, Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance</td><td>Use of the game for the number of participants you paid for, with the organizer console and the links to share</td><td>In your account and by e-mail, within minutes after Razorpay confirms the payment. The game itself runs on the date and time the Organizer sets. If you pay after the start time, it starts about 2 minutes after the payment is confirmed.</td></tr>
<tr><td>Startup Coach</td><td>A private access link to the programme and the Proof Forge tool</td><td>By e-mail to the address you gave, at once after the payment is confirmed</td></tr>
<tr><td>Veridian DPDP</td><td>Access to your account on the website</td><td>Online, as set out in its own policy at <a href="{DPDP_URL}/refund/">{DPDP_URL.replace("https://", "")}</a></td></tr>
<tr><td>Custom software</td><td>The software, access or documents in your accepted quotation</td><td>By secure download link, access to a hosted system or code repository, or e-mail, on the dates in the quotation; if there is no date, we tell you in writing within 2 working days after your payment is confirmed</td></tr></tbody></table></div>
<h2>2. No physical delivery</h2><p>We do not ship, courier or hand over any physical product, and we do not need a delivery address. There is nothing to return.</p>
<h2>3. What you need</h2><p>A working internet connection, a current web browser and an e-mail address you can read.</p>
<h2>4. Charges</h2><p>There is no shipping or delivery charge. The only amount is the one shown on the payment page or in your quotation (see <a href="/pricing/">Pricing Details</a>).</p>
<h2>5. If something does not arrive</h2><p>Check your spam folder first. Then write to <a href="mailto:{EMAIL}?subject=Support">{EMAIL}</a> with the subject "Support" and your payment reference or invoice number. We will resend it, fix it or tell you what is holding it up. If we are at fault and cannot deliver, the <a href="/refund/">Cancellation and Refund Policy</a> applies.</p>''')

PAGES["policies/index.html"] = doc("Product Policies", f"Delivery, cancellation, rescheduling and refund policy for each product of {CO}.", "/policies/", VER2,
  "One page for each product. All products are digital and delivered over the internet.",
  '''<h2>All products</h2><ul><li><a href="/shipping/">Shipping and Delivery Policy</a></li><li><a href="/refund/">Cancellation and Refund Policy</a></li><li><a href="/terms/">Terms and Conditions</a></li><li><a href="/privacy/">Privacy Policy</a></li></ul>
<h2>Corporate Games</h2><ul>''' + "".join(f'<li><a href="/policies/{sl}/">{nm}</a></li>' for sl, nm, _ in GAMES) + f'''</ul>
<h2>Other products</h2><ul><li><a href="/policies/startup-coach/">Startup Coach</a></li><li><a href="/policies/veridian-dpdp/">Veridian DPDP</a></li></ul>''')

for sl, nm, url in GAMES:
    PAGES[f"policies/{sl}/index.html"] = doc(f"{nm}: Policy", f"Delivery, cancellation, rescheduling and refund policy of {nm}, a software product of {CO}.", f"/policies/{sl}/", VER2,
      f"{nm} is a digital product delivered over the internet. You pay per game. There is no refund after payment, and the game can be rescheduled to any date within 365 days of payment.",
      f'''<h2>Delivery</h2><p>Nothing physical is delivered. The Organizer gets use of the game for the chosen number of participants, with the organizer console and the links to share, in the account and by e-mail within minutes after the payment is confirmed. See the <a href="/shipping/">Shipping and Delivery Policy</a>. Website: <a href="{url}/">{url.replace("https://", "")}</a>.</p>''' + GAME_POLICY.replace("{NAME}", nm))

PAGES["policies/startup-coach/index.html"] = doc("Startup Coach: Policy", f"Delivery, cancellation and refund policy of the Startup Coach programme of {CO}.", "/policies/startup-coach/", VER2,
  "The Startup Coach is a coaching programme and software tool delivered over the internet. Access is given at once after payment.",
  f'''<h2>Delivery</h2><p>A private access link is e-mailed to the address you gave, at once after the payment is confirmed. Nothing physical is delivered.</p>
<h2>Payment</h2><p>Rs 19,999 per startup seat, for one to five startups at a time. No GST is added.</p>
<h2>Cancellation and refund</h2><p>Because access is given at once, a booking cannot be cancelled and no refund is given after the access link has been issued. A wrong or double charge is always put right. If the access link cannot be delivered or does not work and we cannot fix it within 7 days of your report, we refund the fee for the affected seats. An approved refund is started within 7 working days to the original payment method.</p>
<h2>Full terms</h2><p>The programme's own terms and legal position are on its website: <a href="{COACH_URL}/terms.html">Terms and Conditions</a>.</p>''')

PAGES["policies/veridian-dpdp/index.html"] = doc("Veridian DPDP: Policy", f"Delivery, cancellation and refund policy of Veridian DPDP, a software product of {CO}.", "/policies/veridian-dpdp/", VER2,
  "Veridian DPDP is a yearly software subscription delivered over the internet. Its cancellation and refund policy is the one published on its own website.",
  f'''<h2>Delivery</h2><p>Nothing physical is delivered. You get online access to your account on the website.</p>
<h2>Cancellation and refund</h2><p>The cancellation and refund policy of Veridian DPDP is published on its own website and applies to it: <a href="{DPDP_URL}/refund/">{DPDP_URL.replace("https://", "")}/refund/</a>. Its terms are at <a href="{DPDP_URL}/terms/">{DPDP_URL.replace("https://", "")}/terms/</a>.</p>''')

# ---------------------------------------------------------------- privacy
PAGES["privacy/index.html"] = doc("Privacy Policy", f"How {CO} collects, uses and protects personal data.", "/privacy/", "Version 1.0 · Effective " + EFFECTIVE,
  "We collect the least we need: who you are, how to reach you, what you paid for, and the technical records needed to keep our website secure. We do not sell personal data, we do not show advertising, and this website sets no cookies. You can ask us to show, correct or erase your data, and complain to us, and then to the Data Protection Board of India.",
  f'''<h2>1. Who is responsible</h2><p>{CO}, the trade name of {OWNER}, an individual in India (the "Business", "we"). For the personal data described in this policy we decide why and how it is used (we are the "Data Fiduciary" under the Digital Personal Data Protection Act, 2023). For an online service that you set up for other people, you are in charge of those people's data and we process it for you.</p>
<h2>2. What we collect</h2><table><thead><tr><th>What</th><th>Examples</th><th>How</th></tr></thead><tbody>
<tr><td>Contact details</td><td>Name, email, phone, organisation</td><td>You, when you write to us or pay</td></tr>
<tr><td>Payment details</td><td>Name, e-mail, organisation, what you paid for, the invoice and payment reference. We never see or keep card numbers; Razorpay handles the payment.</td><td>You</td></tr>
<tr><td>Mail you send us</td><td>Messages and attachments, sender address</td><td>You</td></tr>
<tr><td>Technical data</td><td>IP address, browser type, date and time, pages requested</td><td>Automatically, in our hosting provider's logs. This website sets no advertising or analytics cookies.</td></tr></tbody></table>
<p>We do not intentionally collect sensitive personal data such as health records, biometric data or passwords through this website. Our website is not directed at children.</p>
<p><b>Our online services.</b> Data of the people you invite is kept only as long as the service needs it and is then deleted, as the notice shown inside that service says. Payment records and your invoice details are kept as the law requires.</p>
<h2>3. Why we use it</h2><ul><li>To answer you, deliver what you paid for and give support.</li><li>To invoice, take payment and meet tax and accounting duties.</li><li>To handle grievances and data requests.</li><li>To keep our website secure and fix faults.</li><li>To protect or defend legal rights and comply with lawful orders.</li></ul>
<p>We do not use personal data for advertising, we do not sell it, and we do not use it to train artificial-intelligence models.</p>
<h2>4. Who receives it</h2><table><thead><tr><th>Recipient</th><th>Why</th></tr></thead><tbody>
<tr><td>Razorpay</td><td>To take and reconcile online payments</td></tr>
<tr><td>Cloudflare</td><td>To host and protect this website and our services</td></tr>
<tr><td>Resend</td><td>To send e-mail (sign-in codes, invoices, reports)</td></tr>
<tr><td>Google (email)</td><td>To receive the mail you send us</td></tr>
<tr><td>Professional advisers and auditors</td><td>To advise us, under duties of confidence</td></tr>
<tr><td>Courts, the Data Protection Board of India, police and other authorities</td><td>Only where the law requires or a lawful order is received</td></tr></tbody></table>
<p>Transfers outside India are made as section 16 of the Digital Personal Data Protection Act, 2023 allows.</p>
<h2>5. How long we keep it</h2><ul><li><b>Online services:</b> as the notice inside the service says; payment records and invoices as the law requires.</li><li><b>Mail and support records:</b> as long as needed to deal with the matter, then deleted, unless a dispute or legal duty needs them kept longer.</li><li><b>Website and hosting logs:</b> a short operational period, and longer where the law requires.</li></ul>
<h2>6. Security</h2><p>We use encrypted connections, store only what we need and limit who can see what. No system is perfectly secure; if there is a personal data breach that the law requires us to report, we report it to the Data Protection Board of India and to the people affected.</p>
<h2>7. Your rights</h2><p>You may ask us to show you the personal data we hold about you, correct it, complete it or erase it; to withdraw a consent you gave; and to nominate someone to exercise these rights for you. Write to <a href="mailto:{EMAIL}?subject=Data%20request">{EMAIL}</a> with the subject "Data request". We verify it is you and answer within the time the law allows.</p>
<h2>8. Grievance Officer</h2><p><b>{OWNER}</b>, Grievance Officer. Email <a href="mailto:{EMAIL}?subject=Grievance">{EMAIL}</a> (subject: Grievance) or phone <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>. We acknowledge every grievance within 48 hours and resolve it within 30 days. If you are not satisfied you may complain to the Data Protection Board of India.</p>
<h2>9. Changes</h2><p>We will update this policy when our practice changes and show the new effective date at the top.</p>''')

# ---------------------------------------------------------------- terms
PAGES["terms/index.html"] = doc("Terms and Conditions", f"Terms for using the website and services of {CO}.", "/terms/", f"Version 1.0 · Effective {EFFECTIVE}",
  "These terms cover this website, online payments and our software services. A written quotation for a custom job adds the details of that job. Indian law applies.",
  f'''<h2>1. Who we are and what these terms cover</h2><p>These terms are between you and {CO}, the trade name of {OWNER}, an individual in India, based in {e(WHERE)}. They apply to this website, to online payments and to the software services we provide. If a written quotation for a custom job differs from these terms on a point, the quotation prevails for that job.</p>
<h2>2. Using the website</h2><p>You may read and use this website for lawful purposes. Do not try to break, overload or gain unauthorised access to it, and do not copy it in a way that suggests it is yours.</p>
<h2>3. Online services</h2><p>An online software service is provided as described on its own pages. Setting up an order is free; a paid order needs payment before it starts. You are responsible for how you use it and for the people you invite.</p>
<h2>4. Prices and payment</h2><p>Prices are in Indian rupees and are the whole amount: we are not registered for GST, so none is added. Online payments are processed by Razorpay under its own terms. An invoice is e-mailed for every payment. See <a href="/pricing/">Pricing Details</a>, the <a href="/refund/">Cancellation and Refund Policy</a> and the <a href="/shipping/">Shipping Policy</a>.</p>
<h2>5. Cancelling, rescheduling and refunds</h2><p>We are a software company and sell digital products only. For our games you pay per game: there is no refund after payment, and the game can be rescheduled to any date within 365 days from the date of payment. The Startup Coach and Veridian DPDP follow their own product policies. A wrong or double charge is refunded. See the <a href="/refund/">Cancellation and Refund Policy</a> and <a href="/policies/">Product Policies</a>.</p>
<h2>6. Your responsibilities</h2><p>Give us correct information. You are responsible for the people and data you put into a service and for having the right to use them, including personal data. Keep any link or key we give you private; you are responsible for what is done with it.</p>
<h2>7. What we do not promise</h2><p>We take care and use reasonable skill. Software can still be wrong or unavailable at times. Nothing we provide is legal, tax or professional advice or a guarantee of any result.</p>
<h2>8. Limit of liability</h2><p>To the fullest extent the law allows: we are not liable for indirect or consequential loss, lost profits, lost data or goodwill; and our total liability for any claim connected with a payment is limited to the amount you paid for it. Nothing in these terms limits liability that the law does not allow to be limited, including for fraud or wilful misconduct.</p>
<h2>9. Governing law and disputes</h2><p>These terms are governed by the laws of India. Write to us describing any dispute and we will try in good faith to settle it within 30 days. A dispute not settled in that time is decided by arbitration under the Arbitration and Conciliation Act, 1996 by a sole arbitrator agreed by the parties. The seat and venue are Ghaziabad, Uttar Pradesh, and the language is English. Subject to that, the courts at Ghaziabad have jurisdiction.</p>
<h2>10. General</h2><p>These terms, with any quotation and our <a href="/privacy/">Privacy Policy</a>, are the whole agreement between us on their subject. If a part is unenforceable the rest stays in force. We may update these terms; the new version applies from its effective date. Questions: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>''')

PAGES["404.html"] = head(f"Page not found · {CO}", "Page not found.", "/404.html") + '''<main id="main"><div class="doc"><h1>That page is not here</h1><p>Please go back to the <a href="/">home page</a> or <a href="/contact/">contact us</a>.</p></div></main>''' + foot()
PATHS = ["/", "/about/", "/contact/", "/terms/", "/privacy/", "/refund/", "/shipping/", "/pricing/", "/policies/"] + [f"/policies/{x[0]}/" for x in GAMES] + ["/policies/startup-coach/", "/policies/veridian-dpdp/"]

def write(rel, content):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f: f.write(content)

# Payment frame (Option 1, 2026-10-11): Corporate Tambola shows this page inside its own payment screen. Razorpay Checkout runs HERE, so Razorpay sees only this registered website.
PAYFRAME_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Secure payment</title>
<style>html,body{margin:0;height:100%;background:transparent}</style></head><body><script src="/payframe/pay.js"></script></body></html>
"""
PAYFRAME_JS = """// Runs Razorpay Checkout for an approved parent page. The parent sends the order; the result goes back to the parent only. Nothing is stored here.
(function () {
  var ALLOWED = ["https://corporate-tambola.pages.dev", "https://rajat-agarwal-startup-coach.pages.dev", "https://veridian-aios.com", "https://www.veridian-aios.com", "https://dpdp.veridian-aios.com", "https://app.veridian-aios.com"];
  var okOrigin = function (o) { return ALLOWED.indexOf(o) >= 0 || /^http:[/][/](localhost|127[.]0[.]0[.]1)(:[0-9]+)?$/.test(o); };
  var parentWin = window.parent, started = false;
  if (parentWin === window) return;
  var say = function (origin, msg) { parentWin.postMessage(msg, origin); };
  window.addEventListener("message", function (ev) {
    if (ev.source !== parentWin || !okOrigin(ev.origin) || started) return;
    var d = ev.data; if (!d || d.t !== "open" || !d.opts || typeof d.opts.key !== "string" || typeof d.opts.order_id !== "string") return;
    started = true; var o = d.opts, back = ev.origin;
    var load = function (cb) { if (window.Razorpay) return cb(); var s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = cb; s.onerror = function () { say(back, { t: "failed", message: "Could not reach the payment service. Check your internet and try again." }); }; document.head.appendChild(s); };
    load(function () {
      try {
        var box = new window.Razorpay({
          key: o.key, order_id: o.order_id, amount: o.amount, currency: o.currency, name: o.name, description: o.description, prefill: o.prefill, notes: o.notes, theme: o.theme, config: o.config,
          handler: function (r) { say(back, { t: "paid", resp: { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature } }); },
          modal: { ondismiss: function () { say(back, { t: "dismissed" }); } }
        });
        if (box.on) box.on("payment.failed", function (r) { say(back, { t: "failed", message: (r && r.error && r.error.description) || "The payment failed. Nothing was charged." }); });
        box.open();
      } catch (e) { say(back, { t: "failed", message: "Could not open the payment window. Please try again." }); }
    });
  });
  // tell every approved parent we are ready (the parent answers once)
  ALLOWED.concat(["http://localhost:8787", "http://localhost:3000", "http://127.0.0.1:8787"]).forEach(function (o) { try { parentWin.postMessage({ t: "ready" }, o); } catch (e) {} });
})();
"""

if os.path.isdir(OUT):
    for name in os.listdir(OUT):
        q = os.path.join(OUT, name); shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
for rel, c in PAGES.items(): write(rel, c)
HERE = os.path.dirname(os.path.abspath(__file__))
shutil.copy(os.path.join(HERE, "site.css"), os.path.join(OUT, "site.css"))
shutil.copytree(os.path.join(HERE, "fonts"), os.path.join(OUT, "fonts"), dirs_exist_ok=True)
write("payframe/index.html", PAYFRAME_HTML); write("payframe/pay.js", PAYFRAME_JS)
write("logo.svg", LOGO); write("favicon.svg", LOGO)
write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"<url><loc>{SITE_URL}{p}</loc><changefreq>monthly</changefreq></url>\n" for p in PATHS) + "</urlset>\n")
write("_headers", """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
/payframe/*
  ! X-Frame-Options
  ! Content-Security-Policy
  ! Permissions-Policy
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: no-cache
  Content-Security-Policy: default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors https://corporate-tambola.pages.dev https://rajat-agarwal-startup-coach.pages.dev; base-uri 'none'; form-action 'none'
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/site.css
  Cache-Control: public, max-age=3600
/*.svg
  Cache-Control: public, max-age=86400
""")
print("built", len(PAGES), "pages ->", OUT)
