/* DevOps-маршрут: поиск по курсу (Ctrl+K или «/»). Индекс search.json собирает build.py, грузится при первом открытии. */
(function () {
  "use strict";

  const src = document.querySelector('script[src*="static/search.js"]').getAttribute("src");
  const prefix = (src.match(/^(.*?)static\//) || ["", ""])[1];
  const ver = (src.match(/\?v=(\w+)/) || ["", ""])[1];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => s.toLowerCase().replace(/ё/g, "е");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let index = null, loading = null, box = null, sel = 0, hits = [];

  function load() {
    if (!loading) loading = fetch(prefix + "search.json" + (ver ? "?v=" + ver : "")).then((r) => r.json()).then((items) => {
      index = items.map((it) => Object.assign(it, { nt: norm(it.t), nx: norm(it.x), ns: norm(it.s) }));
    });
    return loading;
  }

  function search(q) {
    const terms = norm(q).split(/\s+/).filter((t) => t.length > 1 || /\w/.test(t));
    if (!terms.length) return [];
    const out = [];
    for (const it of index) {
      let score = 0, ok = true;
      for (const t of terms) {
        const inT = it.nt.indexOf(t), inX = it.nx.indexOf(t), inS = it.ns.indexOf(t);
        if (inT < 0 && inX < 0 && inS < 0) { ok = false; break; }
        if (inT >= 0) score += 12 + (inT === 0 || /[\s.(«"-]/.test(it.nt[inT - 1]) ? 6 : 0);
        if (inS >= 0) score += 4;
        if (inX >= 0) score += 2 + Math.min(4, it.nx.split(t).length - 2);
      }
      if (ok) out.push({ it, score: score - (it.s === "урок" ? 0 : 1) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 30).map((h) => h.it);
  }

  function snippet(it, terms) {
    if (!it.x) return "";
    let at = -1;
    for (const t of terms) { const k = it.nx.indexOf(t); if (k >= 0 && (at < 0 || k < at)) at = k; }
    if (at < 0) return esc(it.x.slice(0, 140)) + (it.x.length > 140 ? "…" : "");
    const from = Math.max(0, at - 60), to = Math.min(it.x.length, at + 110);
    return (from ? "…" : "") + mark(it.x.slice(from, to), terms) + (to < it.x.length ? "…" : "");
  }
  function mark(text, terms) {
    const re = new RegExp("(" + terms.map(reEsc).join("|") + ")", "gi");
    return esc(text).replace(re, "<mark>$1</mark>");
  }

  function draw() {
    const input = box.querySelector("input"), list = box.querySelector(".search-list");
    const q = input.value.trim();
    if (!index) { list.innerHTML = '<div class="search-empty">загружаю индекс…</div>'; return; }
    if (!q) { list.innerHTML = '<div class="search-empty">Ищи по урокам, командам и вопросам с собеседований: <code>chmod</code>, <code>rollback</code>, <code>индекс</code>, <code>CrashLoopBackOff</code></div>'; hits = []; return; }
    hits = search(q);
    const terms = norm(q).split(/\s+/).filter(Boolean);
    sel = Math.min(sel, Math.max(0, hits.length - 1));
    list.innerHTML = hits.length ? hits.map((it, k) => `<a class="search-hit ${k === sel ? "on" : ""}" href="${prefix}${it.u}" data-k="${k}">
        <span class="search-where">${esc(it.s)}</span><b>${mark(it.t, terms)}</b><span class="search-snip">${snippet(it, terms)}</span></a>`).join("")
      : `<div class="search-empty">Ничего не нашлось по «${esc(q)}». Попробуй другое слово или английское название команды.</div>`;
    list.querySelectorAll(".search-hit").forEach((a) => a.addEventListener("mousemove", () => { if (sel !== +a.dataset.k) { sel = +a.dataset.k; paint(); } }));
  }
  function paint() {
    box.querySelectorAll(".search-hit").forEach((a, k) => a.classList.toggle("on", k === sel));
    const on = box.querySelector(".search-hit.on"); if (on) on.scrollIntoView({ block: "nearest" });
  }

  function open() {
    if (!box) {
      box = document.createElement("div");
      box.className = "search-modal";
      box.innerHTML = `<div class="search-panel" role="dialog" aria-label="Поиск по курсу"><div class="search-bar"><span>⌕</span>
        <input type="search" placeholder="Поиск по курсу…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="search-list"></div></div>`;
      document.body.appendChild(box);
      const input = box.querySelector("input");
      input.addEventListener("input", () => { sel = 0; draw(); });
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); paint(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
        else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); go(prefix + hits[sel].u); }
      });
      box.addEventListener("click", (e) => {
        if (e.target === box) close();
        const a = e.target.closest(".search-hit"); if (a) { e.preventDefault(); go(a.getAttribute("href")); }
      });
    }
    box.classList.add("open");
    document.body.classList.add("search-lock");
    const input = box.querySelector("input");
    input.focus(); input.select();
    draw();
    load().then(draw, () => { box.querySelector(".search-list").innerHTML = '<div class="search-empty">Не удалось загрузить индекс поиска.</div>'; });
  }
  function close() { if (box) box.classList.remove("open"); document.body.classList.remove("search-lock"); }
  function go(url) {
    close();
    const target = new URL(url, location.href);
    if (target.pathname === location.pathname && target.hash) location.hash = target.hash;
    else location.href = url;
  }

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K" || e.code === "KeyK")) { e.preventDefault(); open(); }
    else if (e.key === "/" && !typing) { e.preventDefault(); open(); }
    else if (e.key === "Escape" && box && box.classList.contains("open")) close();
  });
  const btn = document.getElementById("search-open");
  if (btn) btn.onclick = open;
  window.SEARCH = { open };
})();
