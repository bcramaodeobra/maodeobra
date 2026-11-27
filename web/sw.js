// Service worker do app (PWA).
// Estratégia: sempre tenta a internet primeiro (assim as atualizações chegam na hora);
// se estiver sem internet, abre a última versão guardada.
const VERSAO = "bcra-v10";
const ARQUIVOS = [
  "./", "index.html", "dono.html", "producao.html", "motorista.html", "config.js",
  "css/style.css", "js/comum.js", "js/dono.js", "js/mao-de-obra.js", "js/motorista.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === self.location.origin;
  const biblioteca = url.hostname === "cdn.jsdelivr.net";
  if (!mesmoSite && !biblioteca) return; // dados do Supabase: sempre direto da internet

  e.respondWith(
    fetch(req, mesmoSite ? { cache: "no-cache" } : undefined)
      .then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});

// Notificações (app do motorista)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "BCRA", body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || "BCRA Mão de Obra", {
      body: d.body || "", tag: d.tag, renotify: true, icon: "icons/icon-192.png", badge: "icons/favicon-48.png",
      vibrate: [200, 100, 200], data: { url: d.url || "motorista.html" },
    });
    const abertos = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    abertos.forEach((c) => c.postMessage({ tipo: "push" }));
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "motorista.html", self.registration.scope).href;
  e.waitUntil((async () => {
    const abertos = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const ja = abertos.find((c) => c.url.startsWith(url));
    if (ja) return ja.focus();
    return self.clients.openWindow(url);
  })());
});
