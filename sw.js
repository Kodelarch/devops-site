/* DevOps-маршрут: service worker — сайт открывается без интернета и ставится на телефон как приложение.
   Страницы: сначала сеть (чтобы видеть свежие уроки), без сети — из кеша. Скрипты и стили с ?v= — из кеша.
   Картинки, шрифты и движки песочниц кешируются при первом открытии. Собирается build.py. */
const VERSION = "5261b884a0";
const CORE = "core-" + VERSION;
const RUNTIME = "runtime-v1";
const PRECACHE = ["./", "manifest.webmanifest", "course.js?v=5261b884a0", "static/shop.sql", "search.json?v=5261b884a0", "cards.html", "cluster.html", "games.html", "incident.html", "index.html", "interview.html", "lab.html", "lessons/0-1.html", "lessons/1-1.html", "lessons/1-2.html", "lessons/1-3.html", "lessons/1-4.html", "lessons/2-1.html", "lessons/2-10.html", "lessons/2-11.html", "lessons/2-2.html", "lessons/2-3.html", "lessons/2-4.html", "lessons/2-5.html", "lessons/2-6.html", "lessons/2-7.html", "lessons/2-8.html", "lessons/2-9.html", "lessons/3-1.html", "lessons/3-2.html", "lessons/4-1.html", "lessons/4-2.html", "lessons/4-3.html", "lessons/4-4.html", "lessons/4-5.html", "lessons/5-1.html", "lessons/5-2.html", "lessons/5-3.html", "lessons/5-4.html", "lessons/6-1.html", "lessons/6-2.html", "lessons/6-3.html", "lint.html", "profile.html", "projects/m1.html", "projects/m2.html", "projects/m3.html", "projects/m4.html", "projects/p1.html", "projects/p2.html", "projects/p3.html", "projects/portfolio.html", "python.html", "resume.html", "roadmap.html", "sql.html", "terminal.html", "static/app.js?v=5261b884a0", "static/cluster.js?v=5261b884a0", "static/explain.js?v=5261b884a0", "static/fx.js?v=5261b884a0", "static/games.js?v=5261b884a0", "static/icons/apple-touch-icon.png", "static/icons/icon-192.png", "static/icons/icon-512.png", "static/icons/maskable-512.png", "static/icons.svg?v=5261b884a0", "static/incident.js?v=5261b884a0", "static/interview.js?v=5261b884a0", "static/lint.js?v=5261b884a0", "static/pybox.js?v=5261b884a0", "static/pyworker.js?v=5261b884a0", "static/reader.js?v=5261b884a0", "static/resume.js?v=5261b884a0", "static/roadmap.js?v=5261b884a0", "static/search.js?v=5261b884a0", "static/sqlbox.js?v=5261b884a0", "static/style.css?v=5261b884a0", "static/term.js?v=5261b884a0", "static/tour.js?v=5261b884a0"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("core-") && k !== CORE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromNetwork(req, cacheName, fresh) {
  // fresh: сверка с сервером в обход HTTP-кеша браузера, чтобы после публикации сразу видеть новую версию
  const res = await fetch(fresh ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : req);
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(req, copy));
  }
  return res;
}

async function page(req) {
  try {
    const res = await fromNetwork(req, CORE, true);
    // переход вида /devops-site → /devops-site/: навигации нельзя отдать «перенаправленный» ответ, отдаём сам редирект
    return res.redirected ? Response.redirect(res.url, 302) : res;
  } catch (err) {
    const url = new URL(req.url);
    const hit = await caches.match(req, { ignoreSearch: true })
      || (url.pathname.endsWith("/") && await caches.match(new URL("index.html", url), { ignoreSearch: true }));
    return hit || caches.match(new URL("index.html", self.registration.scope));
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;
  const url = new URL(req.url);
  if (req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith(".html"))) {
    e.respondWith(page(req));
    return;
  }
  // course.js меняется вместе со страницами — тоже сначала сеть
  if (url.origin === location.origin && url.pathname.endsWith("/course.js")) {
    e.respondWith(fromNetwork(req, CORE, true).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fromNetwork(req, RUNTIME)));
});
