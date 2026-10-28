/* DevOps-маршрут: пробное собеседование. 10 случайных вопросов с таймером, письменные ответы,
   самооценка по эталону, карта слабых тем и отправка всего интервью Claude на разбор. */
(function () {
  "use strict";

  const root = document.getElementById("interview");
  if (!root) return;
  const data = JSON.parse(document.getElementById("page-data").textContent);
  const deck = data.deck, parts = data.parts;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const text = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent.replace(/\s+\n/g, "\n").trim(); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const store = () => { const s = window.APP ? APP.state() : {}; s.interviews = s.interviews || []; return s; };
  const SECONDS = 180, N = 10;
  let timer = 0;

  function menu() {
    clearInterval(timer);
    const hist = store().interviews.slice(-5).reverse();
    root.innerHTML = `<div class="iv-setup">
      <label>Темы <select id="iv-part"><option value="all">Весь курс</option>${parts.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("")}</select></label>
      <label>Время на вопрос <select id="iv-time"><option value="180">3 минуты</option><option value="120">2 минуты</option><option value="0">без таймера</option></select></label>
      <button type="button" class="btn btn-primary btn-lg" id="iv-go">▶ Начать собеседование</button></div>
      <p class="game-help">${N} вопросов. Отвечай письменно, как сказала бы вслух: что это, зачем и пример из практики. Подсказок во время интервью нет — эталонные ответы покажу в конце.</p>
      ${hist.length ? `<h2 class="iv-h">Прошлые собеседования</h2><div class="iv-hist">${hist.map((h) => `<div><b>${h.score}%</b><span>${h.date} · ${esc(h.topic)}</span></div>`).join("")}</div>` : ""}`;
    root.querySelector("#iv-go").onclick = () => {
      const part = root.querySelector("#iv-part").value, secs = +root.querySelector("#iv-time").value;
      const pool = deck.filter((c) => part === "all" || c.part === part);
      // по всему курсу — вопросы из разных частей, чтобы не было десяти про одно и то же
      let qs = shuffle(pool);
      if (part === "all") { const by = {}; qs.forEach((c) => (by[c.part] = by[c.part] || []).push(c)); qs = []; while (qs.length < N && Object.values(by).some((l) => l.length)) Object.values(by).forEach((l) => { if (l.length && qs.length < N) qs.push(l.pop()); }); }
      run(qs.slice(0, N), secs, part === "all" ? "весь курс" : parts.find((p) => p.id === part).title);
    };
  }

  function run(qs, secs, topic) {
    const answers = qs.map(() => ""), spent = qs.map(() => 0);
    let i = 0, left = secs;
    function show() {
      clearInterval(timer); left = secs;
      const c = qs[i];
      root.innerHTML = `<div class="iv-top"><span>Вопрос ${i + 1} из ${qs.length}</span><span class="iv-topic">${esc(c.number)} · ${esc(c.title)}</span>${secs ? `<b id="iv-clock">${fmt(left)}</b>` : ""}</div>
        <div class="iv-progress"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <div class="iv-q">${c.q}</div>
        <textarea id="iv-a" class="sqlbox-input iv-a" rows="8" placeholder="Твой ответ…">${esc(answers[i])}</textarea>
        <div class="game-actions"><button type="button" class="btn btn-primary" id="iv-next">${i + 1 < qs.length ? "Следующий вопрос →" : "Закончить"}</button>
        <button type="button" class="btn btn-ghost" id="iv-skip">Не знаю, дальше</button><button type="button" class="btn btn-ghost" id="iv-stop">Прервать</button></div>`;
      const a = root.querySelector("#iv-a"); a.focus();
      const next = (skip) => { answers[i] = skip ? "" : a.value.trim(); spent[i] = secs ? secs - left : 0; if (++i < qs.length) show(); else finish(); };
      root.querySelector("#iv-next").onclick = () => next(false);
      root.querySelector("#iv-skip").onclick = () => next(true);
      root.querySelector("#iv-stop").onclick = () => { if (confirm("Прервать собеседование? Ответы не сохранятся.")) menu(); };
      a.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); next(false); } });
      if (secs) timer = setInterval(() => {
        left--; const el = root.querySelector("#iv-clock"); if (el) { el.textContent = fmt(left); el.classList.toggle("low", left <= 30); }
        if (left <= 0) next(false);
      }, 1000);
    }
    function finish() {
      clearInterval(timer);
      const marks = qs.map(() => null);
      let saved = false;
      function draw() {
        const rated = marks.filter((m) => m !== null).length;
        root.innerHTML = `<h2 class="iv-h">Разбор: сравни свой ответ с эталоном и честно оцени</h2>
          ${qs.map((c, k) => `<div class="iv-review ${marks[k] === 2 ? "good" : marks[k] === 1 ? "mid" : marks[k] === 0 ? "bad" : ""}">
            <div class="iv-topic">${k + 1}. ${esc(c.number)} · ${esc(c.title)}</div><div class="iv-q small">${c.q}</div>
            <div class="iv-cols"><div><div class="ex-col-title">Твой ответ</div><div class="iv-mine">${answers[k] ? esc(answers[k]) : "<i>пропущен</i>"}</div></div>
            <div><div class="ex-col-title">Эталон</div><div class="prose iv-ref">${c.a}</div></div></div>
            <div class="iv-marks">${[[2, "Знала ✓"], [1, "Частично"], [0, "Не знала"]].map(([v, t]) => `<button type="button" class="chip ${marks[k] === v ? "on" : ""}" data-k="${k}" data-v="${v}">${t}</button>`).join("")}</div></div>`).join("")}
          <div class="iv-final" id="iv-final"></div>`;
        root.querySelectorAll(".iv-marks .chip").forEach((b) => b.onclick = () => { marks[+b.dataset.k] = +b.dataset.v; draw(); });
        const fin = root.querySelector("#iv-final");
        if (rated < qs.length) { fin.innerHTML = `<p class="game-help">Оценено ${rated} из ${qs.length}. Отметь все ответы, чтобы увидеть итог и слабые темы.</p>${aiButton()}`; bindAi(); return; }
        const score = Math.round((100 * marks.reduce((a, m) => a + m, 0)) / (2 * qs.length));
        const weak = {};
        qs.forEach((c, k) => { if (marks[k] < 2) (weak[c.lesson] = weak[c.lesson] || { n: 0, c }).n += 2 - marks[k]; });
        const weakList = Object.values(weak).sort((a, b) => b.n - a.n);
        fin.innerHTML = `<div class="iv-score"><b>${score}%</b><span>${score >= 80 ? "Уверенно — на настоящем собеседовании ты бы справилась." : score >= 50 ? "Неплохо, но есть пробелы — их видно ниже." : "Пока рано — повтори слабые темы и попробуй снова."}</span></div>
          ${weakList.length ? `<p><b>Что повторить:</b></p><div class="iv-weak">${weakList.map((w) => `<a class="chip" href="lessons/${w.c.lesson}.html#cards">${esc(w.c.number)} ${esc(w.c.title)}</a>`).join("")}</div>` : "<p>Слабых тем в этом интервью нет 👏</p>"}
          ${aiButton()}<div class="game-actions"><button type="button" class="btn btn-primary" id="iv-again">Ещё одно собеседование</button></div>`;
        bindAi();
        fin.querySelector("#iv-again").onclick = menu;
        if (!saved) { saved = true; save(score, topic); }
      }
      function aiButton() {
        return `<div class="iv-ai"><b>Разбор от Claude</b><p>Скопирую вопросы, твои ответы и эталоны в один запрос и открою claude.ai — вставь его в новый чат, и Claude оценит каждый ответ как интервьюер и подскажет, что добавить.</p>
          <button type="button" class="btn" id="iv-ai">📋 Скопировать и открыть Claude</button></div>`;
      }
      function bindAi() {
        root.querySelector("#iv-ai").onclick = async () => {
          const prompt = "Ты опытный интервьюер на позицию Junior DevOps-инженера. Ниже — вопросы пробного собеседования, мои ответы и эталонные ответы из курса. "
            + "Оцени каждый мой ответ по шкале 0–10 как на реальном собеседовании, коротко объясни, чего не хватило, и предложи формулировку, которой ответил бы сильный кандидат. "
            + "В конце дай общий вердикт и три темы, которые мне стоит подтянуть в первую очередь. Отвечай по-русски.\n\n"
            + qs.map((c, k) => `### Вопрос ${k + 1} (урок ${c.number})\n${text(c.q)}\n\nМой ответ:\n${answers[k] || "(пропущен)"}\n\nЭталон из курса:\n${text(c.a)}`).join("\n\n");
          try { await navigator.clipboard.writeText(prompt); } catch (e) { const t = document.createElement("textarea"); t.value = prompt; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
          window.open("https://claude.ai/new", "_blank");
          if (window.APP) APP.toast("Запрос скопирован — вставь его в чат с Claude", "level");
        };
      }
      draw();
    }
    show();
  }
  function save(score, topic) {
    const s = store(), today = new Date().toLocaleDateString("sv-SE");
    const first = !s.interviews.some((h) => h.date === today);
    s.interviews.push({ date: today, score, topic });
    s.interviews = s.interviews.slice(-30);
    if (window.APP) { if (first) APP.addXP(20, "пробное собеседование"); else APP.save(); APP.track("lab"); }
    if (score >= 80 && window.FX) FX.confetti();
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  menu();
})();
