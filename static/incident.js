/* DevOps-маршрут: симулятор инцидента. Дежурство: алерт → разбор → устранение → постмортем.
   Каждое действие стоит минут; пока сервис лежит, растёт ущерб. Сценарии — в SCENARIOS. */
(function () {
  "use strict";

  const root = document.getElementById("incident");
  if (!root) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const today = () => new Date().toLocaleDateString("sv-SE");

  // кривые для графиков: base — значения до начала инцидента, bad — во время, ok — после устранения
  const SCENARIOS = [
    {
      id: "friday", title: "Пятничный релиз", level: "лёгкий",
      alert: "🔴 FIRING · HighErrorRate · shop-api: доля 5xx 31% (порог 5%) · 18:42",
      brief: "Пятница, вечер. Приходит алерт: каждый третий запрос к API магазина заканчивается ошибкой. Покупатели не могут оформить заказ.",
      charts: { "5xx, %": [1, 1, 1, 2, 30, 31, 33, 31], "p99, мс": [180, 190, 175, 185, 210, 220, 205, 215], "CPU, %": [35, 38, 36, 40, 41, 39, 40, 42], "RPS": [420, 430, 410, 440, 435, 445, 430, 440] },
      fixed: { "5xx, %": 1, "p99, мс": 180, "CPU, %": 37, "RPS": 430 },
      actions: [
        { id: "dash", label: "Открыть дашборд сервиса", cost: 2, out: "Ошибки начались резко в 18:31, а не росли постепенно. CPU, память и задержки в норме — нагрузка обычная. Резкий скачок обычно означает **изменение**, а не нагрузку.", tag: "clue" },
        { id: "deploys", label: "Посмотреть последние выкаты", cost: 1, cmd: "kubectl rollout history deploy/shop-api", out: "REVISION  CHANGE-CAUSE\n41        v1.7.3\n42        v1.8.0  (18:30, пятница 🙃)", tag: "clue", note: "Выкат v1.8.0 был за минуту до начала ошибок." },
        { id: "pods", label: "kubectl get pods", cost: 1, cmd: "kubectl get pods -l app=shop-api", out: "NAME                  READY  STATUS   RESTARTS\nshop-api-8f6c-2kq7d   1/1    Running  0\nshop-api-8f6c-9xw2p   1/1    Running  0\nshop-api-8f6c-tt4mb   1/1    Running  0", note: "Все поды живы и Ready — дело не в падениях." },
        { id: "logs", label: "Логи пода", cost: 3, cmd: "kubectl logs deploy/shop-api --since=15m | grep ERROR | head -3", out: "ERROR POST /orders → 500\nKeyError: 'PAYMENT_PROVIDER_URL'\n  File \"app/payments.py\", line 12, in charge", tag: "clue", note: "Новая версия ждёт переменную окружения, которой нет в манифесте." },
        { id: "restart", label: "Перезапустить поды", cost: 4, cmd: "kubectl rollout restart deploy/shop-api", out: "Поды пересозданы… ошибки на месте: 30%. Рестарт не лечит баг в коде или конфиге.", tag: "waste" },
        { id: "scale", label: "Добавить реплик (scale 3 → 6)", cost: 3, cmd: "kubectl scale deploy/shop-api --replicas=6", out: "Подов стало 6, доля ошибок та же. Масштабирование помогает от нагрузки, а нагрузка в норме.", tag: "waste" },
        { id: "db", label: "Проверить базу данных", cost: 4, out: "Соединений 34 из 100, медленных запросов нет, репликация в порядке. База ни при чём.", tag: "waste" },
        { id: "rollback", label: "Откатить релиз", cost: 2, cmd: "kubectl rollout undo deploy/shop-api", out: "deployment.apps/shop-api rolled back\nwaiting for rollout… 3 of 3 updated replicas are available\n5xx: 31% → 1% ✓", tag: "fix" },
        { id: "hotfix", label: "Срочно чинить код и выкатывать хотфикс", cost: 25, out: "Пока ты писала фикс, ревью и ждала пайплайн, прошло 25 минут с ошибками. Хотфикс помог, но сначала надо было **остановить кровотечение** откатом, а чинить уже спокойно.", tag: "slowfix" },
      ],
      root: "В v1.8.0 код начал читать переменную `PAYMENT_PROVIDER_URL`, а в манифест Deployment её не добавили. Оформление заказа падало с KeyError.",
      lessons: ["Сначала откат (mitigation), потом расследование — время инцидента важнее красоты фикса.", "Резкий скачок ошибок без роста нагрузки — первым делом проверь последние изменения.", "Добавь проверку обязательных переменных при старте приложения и смоук-тест после выката (урок 6.1).", "Пятничный релиз вечером — не лучшая идея: меньше людей на связи."],
    },
    {
      id: "disk", title: "Кончилось место", level: "средний",
      alert: "🔴 FIRING · PostgresDown · db-1: база не принимает запись · 03:12",
      brief: "Ночь. Будит алерт: база данных отказывается записывать. Сайт открывается, но заказы и регистрация не работают.",
      charts: { "5xx, %": [0, 0, 1, 3, 18, 40, 46, 45], "Диск db-1, %": [86, 89, 92, 96, 99, 100, 100, 100], "Соединения": [30, 32, 31, 30, 33, 28, 25, 26], "CPU db, %": [20, 22, 21, 23, 25, 18, 15, 14] },
      fixed: { "5xx, %": 0, "Диск db-1, %": 61, "Соединения": 31, "CPU db, %": 21 },
      actions: [
        { id: "dash", label: "Открыть дашборд базы", cost: 2, out: "Диск db-1 рос несколько дней и упёрся в 100%. Ошибки начались ровно тогда, когда место закончилось.", tag: "clue" },
        { id: "logs", label: "Лог PostgreSQL", cost: 2, cmd: "journalctl -u postgresql --since -30min | tail -2", out: "PANIC: could not write to file \"pg_wal/xlogtemp.4121\": No space left on device\nLOG: database system is shut down", tag: "clue" },
        { id: "df", label: "df -h и du на сервере", cost: 3, cmd: "df -h /var/lib/postgresql; du -sh /var/lib/postgresql/* /var/log/postgresql", out: "/dev/sdb1   100G  100G  0  100% /var/lib/postgresql\n38G   /var/lib/postgresql/16/main/pg_wal\n41G   /var/log/postgresql", tag: "clue", note: "41 ГБ логов — их никто не ротировал. И 38 ГБ WAL: архивация WAL сломана, файлы копятся." },
        { id: "restart", label: "Перезапустить PostgreSQL", cost: 3, cmd: "systemctl restart postgresql", out: "Job for postgresql.service failed. Без свободного места база не стартует — рестарт ничего не даст.", tag: "waste" },
        { id: "rmwal", label: "Удалить файлы из pg_wal", cost: 2, out: "⛔ Стоп! WAL — журнал транзакций. Ручное удаление файлов из pg_wal — верный способ **потерять данные** и не поднять базу. Хорошо, что это только симулятор. Действие отменено.", tag: "danger" },
        { id: "logsclean", label: "Сжать и удалить старые логи PostgreSQL", cost: 4, cmd: "find /var/log/postgresql -name '*.log' -mtime +2 -delete", out: "Освобождено 39 ГБ. Диск 61%.\nsystemctl start postgresql → active (running)\n5xx: 45% → 0% ✓", tag: "fix" },
        { id: "resize", label: "Расширить диск в облаке", cost: 15, out: "Запрос на увеличение тома, расширение файловой системы… 15 минут — и база поднялась. Работает, но место быстро освобождалось и без этого: логи можно было удалить сразу.", tag: "slowfix" },
      ],
      root: "logrotate не был настроен для логов PostgreSQL, а архивация WAL сломалась после смены пароля к хранилищу. Диск заполнялся несколько дней, алерта на заполнение не было.",
      lessons: ["Никогда не удаляй файлы данных и WAL руками — освобождай место за счёт логов и временных файлов.", "Алерт на диск нужен заранее: «заполнится через 4 часа» (`predict_linear`), а не «уже 100%» (урок 1.4).", "Настрой logrotate (урок 1.1) и мониторинг архивации WAL.", "Рестарт без устранения причины — потерянные минуты."],
    },
    {
      id: "slow", title: "Всё тормозит", level: "сложный",
      alert: "🟠 FIRING · HighLatency · shop-api: p99 4.2 с (порог 800 мс) · 11:05",
      brief: "Утро, пик продаж. Сайт не падает, но страницы каталога грузятся по 4 секунды. Часть запросов отваливается по таймауту.",
      charts: { "p99, мс": [210, 220, 230, 900, 2800, 4200, 4100, 4300], "5xx, %": [0, 0, 0, 1, 4, 7, 6, 8], "Соединения с БД": [30, 31, 34, 70, 100, 100, 100, 100], "CPU api, %": [40, 41, 38, 30, 22, 18, 19, 17] },
      fixed: { "p99, мс": 200, "5xx, %": 0, "Соединения с БД": 32, "CPU api, %": 41 },
      actions: [
        { id: "dash", label: "Открыть дашборд", cost: 2, out: "Задержки выросли, а CPU приложения **упал** — значит, приложение не считает, а ждёт. Пул соединений с базой забит: 100 из 100.", tag: "clue" },
        { id: "scale", label: "Добавить реплик API", cost: 3, cmd: "kubectl scale deploy/shop-api --replicas=10", out: "Стало только хуже: больше подов — больше соединений к и так забитой базе. p99 4.8 с.", tag: "waste" },
        { id: "deploys", label: "Последние изменения", cost: 1, out: "Код не выкатывали два дня. Но в 10:50 прошла **миграция базы**: в таблицу products добавили колонку category_id и пересоздали таблицу.", tag: "clue" },
        { id: "activity", label: "Запросы в pg_stat_activity", cost: 3, cmd: "SELECT state, wait_event, left(query, 60) FROM pg_stat_activity WHERE state='active';", out: "active | DataFileRead | SELECT * FROM products WHERE category_id = $1 ORDER BY …\nactive | DataFileRead | SELECT * FROM products WHERE category_id = $1 ORDER BY …\n(×97)", tag: "clue" },
        { id: "explain", label: "EXPLAIN самого частого запроса", cost: 3, cmd: "EXPLAIN SELECT * FROM products WHERE category_id = 7;", out: "Seq Scan on products  (cost=0.00..48211.00 rows=1520)\n  Filter: (category_id = 7)", tag: "clue", note: "Seq Scan по 2 млн строк на каждый запрос каталога: индекс по category_id потерялся при миграции." },
        { id: "restartdb", label: "Перезапустить базу", cost: 5, out: "Пять минут полной недоступности, а после старта запросы снова забили пул. Причина не устранена.", tag: "waste" },
        { id: "index", label: "Создать индекс CONCURRENTLY", cost: 4, cmd: "CREATE INDEX CONCURRENTLY idx_products_category ON products(category_id);", out: "CREATE INDEX (за 3 минуты, без блокировки таблицы)\nIndex Scan using idx_products_category…\np99: 4.2 с → 200 мс ✓", tag: "fix" },
        { id: "indexlock", label: "Создать индекс обычным CREATE INDEX", cost: 9, out: "Обычный CREATE INDEX **блокирует запись** в таблицу на время построения: 6 минут магазин не мог менять товары. Индекс помог, но CONCURRENTLY сделал бы то же без блокировки (урок 2.8).", tag: "slowfix" },
      ],
      root: "Миграция пересоздала таблицу products и не перенесла индекс по category_id. Каждый запрос каталога стал полным сканированием, запросы копились и забили пул соединений.",
      lessons: ["Падение CPU при росте задержек — признак ожидания (база, сеть, блокировки), а не нехватки мощности.", "Масштабирование приложения не помогает, если узкое место — база: оно делает только хуже.", "Проверяй миграции через EXPLAIN на копии продовых данных, индексы — CONCURRENTLY (уроки 2.8, 2.11).", "Алерт на насыщение пула соединений срабатывает раньше, чем на задержки."],
    },
  ];

  function chart(name, values, color) {
    const w = 220, h = 54, max = Math.max(...values) * 1.15 || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
    return `<div class="inc-chart"><div class="inc-chart-head"><span>${esc(name)}</span><b style="color:${color}">${values[values.length - 1]}</b></div>
      <svg viewBox="0 -4 ${w} ${h + 8}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg></div>`;
  }

  function menu() {
    const done = (window.APP && APP.state().games && APP.state().games.incidents) || {};
    root.innerHTML = `<div class="inc-pick">${SCENARIOS.map((s) => `<button type="button" class="inc-card" data-id="${s.id}">
      <span class="inc-level">${s.level}</span><b>${esc(s.title)}</b><span>${esc(s.alert.split("·")[1] || "")}</span>
      ${done[s.id] ? `<em>лучшее время: ${done[s.id]} мин</em>` : "<em>ещё не пройден</em>"}</button>`).join("")}</div>`;
    root.querySelectorAll(".inc-card").forEach((b) => b.onclick = () => play(SCENARIOS.find((s) => s.id === b.dataset.id)));
  }

  function play(sc) {
    let minutes = 0, log = [], used = new Set(), over = false;
    const charts = JSON.parse(JSON.stringify(sc.charts));
    function draw(last) {
      const colors = ["var(--danger)", "var(--amber)", "var(--cyan)", "var(--violet)"];
      root.innerHTML = `<div class="inc-alert ${over ? "resolved" : ""}">${over ? "✅ RESOLVED · " + esc(sc.title) : esc(sc.alert)}</div>
        <div class="inc-grid"><div class="inc-left">
          <div class="inc-clock"><span>с начала инцидента</span><b>${minutes} мин</b></div>
          <div class="inc-charts">${Object.entries(charts).map(([k, v], i) => chart(k, v, colors[i])).join("")}</div>
          <div class="inc-log"><div class="ex-col-title">Таймлайн</div>${log.map((l) => `<div class="inc-log-row ${l.tag || ""}"><span>+${l.at} мин</span>${esc(l.label)}</div>`).join("") || '<div class="ex-empty">пока пусто</div>'}</div>
        </div><div class="inc-right">
          ${last ? `<div class="inc-out ${last.tag || ""}">${last.cmd ? `<pre>$ ${esc(last.cmd)}</pre>` : ""}<pre class="inc-res">${esc(last.out)}</pre>${last.note ? `<p>💡 ${md(last.note)}</p>` : ""}</div>` : `<div class="inc-out"><p>${md(sc.brief)}</p><p>Выбирай действия справа. Каждое занимает время, а пока сервис сломан, страдают пользователи. Цель — **как можно быстрее устранить последствия**, а потом разобраться в причине.</p></div>`}
          <div class="inc-actions">${sc.actions.map((a) => `<button type="button" class="inc-act ${used.has(a.id) ? "used" : ""}" data-id="${a.id}" ${over ? "disabled" : ""}>${esc(a.label)}<span>~${a.cost} мин</span></button>`).join("")}</div>
          <button type="button" class="btn btn-ghost" id="inc-quit">← К списку сценариев</button>
        </div></div>`;
      root.querySelectorAll(".inc-act").forEach((b) => b.onclick = () => act(sc.actions.find((a) => a.id === b.dataset.id)));
      root.querySelector("#inc-quit").onclick = menu;
    }
    function act(a) {
      if (over) return;
      if (a.tag !== "danger") minutes += a.cost;
      used.add(a.id);
      log.push({ at: minutes, label: a.label, tag: a.tag });
      // пока не починено, графики продолжают показывать проблему
      Object.keys(charts).forEach((k) => { const v = charts[k]; v.push(v[v.length - 1]); v.shift(); });
      if (a.tag === "fix" || a.tag === "slowfix") {
        over = true;
        Object.keys(charts).forEach((k) => { charts[k].push(sc.fixed[k], sc.fixed[k]); charts[k].splice(0, 2); });
        draw(a);
        setTimeout(() => postmortem(a), reducedMotion() ? 0 : 900);
        return;
      }
      draw(a);
      if (window.FX && a.tag === "danger") FX.bot.react("no");
    }
    function postmortem(fix) {
      const waste = log.filter((l) => l.tag === "waste").length, danger = log.some((l) => l.tag === "danger");
      const clues = log.filter((l) => l.tag === "clue").length;
      const grade = fix.tag === "fix" && minutes <= 12 && !waste && !danger ? ["S", "Образцовое дежурство"] : fix.tag === "fix" && minutes <= 20 && !danger ? ["A", "Хорошая работа"] : ["B", "Сервис спасён, но можно быстрее"];
      const g = window.APP ? APP.state() : { games: {} };
      g.games = g.games || {}; g.games.incidents = g.games.incidents || {};
      const prev = g.games.incidents[sc.id];
      if (!prev || minutes < prev) g.games.incidents[sc.id] = minutes;
      if (window.APP) {
        if (!prev) APP.addXP(grade[0] === "S" ? 40 : 25, `инцидент «${sc.title}»`); else APP.save();
      }
      if (grade[0] !== "B" && window.FX) FX.confetti();
      if (window.APP) APP.track("lab");
      const pm = document.createElement("div");
      pm.className = "inc-pm";
      pm.innerHTML = `<div class="inc-grade g${grade[0]}">${grade[0]}</div><div><h3>Постмортем: ${esc(sc.title)}</h3>
        <p><b>${grade[1]}.</b> Время до устранения: <b>${minutes} мин</b> · полезных проверок: ${clues} · лишних действий: ${waste}${danger ? " · было опасное действие ⛔" : ""}</p>
        <p><b>Причина:</b> ${md(sc.root)}</p>
        <p><b>Выводы:</b></p><ul>${sc.lessons.map((l) => `<li>${md(l)}</li>`).join("")}</ul>
        <div class="game-actions"><button type="button" class="btn btn-primary" id="inc-again">Пройти заново</button><button type="button" class="btn" id="inc-list">Другой сценарий</button></div></div>`;
      root.appendChild(pm);
      pm.scrollIntoView({ behavior: "smooth", block: "start" });
      pm.querySelector("#inc-again").onclick = () => play(sc);
      pm.querySelector("#inc-list").onclick = menu;
    }
    draw(null);
    root.scrollIntoView({ block: "start" });
  }
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  menu();
})();
