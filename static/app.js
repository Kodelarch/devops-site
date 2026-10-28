/* DevOps-маршрут: прогресс, опыт, уровни, тесты и карточки. Всё хранится в localStorage браузера. */
(function () {
  "use strict";

  const KEY = "devops-course-progress-v1";
  const THEME_KEY = "devops-course-theme";
  const COURSE = window.COURSE || { parts: [], lessons: {} };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const dayKey = (d) => (d || new Date()).toLocaleDateString("sv-SE");
  const appSrc = (document.querySelector('script[src*="static/app.js"]') || { getAttribute: () => "" }).getAttribute("src");
  const PREFIX = (appSrc.match(/^(.*?)static\//) || ["", ""])[1], VER = (appSrc.match(/\?v=(\w+)/) || ["", ""])[1];
  const ICON = (name, cls) => `<svg class="ic ${cls || ""}" aria-hidden="true"><use href="${PREFIX}static/icons.svg?v=${VER}#i-${name}"/></svg>`;
  window.ICON = ICON;

  // ---------------------------------------------------------------- состояние

  function fresh() {
    return { xp: 0, steps: {}, practice: {}, quiz: {}, cards: {}, projects: {}, answers: {}, days: {}, achievements: {}, py: {}, games: {}, last: null };
  }
  let S = fresh();
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = fresh(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* приватный режим */ } backup.schedule(); }

  // ---------------------------------------------------------------- автосохранение в файл
  // Один раз выбираешь файл (Chrome/Edge) — дальше каждое изменение прогресса записывается в него само.
  // Ссылка на файл хранится в IndexedDB; формат файла тот же, что у кнопки «Выгрузить прогресс».

  const backup = (function () {
    const supported = "showSaveFilePicker" in window && "indexedDB" in window;
    let handle = null, timer = 0, state = "off", lastSaved = null, listeners = [];
    const emit = () => listeners.forEach((fn) => fn());

    function db() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("devops-course", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    async function kv(op, key, value) {
      const d = await db();
      return new Promise((resolve, reject) => {
        const tx = d.transaction("kv", op === "get" ? "readonly" : "readwrite"), st = tx.objectStore("kv");
        const req = op === "get" ? st.get(key) : op === "del" ? st.delete(key) : st.put(value, key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    async function permission(ask) {
      if (!handle) return "off";
      const opts = { mode: "readwrite" };
      let p = await handle.queryPermission(opts);
      if (p === "prompt" && ask) p = await handle.requestPermission(opts);
      return p === "granted" ? "on" : "paused";
    }
    const isEmpty = (p) => !p || (!p.xp && !Object.keys(p.steps || {}).length);
    async function readHandle() {
      try { return JSON.parse(await (await handle.getFile()).text()); } catch (e) { return null; }
    }
    async function write(allowEmpty) {
      if (!handle || state !== "on") return;
      // пустой прогресс никогда не затирает непустую копию — кроме явного «Сбросить всё»
      if (isEmpty(S) && !allowEmpty) {
        const saved = await readHandle();
        if (saved && !isEmpty(saved)) return;
      }
      try {
        const w = await handle.createWritable();
        await w.write(JSON.stringify(S, null, 2));
        await w.close();
        lastSaved = new Date();
        try { localStorage.setItem(KEY + "-backup-at", lastSaved.toISOString()); } catch (e) { /* ignore */ }
      } catch (e) {
        state = "paused";
      }
      emit();
    }
    async function init() {
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
      try { const at = localStorage.getItem(KEY + "-backup-at"); if (at) lastSaved = new Date(at); } catch (e) { /* ignore */ }
      if (!supported) { state = "unsupported"; emit(); return; }
      try { handle = (await kv("get", "backup-handle")) || null; } catch (e) { handle = null; }
      state = await permission(false);
      emit();
      if (state === "paused") {
        // Chrome может спросить разрешение заново после перезапуска: продлеваем его по первому клику на странице
        const resume = async () => {
          document.removeEventListener("pointerdown", resume, true);
          state = await permission(true); emit();
          if (state === "on") restoreIfLost();
        };
        document.addEventListener("pointerdown", resume, true);
      }
      if (state === "on") await restoreIfLost();
    }
    async function restoreIfLost() {
      // браузер «забыл» прогресс, а файл его помнит — возвращаем сами, без кнопок
      const saved = await readHandle();
      if (isEmpty(S) && saved && typeof saved.xp === "number" && !isEmpty(saved)) {
        S = Object.assign(fresh(), saved);
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
        try { sessionStorage.setItem(KEY + "-restored", String(saved.xp)); } catch (e) { /* ignore */ }
        location.reload();
        return;
      }
      write();
    }
    return {
      supported,
      get state() { return state; },
      get fileName() { return handle ? handle.name : ""; },
      get lastSaved() { return lastSaved; },
      on(fn) { listeners.push(fn); },
      init,
      schedule() { if (state !== "on") return; clearTimeout(timer); timer = setTimeout(write, 800); },
      now(allowEmpty) { clearTimeout(timer); return write(allowEmpty); },
      async enable() {
        handle = await window.showSaveFilePicker({
          suggestedName: "devops-progress-backup.json",
          types: [{ description: "Прогресс курса", accept: { "application/json": [".json"] } }],
        });
        await kv("put", "backup-handle", handle);
        state = await permission(true);
        await restoreIfLost();
      },
      async disable() { handle = null; state = "off"; clearTimeout(timer); try { await kv("del", "backup-handle"); } catch (e) { /* ignore */ } emit(); },
      async readFile() { if (!handle) return null; await permission(true); return JSON.parse(await (await handle.getFile()).text()); },
    };
  })();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") backup.now(); });

  const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6500];
  const TITLES = ["Новичок", "Стажёр", "Ученик", "Практикант", "Junior", "Junior+", "Уверенный Junior",
    "Middle−", "Middle", "Middle+", "Senior в душе", "Гуру пайплайнов", "Легенда DevOps"];
  function levelOf(xp) { let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]) i++; return i; }

  function streak() {
    const d = new Date();
    if (!S.days[dayKey(d)]) { d.setDate(d.getDate() - 1); if (!S.days[dayKey(d)]) return 0; }
    let n = 0;
    while (S.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function bestStreak() {
    const days = Object.keys(S.days).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of days) {
      const d = new Date(k + "T12:00:00");
      cur = prev && (d - prev) / 86400000 === 1 ? cur + 1 : 1;
      best = Math.max(best, cur); prev = d;
    }
    return best;
  }

  function toast(text, kind) {
    const box = $("#toasts"); if (!box) return;
    const el = document.createElement("div");
    el.className = "toast " + (kind || ""); el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function addXP(n, reason) {
    if (!n) return;
    const before = levelOf(S.xp);
    S.xp = Math.max(0, S.xp + n);
    if (n > 0) {
      S.days[dayKey()] = (S.days[dayKey()] || 0) + n;
      toast(`+${n} XP · ${reason}`, "xp");
      if (window.FX) FX.flyXP(n);
    }
    const after = levelOf(S.xp);
    if (after > before) {
      if (window.FX) FX.levelUp(after + 1, TITLES[after]);
      else toast(`Новый уровень: ${after + 1} — ${TITLES[after]} 🎉`, "level");
    }
    checkAchievements();
    save(); renderStats();
  }

  // ---------------------------------------------------------------- прогресс уроков

  const lessonSteps = (slug) => (COURSE.lessons[slug] || {}).steps || [];
  const stepDone = (slug, id) => !!(S.steps[slug] && S.steps[slug][id]);
  function lessonPct(slug) {
    const steps = lessonSteps(slug); if (!steps.length) return 0;
    return Math.round(100 * steps.filter((id) => stepDone(slug, id)).length / steps.length);
  }
  function markStep(slug, id, xp, reason) {
    S.steps[slug] = S.steps[slug] || {};
    if (S.steps[slug][id]) return false;
    S.steps[slug][id] = Date.now();
    track("steps");
    addXP(xp, reason);
    if (lessonPct(slug) === 100) {
      const num = COURSE.lessons[slug].number;
      if (window.FX) FX.celebrate({
        title: `Урок ${num} пройден`,
        lines: [{ cls: "cmd", text: `kubectl rollout status lesson/${num}` },
          { cls: "out", text: `Waiting for rollout to finish: ${lessonSteps(slug).length} of ${lessonSteps(slug).length} steps done...` },
          { cls: "ok", text: `deployment "lesson-${num}" successfully rolled out ✓` }],
      });
      else toast(`Урок ${num} пройден целиком 🏁`, "level");
    }
    save();
    return true;
  }
  const allLessons = () => Object.keys(COURSE.lessons);
  const countDone = (obj) => Object.values(obj).filter(Boolean).length;
  const cardsKnown = () => Object.values(S.cards).filter((c) => c.known).length;
  const quizCorrect = () => Object.values(S.quiz).filter((q) => q.ok).length;
  const partPct = (part) => {
    const ls = part.lessons; if (!ls.length) return 0;
    return Math.round(ls.reduce((a, s) => a + lessonPct(s), 0) / ls.length);
  };
  const projectDone = (slug) => Object.keys(S.projects).filter((k) => k.startsWith(slug + "-")).length;
  const projectPct = (slug) => {
    const p = (COURSE.projects || {})[slug]; if (!p || !p.total) return 0;
    return Math.min(100, Math.round(100 * projectDone(slug) / p.total));
  };
  const coursePct = () => {
    const ls = allLessons(); if (!ls.length) return 0;
    return Math.round(ls.reduce((a, s) => a + lessonPct(s), 0) / ls.length);
  };

  // ---------------------------------------------------------------- достижения

  const ACHIEVEMENTS = [
    { id: "first", icon: "steps", name: "Первый шаг", desc: "Пройти первый шаг урока", test: () => Object.keys(S.steps).length > 0 },
    { id: "lesson", icon: "flag", name: "Урок закрыт", desc: "Пройти урок на 100%", test: () => allLessons().some((s) => lessonPct(s) === 100) },
    { id: "hands", icon: "wrench", name: "Руки помнят", desc: "Выполнить 10 практических заданий", test: () => countDone(S.practice) >= 10 },
    { id: "hands50", icon: "building", name: "Инженер", desc: "Выполнить 50 практических заданий", test: () => countDone(S.practice) >= 50 },
    { id: "quiz", icon: "target", name: "В яблочко", desc: "Ответить верно на 50 вопросов тестов", test: () => quizCorrect() >= 50 },
    { id: "cards", icon: "chat", name: "Готова к собеседованию", desc: "Выучить 50 карточек", test: () => cardsKnown() >= 50 },
    { id: "streak3", icon: "flame", name: "Три дня подряд", desc: "Заниматься три дня без пропусков", test: () => bestStreak() >= 3 },
    { id: "streak7", icon: "calendar", name: "Неделя без пропусков", desc: "Заниматься семь дней подряд", test: () => bestStreak() >= 7 },
    { id: "part", icon: "puzzle", name: "Часть закрыта", desc: "Пройти целиком одну часть курса", test: () => COURSE.parts.some((p) => partPct(p) === 100) },
    { id: "xp1000", icon: "bolt", name: "Тысяча опыта", desc: "Набрать 1000 XP", test: () => S.xp >= 1000 },
    { id: "portfolio", icon: "portfolio", name: "Портфолио растёт", desc: "Отметить 10 пунктов в проектах портфолио", test: () => countDone(S.projects) >= 10 },
    { id: "mini", icon: "lab", name: "Проект выходного дня", desc: "Закончить мини-проект", test: () => Object.entries(COURSE.projects || {}).some(([s, p]) => p.kind === "mini" && projectPct(s) === 100) },
    { id: "bigproject", icon: "trophy", name: "Есть что показать", desc: "Закончить большой проект P1, P2 или P3", test: () => Object.entries(COURSE.projects || {}).some(([s, p]) => p.kind === "main" && projectPct(s) === 100) },
    { id: "finish", icon: "rocket", name: "Финиш", desc: "Пройти весь курс", test: () => allLessons().length && allLessons().every((s) => lessonPct(s) === 100) },
  ];
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (!S.achievements[a.id] && a.test()) {
        S.achievements[a.id] = dayKey();
        if (window.FX) FX.achievement(ICON(a.icon), a.name, a.desc);
        else toast(`Достижение: ${a.name}`, "level");
      }
    }
  }

  // ---------------------------------------------------------------- шапка и тема

  function renderStats() {
    const lvl = levelOf(S.xp);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("xp", S.xp); set("streak", streak()); set("level", `LVL ${lvl + 1}`);
  }
  function markNav(kind) {
    $$(".topnav a, .bottomnav a").forEach((a) => a.classList.toggle("current", (a.dataset.nav || "").split(" ").includes(kind)));
  }
  function copyButtons() {
    $$(".prose pre").forEach((pre) => {
      const btn = document.createElement("button");
      btn.className = "copy-btn"; btn.type = "button"; btn.textContent = "copy";
      btn.onclick = () => {
        const code = pre.querySelector("code") || pre;
        navigator.clipboard.writeText(code.innerText).then(() => { btn.textContent = "copied ✓"; setTimeout(() => (btn.textContent = "copy"), 1500); },
          () => { btn.textContent = "ошибка"; });
      };
      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.parentNode.insertBefore(wrap, pre); wrap.appendChild(pre); wrap.appendChild(btn);
    });
  }
  function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    if (theme) document.documentElement.dataset.theme = theme;
    const btn = $("#theme-toggle");
    if (btn) btn.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = dark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  }
  const ring = (el, pct) => { if (el) { el.style.strokeDasharray = `${pct * 0.974} 100`; el.classList.toggle("zero", pct === 0); } };
  const pageData = () => { const el = $("#page-data"); return el ? JSON.parse(el.textContent) : {}; };

  // ---------------------------------------------------------------- карточки (общий компонент)

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------------------------------------------------------------- интервальное повторение
  // box — ступень: «Знаю» поднимает на ступень и откладывает карточку на INTERVALS[box] дней, «Повторить» сбрасывает в ноль.

  const INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120];
  const NEW_PER_DAY = 10;
  const addDays = (key, n) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return dayKey(d); };
  function srs(id) {
    const st = S.cards[id];
    if (!st) return null;
    if (st.box === undefined) { // карточки, отмеченные до появления расписания
      st.box = st.known && !st.again ? 1 : 0;
      st.due = st.last ? addDays(st.last, INTERVALS[st.box]) : dayKey();
    }
    return st;
  }
  const isDue = (id) => { const st = srs(id); return !!st && st.due <= dayKey(); };
  const quizMistake = (id) => { const q = S.quiz[id]; return !!q && (q.tries > 1 || (q.tries >= 1 && !q.ok)); };
  const newToday = () => Object.values(S.cards).filter((c) => c.first === dayKey()).length;
  function dueToday(all) {
    const due = [], fresh = [];
    for (const c of all) {
      if (c.quiz && !quizMistake(c.id)) continue;
      const st = srs(c.id);
      if (st) { if (st.due <= dayKey()) due.push(c); }
      else if (c.quiz) due.push(c);           // ошибка в тесте — сразу на повтор
      else fresh.push(c);
    }
    const allowed = Math.max(0, NEW_PER_DAY - newToday());
    due.sort((a, b) => srs(a.id).due < srs(b.id).due ? -1 : 1);
    return { due, fresh: fresh.slice(0, allowed) };
  }

  function deck(container, cards, opts) {
    opts = opts || {};
    let queue = cards.slice(), i = 0, open = false;
    const requeued = new Set();
    function rememberResult(card, known) {
      const prev = srs(card.id) || { box: 0, first: dayKey() };
      const first = known && !prev.known;
      const box = known ? Math.min(INTERVALS.length - 1, prev.box + 1) : 0;
      S.cards[card.id] = { known: known || !!prev.known, again: !known, seen: (prev.seen || 0) + 1, last: dayKey(),
        box, due: addDays(dayKey(), INTERVALS[box]), first: prev.first || dayKey() };
      track("cards");
      if (!known && opts.requeue && !requeued.has(card.id)) { requeued.add(card.id); queue.push(card); }
      if (first) addXP(3, "карточка выучена"); else { save(); renderStats(); }
      if (opts.onChange) opts.onChange();
    }
    function draw() {
      if (!queue.length) { container.innerHTML = `<div class="card"><div class="card-q">${opts.empty ? "Готово" : "Здесь пока пусто"}</div><p>${opts.empty || "Поменяй фильтр, чтобы увидеть другие карточки."}</p></div>`; return; }
      if (i >= queue.length) {
        const known = queue.filter((c) => S.cards[c.id] && S.cards[c.id].known && !S.cards[c.id].again).length;
        container.innerHTML = `<div class="card"><div class="card-q">Круг пройден 🎉</div><p>Знаю: <b>${known}</b> из ${queue.length}. Карточки с отметкой «Повторить» стоит прогнать ещё раз — так они переходят в долгую память.</p>
          <div class="card-actions"><button class="btn btn-primary" data-act="restart">Ещё круг</button><button class="btn" data-act="again">Только «Повторить»</button></div></div>`;
        container.querySelector('[data-act="restart"]').onclick = () => { queue = shuffle(cards.slice()); i = 0; draw(); };
        container.querySelector('[data-act="again"]').onclick = () => { queue = cards.filter((c) => S.cards[c.id] && S.cards[c.id].again); i = 0; draw(); };
        if (opts.onFinish) opts.onFinish();
        return;
      }
      const c = queue[i], st = srs(c.id);
      const when = st && !st.again && st.due > dayKey() ? ` · следующий раз ${new Date(st.due + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : "";
      const badge = (c.quiz ? '<span class="chip again">ошибка в тесте</span>' : "")
        + (st ? (st.again ? '<span class="chip again">повторить</span>' : st.known ? `<span class="chip ok">знаю${when}</span>` : "") : c.quiz ? "" : '<span class="chip">новая</span>');
      container.innerHTML = `<div class="card-progress">Карточка ${i + 1} из ${queue.length}</div>
        <div class="card"><div class="card-meta"><span>${c.number ? `Урок ${c.number} · ${c.title}` : ""}</span>${badge}</div>
        <div class="card-q">${c.q}</div>
        ${open ? `<div class="card-a prose">${c.a}</div>` : ""}
        <div class="card-actions">${open
          ? '<button class="btn btn-success" data-act="yes">Знаю ✓</button><button class="btn" data-act="no">Повторить ↺</button>'
          : '<button class="btn btn-primary" data-act="show">Показать ответ</button><span class="lead" style="font-size:14px">Сначала ответь вслух</span>'}</div></div>`;
      const btn = (a) => container.querySelector(`[data-act="${a}"]`);
      if (open) {
        btn("yes").onclick = () => { rememberResult(c, true); open = false; i++; draw(); };
        btn("no").onclick = () => { rememberResult(c, false); open = false; i++; draw(); };
        if (window.hljs) $$("pre code", container).forEach((el) => window.hljs.highlightElement(el));
      } else {
        btn("show").onclick = () => { open = true; draw(); };
      }
    }
    draw();
  }

  // ---------------------------------------------------------------- страница урока

  function initLesson() {
    const data = pageData(), slug = data.lesson;
    const sections = $$(".step"), links = $$(".step-link");
    const ids = sections.map((s) => s.id);
    let current = 0;
    const readerPref = () => { try { return JSON.parse(localStorage.getItem("devops-course-reader") || "{}"); } catch (e) { return {}; } };
    let all = !!readerPref().all;
    document.documentElement.classList.toggle("lesson-all", all);

    function refreshSidebar() {
      links.forEach((a) => a.classList.toggle("done", stepDone(slug, a.dataset.step)));
      const pct = lessonPct(slug);
      $("#lesson-progress").style.width = pct + "%";
      const done = ids.filter((id) => stepDone(slug, id)).length;
      $("#lesson-progress-label").textContent = `Пройдено ${done} из ${ids.length} шагов · ${pct}%`;
    }
    function show(i, scroll) {
      current = Math.max(0, Math.min(ids.length - 1, i));
      sections.forEach((s, k) => s.classList.toggle("active", k === current));
      links.forEach((a, k) => a.classList.toggle("active", k === current));
      history.replaceState(null, "", "#" + ids[current]);
      $("#prev-step").disabled = current === 0;
      const last = current === ids.length - 1;
      $("#next-step").textContent = last ? (data.next ? "Следующий урок →" : "Завершить курс 🎉") : "Дальше →";
      S.last = { lesson: slug, step: ids[current] }; save();
      if (all) { if (scroll !== false) sections[current].scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
      $("#sidebar").classList.remove("open");
    }
    function completeReading(i) {
      if (i === undefined) i = current;
      const sec = sections[i], kind = sec.dataset.kind;
      if (kind === "theory") markStep(slug, ids[i], 5, "шаг прочитан");
      if (kind === "summary") markStep(slug, ids[i], 10, "итоги урока");
      if (kind === "materials") markStep(slug, ids[i], 2, "материалы");
      refreshSidebar();
    }
    // в режиме «весь урок» шаг засчитывается, когда дочитала его до конца, а оглавление следит за прокруткой
    const ends = sections.map((sec) => { const m = document.createElement("div"); m.className = "step-end"; sec.appendChild(m); return m; });
    const endSeen = new IntersectionObserver((es) => es.forEach((e) => { if (all && e.isIntersecting) completeReading(ends.indexOf(e.target)); }));
    ends.forEach((m) => endSeen.observe(m));
    let scrollTick = 0;
    window.addEventListener("scroll", () => {
      if (!all || scrollTick) return;
      scrollTick = requestAnimationFrame(() => {
        scrollTick = 0;
        // текущий шаг — последний, чей верх уже прошёл под шапкой
        let k = 0;
        sections.forEach((sec, j) => { if (sec.getBoundingClientRect().top < 140) k = j; });
        if (k !== current) { current = k; links.forEach((a, j) => a.classList.toggle("active", j === k)); history.replaceState(null, "", "#" + ids[k]); S.last = { lesson: slug, step: ids[k] }; save(); }
      });
    }, { passive: true });
    document.addEventListener("lessonmode", (e) => { all = e.detail; document.documentElement.classList.toggle("lesson-all", all); show(current); });

    $("#next-step").onclick = () => {
      completeReading();
      if (current < ids.length - 1) show(current + 1);
      else {
        const go = () => { location.href = data.next ? data.next + ".html" : "../profile.html"; };
        if (window.FX) FX.whenIdle(go); else go();
      }
    };
    $("#prev-step").onclick = () => show(current - 1);
    links.forEach((a, k) => a.addEventListener("click", (e) => { e.preventDefault(); completeReadingIfLeaving(); show(k); }));
    function completeReadingIfLeaving() { /* переход по оглавлению не засчитывает шаг: засчитывает кнопка «Дальше» */ }
    window.addEventListener("hashchange", () => { const k = ids.indexOf(location.hash.slice(1)); if (k >= 0 && k !== current) show(k); });
    $("#sidebar-toggle").onclick = () => $("#sidebar").classList.toggle("open");

    // практика
    const tasks = data.practice || [];
    function practiceCheck() {
      if (tasks.length && tasks.every((t) => S.practice[t])) markStep(slug, "practice", 0, "");
      refreshSidebar();
    }
    $$("[data-task-check]").forEach((box) => {
      const id = box.dataset.taskCheck, art = box.closest(".task");
      box.checked = !!S.practice[id]; art.classList.toggle("done", box.checked);
      box.addEventListener("change", () => {
        art.classList.toggle("done", box.checked);
        if (box.checked) { S.practice[id] = dayKey(); addXP(25, "практическое задание"); }
        else { delete S.practice[id]; addXP(-25, ""); }
        practiceCheck();
      });
    });
    $$(".task").forEach((art) => reviewBox(art, data));

    // тест
    const quizBox = $("#quiz-box");
    if (quizBox) renderQuiz(quizBox, data.quiz || [], slug, refreshSidebar);

    // карточки урока
    const cardsBox = $("#flashcards");
    if (cardsBox) {
      const cards = (data.cards || []).map((c) => Object.assign({}, c));
      deck(cardsBox, cards, {
        onChange: () => {
          if (cards.every((c) => S.cards[c.id] && S.cards[c.id].known)) markStep(slug, "cards", 15, "все карточки урока");
          refreshSidebar();
        },
      });
    }

    const fromHash = ids.indexOf(location.hash.slice(1));
    const firstOpen = ids.findIndex((id) => !stepDone(slug, id));
    refreshSidebar();
    show(fromHash >= 0 ? fromHash : (firstOpen >= 0 ? firstOpen : 0), false);
  }

  // ---------------------------------------------------------------- проверка задания через Claude

  function reviewPrompt(lesson, task, answer) {
    return `Ты — опытный DevOps-инженер и ментор. Проверь, как я выполнила практическое задание из курса «${COURSE.title}».

Урок ${lesson.number} «${lesson.title}».

ЗАДАНИЕ:
${task}

МОЙ ОТВЕТ (команды, файлы, вывод терминала):
\`\`\`
${answer}
\`\`\`

Что нужно:
1. Сверь ответ с заданием и с его «Проверкой»: что выполнено, а что нет.
2. Найди ошибки, небезопасные или неидемпотентные места и объясни, чем они плохи.
3. Покажи, как исправить или улучшить (коротко, с кодом, если нужно).
4. Задай один вопрос, который мне могли бы задать по этой теме на собеседовании junior DevOps.
5. В конце одной строкой вердикт: ЗАЧТЕНО или ДОРАБОТАТЬ.
Пиши по-русски, коротко и по делу.`;
  }

  function reviewBox(art, lesson) {
    const id = art.dataset.task, box = art.querySelector(".task-done");
    const taskText = Array.from(art.childNodes).filter((n) => !(n.classList && n.classList.contains("task-done"))).map((n) => n.textContent).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const wrap = document.createElement("details");
    wrap.className = "review";
    wrap.innerHTML = `<summary>Сдать на проверку Claude</summary>
      <p class="review-hint">Вставь сюда команды, которые выполнила, нужные файлы (скрипт, конфиг, Dockerfile) и вывод проверки. Пароли и ключи замени на <code>***</code>.</p>
      <textarea class="review-input" spellcheck="false" placeholder="$ ip a&#10;2: enp0s3: ... inet 192.168.56.10/24&#10;$ timedatectl&#10;..."></textarea>
      <div class="review-actions"><button class="btn btn-primary" type="button" data-review>Скопировать запрос и открыть Claude</button><span class="review-status" aria-live="polite"></span></div>
      <p class="review-hint">Запрос скопируется в буфер обмена — вставь его в новый чат (Ctrl+V). Получишь «ЗАЧТЕНО» — отметь задание галочкой выше.</p>`;
    art.insertBefore(wrap, box.nextSibling);
    const input = wrap.querySelector(".review-input"), status = wrap.querySelector(".review-status");
    input.value = (S.answers || {})[id] || "";
    let t = 0;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { S.answers = S.answers || {}; S.answers[id] = input.value; save(); }, 400); });
    wrap.querySelector("[data-review]").onclick = () => {
      const answer = input.value.trim();
      if (!answer) { status.textContent = "Сначала вставь свой ответ"; status.className = "review-status no"; input.focus(); return; }
      const text = reviewPrompt(lesson, taskText, answer);
      navigator.clipboard.writeText(text).then(() => {
        const opened = window.open("https://claude.ai/new", "_blank");
        if (opened) opened.opener = null;
        status.textContent = opened ? "Скопировано ✓ Вставь в открывшийся чат" : "Скопировано ✓ Открой claude.ai и вставь";
        status.className = "review-status ok";
        if (window.FX) FX.bot.say("Запрос скопирован. Вставь его в чат с Claude — он проверит и даст вердикт.", "happy");
      }, () => { status.textContent = "Не удалось скопировать — выдели текст ответа и скопируй вручную"; status.className = "review-status no"; });
    };
  }

  function renderQuiz(box, questions, slug, onDone) {
    function score() { return questions.filter((q) => S.quiz[q.id] && S.quiz[q.id].ok).length; }
    function header() {
      const s = score();
      return `<div class="quiz-score"><span>Верно ${s} из ${questions.length}</span><div class="progress" style="flex:1"><div class="progress-bar" style="width:${Math.round(100 * s / questions.length)}%"></div></div></div>`;
    }
    function draw() {
      box.innerHTML = header() + questions.map((q, n) => {
        const multi = q.answer.length > 1, st = S.quiz[q.id];
        const solved = st && st.ok;
        return `<div class="quiz-q ${solved ? "correct" : ""}" data-q="${n}">
          <div class="quiz-q-title">${n + 1}. ${q.q}</div>
          <div class="quiz-hint">${multi ? "Несколько верных ответов" : "Один верный ответ"}</div>
          ${q.options.map((o, k) => `<label class="quiz-option ${solved && q.answer.includes(k) ? "right" : ""}">
            <input type="${multi ? "checkbox" : "radio"}" name="q${n}" value="${k}" ${solved ? "disabled" : ""} ${solved && q.answer.includes(k) ? "checked" : ""}>
            <span>${o}</span></label>`).join("")}
          <div class="quiz-actions">${solved
            ? '<span class="quiz-result ok">Верно ✓</span><button class="btn btn-ghost" data-retry>Решить заново</button>'
            : '<button class="btn btn-primary" data-check>Проверить</button><span class="quiz-result"></span>'}</div>
          ${solved && q.why ? `<div class="quiz-why prose">${q.why}</div>` : ""}
        </div>`;
      }).join("");
      $$(".quiz-q", box).forEach((el) => {
        const q = questions[+el.dataset.q];
        const check = el.querySelector("[data-check]");
        if (check) check.onclick = () => grade(el, q);
        const retry = el.querySelector("[data-retry]");
        if (retry) retry.onclick = () => { el.classList.remove("correct"); $$("input", el).forEach((i) => { i.disabled = false; i.checked = false; }); $$(".quiz-option", el).forEach((o) => o.className = "quiz-option"); retry.parentNode.innerHTML = '<button class="btn btn-primary" data-check>Проверить</button><span class="quiz-result"></span>'; el.querySelector("[data-check]").onclick = () => grade(el, q, true); const w = el.querySelector(".quiz-why"); if (w) w.remove(); };
      });
      if (window.hljs) $$("pre code", box).forEach((el) => window.hljs.highlightElement(el));
    }
    function grade(el, q, practiceOnly) {
      const chosen = $$("input", el).filter((i) => i.checked).map((i) => +i.value);
      if (!chosen.length) { el.querySelector(".quiz-result").textContent = "Выбери ответ"; return; }
      const ok = chosen.length === q.answer.length && chosen.every((c) => q.answer.includes(c));
      $$(".quiz-option", el).forEach((opt, k) => {
        opt.className = "quiz-option" + (q.answer.includes(k) ? (chosen.includes(k) ? " right" : (ok ? "" : " missed")) : (chosen.includes(k) ? " bad" : ""));
      });
      const res = el.querySelector(".quiz-result");
      res.className = "quiz-result " + (ok ? "ok" : "no");
      if (ok) track("quiz");
      res.textContent = ok ? "Верно ✓" : "Не совсем — посмотри пояснение и попробуй ещё раз";
      if (window.FX) FX.bot.react(ok ? "ok" : "no");
      el.classList.toggle("correct", ok); el.classList.toggle("wrong", !ok);
      let why = el.querySelector(".quiz-why");
      if (q.why && !why) { why = document.createElement("div"); why.className = "quiz-why prose"; why.innerHTML = q.why; el.appendChild(why); if (window.hljs) $$("pre code", why).forEach((c) => window.hljs.highlightElement(c)); }
      const st = S.quiz[q.id] || { ok: false, tries: 0 };
      if (!practiceOnly && !st.ok) {
        st.tries += 1;
        if (ok) { st.ok = true; addXP(st.tries === 1 ? 10 : 4, st.tries === 1 ? "верно с первой попытки" : "верный ответ"); }
        S.quiz[q.id] = st; save();
      }
      el.querySelector(".quiz-score");
      const head = box.querySelector(".quiz-score");
      if (head) head.outerHTML = header();
      if (questions.every((x) => S.quiz[x.id] && S.quiz[x.id].ok)) { markStep(slug, "quiz", 20, "тест пройден"); onDone(); }
    }
    draw();
  }

  // ---------------------------------------------------------------- главная

  function initIndex() {
    $$(".lesson-card").forEach((card) => {
      const pct = lessonPct(card.dataset.lesson);
      ring(card.querySelector(".ring-fg"), pct);
      card.querySelector(".ring-text").textContent = pct + "%";
      card.classList.toggle("done", pct === 100);
    });
    let activeSet = false;
    for (const p of COURSE.parts) {
      const pct = partPct(p);
      const el = document.querySelector(`.part-progress[data-part="${p.id}"]`);
      if (el) el.textContent = `${p.lessons.filter((s) => lessonPct(s) === 100).length}/${p.lessons.length} уроков · ${pct}%`;
      const bar = document.querySelector(`[data-part-bar="${p.id}"]`);
      if (bar) bar.style.width = pct + "%";
      const stage = document.querySelector(`.stage[data-stage="${p.id}"]`);
      if (stage) {
        stage.classList.toggle("done", pct === 100);
        const current = pct < 100 && !activeSet;
        if (current) { stage.classList.add("active"); activeSet = true; }
        stage.querySelector(".stage-pct").textContent = pct === 100 ? "passed ✓" : pct ? `running · ${pct}%` : current ? "next ▸" : "queued";
      }
    }
    $$(".project-card").forEach((card) => {
      const pct = projectPct(card.dataset.projectCard);
      ring(card.querySelector(".ring-fg"), pct);
      card.querySelector(".ring-text").textContent = pct + "%";
      card.classList.toggle("done", pct === 100);
    });
    const pct = coursePct();
    ring($("#course-ring"), pct); $("#course-percent").textContent = pct + "%";
    const lvl = levelOf(S.xp);
    $("#hero-level").textContent = `${lvl + 1} · ${TITLES[lvl]}`;
    $("#hero-next").textContent = lvl + 1 < LEVELS.length ? `${LEVELS[lvl + 1] - S.xp} XP` : "максимум";
    $("#hero-cards").textContent = cardsKnown();
    const deckIds = Object.values(COURSE.lessons).flatMap((l) => l.cards.map((id) => ({ id })))
      .concat(Object.values(COURSE.lessons).flatMap((l) => l.quiz.map((id) => ({ id, quiz: 1 }))));
    const t = dueToday(deckIds), n = t.due.length + t.fresh.length;
    const rev = $("#review-today");
    if (rev && n) { rev.hidden = false; rev.querySelector("b").textContent = n; rev.title = t.due.length ? `${t.due.length} по расписанию${t.fresh.length ? ` и ${t.fresh.length} новых` : ""}` : `${t.fresh.length} новых карточек`; }
    const sc = $("#streak-chip"); if (sc) { sc.querySelector("b").textContent = streak(); sc.classList.toggle("hot", streak() > 0); }
    // куда продолжать: последний открытый шаг, а если урок уже пройден — следующий непройденный урок
    let target = S.last && COURSE.lessons[S.last.lesson] ? S.last.lesson : null;
    if (target && lessonPct(target) === 100) target = allLessons().find((s) => lessonPct(s) < 100) || target;
    if (target) {
      const l = COURSE.lessons[target], steps = lessonSteps(target), btn = $("#continue");
      const step = target === (S.last && S.last.lesson) ? S.last.step : (steps.find((id) => !stepDone(target, id)) || steps[0]);
      const k = Math.max(0, steps.indexOf(step));
      btn.href = `lessons/${target}.html#${step}`;
      $("#continue-title").textContent = lessonPct(target) ? `Продолжить урок ${l.number}` : `Начать урок ${l.number}`;
      $("#continue-sub").textContent = `${l.title} · шаг ${k + 1} из ${steps.length} · пройдено ${lessonPct(target)}%`;
    }
  }

  // ---------------------------------------------------------------- тренажёр карточек

  function initCards() {
    const all = pageData().deck || [];
    const sel = $("#deck-part"), mode = $("#deck-mode");
    for (const p of COURSE.parts) sel.insertAdjacentHTML("beforeend", `<option value="${p.id}">${p.title}</option>`);
    const plain = all.filter((c) => !c.quiz);
    function stats() {
      const k = plain.filter((c) => S.cards[c.id] && S.cards[c.id].known && !S.cards[c.id].again).length;
      const a = plain.filter((c) => S.cards[c.id] && S.cards[c.id].again).length;
      const t = dueToday(all.filter((c) => sel.value === "all" || c.part === sel.value));
      const mistakes = all.filter((c) => c.quiz && quizMistake(c.id)).length;
      $("#deck-stats").innerHTML = `<span class="chip ok">знаю: ${k}</span><span class="chip again">повторить: ${a}</span><span class="chip">новых: ${plain.length - k - a}</span>`
        + `<span class="chip today">на сегодня: ${t.due.length} + ${t.fresh.length} новых</span>${mistakes ? `<span class="chip">ошибок из тестов: ${mistakes}</span>` : ""}`;
    }
    function build() {
      let cards = all.filter((c) => sel.value === "all" || c.part === sel.value);
      const rank = (c) => { const s = S.cards[c.id]; return !s ? 0 : s.again ? 1 : 2; };
      if (mode.value === "today") {
        const t = dueToday(cards);
        cards = shuffle(t.due).concat(shuffle(t.fresh));
        deck($("#deck"), cards, { onChange: stats, requeue: true, empty: "На сегодня всё повторено ✓ Следующие карточки вернутся по расписанию — загляни завтра." });
        stats(); return;
      }
      if (mode.value === "quiz") cards = cards.filter((c) => c.quiz && quizMistake(c.id));
      else cards = cards.filter((c) => !c.quiz);
      if (mode.value === "again") cards = cards.filter((c) => S.cards[c.id] && S.cards[c.id].again);
      cards = shuffle(cards);
      if (mode.value === "due") cards.sort((a, b) => rank(a) - rank(b));
      deck($("#deck"), cards, { onChange: stats, empty: mode.value === "quiz" ? "Ошибок в тестах нет — или ты их ещё не делала 🙂" : null });
      stats();
    }
    sel.onchange = build; mode.onchange = build; build();
  }

  // ---------------------------------------------------------------- профиль

  function initProfile() {
    const lvl = levelOf(S.xp);
    $("#p-level").textContent = lvl + 1;
    $("#p-title").textContent = TITLES[lvl];
    const lo = LEVELS[lvl], hi = LEVELS[lvl + 1];
    $("#p-level-bar").style.width = hi ? Math.round(100 * (S.xp - lo) / (hi - lo)) + "%" : "100%";
    $("#p-level-label").textContent = hi ? `${S.xp} XP · до уровня ${lvl + 2} осталось ${hi - S.xp} XP` : `${S.xp} XP · максимальный уровень`;
    const lessonsDone = allLessons().filter((s) => lessonPct(s) === 100).length;
    const stepsDone = Object.values(S.steps).reduce((a, o) => a + Object.keys(o).length, 0);
    const cells = [["bolt", S.xp, "опыта"], ["flame", streak(), "дней подряд"], ["trophy", bestStreak(), "лучшая серия"],
      ["course", `${lessonsDone}/${allLessons().length}`, "уроков пройдено"], ["steps", stepsDone, "шагов пройдено"],
      ["wrench", countDone(S.practice), "заданий сделано"], ["target", quizCorrect(), "верных ответов"], ["chat", cardsKnown(), "карточек выучено"]];
    $("#stat-grid").innerHTML = cells.map(([i, v, t]) => `<div class="stat-card"><b>${ICON(i)} ${v}</b><span>${t}</span></div>`).join("");
    const got = ACHIEVEMENTS.filter((a) => S.achievements[a.id]).length;
    $("#achievements").innerHTML = `<div class="badge-count">открыто ${got} из ${ACHIEVEMENTS.length}</div>` + ACHIEVEMENTS.map((a, k) => `<div class="badge ${S.achievements[a.id] ? "got" : ""}" style="--h:${(k * 47) % 360}" title="${a.desc}">
      <div class="badge-hex">${ICON(a.icon)}</div><div class="badge-name">${a.name}</div><div class="badge-desc">${S.achievements[a.id] ? "получено " + new Date(S.achievements[a.id] + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : a.desc}</div></div>`).join("");
    $("#part-stats").innerHTML = COURSE.parts.map((p) => { const v = partPct(p); return `<div class="part-row"><span>${p.title}</span><div class="progress"><div class="progress-bar" style="width:${v}%"></div></div><b>${v}%</b></div>`; }).join("");
    const projects = Object.entries(COURSE.projects || {});
    if (projects.length) {
      $("#part-stats").insertAdjacentHTML("afterend", '<h2>Проекты портфолио</h2><section id="project-stats">' +
        projects.map(([slug, p]) => { const v = projectPct(slug); return `<div class="part-row"><a href="projects/${slug}.html">${p.code} · ${p.title}</a><div class="progress"><div class="progress-bar" style="width:${v}%"></div></div><b>${v}%</b></div>`; }).join("") + "</section>");
    }
    const heat = [];
    const heatLevel = (xp) => !xp ? "" : xp <= 20 ? "l1" : xp <= 60 ? "l2" : xp <= 120 ? "l3" : "l4";
    const start = new Date(); start.setDate(start.getDate() - 83 - ((start.getDay() + 6) % 7)); // с понедельника, ~12 недель
    for (const d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) { const key = dayKey(d); heat.push(`<div class="heat ${heatLevel(S.days[key])}" title="${key}${S.days[key] ? ": " + S.days[key] + " XP" : ""}"></div>`); }
    $("#heatmap").innerHTML = heat.join("");

    $("#export").onclick = () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `devops-progress-${dayKey()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("#import").onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      file.text().then((t) => {
        const data = JSON.parse(t);
        if (typeof data.xp !== "number" || typeof data.steps !== "object") throw new Error("bad");
        S = Object.assign(fresh(), data); save(); backup.now().finally(() => location.reload());
      }).catch(() => toast("Это не файл прогресса курса", ""));
    };
    $("#reset").onclick = () => {
      if (confirm("Удалить весь прогресс, опыт и достижения в этом браузере? Файл автосохранения тоже станет пустым.")) {
        S = fresh(); save(); backup.now(true).finally(() => location.reload());
      }
    };

    // автосохранение
    const box = $("#autosave");
    function drawBackup() {
      const st = backup.state, at = backup.lastSaved;
      const when = at ? at.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "ещё не было";
      const text = {
        unsupported: ["off", "Этот браузер не умеет сохранять в файл сам. Работает в Chrome и Edge; здесь — выгружай прогресс кнопкой выше."],
        off: ["off", "Выключено. Выбери файл один раз — дальше прогресс будет сохраняться в него сам после каждого действия."],
        paused: ["paused", `Приостановлено: браузер просит подтвердить доступ к файлу «${backup.fileName}». Нажми «Продолжить».`],
        on: ["on", `Включено: файл «${backup.fileName}». Последнее сохранение: ${when}.`],
      }[st];
      box.innerHTML = `<div class="autosave-status ${text[0]}"><span class="autosave-dot"></span>${text[1]}</div>
        <div class="profile-actions">${st === "unsupported" ? "" : st === "off"
          ? '<button class="btn btn-primary" data-bk="enable">Включить автосохранение</button>'
          : `${st === "paused" ? '<button class="btn btn-primary" data-bk="resume">Продолжить</button>' : ""}
             <button class="btn" data-bk="restore">Восстановить из файла</button>
             <button class="btn" data-bk="change">Другой файл</button>
             <button class="btn btn-danger" data-bk="disable">Выключить</button>`}</div>`;
      const on = (k, fn) => { const b = box.querySelector(`[data-bk="${k}"]`); if (b) b.onclick = fn; };
      const pick = () => backup.enable().then(() => toast("Автосохранение включено ✓", "level"), (e) => { if (e.name !== "AbortError") toast("Не получилось выбрать файл", ""); });
      on("enable", pick); on("change", pick);
      on("resume", () => backup.init());
      on("disable", () => backup.disable());
      on("restore", () => backup.readFile().then((data) => {
        if (!data || typeof data.xp !== "number" || typeof data.steps !== "object") throw new Error("bad");
        if (!confirm(`Заменить прогресс в браузере данными из файла (${data.xp} XP)?`)) return;
        S = Object.assign(fresh(), data); save(); location.reload();
      }).catch(() => toast("Файл не читается как прогресс курса", "")));
    }
    backup.on(drawBackup);
    drawBackup();
  }

  // ---------------------------------------------------------------- портфолио

  function initProject() {
    const slug = $(".project").dataset.project;
    $$(".task-list-item-checkbox").forEach((box, k) => {
      const id = `${slug}-${k}`;
      box.checked = !!S.projects[id];
      box.addEventListener("change", () => {
        const before = projectPct(slug);
        if (box.checked) { S.projects[id] = dayKey(); addXP(10, "пункт проекта"); }
        else { delete S.projects[id]; addXP(-10, ""); }
        if (before < 100 && projectPct(slug) === 100) {
          addXP(150, "проект готов");
          if (window.FX) FX.celebrate({ title: "Проект готов", xp: 150, bar: `student@devops: ~/projects/${slug}`,
            lines: [{ cls: "cmd", text: "git push origin main" }, { cls: "out", text: "pipeline #42: lint ✓ test ✓ build ✓ deploy ✓" },
              { cls: "ok", text: "Добавь ссылку на репозиторий в резюме — это твоё портфолио." }] });
          else toast("Проект для портфолио готов 🎉 Добавь ссылку в резюме", "level");
        }
      });
    });
  }

  // ---------------------------------------------------------------- робот: приветствие по странице

  function greet(kind) {
    const key = "devops-bot-greet:" + location.pathname;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
    let msg = null;
    if (kind === "index") {
      const st = streak();
      if (st > 1) msg = `Серия ${st} ${st < 5 ? "дня" : "дней"} подряд 🔥 Не прерывай её сегодня!`;
      else if (S.last && COURSE.lessons[S.last.lesson]) {
        const l = COURSE.lessons[S.last.lesson];
        msg = `Продолжим урок ${l.number}? Пройдено ${lessonPct(S.last.lesson)}%.`;
      } else msg = "Привет! Я робот курса. Начни с урока 0.1 — а если нажмёшь на меня, расскажу факт про DevOps.";
    } else if (kind === "lesson") {
      const d = pageData(), pct = lessonPct(d.lesson);
      msg = pct === 100 ? `Урок ${d.number} уже пройден. Повтори тест или карточки — это закрепляет.`
        : pct ? `С возвращением! Урок ${d.number} пройден на ${pct}%.`
        : `Урок ${d.number}: ${d.steps.length} шагов. Читай, а практику обязательно делай руками.`;
    } else if (kind === "cards") msg = "Режим «На сегодня» — то, что пора повторить. Отвечай вслух и только потом открывай ответ.";
    else if (kind === "roadmap") msg = "Наведи на урок — подсвечу всё, что стоит пройти до него.";
    else if (kind === "games") msg = "Пять минут игры — и команды запоминаются сами. За победы дают опыт!";
    else if (kind === "python") msg = "Каждая задача — +25 XP. Пиши функцию и жми «Проверить».";
    else if (kind === "profile") {
      const lvl = levelOf(S.xp);
      msg = LEVELS[lvl + 1] ? `${S.xp} XP. До уровня ${lvl + 2} осталось ${LEVELS[lvl + 1] - S.xp} XP.` : "Максимальный уровень. Легенда!";
    } else if (kind === "project") msg = "Отмечай пункты по ходу работы — за готовый проект +150 XP.";
    if (msg) setTimeout(() => FX.bot.say(msg, "happy"), 1200);
  }

  // ---------------------------------------------------------------- квесты дня, недельный челлендж и прогноз
  // Считаем действия за сегодня; три квеста дня дают бонусный опыт, пять активных дней за неделю — ещё бонус.

  const QUESTS = {
    steps: { goal: 3, text: "Пройди 3 шага уроков", icon: "book", href: "index.html#continue" },
    cards: { goal: 8, text: "Повтори 8 карточек", icon: "cards", href: "cards.html" },
    quiz: { goal: 3, text: "Ответь верно на 3 вопроса тестов", icon: "target", href: "index.html" },
    lab: { goal: 1, text: "Реши задание в лаборатории", icon: "lab", href: "lab.html" },
  };
  const questsToday = () => ["steps", "cards", new Date().getDate() % 2 ? "quiz" : "lab"];
  function daily() {
    if (!S.daily || S.daily.day !== dayKey()) S.daily = { day: dayKey(), c: {}, got: {} };
    return S.daily;
  }
  const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); };
  const activeThisWeek = () => Object.keys(S.days).filter((k) => k >= weekStart() && S.days[k] > 0).length;
  function track(kind, n) {
    const d = daily();
    d.c[kind] = (d.c[kind] || 0) + (n || 1);
    let bonus = 0;
    questsToday().forEach((q) => {
      if (!d.got[q] && (d.c[q] || 0) >= QUESTS[q].goal) { d.got[q] = 1; bonus += 15; toast(`Квест дня выполнен: ${QUESTS[q].text.toLowerCase()} ✓`, "level"); }
    });
    if (bonus && questsToday().every((q) => d.got[q]) && !d.got.all) { d.got.all = 1; bonus += 25; if (window.FX) FX.confetti(); }
    if (bonus) addXP(bonus, "квесты дня");
    else save();
    if (S.weekly !== weekStart() && activeThisWeek() >= 5) { S.weekly = weekStart(); addXP(50, "5 активных дней за неделю"); }
    renderDaily();
  }
  function forecast() {
    const all = Object.values(COURSE.lessons).reduce((a, l) => a + l.steps.length, 0);
    const stamps = Object.values(S.steps).flatMap((o) => Object.values(o));
    const left = all - stamps.length, recent = stamps.filter((t) => t > Date.now() - 14 * 86400000).length;
    if (!left) return "Курс пройден целиком 🚀";
    if (!recent) return `Осталось ${left} шагов. Пройди пару шагов — и я посчитаю, когда ты закончишь курс.`;
    const days = Math.ceil(left / (recent / 14)), end = new Date(Date.now() + days * 86400000);
    return `В темпе последних двух недель (${(recent / 14).toFixed(1).replace(".", ",")} шага в день) курс закончится примерно <b>${end.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</b>. Осталось ${left} шагов.`;
  }
  function renderDaily() {
    const box = $("#daily"); if (!box) return;
    const d = daily(), w = activeThisWeek();
    const qc = $("#quests-chip");
    if (qc) { const n = questsToday().filter((q) => d.got[q]).length; qc.querySelector("b").textContent = `${n}/3`; qc.classList.toggle("done", n === 3); }
    box.innerHTML = `<div class="daily-head"><b>Квесты дня</b><span>+15 XP за каждый, +25 за все три</span></div>
      <div class="daily-list">${questsToday().map((q) => { const v = Math.min(QUESTS[q].goal, d.c[q] || 0), done = d.got[q];
        return `<a class="daily-q ${done ? "done" : ""}" href="${QUESTS[q].href}"><span class="daily-icon">${ICON(done ? "check" : QUESTS[q].icon)}</span><span>${QUESTS[q].text}</span>
          <span class="daily-bar"><i style="width:${(100 * v) / QUESTS[q].goal}%"></i></span><em>${v}/${QUESTS[q].goal}</em></a>`; }).join("")}</div>
      <div class="daily-week"><span>Неделя: ${w}/5 активных дней ${S.weekly === weekStart() ? "✓ бонус получен" : "→ +50 XP"}</span>
        <span class="daily-days">${[0, 1, 2, 3, 4, 5, 6].map((i) => { const dd = new Date(weekStart() + "T12:00:00"); dd.setDate(dd.getDate() + i); const k = dayKey(dd); return `<i class="${S.days[k] ? "on" : ""} ${k === dayKey() ? "today" : ""}" title="${k}"></i>`; }).join("")}</span></div>
      <p class="daily-forecast">${forecast()}</p>`;
  }

  // ---------------------------------------------------------------- приложение на телефон (PWA)

  let installPrompt = null;
  function initPWA() {
    const script = $('script[src*="static/app.js"]');
    const src = script ? script.getAttribute("src") : "";
    const prefix = (src.match(/^(.*?)static\//) || ["", ""])[1];
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register(prefix + "sw.js").catch(() => { /* без офлайна сайт работает как обычно */ });
    }
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; drawInstall(); });
    window.addEventListener("appinstalled", () => { installPrompt = null; toast("Приложение установлено ✓", "level"); drawInstall(); });
    drawInstall();
  }
  function drawInstall() {
    const box = $("#install-app"); if (!box) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let html;
    if (standalone) html = '<div class="autosave-status on"><span class="autosave-dot"></span>Ты уже в приложении. Уроки, которые ты открывала, доступны и без интернета.</div>';
    else if (installPrompt) html = '<div class="profile-actions"><button class="btn btn-primary" id="install-btn">📲 Установить приложение</button></div>';
    else if (ios) html = '<div class="autosave-status off"><span class="autosave-dot"></span>На iPhone: открой сайт в Safari → кнопка «Поделиться» → «На экран „Домой“».</div>';
    else html = '<div class="autosave-status off"><span class="autosave-dot"></span>На телефоне открой сайт в Chrome → меню ⋮ → «Добавить на главный экран» (или «Установить приложение»). На компьютере — значок установки справа в адресной строке.</div>';
    box.innerHTML = html;
    const btn = $("#install-btn");
    if (btn) btn.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; drawInstall(); };
  }

  // открытый интерфейс для песочниц, игр и карты навыков
  window.APP = { state: () => S, save, addXP, toast, lessonPct, projectPct, track };

  // ---------------------------------------------------------------- старт

  initTheme();
  const kind = document.body.dataset.page;
  markNav(kind);
  copyButtons();
  if (kind === "lesson") initLesson();
  if (kind === "index") { initIndex(); renderDaily(); }
  if (kind === "cards") initCards();
  if (kind === "profile") initProfile();
  if (kind === "project") initProject();
  checkAchievements(); save(); renderStats();
  backup.init();
  initPWA();
  try {
    const restored = sessionStorage.getItem(KEY + "-restored");
    if (restored) { sessionStorage.removeItem(KEY + "-restored"); toast(`Прогресс восстановлен из автосохранения: ${restored} XP ✓`, "level"); }
  } catch (e) { /* ignore */ }
  if (window.FX) { FX.init(kind); greet(kind); }
  if (window.hljs) $$(".prose pre code").forEach((el) => window.hljs.highlightElement(el));
})();
