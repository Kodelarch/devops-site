/* DevOps-маршрут: короткое знакомство с сайтом при первом входе на главную (или по ссылке ?tour=1 из профиля). */
(function () {
  "use strict";

  const KEY = "devops-course-tour";
  if (document.body.dataset.page !== "index") return;
  const forced = /[?&]tour=1/.test(location.search);
  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch (e) { seen = true; }
  if (seen && !forced) return;
  const mobile = () => window.matchMedia("(max-width: 720px)").matches;

  const STEPS = [
    { sel: "#continue", title: "Отсюда — в урок", text: "Главная кнопка ведёт ровно туда, где ты остановилась. Уроки идут по шагам: теория, практика руками, тест и вопросы с собеседований." },
    { sel: () => (mobile() ? ".bottomnav" : ".topnav"), title: "Разделы", text: "Карта навыков показывает весь маршрут, карточки — повторение по расписанию, а в Лаборатории тренажёры: терминал, Kubernetes, инциденты, Python, SQL и собеседование." },
    { sel: "#daily", title: "Квесты дня", text: "Три небольших задания на каждый день за бонусный опыт и прогноз, когда закончится курс. Не обязательно — но помогает не бросать." },
    { sel: "#search-open", title: "Поиск", text: "Ищет по всем урокам, командам и вопросам. Быстрый вызов — Ctrl+K или клавиша /." },
    { sel: "#level", title: "Профиль и прогресс", text: "Прогресс хранится в этом браузере. В профиле включи автосохранение в файл — тогда он не потеряется. Там же заметки, закладки и резюме «Что я умею»." },
  ];
  let i = 0, ring, card;

  function target(step) { const s = typeof step.sel === "function" ? step.sel() : step.sel; return document.querySelector(s); }
  function place() {
    const step = STEPS[i], el = target(step);
    if (!el) { next(); return; }
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = el.getBoundingClientRect(), pad = 8;
    Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    card.innerHTML = `<div class="tour-step">${i + 1} из ${STEPS.length}</div><b>${step.title}</b><p>${step.text}</p>
      <div class="tour-actions"><button type="button" class="btn btn-ghost" data-t="skip">Пропустить</button>
      ${i ? '<button type="button" class="btn" data-t="back">Назад</button>' : ""}<button type="button" class="btn btn-primary" data-t="next">${i + 1 < STEPS.length ? "Дальше" : "Понятно!"}</button></div>`;
    const below = r.bottom + 14 + card.offsetHeight < window.innerHeight;
    const left = Math.max(12, Math.min(window.innerWidth - card.offsetWidth - 12, r.left));
    Object.assign(card.style, { left: left + "px", top: (below ? r.bottom + 14 : Math.max(12, r.top - card.offsetHeight - 14)) + "px" });
    card.querySelector('[data-t="next"]').focus();
  }
  function next() { i++; if (i >= STEPS.length) finish(); else place(); }
  function finish() {
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
    ring.remove(); card.remove(); window.removeEventListener("resize", place); document.removeEventListener("keydown", keys);
    if (forced) history.replaceState(null, "", location.pathname);
    window.scrollTo({ top: 0 });
  }
  function keys(e) { if (e.key === "Escape") finish(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft" && i) { i--; place(); } }

  function start() {
    ring = document.createElement("div"); ring.className = "tour-ring";
    card = document.createElement("div"); card.className = "tour-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Знакомство с сайтом");
    document.body.append(ring, card);
    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      if (b.dataset.t === "skip") finish(); else if (b.dataset.t === "back") { i--; place(); } else next();
    });
    window.addEventListener("resize", place);
    document.addEventListener("keydown", keys);
    place();
  }
  // даём странице и анимациям появиться
  if (document.readyState === "complete") setTimeout(start, 600); else window.addEventListener("load", () => setTimeout(start, 600));
})();
