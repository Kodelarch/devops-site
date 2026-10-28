/* DevOps-маршрут: SQL-песочница. Настоящий PostgreSQL прямо в браузере (PGlite, WebAssembly)
   с учебной базой «маркетплейс электроники» из _assets/sql/shop.sql.
   База поднимается при первом запуске запроса и живёт в памяти вкладки: изменения сбрасываются кнопкой или перезагрузкой. */
(function () {
  "use strict";

  const PGLITE = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js";
  const SQL_LESSONS = ["2.6", "2.7", "2.8", "2.9", "2.10", "2.11"];
  const MAX_ROWS = 200;
  const prefix = (document.querySelector('script[src*="static/sqlbox.js"]').getAttribute("src").match(/^(.*?)static\//) || ["", ""])[1];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let dbPromise = null;
  const statusListeners = [];
  const setStatus = (s) => statusListeners.forEach((fn) => fn(s));

  async function freshDb() {
    setStatus("загружаю PostgreSQL (~16 МБ, только в первый раз)…");
    const { PGlite } = await import(PGLITE);
    const db = await PGlite.create();
    setStatus("создаю учебную базу…");
    const seed = await (await fetch(prefix + "static/shop.sql")).text();
    await db.exec(seed);
    setStatus("ready");
    return db;
  }
  function db() {
    if (!dbPromise) dbPromise = freshDb().catch((e) => { dbPromise = null; setStatus("error"); throw e; });
    return dbPromise;
  }
  async function reset() {
    const old = dbPromise; dbPromise = null;
    try { if (old) (await old).close(); } catch (e) { /* ignore */ }
    return db();
  }

  function cell(v) {
    if (v === null || v === undefined) return '<td class="sql-null">NULL</td>';
    if (v instanceof Date) return `<td>${esc(v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 19 : 10).replace("T", " "))}</td>`;
    if (typeof v === "object") return `<td>${esc(JSON.stringify(v))}</td>`;
    if (typeof v === "boolean") return `<td class="sql-bool">${v}</td>`;
    return `<td${typeof v === "number" ? ' class="sql-num"' : ""}>${esc(v)}</td>`;
  }
  function renderResult(res, ms) {
    // показываем последний запрос, который вернул строки, иначе — итог последней команды
    const withRows = [...res].reverse().find((r) => r.fields && r.fields.length);
    const last = res[res.length - 1] || {};
    const info = `${res.length > 1 ? `${res.length} команд · ` : ""}${ms} мс`;
    if (!withRows) {
      const n = last.affectedRows;
      return `<div class="sql-ok">✓ Готово${n !== undefined ? `: затронуто строк — ${n}` : ""} <span>${info}</span></div>`;
    }
    const rows = withRows.rows.slice(0, MAX_ROWS);
    const head = withRows.fields.map((f) => `<th>${esc(f.name)}</th>`).join("");
    const body = rows.map((r) => `<tr>${withRows.fields.map((f) => cell(r[f.name])).join("")}</tr>`).join("");
    const more = withRows.rows.length > MAX_ROWS ? ` (показаны первые ${MAX_ROWS})` : "";
    return `<div class="sql-meta">строк: ${withRows.rows.length}${more} <span>${info}</span></div>
      <div class="sql-table"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${withRows.fields.length}" class="sql-empty">пусто — ни одна строка не подошла</td></tr>`}</tbody></table></div>`;
  }
  function hint(msg) {
    const rel = msg.match(/relation "([^"]+)" does not exist/);
    if (rel) return `Таблицы «${rel[1]}» в учебной базе нет — это пример-иллюстрация из текста урока. Запросы можно гонять на таблицах store, customer, product, store_visit, purchase.`;
    if (/cannot run inside a transaction block/.test(msg)) return "Эта команда администратора выполняется отдельно, вне транзакции — в песочнице её можно только прочитать.";
    if (/column .* does not exist/.test(msg)) return "Такого столбца нет — сверься со схемой базы.";
    if (/syntax error/.test(msg)) return "Синтаксическая ошибка: проверь запятые, кавычки и порядок ключевых слов.";
    return "";
  }

  /* Редактор с кнопкой запуска и таблицей результата. */
  function mount(host, sql, opts) {
    opts = opts || {};
    host.classList.add("sqlbox");
    host.innerHTML = `<div class="sqlbox-head"><span class="sqlbox-tag">PostgreSQL · учебная база магазина</span>
        <span class="sqlbox-status" aria-live="polite"></span></div>
      <textarea class="sqlbox-input" spellcheck="false" rows="${Math.min(14, Math.max(4, sql.split("\n").length + 1))}"></textarea>
      <div class="sqlbox-actions"><button type="button" class="btn btn-primary" data-run>▶ Выполнить</button>
        <span class="sqlbox-key">Ctrl + Enter</span>
        <button type="button" class="btn btn-ghost" data-reset title="Вернуть таблицы в исходное состояние">↺ Сбросить базу</button>
        ${opts.closable ? '<button type="button" class="btn btn-ghost" data-close>Закрыть</button>' : ""}</div>
      <div class="sqlbox-out"></div>`;
    const input = host.querySelector(".sqlbox-input"), out = host.querySelector(".sqlbox-out"), status = host.querySelector(".sqlbox-status");
    input.value = sql;
    statusListeners.push((s) => { status.textContent = s === "ready" ? "база готова" : s === "error" ? "не удалось загрузить базу" : s; status.className = "sqlbox-status " + (s === "ready" ? "ok" : s === "error" ? "bad" : ""); });
    async function run() {
      const q = input.value.trim();
      if (!q) return;
      out.innerHTML = '<div class="sql-meta">выполняю…</div>';
      try {
        const d = await db();
        const t = performance.now();
        const res = await d.exec(q);
        out.innerHTML = renderResult(res, Math.round(performance.now() - t));
      } catch (e) {
        const msg = (e && e.message) || String(e);
        out.innerHTML = `<div class="sql-error"><b>Ошибка:</b> ${esc(msg)}${hint(msg) ? `<div class="sql-hint">${esc(hint(msg))}</div>` : ""}</div>`;
      }
    }
    host.querySelector("[data-run]").onclick = run;
    host.querySelector("[data-reset]").onclick = async () => { out.innerHTML = '<div class="sql-meta">пересоздаю базу…</div>'; try { await reset(); out.innerHTML = '<div class="sql-ok">✓ База сброшена к исходным данным</div>'; } catch (e) { out.innerHTML = `<div class="sql-error">${esc(e.message || e)}</div>`; } };
    const close = host.querySelector("[data-close]");
    if (close) close.onclick = () => host.remove();
    input.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
      if (e.key === "Tab") { e.preventDefault(); const s = input.selectionStart; input.setRangeText("  ", s, input.selectionEnd, "end"); }
    });
    return { run, input };
  }

  /* Кнопка «Выполнить» у SQL-примеров в уроках 2.6–2.11. */
  function attachToLesson() {
    const data = document.getElementById("page-data");
    if (!data) return;
    let number = "";
    try { number = JSON.parse(data.textContent).number; } catch (e) { return; }
    if (!SQL_LESSONS.includes(number)) return;
    // обрывки запросов, сценарии на две сессии и «...» — не для запуска
    const fragment = (t) => {
      const first = t.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("--")) || "";
      return /\.\.\.|…/.test(t) || /Session #/i.test(t) || /^(WHERE|AND|OR|SUM|COUNT|AVG|CASE|,|\))/i.test(first);
    };
    document.querySelectorAll(".prose pre code.language-sql").forEach((code) => {
      if (fragment(code.innerText)) return;
      const wrap = code.closest(".code-wrap") || code.parentElement;
      if (wrap.querySelector(".run-sql")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "run-sql"; btn.textContent = "▶ выполнить";
      btn.title = "Открыть пример в SQL-песочнице и выполнить";
      btn.onclick = () => {
        let box = wrap.nextElementSibling;
        if (box && box.classList.contains("sqlbox")) { box.querySelector("[data-run]").click(); return; }
        box = document.createElement("div");
        wrap.after(box);
        mount(box, code.innerText.replace(/\n$/, ""), { closable: true }).run();
      };
      wrap.appendChild(btn);
    });
  }

  /* Страница песочницы: свободный редактор и готовые примеры. */
  function initPage() {
    const host = document.getElementById("sql-playground");
    if (!host) return;
    let saved = "";
    try { saved = localStorage.getItem("devops-course-sql-draft") || ""; } catch (e) { /* ignore */ }
    const box = mount(host, saved || "SELECT name, city, premium\nFROM customer\nORDER BY name;");
    box.input.addEventListener("input", () => { try { localStorage.setItem("devops-course-sql-draft", box.input.value); } catch (e) { /* ignore */ } });
    document.querySelectorAll("[data-example]").forEach((b) => b.onclick = () => {
      box.input.value = b.dataset.example;
      box.input.rows = Math.min(14, Math.max(4, b.dataset.example.split("\n").length + 1));
      box.run();
      host.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  window.SQLBOX = { mount, db, reset };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { attachToLesson(); initPage(); });
  else { attachToLesson(); initPage(); }
})();
