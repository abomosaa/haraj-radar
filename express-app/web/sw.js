// Service worker for the browser-only build: offline app shell,
// notifications, and occasional background checks (periodic sync) when the
// browser allows it for an installed app.
importScripts("./query.js", "./local-api.js");

const CACHE = "haraj-radar-web-v1";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./query.js", "./local-api.js",
  "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/badge-72.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App files: network first (always fresh), cache when offline.
// Haraj data and images go straight to the network.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});

function show(n) {
  return self.registration.showNotification(n.title, {
    body: n.body || "", icon: "./icons/icon-192.png", badge: "./icons/badge-72.png",
    tag: n.tag || undefined, renotify: Boolean(n.tag), dir: "rtl", lang: "ar", data: { url: n.url || "./" },
  });
}

// Background check while the app is closed (Chrome/Edge, installed app;
// the browser decides how often).
self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "haraj-radar-check") return;
  self.LocalAPI.setNotifier(show);
  e.waitUntil(self.LocalAPI.runAll("periodic").catch(() => {}));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const app = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (app && target.startsWith(self.registration.scope)) return app.navigate(target).then((w) => (w || app).focus());
      return self.clients.openWindow(target);
    })
  );
});
