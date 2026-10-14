/* IT Services by Rajat Agarwal: service worker. Pages you have opened open again without internet; anything else shows the offline page.
   Never touches /api/ (payments are always live), the payment frame, the payment test page, or any other website. */
const V = "its-v1";
const CORE = ["/offline/", "/site.css", "/logo.svg", "/icon-192.png", "/fonts/inter-latin.woff2", "/fonts/dm-serif-display-latin.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const save = (req, res) => { if (res && res.ok && res.type === "basic") { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; };
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/payframe/")) return;
  if (r.mode === "navigate") {
    const live = u.pathname.startsWith("/paytest");
    e.respondWith(fetch(r).then((res) => (live ? res : save(r, res))).catch(() => Promise.resolve(live ? null : caches.match(r)).then((m) => m || caches.match("/offline/"))));
    return;
  }
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => save(r, res))));
});
