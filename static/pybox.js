/* DevOps-маршрут: Python-песочница. Настоящий CPython (Pyodide, WebAssembly) в отдельном потоке:
   кнопка «▶ выполнить» у примеров в уроках 2.1–2.5, свободный редактор и задачи с автотестами на python.html. */
(function () {
  "use strict";

  const PY_LESSONS = ["2.1", "2.2", "2.3", "2.4", "2.5"];
  const TIMEOUT = 15000;
  const src = document.querySelector('script[src*="static/pybox.js"]').getAttribute("src");
  const prefix = (src.match(/^(.*?)static\//) || ["", ""])[1];
  const ver = (src.match(/\?v=(\w+)/) || ["", ""])[1];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------------------------------------------------------------- поток с Python

  let worker = null, booted = false, seq = 0;
  const pending = new Map(), statusListeners = [];
  const setStatus = (s) => statusListeners.forEach((fn) => fn(s));

  function spawn() {
    worker = new Worker(prefix + "static/pyworker.js" + (ver ? "?v=" + ver : ""));
    booted = false;
    worker.onmessage = (e) => {
      if (e.data.hello) return;
      const job = pending.get(e.data.id); if (!job) return;
      pending.delete(e.data.id); clearTimeout(job.timer);
      if (!booted) { booted = true; setStatus("ready"); }
      job.resolve(e.data);
    };
    worker.onerror = () => { setStatus("error"); pending.forEach((j) => j.resolve({ out: "", error: "Не удалось загрузить Python. Проверь интернет и попробуй ещё раз.", results: [] })); pending.clear(); worker = null; };
  }
  function run(code, extra) {
    if (!worker) spawn();
    if (!booted) setStatus("загружаю Python (~10 МБ, только в первый раз)…");
    const id = ++seq;
    return new Promise((resolve) => {
      // первый запуск включает загрузку интерпретатора — ему даём больше времени
      const timer = setTimeout(() => {
        pending.delete(id); worker.terminate(); worker = null;
        resolve({ out: "", error: "Код выполнялся дольше " + (booted ? TIMEOUT / 1000 : 60) + " секунд и был остановлен. Похоже на бесконечный цикл или долгий sleep.", results: [], killed: true });
      }, booted ? TIMEOUT : 60000);
      pending.set(id, { resolve, timer });
      worker.postMessage(Object.assign({ id, code }, extra || {}));
    });
  }

  function hint(err) {
    if (/ModuleNotFoundError: No module named '([^']+)'/.test(err)) {
      const m = err.match(/No module named '([^']+)'/)[1];
      return `Модуля «${m}» в браузерном Python нет — этот пример запускается у тебя на машине (pip install ${m}). Стандартная библиотека доступна вся.`;
    }
    if (/can't start new thread|start_new_thread|not supported on Emscripten|cannot run.*subprocess|OSError: \[Errno 52\]/i.test(err)) return "Потоки, процессы и подпрограммы в браузере недоступны — этот пример про параллельность запускай у себя в терминале.";
    if (/OSError|ConnectionError|socket/.test(err)) return "Сеть и сокеты из браузерного Python недоступны — пример запускается локально.";
    if (/EOFError|reading from stdin/.test(err)) return "input() в песочнице не работает — задай значение прямо в коде.";
    if (/IndentationError/.test(err)) return "Ошибка отступов: внутри блока все строки должны быть сдвинуты одинаково (4 пробела).";
    if (/NameError/.test(err)) return "Имя не найдено: проверь опечатки и что переменная или функция объявлена выше.";
    return "";
  }

  // ---------------------------------------------------------------- редактор

  function mount(host, code, opts) {
    opts = opts || {};
    host.classList.add("sqlbox", "pybox");
    host.innerHTML = `<div class="sqlbox-head"><span class="sqlbox-tag">Python 3.12 · в браузере</span><span class="sqlbox-status" aria-live="polite"></span></div>
      <textarea class="sqlbox-input" spellcheck="false" rows="${Math.min(18, Math.max(4, code.split("\n").length + 1))}"></textarea>
      <div class="sqlbox-actions"><button type="button" class="btn btn-primary" data-run>${opts.test ? "✓ Проверить" : "▶ Выполнить"}</button>
        <span class="sqlbox-key">Ctrl + Enter</span>
        ${opts.reset ? '<button type="button" class="btn btn-ghost" data-reset>↺ Начать заново</button>' : ""}
        ${opts.closable ? '<button type="button" class="btn btn-ghost" data-close>Закрыть</button>' : ""}</div>
      <div class="sqlbox-out"></div>`;
    const input = host.querySelector(".sqlbox-input"), out = host.querySelector(".sqlbox-out"), status = host.querySelector(".sqlbox-status");
    input.value = code;
    statusListeners.push((s) => { status.textContent = s === "ready" ? "Python готов" : s === "error" ? "не удалось загрузить" : s; status.className = "sqlbox-status " + (s === "ready" ? "ok" : s === "error" ? "bad" : ""); });
    if (booted) statusListeners[statusListeners.length - 1]("ready");

    async function go() {
      const t0 = performance.now();
      out.innerHTML = '<div class="sql-meta">выполняю…</div>';
      const r = await run(input.value, opts.test ? { setup: opts.test.setup, cases: opts.test.cases } : null);
      const ms = Math.round(performance.now() - t0);
      let html = r.out ? `<pre class="py-out">${esc(r.out.replace(/\n$/, ""))}</pre>` : "";
      if (r.error) {
        const h = hint(r.error);
        html += `<div class="sql-error"><b>Ошибка:</b> ${esc(r.error.trim())}${h ? `<div class="sql-hint">${esc(h)}</div>` : ""}</div>`;
      } else if (opts.test) {
        const passed = r.results.filter((x) => x[3]).length, all = r.results.length;
        html += `<div class="py-tests">${r.results.map(([expr, got, want, ok]) =>
          `<div class="py-test ${ok ? "ok" : "bad"}"><span>${ok ? "✓" : "✗"}</span><code>${esc(expr)}</code>${ok ? "" : `<div>ожидалось <code>${esc(want)}</code>, получилось <code>${esc(got)}</code></div>`}</div>`).join("")}</div>`;
        html += passed === all ? `<div class="sql-ok">✓ Все тесты пройдены (${all}/${all}) <span>${ms} мс</span></div>`
          : `<div class="sql-meta">пройдено ${passed} из ${all} <span>${ms} мс</span></div>`;
        if (passed === all && opts.onPass) opts.onPass();
      } else if (!r.out) html = `<div class="sql-ok">✓ Выполнено без вывода <span>${ms} мс</span></div>`;
      else html += `<div class="sql-meta"><span>${ms} мс</span></div>`;
      out.innerHTML = html;
    }
    host.querySelector("[data-run]").onclick = go;
    const reset = host.querySelector("[data-reset]");
    if (reset) reset.onclick = () => { if (confirm("Вернуть заготовку? Твой код в этом редакторе пропадёт.")) { input.value = opts.reset; input.dispatchEvent(new Event("input")); out.innerHTML = ""; } };
    const close = host.querySelector("[data-close]");
    if (close) close.onclick = () => host.remove();
    input.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); go(); }
      if (e.key === "Tab") { e.preventDefault(); const s = input.selectionStart; input.setRangeText("    ", s, input.selectionEnd, "end"); }
    });
    return { run: go, input };
  }

  // ---------------------------------------------------------------- уроки 2.1–2.5

  function attachToLesson() {
    const data = document.getElementById("page-data");
    if (!data) return;
    let number = "";
    try { number = JSON.parse(data.textContent).number; } catch (e) { return; }
    if (!PY_LESSONS.includes(number)) return;
    // обрывки («...»), вывод терминала и код, которому нужны сеть, потоки или сторонние пакеты, не запускаем
    const runnable = (t) => !/\.\.\.$|^\s*\.\.\.|…|^>>>|^\$ /m.test(t)
      && !/^\s*(from|import)\s+(fastapi|requests|httpx|aiohttp|asyncpg|psycopg|psycopg2|sqlalchemy|pydantic|uvicorn|pytest|boto3|redis|yaml|docker|paramiko|click|typer|structlog|prometheus_client)\b/m.test(t)
      && /\b(print|assert)\b/.test(t)
      && !/\bopen\(|subprocess|os\.system|sys\.argv|sys\.stdin|argparse|threading|ThreadPoolExecutor|ProcessPoolExecutor|multiprocessing|\binput\(|read_text|write_text|\.iterdir|os\.walk|glob\(|\brich\b|signal\.|socket|shutil|os\.environ\[/.test(t);
    document.querySelectorAll(".prose pre code.language-python").forEach((code) => {
      if (!runnable(code.innerText)) return;
      const wrap = code.closest(".code-wrap") || code.parentElement;
      if (wrap.querySelector(".run-sql")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "run-sql run-py"; btn.textContent = "▶ выполнить";
      btn.title = "Запустить пример в Python-песочнице";
      btn.onclick = () => {
        let box = wrap.nextElementSibling;
        if (box && box.classList.contains("pybox")) { box.querySelector("[data-run]").click(); return; }
        box = document.createElement("div");
        wrap.after(box);
        mount(box, code.innerText.replace(/\n$/, ""), { closable: true }).run();
      };
      wrap.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------- страница python.html

  function initPage() {
    const host = document.getElementById("py-playground");
    if (!host) return;
    const DRAFT = "devops-course-py-draft";
    const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
    const box = mount(host, get(DRAFT) || 'services = ["nginx", "api", "postgres"]\nfor s in services:\n    print(f"{s}: ok")');
    box.input.addEventListener("input", () => put(DRAFT, box.input.value));
    document.querySelectorAll("[data-example]").forEach((b) => b.onclick = () => {
      box.input.value = b.dataset.example;
      box.input.rows = Math.min(18, Math.max(4, b.dataset.example.split("\n").length + 1));
      put(DRAFT, box.input.value); box.run();
      host.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const tasks = (JSON.parse(document.getElementById("page-data").textContent) || {}).tasks || [];
    const list = document.getElementById("py-tasks");
    const solved = () => (window.APP ? APP.state().py : {}) || {};
    function drawScore() {
      const n = tasks.filter((t) => solved()[t.id]).length;
      document.getElementById("py-score").textContent = `решено ${n} из ${tasks.length}`;
    }
    tasks.forEach((t, i) => {
      const el = document.createElement("details");
      el.className = "py-task" + (solved()[t.id] ? " solved" : "");
      el.innerHTML = `<summary><span class="py-task-num">${String(i + 1).padStart(2, "0")}</span><span class="py-task-title">${esc(t.title)}</span><span class="py-task-topic">${esc(t.topic)}</span><span class="py-task-check">✓</span></summary>
        <p>${t.desc}</p><div class="py-task-box"></div>`;
      list.appendChild(el);
      let mounted = false;
      el.addEventListener("toggle", () => {
        if (!el.open || mounted) return;
        mounted = true;
        const key = "devops-course-py-task:" + t.id;
        const b = mount(el.querySelector(".py-task-box"), get(key) || t.starter, {
          test: t, reset: t.starter,
          onPass: () => {
            el.classList.add("solved");
            if (window.APP) APP.track("lab");
            if (window.APP && !solved()[t.id]) {
              APP.state().py[t.id] = new Date().toLocaleDateString("sv-SE");
              APP.addXP(25, `задача «${t.title}»`);
              if (window.FX) FX.confetti();
            }
            drawScore();
          },
        });
        b.input.addEventListener("input", () => put(key, b.input.value));
      });
    });
    drawScore();
  }

  window.PYBOX = { mount, run };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { attachToLesson(); initPage(); });
  else { attachToLesson(); initPage(); }
})();
