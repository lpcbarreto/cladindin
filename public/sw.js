// Service worker do Cladindin: só guarda os arquivos estáticos do app.
// Dados financeiros nunca vão para o cache: páginas e APIs sempre vêm da rede.
const CACHE = "cladindin-v2";
const OFFLINE = "/fora-do-ar.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/pwa-icon/192"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Sem rede ou servidor fora do ar (502/503/504): mostra a tela "Voltamos já" guardada no aparelho
    e.respondWith(
      fetch(req)
        .then((res) => (res.status >= 502 && res.status <= 504 ? caches.match(OFFLINE).then((hit) => hit || res) : res))
        .catch(() => caches.match(OFFLINE)),
    );
    return;
  }
  // Arquivos com hash no nome (_next/static) são imutáveis: cache primeiro
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
