/* DevOps-маршрут: интерактивные поясняющие схемы в теории.
   В заметке: callout `> [!anim] Подпись` и в теле идентификатор схемы в обратных кавычках, например `git-trees`.
   Сборщик превращает его в <figure class="explain" data-anim="...">, а этот файл рисует схему. */
(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  /* Общий каркас: панель кнопок, сцена, строка пояснения. */
  function shell(stage, opts) {
    stage.innerHTML = `<div class="ex-controls"></div><div class="ex-scene ${opts.scene || ""}"></div><div class="ex-narr" aria-live="polite"></div>`;
    const ui = {
      controls: stage.querySelector(".ex-controls"),
      scene: stage.querySelector(".ex-scene"),
      narr: stage.querySelector(".ex-narr"),
      say(text, cls) { ui.narr.className = "ex-narr " + (cls || ""); ui.narr.innerHTML = md(text); },
      button(label, fn, cls) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "ex-btn " + (cls || ""); b.innerHTML = label;
        b.addEventListener("click", fn);
        ui.controls.appendChild(b);
        return b;
      },
      toggle(labels, fn) {
        const box = document.createElement("div");
        box.className = "ex-toggle";
        labels.forEach((l, k) => {
          const b = document.createElement("button");
          b.type = "button"; b.textContent = l; if (!k) b.classList.add("on");
          b.onclick = () => { box.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); fn(k); };
          box.appendChild(b);
        });
        ui.controls.appendChild(box);
        return box;
      },
    };
    return ui;
  }

  /* ---------------------------------------------------------------- диаграмма последовательности */

  function sequence(stage, scenarios) {
    const ui = shell(stage, { scene: "ex-seq-scene" });
    let sc = scenarios[0], shown = 0, timer = 0, playing = false;
    const next = ui.button("▶ Дальше", step, "primary");
    const auto = ui.button("⏵ Авто", () => (playing ? stop() : play()));
    ui.button("↺ Сначала", reset);
    if (scenarios.length > 1) ui.toggle(scenarios.map((s) => s.name), (k) => { sc = scenarios[k]; reset(); });

    function draw() {
      const n = sc.actors.length;
      const lanes = sc.actors.map((a, i) => `<div class="ex-lane" style="left:${((i + 0.5) / n) * 100}%"></div>`).join("");
      const heads = sc.actors.map((a) => `<div class="ex-actor">${md(a)}</div>`).join("");
      const rows = sc.steps.slice(0, shown).map((s, k) => {
        const last = k === shown - 1 ? " last" : "";
        if (s.note != null) {
          const edge = s.note === 0 ? "edge-l" : s.note === n - 1 ? "edge-r" : "";
          return `<div class="ex-row${last}"><div class="ex-note ${s.cls || ""} ${edge}" style="left:${((s.note + 0.5) / n) * 100}%">${md(s.label)}</div></div>`;
        }
        const a = Math.min(s.from, s.to), b = Math.max(s.from, s.to);
        return `<div class="ex-row${last}"><div class="ex-msg ${s.from > s.to ? "rtl" : ""} ${s.cls || ""}" style="left:${((a + 0.5) / n) * 100}%;width:${((b - a) / n) * 100}%">
          <span>${md(s.label)}</span></div></div>`;
      }).join("");
      const db = sc.state ? `<div class="ex-state">${md(sc.state(shown))}</div>` : "";
      ui.scene.innerHTML = `<div class="ex-actors" style="grid-template-columns:repeat(${n},1fr)">${heads}</div><div class="ex-seq">${lanes}${rows}</div>${db}`;
      next.disabled = shown >= sc.steps.length;
      const cur = sc.steps[shown - 1];
      const c = (cur && cur.cls) || "";
      if (cur) ui.say(cur.narr || "", /bad/.test(c) ? "bad" : /good/.test(c) ? "good" : "");
      else ui.say(sc.intro);
    }
    function step() { if (shown < sc.steps.length) { shown++; draw(); } if (shown >= sc.steps.length) stop(); }
    function play() {
      if (shown >= sc.steps.length) shown = 0;
      playing = true; auto.textContent = "⏸ Пауза";
      (function tick() { if (!playing) return; step(); if (shown < sc.steps.length) timer = setTimeout(tick, reduced ? 600 : 1900); })();
    }
    function stop() { playing = false; clearTimeout(timer); auto.textContent = "⏵ Авто"; }
    function reset() { stop(); shown = 0; draw(); }
    draw();
  }

  const W = {};

  W["request-journey"] = (stage) => sequence(stage, [{
    name: "HTTPS-запрос",
    intro: "Что происходит, когда ты открываешь `https://shop.example.com`? Жми «Дальше» — по шагу за раз.",
    actors: ["🧑‍💻 Браузер", "🔎 DNS-резолвер", "🌐 DNS-серверы", "🖥️ Сервер"],
    steps: [
      { from: 0, to: 1, label: "shop.example.com — какой IP?", narr: "Сначала браузер проверяет свой кеш и `/etc/hosts`, а потом спрашивает DNS-резолвер — обычно у провайдера или `8.8.8.8`." },
      { from: 1, to: 2, label: "корень → .com → NS домена", narr: "Резолвер идёт по цепочке: корневой сервер отправляет к серверам зоны `.com`, те — к авторитетному NS-серверу домена." },
      { from: 2, to: 1, label: "A 93.184.216.34 · TTL 300", narr: "Авторитетный сервер отвечает записью **A**. TTL — сколько секунд ответ можно хранить в кеше." },
      { from: 1, to: 0, label: "93.184.216.34", narr: "Резолвер кеширует ответ и отдаёт IP. Если сломалось здесь, поможет `dig shop.example.com`." },
      { from: 0, to: 3, label: "SYN → :443", cls: "tcp", narr: "Теперь TCP — трёхстороннее рукопожатие. **SYN**: «хочу соединиться» на порт 443." },
      { from: 3, to: 0, label: "SYN-ACK", cls: "tcp", narr: "Сервер согласен. Если на SYN нет ответа — `Connection timed out` (часто файрвол); если пришёл RST — `Connection refused` (порт никто не слушает)." },
      { from: 0, to: 3, label: "ACK", cls: "tcp", narr: "Соединение установлено. Проверить этот этап: `nc -vz shop.example.com 443`." },
      { from: 0, to: 3, label: "TLS ClientHello", cls: "tls", narr: "TLS: браузер предлагает версии протокола и шифры." },
      { from: 3, to: 0, label: "ServerHello + сертификат", cls: "tls", narr: "Сервер присылает сертификат. Браузер проверяет цепочку доверия, срок действия и имя домена — отсюда ошибки «сертификат истёк» и «не тот домен»." },
      { from: 0, to: 3, label: "GET /products HTTP/1.1", cls: "http", narr: "Внутри зашифрованного канала идёт обычный HTTP-запрос: метод, путь, заголовки." },
      { from: 3, to: 0, label: "200 OK · application/json", cls: "http good", narr: "Ответ получен. Весь путь: **DNS → TCP → TLS → HTTP**. Диагностику «сайт не открывается» ведут в том же порядке.", },
    ],
  }]);

  W["lost-update"] = (stage) => sequence(stage, [
    {
      name: "Без блокировки",
      intro: "На складе остался **1** товар. Два покупателя нажимают «Купить» одновременно.",
      actors: ["🛒 Транзакция A", "🗄️ База · stock", "🛒 Транзакция B"],
      state: (n) => `stock = ${n < 3 ? 1 : 0} · продано: ${n < 3 ? 0 : n < 4 ? 1 : 2}`,
      steps: [
        { from: 0, to: 1, label: "SELECT stock → 1", narr: "A читает остаток: 1 — можно продавать." },
        { from: 2, to: 1, label: "SELECT stock → 1", narr: "B читает тот же остаток, пока A ещё не записала результат: тоже 1." },
        { from: 0, to: 1, label: "UPDATE stock = 0 · COMMIT", narr: "A списывает товар и фиксирует транзакцию." },
        { from: 2, to: 1, label: "UPDATE stock = 0 · COMMIT", narr: "B тоже «списывает» — она же видела 1. Её запись затирает запись A." },
        { note: 1, label: "Продано 2, а был 1 ✗", cls: "bad", narr: "**Потерянное обновление (Lost Update)**: обе транзакции прочитали старое значение и посчитали от него. Один заказ не обеспечен товаром." },
      ],
    },
    {
      name: "SELECT … FOR UPDATE",
      intro: "Та же ситуация, но чтение блокирует строку до конца транзакции.",
      actors: ["🛒 Транзакция A", "🗄️ База · stock", "🛒 Транзакция B"],
      state: (n) => `stock = ${n < 3 ? 1 : 0} · продано: ${n < 3 ? 0 : 1}`,
      steps: [
        { from: 0, to: 1, label: "SELECT … FOR UPDATE → 1", narr: "A читает остаток **и блокирует строку**." },
        { from: 2, to: 1, label: "SELECT … FOR UPDATE", narr: "B пытается прочитать ту же строку с блокировкой…" },
        { note: 2, label: "⏳ ждёт блокировку", cls: "wait", narr: "…и встаёт в очередь: строку держит A." },
        { from: 0, to: 1, label: "UPDATE stock = 0 · COMMIT", narr: "A списывает товар и делает COMMIT — блокировка снята." },
        { from: 1, to: 2, label: "→ stock = 0", narr: "B наконец получает строку — уже со **свежим** значением 0." },
        { from: 2, to: 1, label: "ROLLBACK: нет в наличии", cls: "good", narr: "B видит, что товара нет, и отказывает покупателю. Продан ровно один товар ✓ Альтернатива — атомарный `UPDATE … WHERE stock >= 1`." },
      ],
    },
  ]);

  /* ---------------------------------------------------------------- Git: три дерева */

  W["git-trees"] = (stage) => {
    const ui = shell(stage, { scene: "ex-git" });
    let files, commits, log;
    const fresh = () => {
      files = [{ n: "README.md", at: "repo" }, { n: "app.py", at: "work" }, { n: "config.yml", at: "work" }];
      commits = ["a1f3c2e Initial commit"]; log = ["$ git status -s", " M app.py", " M config.yml"];
    };
    const col = (where, title, hint) => `<div class="ex-col ex-${where}"><div class="ex-col-title">${title}</div><div class="ex-col-hint">${hint}</div>
      <div class="ex-chips">${files.filter((f) => f.at === where).map((f) => `<span class="ex-chip ${where}">${f.n}</span>`).join("") || '<span class="ex-empty">пусто</span>'}</div>
      ${where === "repo" ? `<div class="ex-commits">${commits.slice().reverse().map((c, k) => `<div class="ex-commit ${k === 0 ? "new" : ""}">● ${esc(c)}</div>`).join("")}</div>` : ""}</div>`;
    function draw() {
      ui.scene.innerHTML = `<div class="ex-cols">${col("work", "📁 Рабочая папка", "файлы, которые ты правишь")}<div class="ex-arrow">git add →</div>
        ${col("index", "📋 Индекс (staging)", "черновик следующего коммита")}<div class="ex-arrow">git commit →</div>
        ${col("repo", "🗄️ Репозиторий .git", "сохранённые снимки")}</div><pre class="ex-term">${log.map(esc).join("\n")}</pre>`;
    }
    const counter = { i: 2 };
    ui.button("✎ Изменить файл", () => {
      const f = files.find((x) => x.at === "repo") || files[0];
      f.at = "work"; log = ["$ vim " + f.n, "$ git status -s", ...files.filter((x) => x.at !== "repo").map((x) => (x.at === "index" ? "M  " : " M ") + x.n)];
      ui.say(`Ты изменила \`${f.n}\`. Изменение пока только в рабочей папке — Git видит его, но никуда не сохранил.`);
      draw();
    });
    ui.button("git add", () => {
      const moved = files.filter((f) => f.at === "work");
      if (!moved.length) { ui.say("В рабочей папке нет изменений — добавлять нечего."); return; }
      const f = moved[0]; f.at = "index";
      log = ["$ git add " + f.n, "$ git status -s", ...files.filter((x) => x.at !== "repo").map((x) => (x.at === "index" ? "M  " : " M ") + x.n)];
      ui.say(`\`git add ${f.n}\` кладёт файл в индекс. Остальные изменения остались в рабочей папке — так собирают коммит из нужной части правок.`);
      draw();
    }, "primary");
    ui.button("git commit", () => {
      const staged = files.filter((f) => f.at === "index");
      if (!staged.length) { log = ["$ git commit -m \"…\"", "nothing to commit (use \"git add\")"]; ui.say("Индекс пуст — коммитить нечего. Сначала `git add`.", "bad"); draw(); return; }
      staged.forEach((f) => (f.at = "repo"));
      const hash = Math.random().toString(16).slice(2, 9);
      commits.push(`${hash} feat: update ${staged.map((f) => f.n).join(", ")}`);
      counter.i++;
      log = [`$ git commit -m "feat: update ${staged.map((f) => f.n).join(", ")}"`, `[main ${hash}] ${staged.length} file changed`];
      ui.say(`Коммит \`${hash}\` сохранил **только то, что было в индексе**. Файлы в рабочей папке в него не попали.`, "good");
      draw();
    });
    ui.button("git restore --staged", () => {
      const f = files.find((x) => x.at === "index");
      if (!f) { ui.say("В индексе ничего нет."); return; }
      f.at = "work"; log = ["$ git restore --staged " + f.n];
      ui.say(`Файл \`${f.n}\` убран из индекса обратно в рабочую папку. Сами правки не потерялись.`);
      draw();
    });
    ui.button("↺", () => { fresh(); ui.say("Два файла изменены в рабочей папке. Попробуй добавить в коммит только один из них."); draw(); }, "ghost");
    fresh(); ui.say("Два файла изменены в рабочей папке. Попробуй добавить в коммит только один из них."); draw();
  };

  /* ---------------------------------------------------------------- chmod */

  W["chmod"] = (stage) => {
    const ui = shell(stage, { scene: "ex-chmod" });
    const who = [["u", "владелец"], ["g", "группа"], ["o", "остальные"]], what = [["r", 4, "чтение"], ["w", 2, "запись"], ["x", 1, "выполнение"]];
    let bits = [7, 5, 5];
    const tips = {
      "755": "Типично для скриптов и папок: владелец всё, остальные читают и запускают.",
      "644": "Типично для обычных файлов и конфигов: владелец пишет, остальные только читают.",
      "600": "Только владелец: так хранят приватные ключи (`~/.ssh/id_ed25519`) и файлы с паролями. SSH откажется работать с ключом, если права шире.",
      "700": "Только владелец, но с выполнением — например папка `~/.ssh`.",
      "777": "Все могут всё. Почти всегда ошибка и дыра в безопасности: любой пользователь может подменить файл.",
    };
    function draw() {
      const oct = bits.join("");
      const sym = "-" + bits.map((b) => (b & 4 ? "r" : "-") + (b & 2 ? "w" : "-") + (b & 1 ? "x" : "-")).join("");
      ui.scene.innerHTML = `<div class="ex-perm-grid">${who.map(([w, wl], i) => `<div class="ex-perm-who"><b>${w}</b> ${wl}<span class="ex-digit">${bits[i]}</span></div>
        ${what.map(([c, v, l]) => `<button type="button" class="ex-bit ${bits[i] & v ? "on" : ""}" data-i="${i}" data-v="${v}" title="${l}">${c}<small>${v}</small></button>`).join("")}`).join("")}</div>
        <div class="ex-perm-out"><code class="ex-big">${sym}</code><code class="ex-big accent">chmod ${oct} deploy.sh</code></div>`;
      ui.scene.querySelectorAll(".ex-bit").forEach((b) => b.onclick = () => { bits[+b.dataset.i] ^= +b.dataset.v; draw(); });
      ui.say(tips[oct] || `Каждая цифра — сумма битов: r = 4, w = 2, x = 1. Здесь: ${bits.map((b, i) => `${who[i][1]} ${b}`).join(", ")}.`, oct === "777" ? "bad" : "");
    }
    ["755", "644", "600", "777"].forEach((p) => ui.button(p, () => { bits = p.split("").map(Number); draw(); }));
    draw();
  };

  /* ---------------------------------------------------------------- SQL JOIN */

  W["sql-joins"] = (stage) => {
    const ui = shell(stage, { scene: "ex-join" });
    const cust = [[1, "Анна"], [2, "Борис"], [3, "Вера"]];
    const buys = [[1, "SSD"], [1, "Мышь"], [2, "Роутер"], [4, "Кабель"]];
    const types = {
      INNER: { l: false, r: false, t: "Только пары, где `customer.id = purchase.customer_id`. Вера без покупок и покупка с несуществующим id 4 отброшены." },
      LEFT: { l: true, r: false, t: "Все покупатели, даже без покупок. У Веры вместо покупки `NULL` — так ищут «кто ничего не купил»: `WHERE p.customer_id IS NULL`." },
      RIGHT: { l: false, r: true, t: "Все покупки, даже без покупателя. Покупка «Кабель» с customer_id = 4 осталась — это «сирота», признак нарушенной связи." },
      FULL: { l: true, r: true, t: "Всё сразу: пары, покупатели без покупок и покупки без покупателя." },
    };
    let cur = "INNER";
    function result(t) {
      const rows = [];
      cust.forEach(([id, n]) => { const m = buys.filter((b) => b[0] === id); m.forEach((b) => rows.push([n, b[1], "pair"])); if (!m.length && t.l) rows.push([n, null, "left"]); });
      buys.forEach((b) => { if (!cust.some((c) => c[0] === b[0]) && t.r) rows.push([null, b[1], "right"]); });
      return rows;
    }
    function draw() {
      const t = types[cur], rows = result(t);
      const used = (side, id) => side === "c" ? (buys.some((b) => b[0] === id) || t.l) : (cust.some((c) => c[0] === id) || t.r);
      const cell = (v) => v == null ? '<td class="null">NULL</td>' : `<td>${esc(v)}</td>`;
      ui.scene.innerHTML = `<div class="ex-join-grid">
        <table class="ex-t"><caption>customer</caption><tr><th>id</th><th>name</th></tr>${cust.map(([id, n]) => `<tr class="${used("c", id) ? "in" : "out"}"><td>${id}</td><td>${n}</td></tr>`).join("")}</table>
        <svg class="ex-venn" viewBox="0 0 160 100" aria-hidden="true">
          <path class="v-l ${t.l ? "on" : ""}" d="M80 18 A40 40 0 1 0 80 82 A40 40 0 0 1 80 18 Z"/>
          <path class="v-r ${t.r ? "on" : ""}" d="M80 18 A40 40 0 1 1 80 82 A40 40 0 0 0 80 18 Z"/>
          <path class="v-m on" d="M80 18 A40 40 0 0 1 80 82 A40 40 0 0 1 80 18 Z"/>
          <circle cx="58" cy="50" r="40"/><circle cx="102" cy="50" r="40"/>
          <text x="30" y="54">customer</text><text x="106" y="54">purchase</text></svg>
        <table class="ex-t"><caption>purchase</caption><tr><th>customer_id</th><th>item</th></tr>${buys.map(([id, it]) => `<tr class="${used("p", id) ? "in" : "out"}"><td>${id}</td><td>${it}</td></tr>`).join("")}</table>
        </div>
        <pre class="ex-term">SELECT c.name, p.item\nFROM customer c ${cur} JOIN purchase p ON p.customer_id = c.id;</pre>
        <table class="ex-t ex-result"><caption>результат: ${rows.length} ${rows.length % 10 === 1 && rows.length % 100 !== 11 ? "строка" : [2, 3, 4].includes(rows.length % 10) && ![12, 13, 14].includes(rows.length % 100) ? "строки" : "строк"}</caption><tr><th>name</th><th>item</th></tr>${rows.map((r) => `<tr class="${r[2]}">${cell(r[0])}${cell(r[1])}</tr>`).join("")}</table>`;
      ui.say(t.t);
    }
    ui.toggle(Object.keys(types).map((k) => k + " JOIN"), (k) => { cur = Object.keys(types)[k]; draw(); });
    draw();
  };

  /* ---------------------------------------------------------------- индекс против полного прохода */

  W["index-scan"] = (stage) => {
    const ui = shell(stage, { scene: "ex-idx" });
    const names = ["anna", "boris", "dina", "egor", "ilya", "kira", "lev", "mila", "nina", "oleg", "petr", "rita", "sasha", "vera", "yan", "zoya"];
    const shuffled = [9, 3, 14, 0, 7, 12, 5, 1, 15, 10, 2, 13, 6, 11, 4, 8].map((i) => names[i]);
    const target = "vera";
    let running = false;
    function draw(seq = -1, found = false, tree = 0, seqReads = 0) {
      const treeHtml = `<div class="ex-tree">
        <div class="ex-node ${tree >= 1 ? "hit" : ""}">… <b>mila</b> …</div>
        <div class="ex-level"><div class="ex-node">anna … kira</div><div class="ex-node ${tree >= 2 ? "hit" : ""}">mila … <b>sasha</b> … zoya</div></div>
        <div class="ex-level"><div class="ex-node">mila nina oleg</div><div class="ex-node">petr rita</div><div class="ex-node ${tree >= 3 ? "hit" : ""}">sasha <b>vera</b> yan zoya</div></div>
        <div class="ex-reads">прочитано страниц: <b>${Math.min(tree, 3)}</b></div></div>`;
      ui.scene.innerHTML = `<div class="ex-idx-grid">
        <div><div class="ex-col-title">Seq Scan — без индекса</div><div class="ex-rows">${shuffled.map((n, k) => `<span class="ex-row-cell ${k <= seq ? "read" : ""} ${found && n === target ? "hit" : ""}">${n}</span>`).join("")}</div>
          <div class="ex-reads">прочитано строк: <b>${seqReads}</b> из ${shuffled.length}</div></div>
        <div><div class="ex-col-title">Index Scan — B-дерево по email</div>${treeHtml}</div></div>
        <pre class="ex-term">SELECT * FROM customer WHERE email = '${target}@mail.ru';</pre>`;
    }
    ui.button("▶ Найти vera@mail.ru", async () => {
      if (running) return; running = true;
      for (let k = 0; k < shuffled.length; k++) {
        draw(k, k >= shuffled.indexOf(target), Math.min(3, k + 1), k + 1);
        ui.say(k < shuffled.length - 1 ? "Без индекса база читает строки подряд — и не может остановиться на первой находке: вдруг совпадений несколько." : "");
        await wait(170);
      }
      draw(shuffled.length - 1, true, 3, shuffled.length);
      ui.say("**16 строк против 3 страниц.** На миллионе строк: Seq Scan читает весь миллион, B-дерево — около 4 страниц, потому что на каждом уровне отбрасывает почти всё лишнее. Проверить, какой план выбрала база: `EXPLAIN ANALYZE`.", "good");
      running = false;
    }, "primary");
    draw(); ui.say("Ищем покупателя по email в таблице из 16 строк. Слева — без индекса, справа — с индексом.");
  };

  /* ---------------------------------------------------------------- Docker: кеш слоёв */

  W["docker-cache"] = (stage) => {
    const ui = shell(stage, { scene: "ex-docker" });
    const orders = {
      bad: [["FROM python:3.12-slim", 0, ""], ["WORKDIR /app", 0, ""], ["COPY . .", 1, "all"], ["RUN pip install -r requirements.txt", 45, "deps"], ["CMD [\"gunicorn\", \"app:app\"]", 0, ""]],
      good: [["FROM python:3.12-slim", 0, ""], ["WORKDIR /app", 0, ""], ["COPY requirements.txt .", 1, "req"], ["RUN pip install -r requirements.txt", 45, "deps"], ["COPY . .", 1, "all"], ["CMD [\"gunicorn\", \"app:app\"]", 0, ""]],
    };
    let order = "bad";
    function build(change) {
      // правка кода задевает `COPY . .`, правка requirements — и `COPY requirements.txt`, и `COPY . .`
      let broken = false, total = 0;
      const res = orders[order].map(([l, t, kind]) => {
        if (kind === "all" || (kind === "req" && change === "req")) broken = true;
        if (broken) total += t;
        return [l, broken, t];
      });
      return { res, total };
    }
    async function run(change, label) {
      const { res, total } = build(change);
      ui.scene.innerHTML = `<div class="ex-layers">${res.map(([l], k) => `<div class="ex-layer" data-k="${k}"><code>${esc(l)}</code><span class="ex-status">…</span></div>`).join("")}</div>`;
      const els = ui.scene.querySelectorAll(".ex-layer");
      for (let k = 0; k < res.length; k++) {
        const [, rebuilt, t] = res[k];
        els[k].classList.add(rebuilt ? "rebuild" : "cached");
        els[k].querySelector(".ex-status").textContent = rebuilt ? (t ? `пересборка ${t} с` : "пересборка") : "CACHED";
        await wait(rebuilt && t > 10 ? 700 : 220);
      }
      ui.say(`${label}: сборка заняла **~${total} с**. ${order === "bad"
        ? (change === "code" ? "`COPY . .` стоит до `pip install` — любое изменение кода сбрасывает кеш, и зависимости ставятся заново." : "Изменился список зависимостей — переустановка оправдана.")
        : (change === "code" ? "Зависимости скопированы и установлены **до** кода, поэтому правка кода пересобирает только последние слои." : "Изменился `requirements.txt` — пересобирается слой с `pip install` и всё после него, как и должно быть.")}`, total > 40 && change === "code" ? "bad" : "good");
    }
    ui.toggle(["Плохой порядок", "Хороший порядок"], (k) => { order = k ? "good" : "bad"; ui.scene.innerHTML = layersIdle(); ui.say("Порядок изменён. Теперь снова «поправь код»."); });
    ui.button("✎ Изменить app.py", () => run("code", "Правка кода"), "primary");
    ui.button("✎ Изменить requirements.txt", () => run("req", "Новая зависимость"));
    const layersIdle = () => `<div class="ex-layers">${orders[order].map(([l]) => `<div class="ex-layer"><code>${esc(l)}</code><span class="ex-status"></span></div>`).join("")}</div>`;
    ui.scene.innerHTML = layersIdle();
    ui.say("Каждая инструкция Dockerfile — слой. Если слой и всё до него не менялись, Docker берёт его из кеша. Как только один слой изменился — все следующие собираются заново.");
  };

  /* ---------------------------------------------------------------- CI-пайплайн */

  W["ci-pipeline"] = (stage) => {
    const ui = shell(stage, { scene: "ex-ci" });
    const stages = [["lint", ["ruff", "hadolint"]], ["test", ["unit", "integration"]], ["build", ["docker build + push"]], ["deploy", ["deploy:prod ▶ manual"]]];
    let failTest = false, running = false;
    function draw(st) {
      ui.scene.innerHTML = `<div class="ex-commitline">● <code>a8c41f2</code> feat: оплата картой → <b>main</b></div><div class="ex-stages">${stages.map(([s, jobs], i) => `<div class="ex-stage">
        <div class="ex-stage-name">${s}</div>${jobs.map((j, k) => `<div class="ex-job ${st[i + "-" + k] || "pending"}"><i></i>${esc(j)}</div>`).join("")}</div>`).join('<div class="ex-link"></div>')}</div>`;
    }
    async function run() {
      if (running) return; running = true;
      const st = {}; draw(st);
      for (let i = 0; i < stages.length; i++) {
        const jobs = stages[i][1];
        if (i === 3) { jobs.forEach((_, k) => (st[i + "-" + k] = "manual")); draw(st); ui.say("Всё зелёное. Деплой в прод ручной: кнопку ▶ нажимает человек — так безопаснее для боевого окружения.", "good"); break; }
        jobs.forEach((_, k) => (st[i + "-" + k] = "running")); draw(st);
        ui.say(["**lint** — быстрые проверки стиля и Dockerfile: падают за секунды, ещё до долгих тестов.", "**test** — задания одного этапа идут параллельно. Если упадёт любое, следующие этапы не начнутся.", "**build** — собираем образ и пушим в registry с тегом коммита."][i]);
        await wait(1100);
        let failed = false;
        jobs.forEach((_, k) => { const bad = failTest && i === 1 && k === 0; st[i + "-" + k] = bad ? "failed" : "passed"; failed = failed || bad; });
        draw(st);
        if (failed) {
          for (let j = i + 1; j < stages.length; j++) stages[j][1].forEach((_, k) => (st[j + "-" + k] = "skipped"));
          draw(st);
          ui.say("Тест упал ✗ — сборка и деплой **пропущены**. Сломанный код не доехал до прода: ради этого CI и нужен. Открываешь лог задания, чинишь, пушишь снова.", "bad");
          break;
        }
        await wait(300);
      }
      running = false;
    }
    ui.button("▶ git push", run, "primary");
    ui.toggle(["Тесты проходят", "Сломать тест"], (k) => { failTest = !!k; draw({}); ui.say(k ? "В коде ошибка. Посмотрим, что сделает пайплайн." : "Код в порядке."); });
    draw({}); ui.say("Каждый push запускает pipeline: этапы идут по очереди, задания внутри этапа — параллельно.");
  };

  /* ---------------------------------------------------------------- Terraform */

  W["terraform-plan"] = (stage) => {
    const ui = shell(stage, { scene: "ex-tf" });
    let code, state, real, plan = null;
    const fresh = () => { code = ["web-1", "web-2"]; state = ["web-1", "web-2"]; real = ["web-1", "web-2"]; plan = null; };
    const box = (title, list, cls, hint) => `<div class="ex-tf-col ${cls}"><div class="ex-col-title">${title}</div><div class="ex-col-hint">${hint}</div>
      ${list.map((s) => `<div class="ex-vm">🖥️ ${s}</div>`).join("") || '<span class="ex-empty">пусто</span>'}</div>`;
    function draw() {
      const planHtml = plan ? `<pre class="ex-term">$ terraform plan\n${plan.map(([op, s]) => `<span class="op-${op === "+" ? "add" : "del"}">  ${op} yandex_compute_instance.${s}</span>`).join("\n") || "No changes. Your infrastructure matches the configuration."}\n\nPlan: ${plan.filter((p) => p[0] === "+").length} to add, 0 to change, ${plan.filter((p) => p[0] === "-").length} to destroy.</pre>` : "";
      ui.scene.innerHTML = `<div class="ex-tf-grid">${box("📄 Код (.tf)", code, "code", "желаемое состояние")}${box("💾 State", state, "state", "что Terraform создал")}${box("☁️ Облако", real, "real", "что есть на самом деле")}</div>${planHtml}`;
    }
    ui.button("✎ count = 3", () => { if (!code.includes("web-3")) code.push("web-3"); plan = null; ui.say("Ты поменяла код: теперь серверов должно быть три. В облаке пока ничего не изменилось — код только описывает желание."); draw(); });
    ui.button("💥 Удалить web-2 руками", () => { real = real.filter((s) => s !== "web-2"); plan = null; ui.say("Кто-то удалил сервер через веб-консоль облака. Это **дрейф**: реальность разошлась с кодом и state.", "bad"); draw(); });
    ui.button("terraform plan", () => {
      state = state.filter((s) => real.includes(s));
      plan = [...code.filter((s) => !real.includes(s)).map((s) => ["+", s]), ...real.filter((s) => !code.includes(s)).map((s) => ["-", s])];
      ui.say(plan.length ? "`plan` сначала обновляет state по реальному облаку (refresh), потом сравнивает с кодом и показывает разницу. **Ничего не меняет** — читай вывод перед apply." : "Код, state и облако совпадают — менять нечего.");
      draw();
    }, "primary");
    ui.button("terraform apply", () => {
      if (!plan) { ui.say("Сначала `terraform plan` — посмотри, что изменится.", "bad"); return; }
      real = code.slice(); state = code.slice(); plan = null;
      ui.say("`apply` выполнил план: облако и state снова совпадают с кодом. Дрейф исправлен тем же способом, что и обычное изменение.", "good");
      draw();
    });
    ui.button("↺", () => { fresh(); ui.say("Всё синхронно: два сервера в коде, в state и в облаке."); draw(); }, "ghost");
    fresh(); ui.say("Terraform сравнивает три вещи: код (что хотим), state (что он создал) и облако (что есть на самом деле)."); draw();
  };

  /* ---------------------------------------------------------------- Kubernetes: Deployment */

  W["k8s-deployment"] = (stage) => {
    const ui = shell(stage, { scene: "ex-k8s" });
    let pods = [], replicas = 3, seq = 0, busy = false, events = [], version = "v1";
    const mk = (v, st) => ({ id: `shop-7d9f-${(seq++).toString(36).padStart(2, "0")}${"abcxyz"[seq % 6]}`, v, st });
    const fresh = () => { pods = [mk("v1", "Running"), mk("v1", "Running"), mk("v1", "Running")]; replicas = 3; version = "v1"; events = []; };
    function ev(t) { events.unshift(t); events = events.slice(0, 4); }
    function draw() {
      const ready = pods.filter((p) => p.st === "Running");
      ui.scene.innerHTML = `<div class="ex-k8s-grid">
        <div class="ex-k8s-box"><div class="ex-col-title">Deployment shop</div><div class="ex-col-hint">replicas: <b>${replicas}</b> · image: shop:<b>${version}</b></div>
          <div class="ex-col-hint">готово: <b>${ready.length}/${replicas}</b></div></div>
        <div class="ex-k8s-pods">${pods.map((p) => `<div class="ex-pod ${p.st.toLowerCase()} ${p.v}"><b>${p.v}</b><span>${p.id}</span><em>${p.st}</em></div>`).join("")}</div>
        <div class="ex-k8s-box svc"><div class="ex-col-title">Service shop</div><div class="ex-col-hint">трафик → ${ready.length} под(а)</div><div class="ex-traffic">${ready.map(() => "<i></i>").join("")}</div></div>
      </div><pre class="ex-term">${events.map(esc).join("\n") || "$ kubectl get pods -w"}</pre>`;
    }
    async function reconcile() {
      // контроллер добивается replicas подов нужной версии
      while (pods.filter((p) => p.st !== "Terminating").length < replicas) {
        const p = mk(version, "Pending"); pods.push(p); ev(`+ ${p.id}  Pending → ContainerCreating`); draw(); await wait(700);
        p.st = "ContainerCreating"; draw(); await wait(700); p.st = "Running"; ev(`✓ ${p.id}  Running, readiness OK`); draw(); await wait(300);
      }
      while (pods.filter((p) => p.st !== "Terminating").length > replicas) {
        const p = pods.filter((x) => x.st === "Running").pop(); p.st = "Terminating"; ev(`- ${p.id}  Terminating`); draw(); await wait(700);
        pods = pods.filter((x) => x !== p); draw();
      }
    }
    async function act(fn) { if (busy) return; busy = true; await fn(); busy = false; }
    ui.button("💥 Убить под", () => act(async () => {
      const p = pods.find((x) => x.st === "Running"); if (!p) return;
      p.st = "Terminating"; ev(`✗ ${p.id}  killed (OOMKilled / нода упала)`); draw();
      ui.say("Под умер. Deployment следит за числом реплик и сразу создаёт замену — это **самовосстановление**. Service не шлёт трафик туда, где под не готов.", "bad");
      await wait(600); pods = pods.filter((x) => x !== p); draw(); await reconcile();
      ui.say("Снова 3 из 3. Никто ничего не перезапускал руками: Kubernetes сам привёл кластер к желаемому состоянию.", "good");
    }), "primary");
    ui.button("⇅ Масштаб 3 ↔ 5", () => act(async () => {
      replicas = replicas === 3 ? 5 : 3; ev(`$ kubectl scale deploy/shop --replicas=${replicas}`); draw();
      ui.say(`Ты поменяла **желаемое** число реплик на ${replicas}. Контроллер сам ${replicas === 5 ? "добавит" : "удалит"} поды.`);
      await reconcile();
    }));
    ui.button("⟳ Обновить до v2/v1", () => act(async () => {
      const from = version; version = version === "v1" ? "v2" : "v1"; ev(`$ kubectl set image deploy/shop shop=shop:${version}`); draw();
      ui.say(`**Rolling update** ${from} → ${version}: по одному новому поду (maxSurge 1), старый удаляется только когда новый прошёл readiness (maxUnavailable 0). Сервис работает всё время.`);
      for (const old of pods.filter((p) => p.v === from)) {
        const p = mk(version, "Pending"); pods.push(p); ev(`+ ${p.id}  ${version} Pending`); draw(); await wait(650);
        p.st = "ContainerCreating"; draw(); await wait(650); p.st = "Running"; ev(`✓ ${p.id}  ${version} Ready`); draw(); await wait(300);
        old.st = "Terminating"; ev(`- ${old.id}  ${from} Terminating`); draw(); await wait(550);
        pods = pods.filter((x) => x !== old); draw();
      }
      ui.say(`Все поды на ${version}, простоя не было. Если бы новые поды не проходили readiness, выкат остановился бы, а старые продолжали работать. Откат: \`kubectl rollout undo deploy/shop\`.`, "good");
    }));
    ui.button("↺", () => act(async () => { fresh(); draw(); ui.say("Deployment держит 3 пода версии v1."); }), "ghost");
    fresh(); draw(); ui.say("Deployment описывает желаемое состояние: 3 пода образа shop:v1. Попробуй сломать его.");
  };

  /* ---------------------------------------------------------------- GitOps */

  W["gitops-loop"] = (stage) => {
    const ui = shell(stage, { scene: "ex-gitops" });
    let git, live, status, busy = false;
    const fresh = () => { git = { image: "v2", replicas: 3 }; live = { image: "v2", replicas: 3 }; status = "Synced"; };
    function draw(arrow) {
      const cfg = (o, diff) => `<pre class="ex-mini">image: shop:<b class="${diff && diff.image ? "diff" : ""}">${o.image}</b>\nreplicas: <b class="${diff && diff.replicas ? "diff" : ""}">${o.replicas}</b></pre>`;
      const d = { image: git.image !== live.image, replicas: git.replicas !== live.replicas };
      ui.scene.innerHTML = `<div class="ex-gitops-grid">
        <div class="ex-k8s-box"><div class="ex-col-title">📦 Git-репозиторий</div><div class="ex-col-hint">источник правды</div>${cfg(git)}</div>
        <div class="ex-flow ${arrow === "pull" ? "on" : ""}">← опрашивает</div>
        <div class="ex-k8s-box argo"><div class="ex-col-title">🐙 Argo CD</div><div class="ex-badge ${status.toLowerCase().replace(/\W/g, "")}">${status}</div></div>
        <div class="ex-flow ${arrow === "sync" ? "on" : ""}">применяет →</div>
        <div class="ex-k8s-box"><div class="ex-col-title">☸️ Кластер</div><div class="ex-col-hint">что работает сейчас</div>${cfg(live, d)}</div></div>`;
    }
    async function sync(selfHeal) {
      status = "OutOfSync"; draw("pull"); await wait(1000);
      status = "Syncing"; draw("sync"); await wait(1100);
      live = Object.assign({}, git); status = "Synced"; draw();
      ui.say(selfHeal ? "**Self-heal**: Argo CD вернул кластер к тому, что записано в Git. Ручная правка исчезла — хочешь 5 реплик, меняй их через merge request." : "Кластер обновлён без `kubectl` и без доступа CI к кластеру: CI только поменял тег в Git, а Argo CD сам **вытянул** изменение (pull-модель).", "good");
    }
    ui.button("git push: image v3", async () => {
      if (busy) return; busy = true;
      git.image = git.image === "v3" ? "v2" : "v3"; draw();
      ui.say(`CI собрал образ и закоммитил новый тег \`${git.image}\` в репозиторий манифестов. Кластер ещё на старой версии…`);
      await wait(900); await sync(false); busy = false;
    }, "primary");
    ui.button("✎ kubectl edit: replicas 5", async () => {
      if (busy) return; busy = true;
      live.replicas = 5; status = "OutOfSync"; draw();
      ui.say("Кто-то поправил кластер руками. Теперь кластер не совпадает с Git — это **дрейф**, Argo CD видит его.", "bad");
      await wait(1500); await sync(true); busy = false;
    });
    ui.button("↺", () => { fresh(); draw(); ui.say("Git и кластер совпадают."); }, "ghost");
    fresh(); draw(); ui.say("В GitOps желаемое состояние лежит в Git, а агент внутри кластера постоянно сверяет его с реальностью.");
  };

  /* ---------------------------------------------------------------- сигналы процессов */

  W["process-signals"] = (stage) => {
    const ui = shell(stage, { scene: "ex-sig" });
    let st, log, busy = false;
    const fresh = () => { st = { state: "running", pid: 1423, workers: 4, gen: 1 }; log = ["$ ps -o pid,stat,cmd -C nginx", "1423 Ss  nginx: master process"]; };
    function draw() {
      const label = { running: "Running · S (спит, ждёт запросы)", stopped: "Stopped · T (заморожен)", stopping: "Завершается аккуратно…", dead: "нет процесса", reloading: "Перечитывает конфиг…" }[st.state];
      const workers = st.state === "dead" ? "" : Array.from({ length: st.workers }, (_, i) => `<div class="ex-sig-worker ${st.state} g${st.gen % 2}">worker ${i + 1}</div>`).join("");
      ui.scene.innerHTML = `<div class="ex-sig-grid"><div class="ex-sig-proc ${st.state}"><div class="ex-col-title">nginx: master</div>
        <div class="ex-col-hint">PID ${st.state === "dead" ? "—" : st.pid}</div><div class="ex-sig-state">${label}</div></div>
        <div class="ex-sig-workers">${workers || '<span class="ex-empty">процессов нет</span>'}</div></div><pre class="ex-term">${log.slice(-5).map(esc).join("\n")}</pre>`;
    }
    async function send(name, fn) { if (busy) return; busy = true; await fn(); busy = false; draw(); }
    const alive = () => st.state !== "dead";
    ui.button("kill -15 (TERM)", () => send("TERM", async () => {
      if (!alive()) return ui.say("Процесса уже нет — сигнал некому отправить: `kill: (1423) - No such process`.", "bad");
      log.push(`$ kill -15 ${st.pid}    # то же, что systemctl stop`); st.state = "stopping"; draw();
      ui.say("**SIGTERM** — вежливая просьба завершиться. Программа может его перехватить: nginx дообслуживает текущие запросы, закрывает файлы и только потом выходит.");
      await wait(1400); st.state = "dead"; log.push("[notice] gracefully shutting down… exiting"); draw();
      ui.say("Процесс завершился **сам и аккуратно**. Поэтому `kill` без номера шлёт именно TERM — с него и начинают.", "good");
    }), "primary");
    ui.button("kill -9 (KILL)", () => send("KILL", async () => {
      if (!alive()) return ui.say("Процесса уже нет.", "bad");
      log.push(`$ kill -9 ${st.pid}`); st.state = "dead"; draw();
      ui.say("**SIGKILL** нельзя перехватить: ядро убивает процесс мгновенно. Запросы оборваны, временные файлы и блокировки могут остаться. Это крайняя мера — когда TERM не помог.", "bad");
    }));
    ui.button("kill -1 (HUP)", () => send("HUP", async () => {
      if (!alive()) return ui.say("Процесса нет — сначала запусти его кнопкой ↺.", "bad");
      log.push(`$ kill -HUP ${st.pid}    # то же, что nginx -s reload`); st.state = "reloading"; draw();
      ui.say("**SIGHUP** у демонов обычно значит «перечитай конфиг». Master остаётся, а воркеры плавно меняются на новые.");
      await wait(1300); st.gen++; st.state = "running"; log.push("[notice] reconfiguring, start worker processes"); draw();
      ui.say("PID master-процесса тот же, воркеры новые — конфиг применён **без простоя**.", "good");
    }));
    ui.button("kill -STOP / -CONT", () => send("STOP", async () => {
      if (!alive()) return ui.say("Процесса нет.", "bad");
      if (st.state === "stopped") { log.push(`$ kill -CONT ${st.pid}`); st.state = "running"; ui.say("**SIGCONT** размораживает процесс, он продолжает с того же места.", "good"); return; }
      log.push(`$ kill -STOP ${st.pid}`); st.state = "stopped";
      ui.say("**SIGSTOP** замораживает процесс (статус `T` в `ps`): он жив, но ничего не делает. Так работает Ctrl+Z в терминале. Нажми ещё раз — отправим CONT.");
    }));
    ui.button("↺", () => send("reset", async () => { fresh(); ui.say("nginx снова работает. Попробуй разные сигналы."); }), "ghost");
    fresh(); draw(); ui.say("Сигнал — короткое сообщение процессу от ядра. Отправляет его `kill`, хотя убивают далеко не все сигналы.");
  };

  /* ---------------------------------------------------------------- конвейер bash */

  W["bash-pipe"] = (stage) => {
    const ui = shell(stage, { scene: "ex-pipe" });
    const LOG = [
      '10.0.0.5 GET /api/items 200', '10.0.0.7 GET / 200', '10.0.0.5 POST /login 401', '10.0.0.9 GET /old 404',
      '10.0.0.5 GET /api/items 500', '10.0.0.7 GET /health 200', '10.0.0.9 GET /api/cart 500', '10.0.0.3 GET / 200',
    ];
    const STAGES = [
      { cmd: "cat access.log", run: () => LOG, say: "`cat` выводит файл в **stdout**. Пока это просто 8 строк лога: IP, метод, путь, код ответа." },
      { cmd: "awk '{print $4}'", run: (l) => l.map((x) => x.split(" ")[3]), say: "`|` передаёт вывод следующей команде на **stdin**. `awk` режет строку по пробелам и печатает 4-е поле — код ответа." },
      { cmd: "sort", run: (l) => l.slice().sort(), say: "`sort` упорядочивает строки — одинаковые коды встают рядом. Это нужно для следующего шага." },
      { cmd: "uniq -c", run: (l) => { const out = []; l.forEach((x) => { const last = out[out.length - 1]; if (last && last[1] === x) last[0]++; else out.push([1, x]); }); return out.map(([n, x]) => `${String(n).padStart(7)} ${x}`); }, say: "`uniq -c` схлопывает **соседние** одинаковые строки и считает их. Без `sort` перед ним счёт был бы неверным." },
      { cmd: "sort -rn", run: (l) => l.slice().sort((a, b) => parseInt(b) - parseInt(a)), say: "`sort -rn` — по числу (`-n`) и по убыванию (`-r`): самые частые коды наверху." },
      { cmd: "head -3", run: (l) => l.slice(0, 3), say: "`head -3` оставляет три первые строки. Готово: топ кодов ответа одной строкой — классика разбора логов на сервере." },
    ];
    let n = 1;
    function draw() {
      let data = [];
      STAGES.slice(0, n).forEach((s, k) => { data = k ? s.run(data) : s.run(); });
      const cmd = STAGES.map((s, k) => `<span class="ex-pipe-cmd ${k < n ? "on" : ""} ${k === n - 1 ? "last" : ""}">${esc(s.cmd)}</span>`).join('<span class="ex-pipe-bar">|</span>');
      ui.scene.innerHTML = `<div class="ex-pipe-line"><span class="ex-pipe-prompt">$</span>${cmd}</div><pre class="ex-term ex-pipe-out">${data.map(esc).join("\n")}</pre>`;
      ui.say(STAGES[n - 1].say, n === STAGES.length ? "good" : "");
      add.disabled = n >= STAGES.length;
    }
    const add = ui.button("▶ Добавить звено", () => { if (n < STAGES.length) { n++; draw(); } }, "primary");
    ui.button("◀ Убрать", () => { if (n > 1) { n--; draw(); } });
    ui.button("↺", () => { n = 1; draw(); }, "ghost");
    draw();
  };

  /* ---------------------------------------------------------------- Prometheus */

  W["prometheus-scrape"] = (stage) => sequence(stage, [{
    name: "Метрика → алерт",
    intro: "Как ошибка в приложении превращается в сообщение дежурному. Жми «Дальше».",
    actors: ["🐍 Приложение", "🔥 Prometheus", "🚨 Alertmanager", "📱 Дежурный"],
    steps: [
      { from: 1, to: 0, label: "GET /metrics · каждые 15 с", narr: "Prometheus сам **ходит** за метриками (pull-модель). Приложение лишь отдаёт текущие значения счётчиков по HTTP." },
      { from: 0, to: 1, label: "http_requests_total{code=\"500\"} 1287", narr: "Ответ — текст: имя метрики, метки и число. Счётчик только растёт, поэтому смотрят на скорость роста: `rate(...[5m])`." },
      { note: 1, label: "TSDB: сохранить точку", narr: "Каждый опрос — новая точка во временном ряду. По ним строятся графики в Grafana." },
      { note: 1, label: "rule: доля 5xx > 5% for 5m", cls: "wait", narr: "Раз в интервал Prometheus вычисляет правила. Условие выполняется — алерт переходит в **Pending** и ждёт `for: 5m`, чтобы не будить людей из-за минутного всплеска." },
      { from: 1, to: 2, label: "FIRING: HighErrorRate", cls: "bad", narr: "Условие держится 5 минут — алерт **Firing** и уходит в Alertmanager." },
      { note: 2, label: "группировка · дедупликация", narr: "Alertmanager склеивает одинаковые алерты в одно сообщение, глушит дубли и решает, кому и куда слать (routes)." },
      { from: 2, to: 3, label: "Telegram: 🔴 5xx 7% на shop-api", cls: "bad", narr: "Дежурный получает уведомление со ссылкой на runbook и дашборд." },
      { from: 2, to: 3, label: "✅ RESOLVED", cls: "good", narr: "Когда доля ошибок падает ниже порога, придёт и сообщение о восстановлении. Цепочка: **метрика → правило → Alertmanager → человек**." },
    ],
  }]);

  /* ---------------------------------------------------------------- asyncio */

  W["asyncio-timeline"] = (stage) => {
    const ui = shell(stage, { scene: "ex-async" });
    const MODES = [
      { name: "Последовательно", bars: [[0, 1], [1, 1], [2, 1]], total: 3, say: "Обычный код: `requests.get` блокирует программу, пока ждёт ответ. Три запроса по 1 с — **3 секунды**, и почти всё это время процессор просто ждёт сеть." },
      { name: "asyncio.gather", bars: [[0, 1], [0.05, 1], [0.1, 1]], total: 1.1, say: "С `asyncio` пока один запрос **ждёт** сеть (`await`), цикл событий запускает следующий. Ожидания идут одновременно — **~1 секунда** вместо трёх, и всё в одном потоке." },
      { name: "CPU-задачи в asyncio", bars: [[0, 1], [1, 1], [2, 1]], total: 3, cpu: true, say: "Но если задача **считает** (CPU), а не ждёт — `await` негде вставить, цикл событий занят. Asyncio не ускоряет вычисления: для них нужны процессы (`ProcessPoolExecutor`)." },
    ];
    let mode = 0, timer = 0;
    function draw(t) {
      const m = MODES[mode], scale = 100 / 3.2;
      ui.scene.innerHTML = `<div class="ex-async-rows">${m.bars.map(([start, len], i) => {
        const done = Math.max(0, Math.min(len, t - start));
        return `<div class="ex-async-row"><span>${m.cpu ? "расчёт" : "запрос"} ${i + 1}</span><div class="ex-async-track">
          <i class="${m.cpu ? "cpu" : "io"}" style="left:${start * scale}%;width:${done * scale}%"></i></div></div>`;
      }).join("")}<div class="ex-async-row"><span></span><div class="ex-async-axis">${[0, 1, 2, 3].map((s) => `<b style="left:${s * scale}%">${s} с</b>`).join("")}<em style="left:${Math.min(t, 3.2) * scale}%"></em></div></div></div>
        <div class="ex-state">прошло: ${Math.min(t, m.total).toFixed(1)} с</div>`;
    }
    function run() {
      clearInterval(timer);
      let t = 0; const m = MODES[mode];
      ui.say(m.say, mode === 1 ? "good" : mode === 2 ? "bad" : "");
      timer = setInterval(() => { t += 0.05; draw(t); if (t >= m.total) clearInterval(timer); }, reduced ? 1 : 40);
    }
    ui.button("▶ Запустить", run, "primary");
    ui.toggle(MODES.map((m) => m.name), (k) => { mode = k; clearInterval(timer); draw(0); ui.say(MODES[k].say.split(":")[0] + ". Жми «Запустить»."); });
    draw(0); ui.say("Три HTTP-запроса по 1 секунде. Сравни, сколько займёт их выполнение разными способами.");
  };

  /* ---------------------------------------------------------------- сеть Docker Compose */

  W["compose-network"] = (stage) => sequence(stage, [{
    name: "Запрос через compose",
    intro: "В `compose.yaml` три сервиса: **web** (nginx, `ports: 8080:80`), **api** и **db** (без ports). Проследим запрос.",
    actors: ["🧑‍💻 Браузер", "🖥️ Хост :8080", "🌐 web", "🐍 api", "🗄️ db"],
    steps: [
      { from: 0, to: 1, label: "localhost:8080", narr: "Снаружи виден только **опубликованный** порт хоста: `ports: \"8080:80\"`." },
      { from: 1, to: 2, label: "→ web:80 (NAT)", narr: "Docker перенаправляет порт хоста в контейнер web на порт 80 через правила iptables. Внутри контейнера nginx слушает свой обычный 80-й." },
      { from: 2, to: 3, label: "proxy_pass http://api:8000", narr: "Контейнеры одной compose-сети находят друг друга **по имени сервиса**: встроенный DNS Docker (`127.0.0.11`) превращает `api` в IP контейнера." },
      { from: 3, to: 4, label: "postgres://db:5432", narr: "api ходит в базу тоже по имени `db`. Порт 5432 доступен **только внутри сети** — ports для db не нужен и даже вреден." },
      { from: 4, to: 3, label: "rows", narr: "Ответ базы возвращается по той же сети." },
      { from: 3, to: 2, label: "200 JSON", narr: "api отдаёт JSON nginx-у…" },
      { from: 2, to: 0, label: "200 OK", cls: "good", narr: "…а тот — браузеру. Частая ошибка: писать в конфиге `localhost:8000` — внутри контейнера `localhost` это **сам контейнер**, а не соседний." },
      { from: 0, to: 4, label: "localhost:5432 ✗", cls: "bad", narr: "А напрямую с хоста к db не достучаться: порт не опубликован. Это правильно — базе не место в интернете." },
    ],
  }]);

  /* ---------------------------------------------------------------- Ansible */

  W["ansible-run"] = (stage) => sequence(stage, [
    {
      name: "Первый запуск",
      intro: "`ansible-playbook site.yml` на два сервера. На web1 nginx ещё нет, на web2 уже стоит.",
      actors: ["💻 Control node", "🖥️ web1", "🖥️ web2"],
      steps: [
        { from: 0, to: 1, label: "SSH · gather facts", narr: "Агентов нет: Ansible подключается по **SSH** и собирает факты — ОС, IP, память. Хосты обрабатываются параллельно." },
        { from: 0, to: 2, label: "SSH · gather facts", narr: "То же для web2." },
        { from: 1, to: 0, label: "apt nginx: changed", cls: "warn", narr: "Задача `apt: name=nginx state=present`. На web1 пакета не было — Ansible поставил его: **changed** (жёлтый)." },
        { from: 2, to: 0, label: "apt nginx: ok", cls: "good", narr: "На web2 nginx уже есть, ничего делать не нужно: **ok** (зелёный). Модуль проверяет состояние, а не слепо выполняет команду." },
        { from: 1, to: 0, label: "template nginx.conf: changed → notify", cls: "warn", narr: "Конфиг из шаблона Jinja2 отличается от того, что на сервере, — файл заменён, и задача **уведомляет handler** «restart nginx»." },
        { note: 1, label: "handler: restart nginx", narr: "Handler выполняется **один раз в конце** play и только там, где его уведомили. На web2 конфиг совпал — рестарта не будет." },
        { note: 0, label: "PLAY RECAP web1 changed=3 · web2 changed=0", cls: "good", narr: "Итог: что изменилось и где. `failed=0` — всё прошло." },
      ],
    },
    {
      name: "Повторный запуск",
      intro: "Запускаем тот же плейбук ещё раз, ничего не меняя.",
      actors: ["💻 Control node", "🖥️ web1", "🖥️ web2"],
      steps: [
        { from: 1, to: 0, label: "apt nginx: ok", cls: "good", narr: "Пакет уже стоит — ok." },
        { from: 1, to: 0, label: "template: ok", cls: "good", narr: "Конфиг совпадает с шаблоном — ok, handler не вызывается, nginx не перезапускается." },
        { from: 2, to: 0, label: "всё: ok", cls: "good", narr: "На web2 тоже всё ok." },
        { note: 0, label: "changed=0 ✓ идемпотентность", cls: "good", narr: "**Идемпотентность**: повторный запуск ничего не меняет, если система уже в нужном состоянии. Поэтому плейбук можно спокойно запускать хоть каждый час — например, чтобы откатывать ручные правки." },
      ],
    },
  ]);

  /* ---------------------------------------------------------------- Helm */

  W["helm-template"] = (stage) => {
    const ui = shell(stage, { scene: "ex-helm" });
    const ENVS = [
      { name: "values.yaml", vals: { replicaCount: 1, tag: "latest", host: "shop.local", cpu: "100m" }, file: "helm install shop ./chart" },
      { name: "+ values-prod.yaml", vals: { replicaCount: 3, tag: "1.4.2", host: "shop.example.com", cpu: "500m" }, over: ["replicaCount", "tag", "host", "cpu"], file: "helm upgrade shop ./chart -f values-prod.yaml" },
    ];
    let env = 0;
    function draw() {
      const e = ENVS[env], v = e.vals, o = new Set(e.over || []);
      const val = (k, x) => `<b class="${o.has(k) ? "diff" : ""}">${x}</b>`;
      ui.scene.innerHTML = `<div class="ex-helm-grid">
        <div class="ex-k8s-box"><div class="ex-col-title">values</div><div class="ex-col-hint">${esc(e.name)}</div>
          <pre class="ex-mini">replicaCount: ${val("replicaCount", v.replicaCount)}\nimage:\n  tag: ${val("tag", v.tag)}\ningress:\n  host: ${val("host", v.host)}\nresources:\n  cpu: ${val("cpu", v.cpu)}</pre></div>
        <div class="ex-k8s-box"><div class="ex-col-title">templates/deployment.yaml</div><div class="ex-col-hint">шаблон Go</div>
          <pre class="ex-mini">replicas: <i>{{ .Values.replicaCount }}</i>\nimage: "shop:<i>{{ .Values.image.tag }}</i>"\nresources:\n  requests:\n    cpu: <i>{{ .Values.resources.cpu }}</i></pre></div>
        <div class="ex-k8s-box"><div class="ex-col-title">итоговый манифест</div><div class="ex-col-hint">что уйдёт в кластер</div>
          <pre class="ex-mini">kind: Deployment\nspec:\n  replicas: ${val("replicaCount", v.replicaCount)}\n  image: "shop:${val("tag", v.tag)}"\n  cpu: ${val("cpu", v.cpu)}\n---\nkind: Ingress\n  host: ${val("host", v.host)}</pre></div>
      </div><pre class="ex-term">$ ${esc(e.file)}</pre>`;
    }
    ui.toggle(ENVS.map((e) => e.name), (k) => {
      env = k; draw();
      ui.say(k ? "Файл `-f values-prod.yaml` **накладывается поверх** values.yaml: совпадающие ключи заменяются (подсвечены), остальные берутся из значений по умолчанию. Шаблон тот же — меняются только значения." : "Шаблон + значения по умолчанию. Увидеть результат без установки: `helm template shop ./chart`.", k ? "good" : "");
    });
    draw(); ui.say("Helm-чарт = шаблоны + значения. Один чарт обслуживает dev и prod — переключи окружение.");
  };

  /* ---------------------------------------------------------------- стратегии выката */

  W["deploy-strategies"] = (stage) => {
    const ui = shell(stage, { scene: "ex-strat" });
    const NAMES = ["Rolling", "Blue-Green", "Canary"];
    let mode = 0, bug = false, pods, traffic, busy = false;
    const fresh = () => { pods = ["v1", "v1", "v1", "v1"]; traffic = 0; };
    function draw(extra) {
      const errs = bug ? Math.round(traffic * 0.4) : 0;
      ui.scene.innerHTML = `<div class="ex-strat-pods">${pods.map((p, i) => `<div class="ex-pod ${p === "v2" ? "v2" : ""} ${p === "—" ? "terminating" : "running"} ${mode === 1 && i >= 4 ? "green" : ""}"><b>${p}</b><span>${mode === 1 ? (i < 4 ? "blue" : "green") : "pod " + (i + 1)}</span></div>`).join("")}</div>
        <div class="ex-strat-bar"><i class="v1" style="width:${100 - traffic}%">v1 ${100 - traffic}%</i><i class="v2" style="width:${traffic}%">${traffic ? "v2 " + traffic + "%" : ""}</i></div>
        <div class="ex-state">${extra || ""}${bug && traffic ? ` · ошибок у пользователей: ${errs}%` : ""}</div>`;
    }
    async function rollout() {
      if (busy) return; busy = true; fresh(); draw();
      if (mode === 0) {
        ui.say("**Rolling update**: поды меняются по одному, трафик перетекает постепенно.");
        for (let i = 0; i < 4; i++) {
          pods[i] = "v2"; traffic = (i + 1) * 25; draw(); await wait(900);
          if (bug && i === 0) { pods[0] = "v1"; traffic = 0; draw("readiness-проба v2 не прошла"); ui.say("С багом: новый под не проходит readiness, выкат **встаёт**, старые поды продолжают работать. Но если баг проявляется не сразу, часть пользователей успеет его поймать — откат через `rollout undo` займёт время.", "bad"); busy = false; return; }
        }
        ui.say("Готово: обновление без простоя и без лишних ресурсов. Минус — какое-то время работают **обе версии сразу**, и откат такой же постепенный.", "good");
      } else if (mode === 1) {
        ui.say("**Blue-Green**: рядом поднимается полная копия на v2 (green), трафик пока весь на blue.");
        pods = ["v1", "v1", "v1", "v1", "v2", "v2", "v2", "v2"]; draw("green поднят, тесты идут"); await wait(1400);
        traffic = 100; draw("переключение балансировщика"); await wait(900);
        if (bug) { traffic = 0; draw("мгновенный откат на blue"); ui.say("Баг в v2 — переключатель просто возвращается на blue. Откат **мгновенный**, но всё время нужны **двойные ресурсы**.", "bad"); busy = false; return; }
        pods = pods.slice(4); draw("blue удалён"); ui.say("Весь трафик переключён разом. Откат — одно переключение назад. Цена — двойные ресурсы на время выката.", "good");
      } else {
        ui.say("**Canary**: v2 получает сначала маленькую долю трафика, метрики сравниваются с v1.");
        pods[3] = "v2";
        for (const t of [10, 25, 50, 100]) {
          traffic = t; if (t === 100) pods = ["v2", "v2", "v2", "v2"]; draw(`шаг: ${t}% на v2`); await wait(1000);
          if (bug && t === 10) { traffic = 0; pods[3] = "v1"; draw("анализ метрик: ошибки выше нормы → откат"); ui.say("Баг заметили на 10% трафика: Argo Rollouts или Flagger сравнили долю 5xx с v1 и **автоматически откатили**. Пострадала лишь малая часть пользователей.", "bad"); busy = false; return; }
        }
        ui.say("Выкатили ступенями, на каждом шаге проверяя метрики. Самая безопасная стратегия, но нужна хорошая наблюдаемость.", "good");
      }
      busy = false;
    }
    ui.button("▶ Выкатить v2", rollout, "primary");
    const bugBtn = ui.button("🐞 В v2 баг: нет", () => { bug = !bug; bugBtn.textContent = `🐞 В v2 баг: ${bug ? "да" : "нет"}`; bugBtn.classList.toggle("on", bug); });
    ui.toggle(NAMES, (k) => { if (busy) return; mode = k; fresh(); draw(); ui.say(`Стратегия **${NAMES[k]}**. Жми «Выкатить», потом включи баг и сравни, как каждая стратегия с ним справляется.`); });
    fresh(); draw(); ui.say("Как выкатить новую версию без простоя? Три стратегии — и что будет, если в новой версии баг.");
  };

  /* ---------------------------------------------------------------- запуск */

  function init() {
    document.querySelectorAll("figure.explain[data-anim]").forEach((fig) => {
      const fn = W[fig.dataset.anim], stage = fig.querySelector(".explain-stage");
      if (!fn) { stage.innerHTML = `<p class="explain-fallback">Схема «${esc(fig.dataset.anim)}» не найдена.</p>`; return; }
      try { fn(stage); } catch (e) { stage.innerHTML = '<p class="explain-fallback">Не удалось показать схему.</p>'; console.error(e); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.EXPLAIN = W;
})();
