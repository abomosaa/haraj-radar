// Service worker: offline app shell + push notifications.
const CACHE = "haraj-radar-v5";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for the app shell (always fresh when online), cache when
// offline. API calls and Haraj images are never cached here.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: e.data && e.data.text() }; }
  const title = data.title || "رادار حراج";
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "./icons/icon-192.png",
      badge: "./icons/badge-72.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      dir: "rtl",
      lang: "ar",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const sameApp = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (sameApp && target.startsWith(self.location.origin)) {
        return sameApp.navigate(target).then((w) => (w || sameApp).focus());
      }
      return self.clients.openWindow(target);
    })
  );
});
