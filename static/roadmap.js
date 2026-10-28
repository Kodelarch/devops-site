/* DevOps-маршрут: дорожная карта навыков — уроки по частям, стрелки «что нужно знать до», статус из прогресса. */
(function () {
  "use strict";

  const host = document.getElementById("roadmap");
  if (!host || !window.COURSE) return;
  const C = window.COURSE;
  const pct = (slug) => (window.APP ? APP.lessonPct(slug) : 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const W = 176, H = 58, GX = 64, GY = 14, TOP = 46;

  // статус: done — пройден, progress — начат, open — все предпосылки пройдены, locked — ещё рано
  const needs = (slug) => (C.lessons[slug].needs || []).filter((n) => C.lessons[n]);
  const ready = (slug) => needs(slug).every((n) => pct(n) === 100);
  const status = (slug) => pct(slug) === 100 ? "done" : pct(slug) > 0 ? "progress" : ready(slug) ? "open" : "locked";
  const cls = (st) => "is-" + st;

  const pos = {};
  let maxRows = 0;
  C.parts.forEach((p, col) => {
    p.lessons.forEach((slug, row) => { pos[slug] = { x: col * (W + GX), y: TOP + row * (H + GY), col }; });
    maxRows = Math.max(maxRows, p.lessons.length);
  });
  const projects = Object.entries(C.projects || {});
  const gateRows = Math.max(0, ...C.parts.map((p) => projects.filter(([, pr]) => pr.after === p.id).length));
  const width = C.parts.length * (W + GX) - GX;
  const height = TOP + maxRows * (H + GY) + gateRows * 40 + 10;

  function edge(from, to) {
    const a = pos[from], b = pos[to];
    if (a.col === b.col) {
      // внутри колонки — дуга слева
      const x = a.x, y1 = a.y + H / 2, y2 = b.y + H / 2, bend = 18 + Math.min(30, (y2 - y1) / 8);
      return `M${x} ${y1} C${x - bend} ${y1}, ${x - bend} ${y2}, ${x} ${y2}`;
    }
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, dx = Math.max(30, (x2 - x1) / 2);
    return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  function draw() {
    // рисуем только прямые связи: если A нужен для B, а B для C, стрелку A → C не показываем
    const ancestorsOf = (slug, acc) => { needs(slug).forEach((n) => { if (!acc.has(n)) { acc.add(n); ancestorsOf(n, acc); } }); return acc; };
    const edges = [];
    Object.keys(C.lessons).forEach((slug) => needs(slug).forEach((n) => {
      if (!needs(slug).some((m) => m !== n && ancestorsOf(m, new Set()).has(n))) edges.push([n, slug]);
    }));
    const heads = C.parts.map((p, col) => `<div class="rm-part" style="left:${col * (W + GX)}px;width:${W}px;--c:var(--c${+p.id % 7})">${esc(p.title)}</div>`).join("");
    const nodes = Object.keys(pos).map((slug) => {
      const l = C.lessons[slug], st = status(slug), v = pct(slug), p = pos[slug];
      return `<a class="rm-node ${cls(st)}" href="lessons/${slug}.html" data-slug="${slug}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px;--c:var(--c${+l.part % 7})">
        <span class="rm-num">${l.number}</span><span class="rm-title">${esc(l.title)}</span>
        <span class="rm-bar"><i style="width:${v}%"></i></span><span class="rm-badge">${st === "done" ? "✓" : st === "locked" ? "🔒" : v ? v + "%" : "→"}</span></a>`;
    }).join("");
    const gates = C.parts.map((p, col) => projects.filter(([, pr]) => pr.after === p.id).map(([slug, pr], k) => {
      const v = window.APP ? APP.projectPct(slug) : 0;
      return `<a class="rm-gate ${pr.kind} ${v === 100 ? "done" : ""}" href="projects/${slug}.html" style="left:${col * (W + GX)}px;top:${TOP + p.lessons.length * (H + GY) + k * 40}px;width:${W}px" title="${esc(pr.title)}">⚑ ${esc(pr.code)} · ${v}%</a>`;
    }).join("")).join("");
    const paths = edges.map(([a, b]) => `<path d="${edge(a, b)}" data-from="${a}" data-to="${b}" class="${pct(a) === 100 ? "lit" : ""}"/>`).join("");
    host.innerHTML = `<div class="rm-canvas" style="width:${width + 30}px;height:${height}px">
      <svg class="rm-edges" width="${width + 30}" height="${height}" viewBox="-30 0 ${width + 30} ${height}" style="left:-30px"><defs><marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>${paths}</svg>
      ${heads}${nodes}${gates}</div>`;

    // наведение: подсветить всё, что нужно знать до этого урока
    const ancestors = (slug, acc) => { needs(slug).forEach((n) => { if (!acc.has(n)) { acc.add(n); ancestors(n, acc); } }); return acc; };
    host.querySelectorAll(".rm-node").forEach((el) => {
      const on = () => {
        const set = ancestors(el.dataset.slug, new Set()); set.add(el.dataset.slug);
        host.classList.add("focus");
        host.querySelectorAll(".rm-node").forEach((n) => n.classList.toggle("hl", set.has(n.dataset.slug)));
        host.querySelectorAll(".rm-edges path").forEach((pth) => pth.classList.toggle("hl", set.has(pth.dataset.to) && set.has(pth.dataset.from)));
      };
      el.addEventListener("mouseenter", on); el.addEventListener("focus", on);
      const off = () => { host.classList.remove("focus"); host.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl")); };
      el.addEventListener("mouseleave", off); el.addEventListener("blur", off);
    });

    // сводка и следующий шаг
    const all = Object.keys(C.lessons), count = (s) => all.filter((x) => status(x) === s).length;
    const next = all.find((s) => status(s) === "progress") || all.find((s) => status(s) === "open");
    const sum = document.getElementById("roadmap-summary");
    if (sum) sum.innerHTML = `<div class="rm-stats"><span class="rm-key is-done">✓ пройдено <b>${count("done")}</b></span><span class="rm-key is-progress">◐ начато <b>${count("progress")}</b></span><span class="rm-key is-open">→ доступно <b>${count("open")}</b></span><span class="rm-key is-locked">🔒 рано <b>${count("locked")}</b></span></div>`
      + (next ? `<a class="btn btn-primary" href="lessons/${next}.html">${status(next) === "progress" ? "Продолжить" : "Следующий шаг"}: ${C.lessons[next].number} ${esc(C.lessons[next].title)} →</a>` : '<b>Весь маршрут пройден 🚀</b>');
    if (next) {
      const el = host.querySelector(`[data-slug="${next}"]`);
      el.classList.add("next");
      if (host.scrollWidth > host.clientWidth) host.scrollLeft = Math.max(0, pos[next].x - 40);
    }
  }
  draw();
})();
