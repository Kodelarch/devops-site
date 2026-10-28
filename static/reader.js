/* DevOps-маршрут: комфорт чтения и мобильные жесты.
   Размер текста и фокус-режим, закладки на шагах, маркер и заметки на полях (хранятся в прогрессе),
   список заметок в профиле, свайпы между шагами урока и в карточках. */
(function () {
  "use strict";

  if (!window.APP) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ICON = window.ICON || (() => "");
  const PREF = "devops-course-reader";
  const SIZES = [15, 16.5, 18, 20];
  const kind = document.body.dataset.page;
  let pref = { size: 1, focus: false };
  try { pref = Object.assign(pref, JSON.parse(localStorage.getItem(PREF) || "{}")); } catch (e) { /* ignore */ }
  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { /* ignore */ } };
  function applyPref() {
    document.documentElement.style.setProperty("--prose-size", SIZES[pref.size] + "px");
    document.documentElement.classList.toggle("focus-mode", !!pref.focus && kind === "lesson");
  }
  applyPref();
  const S = () => { const s = APP.state(); s.notes = s.notes || []; s.bookmarks = s.bookmarks || {}; return s; };

  // ---------------------------------------------------------------- урок
  function initLesson() {
    const data = JSON.parse($("#page-data").textContent), slug = data.lesson;
    const main = $(".lesson-main");

    // панель чтения
    const bar = document.createElement("div");
    bar.className = "reader-bar";
    bar.innerHTML = `<button type="button" class="reader-btn" data-r="minus" title="Мельче">A−</button><button type="button" class="reader-btn" data-r="plus" title="Крупнее">A+</button>
      <button type="button" class="reader-btn" data-r="all" title="Показать урок целиком одной лентой или по шагам">${ICON("course")}<span>весь урок</span></button>
      <button type="button" class="reader-btn" data-r="focus" title="Фокус-режим: без фона и анимаций">${ICON("focus")}<span>фокус</span></button>`;
    main.insertBefore(bar, main.firstChild);
    const drawBar = () => { bar.querySelector('[data-r="focus"]').classList.toggle("on", !!pref.focus); bar.querySelector('[data-r="all"]').classList.toggle("on", !!pref.all); bar.querySelector('[data-r="minus"]').disabled = pref.size === 0; bar.querySelector('[data-r="plus"]').disabled = pref.size === SIZES.length - 1; };
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]"); if (!b) return;
      if (b.dataset.r === "minus") pref.size = Math.max(0, pref.size - 1);
      if (b.dataset.r === "plus") pref.size = Math.min(SIZES.length - 1, pref.size + 1);
      if (b.dataset.r === "focus") { pref.focus = !pref.focus; APP.toast(pref.focus ? "Фокус-режим: фон и анимации выключены" : "Фокус-режим выключен", ""); }
      if (b.dataset.r === "all") {
        pref.all = !pref.all; savePref();
        document.dispatchEvent(new CustomEvent("lessonmode", { detail: pref.all }));
        APP.toast(pref.all ? "Весь урок одной лентой: шаг засчитывается, когда дочитаешь его до конца" : "Снова по шагам", "");
      }
      savePref(); applyPref(); drawBar();
    });
    drawBar();

    // закладки на шагах
    $$(".step").forEach((sec) => {
      const h = sec.querySelector("h2"); if (!h) return;
      const key = slug + "#" + sec.id;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "bm-btn"; btn.title = "Закладка на этот шаг"; btn.innerHTML = ICON("bookmark");
      const draw = () => btn.classList.toggle("on", !!S().bookmarks[key]);
      btn.onclick = () => {
        const s = S();
        if (s.bookmarks[key]) delete s.bookmarks[key];
        else s.bookmarks[key] = { lesson: slug, step: sec.id, number: data.number, title: data.title, stepTitle: h.textContent, at: Date.now() };
        APP.save(); draw(); APP.toast(s.bookmarks[key] ? "Закладка добавлена — список в профиле" : "Закладка убрана", "");
      };
      h.appendChild(btn); draw();
    });

    // маркер и заметки
    applyHighlights(slug);
    const tip = document.createElement("div");
    tip.className = "hl-tip"; tip.hidden = true;
    tip.innerHTML = `<button type="button" data-h="mark">${ICON("highlight")} Выделить</button><button type="button" data-h="note">${ICON("note")} Заметка</button>`;
    document.body.appendChild(tip);
    let pending = null;
    function onSelect() {
      const sel = window.getSelection();
      const text = sel && sel.toString().replace(/\s+/g, " ").trim();
      if (!text || text.length < 3 || text.length > 600) { tip.hidden = true; pending = null; return; }
      const range = sel.getRangeAt(0), host = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      const step = host.closest(".step"), prose = host.closest(".prose");
      if (!step || !prose || host.closest(".quiz, .flashcards, .task, textarea, .explain, .hl")) { tip.hidden = true; return; }
      pending = { step: step.id, text };
      const r = range.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + "px";
      tip.style.top = (window.scrollY + r.top - tip.offsetHeight - 8) + "px";
    }
    document.addEventListener("mouseup", () => setTimeout(onSelect, 10));
    document.addEventListener("selectionchange", () => { if (window.matchMedia("(pointer: coarse)").matches) setTimeout(onSelect, 300); });
    tip.addEventListener("mousedown", (e) => e.preventDefault());
    tip.addEventListener("click", (e) => {
      const b = e.target.closest("[data-h]"); if (!b || !pending) return;
      let note = "";
      if (b.dataset.h === "note") { note = prompt("Заметка к выделенному:", "") || ""; if (!note.trim()) return; }
      S().notes.push({ id: Date.now().toString(36), lesson: slug, number: data.number, title: data.title, step: pending.step, text: pending.text, note: note.trim(), at: Date.now() });
      APP.save(); window.getSelection().removeAllRanges(); tip.hidden = true; pending = null;
      applyHighlights(slug);
    });

    // клик по выделению: заметка, изменить, удалить
    const pop = document.createElement("div");
    pop.className = "hl-pop"; pop.hidden = true; document.body.appendChild(pop);
    document.addEventListener("click", (e) => {
      const m = e.target.closest("mark.hl");
      if (!m) { if (!e.target.closest(".hl-pop")) pop.hidden = true; return; }
      const n = S().notes.find((x) => x.id === m.dataset.id); if (!n) return;
      pop.innerHTML = `${n.note ? `<p>${esc(n.note)}</p>` : '<p class="hl-muted">Выделение без заметки</p>'}<div><button type="button" data-p="edit">${n.note ? "Изменить" : "Добавить заметку"}</button><button type="button" data-p="del">Убрать</button></div>`;
      const r = m.getBoundingClientRect();
      pop.hidden = false;
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left)) + "px";
      pop.style.top = (window.scrollY + r.bottom + 6) + "px";
      pop.onclick = (ev) => {
        const b = ev.target.closest("[data-p]"); if (!b) return;
        const s = S();
        if (b.dataset.p === "del") s.notes = s.notes.filter((x) => x.id !== n.id);
        else { const v = prompt("Заметка:", n.note || ""); if (v === null) return; n.note = v.trim(); }
        APP.save(); pop.hidden = true; applyHighlights(slug);
      };
    });

    // свайпы между шагами на телефоне
    swipe(main, (dir) => { if (pref.all) return; const b = dir < 0 ? $("#next-step") : $("#prev-step"); if (b && !b.disabled) b.click(); },
      (t) => t.closest("pre, code, table, textarea, input, .explain, .sqlbox, .flashcards, .ex-scene, .sql-table, .code-wrap"));
  }

  // находит текст внутри шага (даже если он разбит на несколько тегов) и оборачивает куски в <mark>
  function applyHighlights(slug) {
    $$("mark.hl").forEach((m) => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
    S().notes.filter((n) => n.lesson === slug).forEach((n) => {
      const prose = $(`#${CSS.escape(n.step)} .prose`); if (!prose) return;
      const nodes = [], walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
      let full = "", map = [];
      while (walker.nextNode()) { const t = walker.currentNode; if (t.parentElement.closest(".quiz, .flashcards, .explain, button")) continue; nodes.push(t); for (let i = 0; i < t.data.length; i++) map.push([t, i]); full += t.data; }
      // сравниваем без учёта лишних пробелов
      let norm = "", nmap = [];
      for (let i = 0; i < full.length; i++) { const ch = /\s/.test(full[i]) ? " " : full[i]; if (ch === " " && norm.endsWith(" ")) continue; norm += ch; nmap.push(i); }
      const at = norm.indexOf(n.text); if (at < 0) return;
      const start = nmap[at], end = nmap[at + n.text.length - 1] + 1;
      const pieces = new Map();
      for (let i = start; i < end; i++) { const [node, off] = map[i]; const p = pieces.get(node) || [off, off]; p[1] = off + 1; pieces.set(node, p); }
      pieces.forEach(([a, b], node) => {
        const r = document.createRange(); r.setStart(node, a); r.setEnd(node, b);
        const m = document.createElement("mark"); m.className = "hl" + (n.note ? " has-note" : ""); m.dataset.id = n.id;
        if (n.note) m.title = n.note;
        try { r.surroundContents(m); } catch (e) { /* узел уже изменён — пропускаем кусок */ }
      });
    });
  }

  function swipe(el, fn, ignore) {
    let x0 = null, y0 = 0, t0 = 0;
    el.addEventListener("touchstart", (e) => { if (e.touches.length !== 1 || (ignore && ignore(e.target))) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5 && Date.now() - t0 < 700 && !window.getSelection().toString()) fn(dx < 0 ? -1 : 1);
    }, { passive: true });
  }

  // ---------------------------------------------------------------- карточки: свайп вправо — знаю, влево — повторить
  function initCardSwipes() {
    $$("#deck, #flashcards").forEach((box) => {
      swipe(box, (dir) => {
        const yes = box.querySelector('[data-act="yes"]'), no = box.querySelector('[data-act="no"]'), show = box.querySelector('[data-act="show"]');
        const card = box.querySelector(".card");
        if (yes && no) { if (card) card.classList.add(dir > 0 ? "fly-r" : "fly-l"); setTimeout(() => (dir > 0 ? yes : no).click(), 180); }
        else if (show) show.click();
      }, (t) => t.closest("pre, code, .card-a"));
      if (window.matchMedia("(pointer: coarse)").matches) {
        const hint = document.createElement("p"); hint.className = "swipe-hint";
        hint.textContent = "На телефоне: свайп → «Знаю», свайп ← «Повторить»";
        box.parentNode.insertBefore(hint, box);
      }
    });
  }

  // ---------------------------------------------------------------- профиль: все заметки и закладки
  function initProfile() {
    const box = $("#notes"); if (!box) return;
    function draw() {
      const s = S(), bms = Object.entries(s.bookmarks).sort((a, b) => b[1].at - a[1].at), notes = s.notes.slice().sort((a, b) => b.at - a.at);
      if (!bms.length && !notes.length) { box.innerHTML = '<p class="game-help">Пока пусто. В уроке выдели текст мышкой (или пальцем) — появится кнопка «Выделить» и «Заметка». Закладка — значок рядом с заголовком шага.</p>'; return; }
      box.innerHTML = (bms.length ? `<h3 class="notes-h">${ICON("bookmark")} Закладки</h3><div class="notes-list">${bms.map(([k, b]) => `<div class="note-row"><a href="lessons/${b.lesson}.html#${b.step}"><b>${esc(b.number)}</b> ${esc(b.stepTitle)} <span>${esc(b.title)}</span></a><button type="button" data-bm="${esc(k)}" title="Убрать">×</button></div>`).join("")}</div>` : "")
        + (notes.length ? `<h3 class="notes-h">${ICON("highlight")} Выделения и заметки</h3><div class="notes-list">${notes.map((n) => `<div class="note-row"><a href="lessons/${n.lesson}.html#${n.step}"><b>${esc(n.number)}</b> <mark class="hl">${esc(n.text.length > 160 ? n.text.slice(0, 160) + "…" : n.text)}</mark>${n.note ? `<em>${esc(n.note)}</em>` : ""}</a><button type="button" data-note="${n.id}" title="Убрать">×</button></div>`).join("")}</div>` : "");
      box.querySelectorAll("[data-bm]").forEach((b) => b.onclick = () => { delete S().bookmarks[b.dataset.bm]; APP.save(); draw(); });
      box.querySelectorAll("[data-note]").forEach((b) => b.onclick = () => { const s = S(); s.notes = s.notes.filter((x) => x.id !== b.dataset.note); APP.save(); draw(); });
    }
    draw();
  }

  if (kind === "lesson") initLesson();
  if (kind === "profile") initProfile();
  initCardSwipes();
})();
