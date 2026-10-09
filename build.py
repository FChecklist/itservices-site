#!/usr/bin/env python3
"""Builds the website of "IT Services by Rajat Agarwal" into ./dist (plain HTML + CSS, no scripts, no cookies).
This is the payment-collection site for Corporate Tambola. It carries the pages Razorpay asks for: About, Contact, Pricing, Terms and Conditions, Privacy Policy,
Cancellation and Refund Policy, Shipping Policy. Run: python build.py   (SITE_URL=https://... python build.py also sets canonical links and a sitemap)."""
import os, shutil, html, json

SITE_URL = os.environ.get("SITE_URL", "https://itservices-rajat-agarwal.pages.dev").rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
CO = "IT Services by Rajat Agarwal"
OWNER = "Rajat Agarwal"
PHONE_TXT, PHONE_TEL = "+91 96503 97480", "+919650397480"
EMAIL = "rajatsiroffice@gmail.com"
PLACE = "Ghaziabad, Uttar Pradesh, India"
ADDR = os.environ.get("ADDR", "").strip()  # the street address, only if the owner decides to publish it (Razorpay may ask for one)
WHERE = ADDR or PLACE
EFFECTIVE = "9 October 2026"
PRODUCT_URL = "https://corporate-tambola.pages.dev"
PACKS = [(100, 2399), (250, 3499), (500, 4699), (750, 5899), (1000, 7099), (2500, 11799), (5000, 17699), (10000, 29499)]  # mirror of packages/shared/src/pricing.ts in the Corporate Tambola repo
e = html.escape
inr = lambda n: "&#8377;" + format(n, ",")

LD = '<script type="application/ld+json">' + json.dumps([
    {"@context": "https://schema.org", "@type": "Organization", "name": CO, "url": SITE_URL + "/", "logo": SITE_URL + "/logo.svg", "email": EMAIL, "telephone": PHONE_TXT,
     "address": {"@type": "PostalAddress", "addressLocality": "Ghaziabad", "addressRegion": "Uttar Pradesh", "addressCountry": "IN"},
     "contactPoint": {"@type": "ContactPoint", "telephone": PHONE_TEL, "email": EMAIL, "contactType": "customer support", "areaServed": "IN", "availableLanguage": ["en", "hi"]}},
    {"@context": "https://schema.org", "@type": "WebSite", "name": CO, "url": SITE_URL + "/"},
], ensure_ascii=False, separators=(",", ":")) + '</script>'

NAV = [("/#what", "What we do"), ("/pricing/", "Pricing"), ("/about/", "About us"), ("/contact/", "Contact")]
LEGAL = [("/about/", "About Us"), ("/terms/", "Terms and Conditions"), ("/privacy/", "Privacy Policy"), ("/refund/", "Cancellation and Refund Policy"), ("/shipping/", "Shipping Policy"), ("/pricing/", "Pricing Details"), ("/contact/", "Contact Us"), ("/contact/#grievance", "Grievance Redressal")]
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
<div class="legal">{CO} is the trade name of {OWNER}, an individual running a sole proprietorship in India. Payments for Corporate Tambola are collected here. Based in {e(WHERE)}. Phone <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>. Email <a href="mailto:{EMAIL}">{EMAIL}</a>. Website: <a href="{SITE_URL}/">{SITE_URL.replace("https://", "")}</a>. GST is not charged. All rights reserved.</div></div></footer>
</body></html>'''

def doc(title, desc, path, version_line, short, inner):
    return head(f"{title} · {CO}", desc, path) + f'''<main id="main"><article class="doc"><h1>{title}</h1>
<p class="ver">{version_line}</p><p class="intro">{short}</p>
{inner}
<h2>Who we are</h2><p>{CO}, the trade name of {OWNER}, an individual (sole proprietor) in India. Based in {e(WHERE)}. Contact: <a href="mailto:{EMAIL}">{EMAIL}</a>, <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>.</p>
</article></main>''' + foot()

PAGES = {}
TERMS_LINK = 'Read together with the <a href="/terms/">Terms and Conditions</a>.'
pack_rows = "".join(f"<tr><td>Up to {n:,} participants</td><td>{inr(p)}</td></tr>" for n, p in PACKS)

# ---------------------------------------------------------------- home
PAGES["index.html"] = head(f"{CO}: software and IT services", f"{CO} provides software and IT services, including Corporate Tambola, a live game for company events. Payments for Corporate Tambola are collected here.", "/") + f'''<main id="main">
<section class="wrap hero" aria-labelledby="h1"><div class="eyebrow">Software · IT services</div>
<h1 id="h1">Software and IT services for businesses.</h1>
<p>{CO} builds and runs software for businesses. Our product is <a href="{PRODUCT_URL}">Corporate Tambola</a>, a live game for company events and extended families. Payments for Corporate Tambola are collected on this website.</p>
<div class="cta"><a class="pill solid" href="/pricing/">Pricing</a><a class="pill" href="/contact/">Contact us</a></div></section>

<section class="s wrap" id="what" aria-labelledby="what-h"><div class="eyebrow">What we do</div><h2 id="what-h">We provide software and IT services.</h2>
<div class="grid three">
<div class="cell"><h3>Corporate Tambola</h3><p>A web game for company events. The organizer builds it free, pays before it starts, and shares one link. Read more at <a href="{PRODUCT_URL}">corporate-tambola.pages.dev</a>.</p></div>
<div class="cell"><h3>Custom software</h3><p>Software built to order for a problem that is only yours, with the scope and price agreed in writing first.</p></div>
<div class="cell"><h3>Plain dealing</h3><p>The price is shown before you pay, you get an invoice for every payment, and our policies on <a href="/refund/">refunds</a>, <a href="/shipping/">delivery</a> and <a href="/privacy/">privacy</a> are written in plain words.</p></div>
</div></section>

<section class="s alt" id="contact" aria-labelledby="ct-h"><div class="wrap"><div class="eyebrow">Contact</div><h2 id="ct-h">Write to us or call.</h2>
<dl class="facts"><div><dt>Business</dt><dd>{CO}<br>Sole proprietorship of {OWNER}</dd></div><div><dt>Based in</dt><dd>{e(WHERE)}</dd></div>
<div><dt>Phone</dt><dd><a href="tel:{PHONE_TEL}">{PHONE_TXT}</a></dd></div><div><dt>Email</dt><dd><a href="mailto:{EMAIL}">{EMAIL}</a></dd></div>
<div><dt>Grievance Officer</dt><dd>{OWNER}<br><a href="mailto:{EMAIL}?subject=Grievance">{EMAIL}</a> (subject: Grievance)</dd></div></dl></div></section>
</main>''' + foot()

# ---------------------------------------------------------------- about
PAGES["about/index.html"] = doc("About Us", f"About {CO}: software and IT services from India, and the maker of Corporate Tambola.", "/about/", f"Version 1.0 · Effective {EFFECTIVE}",
  f"{CO} is the trade name of {OWNER}, an individual in India. We build software and provide IT services.",
  f'''<h2>What we do</h2><p>We build and run software for businesses. Our own product is <a href="{PRODUCT_URL}">Corporate Tambola</a>, a live game that a company can run for its employees, families, dealers and customers. We also build custom software to order, to a scope and price agreed in writing.</p>
<h2>How we work</h2><ul><li><b>Price first.</b> You see the price before you pay. See <a href="/pricing/">Pricing Details</a>.</li><li><b>Plain policies.</b> <a href="/refund/">Cancellation and refunds</a>, <a href="/shipping/">delivery</a> and <a href="/privacy/">privacy</a> are written in plain words.</li><li><b>A record of every payment.</b> You get an invoice by e-mail for every payment.</li></ul>
<h2>The business</h2><table><tbody><tr><th>Name</th><td>{CO}</td></tr><tr><th>Type</th><td>Sole proprietorship of an individual, {OWNER}, India</td></tr><tr><th>GST</th><td>Not registered. GST is not charged on our prices.</td></tr><tr><th>Based in</th><td>{e(WHERE)}</td></tr><tr><th>Phone</th><td><a href="tel:{PHONE_TEL}">{PHONE_TXT}</a></td></tr><tr><th>Email</th><td><a href="mailto:{EMAIL}">{EMAIL}</a></td></tr><tr><th>Grievance Officer</th><td>{OWNER}</td></tr></tbody></table>
<h2>Talk to us</h2><p>Write to <a href="mailto:{EMAIL}?subject=Enquiry">{EMAIL}</a> or call <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>.</p>''')

# ---------------------------------------------------------------- contact
PAGES["contact/index.html"] = doc("Contact Us", f"How to reach {CO}: phone, email and Grievance Officer.", "/contact/", f"Version 1.0 · Effective {EFFECTIVE}",
  f'Write to <a href="mailto:{EMAIL}">{EMAIL}</a> or call <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>. Put the subject that fits at the start of the subject line so the right message is seen first.',
  f'''<h2>1. Email and phone</h2><table><thead><tr><th>Subject</th><th>Use it for</th></tr></thead><tbody>
<tr><td>Enquiry</td><td>Questions about Corporate Tambola, quotes for custom software, meetings</td></tr>
<tr><td>Billing</td><td>Invoices, payments, receipts, credit and a wrong or double charge (see the <a href="/refund/">Cancellation and Refund Policy</a>)</td></tr>
<tr><td>Support</td><td>A problem with a game or with something we delivered</td></tr>
<tr><td>Grievance</td><td>A complaint about how we handled personal data</td></tr>
<tr><td>Data request</td><td>To see, correct or erase your personal data, or withdraw consent (see the <a href="/privacy/">Privacy Policy</a>)</td></tr></tbody></table>
<p>Email: <a href="mailto:{EMAIL}">{EMAIL}</a><br>Phone: <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a><br>Support hours: Monday to Saturday, 10:00 to 18:00 Indian Standard Time (closed on public holidays). We reply to every email within 2 working days.</p>
<h2 id="grievance">2. Grievance Redressal Officer</h2><p><b>{OWNER}</b>, Grievance Redressal Officer, {CO}.<br>Email: <a href="mailto:{EMAIL}?subject=Grievance">{EMAIL}</a> (subject: Grievance)<br>Phone: <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a></p><p>We acknowledge every grievance within 48 hours of receiving it and resolve it within 30 days. If you are not satisfied with the outcome you can complain to the Data Protection Board of India (for personal data) or to the relevant regulator or consumer forum.</p>
<h2>3. Business details</h2><p>{CO}<br>Sole proprietorship of {OWNER}<br>Based in {e(WHERE)}<br>Not registered for GST: GST is not charged.</p>
<h2>4. Payments</h2><p>Online payments are processed by our payment partner Razorpay. We never see or keep your card number. For anything about a payment, write to us with the payment reference.</p>''')

# ---------------------------------------------------------------- pricing
PAGES["pricing/index.html"] = doc("Pricing Details", f"Pricing details of {CO}: the price of a Corporate Tambola game by number of participants, in Indian rupees, with no GST added.", "/pricing/", f"Version 1.0 · Effective {EFFECTIVE} · {TERMS_LINK}",
  "The price of a Corporate Tambola game depends on how many people can join. The price is in Indian rupees and is the whole amount: no GST is added. Custom software is quoted in writing before you pay.",
  f'''<h2>1. Corporate Tambola</h2><p>One payment is for one game. Building and publishing a game are free. You pay before the game starts; a game that is not paid for does not begin and nothing is charged. The price depends on the number of participants you allow:</p>
<table><thead><tr><th>Pack</th><th>Price (INR)</th></tr></thead><tbody>{pack_rows}</tbody></table>
<p>The limit you set does not have to match a pack size: you pay for the smallest pack that covers it. The price shown on the payment page is the amount you pay.</p>
<h2>2. Currency and tax</h2><p>All amounts are in Indian rupees. {CO} is not registered for GST, so no GST is added and none is shown on the invoice. The amount on the payment page is the whole amount.</p>
<h2>3. How you pay</h2><ul><li><b>Online</b> by UPI, debit card, credit card, net banking or wallet through our payment partner Razorpay, on the payment page of Corporate Tambola.</li><li><b>Credit.</b> If you cancelled an earlier paid game, the credit pays first (see the <a href="/refund/">Cancellation and Refund Policy</a>).</li></ul>
<p>We never see or keep your card number or bank login; Razorpay handles the payment under its own terms and security. Payment is confirmed when Razorpay confirms it, and we then e-mail the invoice to the address you gave.</p>
<h2>4. Custom software</h2><p>Custom work is priced for the job. After you tell us what you need, we send a written quotation with what is included, the delivery time and the amount in Indian rupees. The price is the one in your accepted quotation. There are no hidden charges.</p>
<h2>5. Changes</h2><p>The price of a game you have paid for does not change. We may change the prices of future games at any time; the price shown on the payment page when you pay is the price that applies.</p>''')

# ---------------------------------------------------------------- refund (the Corporate Tambola rule: credit, not refund)
PAGES["refund/index.html"] = doc("Cancellation and Refund Policy", f"Cancellation and refund policy of {CO}: a cancelled paid game can be moved to a new date for 30 days, and the payment stays as credit for 365 days.", "/refund/", f"Version 1.0 · Effective {EFFECTIVE} · {TERMS_LINK}",
  "We do not give refunds for a game you cancel. Instead, for 30 days you can move the game to a new date, and your payment stays as credit for your next game for 365 days. A wrong or double charge is always put right.",
  f'''<h2>1. Cancelling a game that was not paid for</h2><p>You can cancel at any time. Nothing was charged, so there is nothing to return.</p>
<h2>2. Cancelling a game that was paid for, before it starts</h2><ul><li>We do not give refunds. Your payment stays with us as <b>credit</b> in your account.</li><li><b>For 30 days after you cancel</b> you can move that game to a new date. Your payment stays with the game and nothing more is due. The new date must be inside the 365 days below.</li><li>If you use the credit for another game first, or 30 days pass, the game cannot be moved. The credit stays for a new game.</li><li><b>Credit lasts 365 days</b> from the date of the payment, until the end of day 365 in India time. Unused credit then lapses and cannot be used or returned.</li></ul>
<p>We tell you the exact date when you cancel, and again 30 days and 3 days before the credit lapses.</p>
<h2>3. After the start time</h2><p>Once a paid game's start time has passed, it has started and cannot be cancelled.</p>
<h2>4. A wrong or double charge</h2><p>If a payment was taken more than once, or the amount charged is not the amount shown on the payment page, or money was taken and the game was not created, we refund the excess or the whole amount. Write to <a href="mailto:{EMAIL}?subject=Billing">{EMAIL}</a> with the subject "Billing", the payment reference, the amount and the date. We confirm in writing whether the refund is approved.</p>
<h2>5. How long a refund takes</h2><p>If a refund is approved we start it within 7 working days. It goes back to the original payment method (UPI, card, net banking or the account you paid from). Your bank or card issuer may take a further 5 to 7 working days to show it.</p>
<h2>6. Custom software</h2><p>For custom work, the cancellation terms are in your written quotation. If none are stated, you can stop at any time, you pay for the work already done, and we refund any advance beyond that.</p>
<h2>7. If you disagree</h2><p>Write to us first, and please contact us before raising a dispute with your bank so that we can fix a wrong charge quickly. For anything about personal data, use the grievance route in the <a href="/privacy/">Privacy Policy</a>.</p>''')

# ---------------------------------------------------------------- shipping
PAGES["shipping/index.html"] = doc("Shipping Policy", f"Shipping policy of {CO}: how and when our software and services are delivered. Everything is delivered online; nothing physical is shipped.", "/shipping/", f"Version 1.0 · Effective {EFFECTIVE} · {TERMS_LINK}",
  "Everything is delivered online. Nothing physical is shipped and there are no shipping charges. A Corporate Tambola game is ready as soon as the payment is confirmed.",
  f'''<h2>1. What we deliver</h2><p>For Corporate Tambola: the use of a game for the number of participants you paid for, with its link to share. For custom software: the software, access or documents described in your accepted quotation.</p>
<h2>2. How</h2><p>Online. A Corporate Tambola game is delivered in your console and by e-mail to the address you gave; you share its link with the participants. Custom software is delivered by a secure download link, by access to a hosted system or code repository, or by e-mail.</p>
<h2>3. When</h2><p>A Corporate Tambola game is ready within minutes after Razorpay confirms the payment. If you pay late, the game starts about 2 minutes after the payment is confirmed. For custom software, on the dates in the quotation; if there is no date, we tell you in writing within 2 working days after your payment is confirmed.</p>
<h2>4. Charges</h2><p>There is no shipping or delivery charge. The only amount is the one shown on the payment page or in your quotation (see <a href="/pricing/">Pricing Details</a>).</p>
<h2>5. If something does not arrive</h2><p>Check your spam folder first. Then write to <a href="mailto:{EMAIL}?subject=Support">{EMAIL}</a> with the subject "Support" and your payment reference or invoice number. We will fix it or tell you what is holding it up.</p>''')

# ---------------------------------------------------------------- privacy
PAGES["privacy/index.html"] = doc("Privacy Policy", f"How {CO} collects, uses and protects personal data.", "/privacy/", "Version 1.0 · Effective " + EFFECTIVE,
  "We collect the least we need: who you are, how to reach you, what you paid for, and the technical records needed to keep our website secure. We do not sell personal data, we do not show advertising, and this website sets no cookies. You can ask us to show, correct or erase your data, and complain to us, and then to the Data Protection Board of India.",
  f'''<h2>1. Who is responsible</h2><p>{CO}, the trade name of {OWNER}, an individual in India (the "Business", "we"). For the personal data described in this policy we decide why and how it is used (we are the "Data Fiduciary" under the Digital Personal Data Protection Act, 2023). For a Corporate Tambola game, the organizer is in charge of the players' names and mobile numbers and we process them for the organizer.</p>
<h2>2. What we collect</h2><table><thead><tr><th>What</th><th>Examples</th><th>How</th></tr></thead><tbody>
<tr><td>Contact details</td><td>Name, email, phone, organisation</td><td>You, when you write to us or pay</td></tr>
<tr><td>Payment details</td><td>Name, e-mail, organisation, what you paid for, the invoice and payment reference. We never see or keep card numbers; Razorpay handles the payment.</td><td>You</td></tr>
<tr><td>Mail you send us</td><td>Messages and attachments, sender address</td><td>You</td></tr>
<tr><td>Technical data</td><td>IP address, browser type, date and time, pages requested</td><td>Automatically, in our hosting provider's logs. This website sets no advertising or analytics cookies.</td></tr></tbody></table>
<p>We do not intentionally collect sensitive personal data such as health records, biometric data or passwords through this website. Our website is not directed at children.</p>
<p><b>Corporate Tambola.</b> Players' names and mobile numbers are deleted within 24 hours after a game ends. Winners' prize hand-over details are kept for 365 days. Payment records and the organizer's invoice details are kept as the law requires. Read the <a href="{PRODUCT_URL}/legal.html#privacy">Corporate Tambola Privacy and Data Policy</a>.</p>
<h2>3. Why we use it</h2><ul><li>To answer you, deliver what you paid for and give support.</li><li>To invoice, take payment and meet tax and accounting duties.</li><li>To handle grievances and data requests.</li><li>To keep our website secure and fix faults.</li><li>To protect or defend legal rights and comply with lawful orders.</li></ul>
<p>We do not use personal data for advertising, we do not sell it, and we do not use it to train artificial-intelligence models.</p>
<h2>4. Who receives it</h2><table><thead><tr><th>Recipient</th><th>Why</th></tr></thead><tbody>
<tr><td>Razorpay</td><td>To take and reconcile online payments</td></tr>
<tr><td>Cloudflare</td><td>To host and protect this website and Corporate Tambola</td></tr>
<tr><td>Resend</td><td>To send e-mail (sign-in codes, invoices, reports)</td></tr>
<tr><td>Google (email)</td><td>To receive the mail you send us</td></tr>
<tr><td>Professional advisers and auditors</td><td>To advise us, under duties of confidence</td></tr>
<tr><td>Courts, the Data Protection Board of India, police and other authorities</td><td>Only where the law requires or a lawful order is received</td></tr></tbody></table>
<p>Transfers outside India are made as section 16 of the Digital Personal Data Protection Act, 2023 allows.</p>
<h2>5. How long we keep it</h2><ul><li><b>Corporate Tambola:</b> player data within 24 hours of the game ending; winners' details 365 days; payment records and invoices as the law requires.</li><li><b>Mail and support records:</b> as long as needed to deal with the matter, then deleted, unless a dispute or legal duty needs them kept longer.</li><li><b>Website and hosting logs:</b> a short operational period, and longer where the law requires.</li></ul>
<h2>6. Security</h2><p>We use encrypted connections, store only what we need and limit who can see what. No system is perfectly secure; if there is a personal data breach that the law requires us to report, we report it to the Data Protection Board of India and to the people affected.</p>
<h2>7. Your rights</h2><p>You may ask us to show you the personal data we hold about you, correct it, complete it or erase it; to withdraw a consent you gave; and to nominate someone to exercise these rights for you. Write to <a href="mailto:{EMAIL}?subject=Data%20request">{EMAIL}</a> with the subject "Data request". We verify it is you and answer within the time the law allows.</p>
<h2>8. Grievance Officer</h2><p><b>{OWNER}</b>, Grievance Officer. Email <a href="mailto:{EMAIL}?subject=Grievance">{EMAIL}</a> (subject: Grievance) or phone <a href="tel:{PHONE_TEL}">{PHONE_TXT}</a>. We acknowledge every grievance within 48 hours and resolve it within 30 days. If you are not satisfied you may complain to the Data Protection Board of India.</p>
<h2>9. Changes</h2><p>We will update this policy when our practice changes and show the new effective date at the top.</p>''')

# ---------------------------------------------------------------- terms
PAGES["terms/index.html"] = doc("Terms and Conditions", f"Terms for using the website and services of {CO}.", "/terms/", f"Version 1.0 · Effective {EFFECTIVE}",
  "These terms cover this website, Corporate Tambola payments and our software services. A written quotation for a custom job adds the details of that job. Indian law applies.",
  f'''<h2>1. Who we are and what these terms cover</h2><p>These terms are between you and {CO}, the trade name of {OWNER}, an individual in India, based in {e(WHERE)}. They apply to this website, to payments for Corporate Tambola and to the software services we provide. If a written quotation for a custom job differs from these terms on a point, the quotation prevails for that job.</p>
<h2>2. Using the website</h2><p>You may read and use this website for lawful purposes. Do not try to break, overload or gain unauthorised access to it, and do not copy it in a way that suggests it is yours.</p>
<h2>3. Corporate Tambola</h2><p>Corporate Tambola is a game for a closed group, played for fun at company events. We provide the online software only; the organizer runs the game and is responsible for the people they invite and for any prizes. Building and publishing are free; a paid game needs payment before it starts. Read the <a href="{PRODUCT_URL}/legal.html">rules, privacy and disclaimer</a> of the game.</p>
<h2>4. Prices and payment</h2><p>Prices are in Indian rupees and are the whole amount: we are not registered for GST, so none is added. Online payments are processed by Razorpay under its own terms. An invoice is e-mailed for every payment. See <a href="/pricing/">Pricing Details</a>, the <a href="/refund/">Cancellation and Refund Policy</a> and the <a href="/shipping/">Shipping Policy</a>.</p>
<h2>5. Cancelling and credit</h2><p>We do not give refunds for a cancelled game. A paid game that is cancelled before it starts can be moved to a new date for 30 days, and the payment stays as credit for your next game for 365 days from the payment. Unused credit then lapses. A wrong or double charge is refunded. See the <a href="/refund/">Cancellation and Refund Policy</a>.</p>
<h2>6. Your responsibilities</h2><p>Give us correct information. You are responsible for the people and data you put into a game and for having the right to use them, including personal data. Keep any link or key we give you private; you are responsible for what is done with it.</p>
<h2>7. What we do not promise</h2><p>We take care and use reasonable skill. Software can still be wrong or unavailable at times. Nothing we provide is legal, tax or professional advice or a guarantee of any result.</p>
<h2>8. Limit of liability</h2><p>To the fullest extent the law allows: we are not liable for indirect or consequential loss, lost profits, lost data or goodwill; and our total liability for any claim connected with a payment is limited to the amount you paid for it. Nothing in these terms limits liability that the law does not allow to be limited, including for fraud or wilful misconduct.</p>
<h2>9. Governing law and disputes</h2><p>These terms are governed by the laws of India. Write to us describing any dispute and we will try in good faith to settle it within 30 days. A dispute not settled in that time is decided by arbitration under the Arbitration and Conciliation Act, 1996 by a sole arbitrator agreed by the parties. The seat and venue are Ghaziabad, Uttar Pradesh, and the language is English. Subject to that, the courts at Ghaziabad have jurisdiction.</p>
<h2>10. General</h2><p>These terms, with any quotation and our <a href="/privacy/">Privacy Policy</a>, are the whole agreement between us on their subject. If a part is unenforceable the rest stays in force. We may update these terms; the new version applies from its effective date. Questions: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>''')

PAGES["404.html"] = head(f"Page not found · {CO}", "Page not found.", "/404.html") + '''<main id="main"><div class="doc"><h1>That page is not here</h1><p>Please go back to the <a href="/">home page</a> or <a href="/contact/">contact us</a>.</p></div></main>''' + foot()
PATHS = ["/", "/about/", "/contact/", "/terms/", "/privacy/", "/refund/", "/shipping/", "/pricing/"]

def write(rel, content):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f: f.write(content)

if os.path.isdir(OUT):
    for name in os.listdir(OUT):
        q = os.path.join(OUT, name); shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
for rel, c in PAGES.items(): write(rel, c)
HERE = os.path.dirname(os.path.abspath(__file__))
shutil.copy(os.path.join(HERE, "site.css"), os.path.join(OUT, "site.css"))
shutil.copytree(os.path.join(HERE, "fonts"), os.path.join(OUT, "fonts"), dirs_exist_ok=True)
write("logo.svg", LOGO); write("favicon.svg", LOGO)
write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"<url><loc>{SITE_URL}{p}</loc><changefreq>monthly</changefreq></url>\n" for p in PATHS) + "</urlset>\n")
write("_headers", """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/site.css
  Cache-Control: public, max-age=3600
/*.svg
  Cache-Control: public, max-age=86400
""")
print("built", len(PAGES), "pages ->", OUT)
