/* DevOps-маршрут: мини-игры — «Собери пайплайн», «Угадай команду» на скорость и «Почини под». */
(function () {
  "use strict";

  const root = document.getElementById("games");
  if (!root) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => new Date().toLocaleDateString("sv-SE");
  const G = () => { const s = window.APP ? APP.state() : { games: {} }; s.games = s.games || {}; return s.games; };
  const save = () => window.APP && APP.save();
  const xp = (n, why) => window.APP && APP.addXP(n, why);

  // ---------------------------------------------------------------- данные

  const PIPELINES = [
    { id: "ci", title: "CI/CD-пайплайн", lesson: "3.2", steps: ["Checkout кода", "Установка зависимостей", "Линтер", "Юнит-тесты", "Сборка образа", "Сканирование образа", "Push в registry", "Деплой на staging", "Деплой в prod"],
      why: "Сначала дешёвые и быстрые проверки (линтер, тесты), потом дорогая сборка. Образ сканируют до публикации, а в prod попадает только то, что прошло staging." },
    { id: "dockerfile", title: "Dockerfile с умным кешем", lesson: "3.1", steps: ["FROM python:3.12-slim", "WORKDIR /app", "COPY requirements.txt .", "RUN pip install -r requirements.txt", "COPY . .", "USER app", "EXPOSE 8000", "CMD [\"python\", \"main.py\"]"],
      why: "Зависимости ставятся до копирования кода: правка в коде не сбрасывает кеш тяжёлого слоя pip install. USER — после установки, чтобы pip работал от root, а приложение уже нет." },
    { id: "git", title: "От правки до merge", lesson: "0.1", steps: ["git switch -c feature", "Правка кода", "git add", "git commit", "git push -u origin feature", "Открыть merge request", "Ревью и зелёный CI", "Merge в main", "git pull в main"],
      why: "Работа идёт в отдельной ветке; в main она попадает только через MR, ревью и пройденный CI." },
    { id: "request", title: "Путь HTTP-запроса", lesson: "1.2", steps: ["DNS: имя → IP", "TCP-рукопожатие", "TLS-рукопожатие", "nginx принимает запрос", "Проксирование в приложение", "Запрос в базу данных", "Ответ клиенту"],
      why: "Без IP нельзя открыть соединение, без TCP — договориться о шифровании, а nginx уже решает, кому отдать запрос." },
    { id: "k8s", title: "kubectl apply → живой под", lesson: "5.1", steps: ["kubectl apply -f deploy.yaml", "API server проверяет манифест", "Запись в etcd", "Controller создаёт ReplicaSet и поды", "Scheduler выбирает узел", "kubelet запускает контейнер", "Readiness probe прошла", "Под попадает в Endpoints сервиса"],
      why: "Всё идёт через API server и etcd; scheduler только назначает узел, а трафик под получает лишь после успешной readiness-пробы." },
    { id: "terraform", title: "Рабочий цикл Terraform", lesson: "4.4", steps: ["terraform init", "terraform fmt и validate", "terraform plan", "Ревью плана", "terraform apply", "Обновление state", "Проверка ресурса"],
      why: "init скачивает провайдеры, plan показывает разницу с state, и только проверенный план применяют." },
  ];

  const COMMANDS = [
    ["Показать скрытые файлы с правами", "ls -la", "linux"], ["Найти процесс nginx", "ps aux | grep nginx", "linux"],
    ["Следить за логом в реальном времени", "tail -f app.log", "linux"], ["Сколько места занято на дисках", "df -h", "linux"],
    ["Размер каталога целиком", "du -sh /var/log", "linux"], ["Сделать скрипт исполняемым", "chmod +x deploy.sh", "linux"],
    ["Сменить владельца файлов", "chown -R app:app /srv", "linux"], ["Логи сервиса systemd", "journalctl -u nginx", "linux"],
    ["Перезапустить сервис", "systemctl restart nginx", "linux"], ["Какие порты слушают", "ss -tlnp", "linux"],
    ["Узнать IP по имени", "dig example.com", "linux"], ["Проверить HTTP-ответ с заголовками", "curl -I https://example.com", "linux"],
    ["Найти строку во всех файлах", "grep -rn TODO .", "linux"], ["Сколько строк в файле", "wc -l access.log", "linux"],
    ["Нагрузка и процессы в реальном времени", "top", "linux"], ["Свободная память", "free -h", "linux"],
    ["Создать ветку и перейти в неё", "git switch -c feature", "git"], ["Что изменено и не закоммичено", "git status", "git"],
    ["Добавить всё в индекс", "git add .", "git"], ["История одной строкой", "git log --oneline", "git"],
    ["Отложить незакоммиченные правки", "git stash", "git"], ["Отменить коммит новым коммитом", "git revert HEAD", "git"],
    ["Скачать изменения без слияния", "git fetch", "git"], ["Перенести коммит из другой ветки", "git cherry-pick a1b2c3", "git"],
    ["Кто последним менял строку", "git blame app.py", "git"], ["Переписать ветку поверх main", "git rebase main", "git"],
    ["Запущенные контейнеры", "docker ps", "docker"], ["Собрать образ с тегом", "docker build -t shop:1.0 .", "docker"],
    ["Зайти в shell контейнера", "docker exec -it api sh", "docker"], ["Логи контейнера с хвостом", "docker logs -f api", "docker"],
    ["Поднять сервисы compose в фоне", "docker compose up -d", "docker"], ["Удалить всё неиспользуемое", "docker system prune", "docker"],
    ["Слои и размер образа", "docker history shop:1.0", "docker"], ["Пробросить порт 8080 → 80", "docker run -p 8080:80 nginx", "docker"],
    ["Все поды во всех неймспейсах", "kubectl get pods -A", "k8s"], ["Почему под не стартует", "kubectl describe pod api-7d9", "k8s"],
    ["Логи упавшего прошлого контейнера", "kubectl logs api-7d9 --previous", "k8s"], ["Масштабировать до 5 реплик", "kubectl scale deploy api --replicas=5", "k8s"],
    ["Откатить деплой", "kubectl rollout undo deploy api", "k8s"], ["Пробросить порт сервиса локально", "kubectl port-forward svc/api 8080:80", "k8s"],
    ["Применить манифест", "kubectl apply -f deploy.yaml", "k8s"], ["Сколько CPU и памяти едят поды", "kubectl top pods", "k8s"],
    ["Показать план изменений", "terraform plan", "iac"], ["Применить плейбук", "ansible-playbook site.yml", "iac"],
    ["Проверить связь со всеми хостами", "ansible all -m ping", "iac"], ["Установить чарт", "helm install shop ./chart", "iac"],
    ["Посмотреть итоговые манифесты чарта", "helm template shop ./chart", "iac"], ["Скачать провайдеры Terraform", "terraform init", "iac"],
  ];

  const PODS = [
    { id: "imagepull", status: "ImagePullBackOff", log: "Events:\n  Warning  Failed  kubelet  Failed to pull image \"registry.local/shop:1.4.3\":\n           manifest for registry.local/shop:1.4.3 not found\n  Normal   BackOff kubelet  Back-off pulling image",
      options: ["В registry нет образа с таким тегом", "Приложение падает при старте", "Не хватает памяти на узле", "Сервис смотрит не на тот порт"], answer: 0,
      fix: "Проверь тег в манифесте и что CI действительно запушил образ: <code>docker manifest inspect registry.local/shop:1.4.3</code>. Если registry приватный — нужен <code>imagePullSecrets</code>." },
    { id: "crashloop", status: "CrashLoopBackOff", log: "$ kubectl logs api-7d9 --previous\nTraceback (most recent call last):\n  File \"/app/main.py\", line 8, in <module>\n    DB_URL = os.environ[\"DATABASE_URL\"]\nKeyError: 'DATABASE_URL'",
      options: ["Образ не скачался", "Контейнеру не передали переменную окружения", "Под не прошёл readiness-пробу", "Узел недоступен"], answer: 1,
      fix: "Приложение падает сразу при старте: в Deployment не задана <code>DATABASE_URL</code>. Добавь её в <code>env</code> (лучше через <code>secretKeyRef</code>)." },
    { id: "oom", status: "OOMKilled", log: "Last State:  Terminated\n  Reason:    OOMKilled\n  Exit Code: 137\nLimits:\n  memory:  128Mi\nRestart Count: 6",
      options: ["Процесс превысил лимит памяти", "В коде синтаксическая ошибка", "Нет прав на файл", "Неверный тег образа"], answer: 0,
      fix: "Код 137 = процесс убит сигналом KILL. Контейнер вышел за <code>limits.memory: 128Mi</code>. Посмотри реальное потребление (<code>kubectl top pod</code>) и подними лимит или найди утечку." },
    { id: "pending", status: "Pending", log: "Events:\n  Warning  FailedScheduling  default-scheduler\n  0/3 nodes are available: 3 Insufficient cpu.",
      options: ["Ошибка в коде приложения", "Ни на одном узле не хватает CPU под requests", "Отсутствует Secret", "Неправильный selector сервиса"], answer: 1,
      fix: "Scheduler не нашёл узел, где свободно столько CPU, сколько указано в <code>resources.requests</code>. Уменьши requests, освободи узлы или добавь узел в кластер." },
    { id: "secret", status: "CreateContainerConfigError", log: "Events:\n  Warning  Failed  kubelet  Error: secret \"db-credentials\" not found",
      options: ["Secret, на который ссылается под, не создан", "Не хватает памяти", "Образ слишком большой", "Под ещё скачивает образ"], answer: 0,
      fix: "Под ссылается на <code>db-credentials</code>, а его нет в этом неймспейсе. Создай Secret (<code>kubectl create secret generic ...</code>) или проверь <code>-n</code>." },
    { id: "readiness", status: "Running, READY 0/1", log: "Events:\n  Warning  Unhealthy  kubelet  Readiness probe failed:\n  Get \"http://10.1.0.12:8080/health\": connect: connection refused\n$ kubectl logs api-7d9\nUvicorn running on http://0.0.0.0:8000",
      options: ["Приложение упало", "Проба стучится на 8080, а приложение слушает 8000", "Нет доступа к registry", "Закончилось место на диске"], answer: 1,
      fix: "Контейнер жив, но проба идёт не на тот порт, поэтому под не получает трафик. Исправь <code>readinessProbe.httpGet.port</code> на 8000." },
    { id: "selector", status: "Running, но сервис не отвечает", log: "$ kubectl get endpoints api\nNAME   ENDPOINTS   AGE\napi    <none>      5m\n$ kubectl get pods --show-labels\napi-7d9   1/1  Running  app=shop-api",
      options: ["Selector сервиса не совпадает с метками подов", "Поды не готовы", "Ingress без TLS", "Нужно перезапустить узел"], answer: 0,
      fix: "У сервиса нет endpoints: его <code>selector</code> (скорее всего <code>app: api</code>) не совпадает с меткой подов <code>app=shop-api</code>. Метки и selector должны совпадать буква в букву." },
    { id: "liveness", status: "Running, RESTARTS 14", log: "Events:\n  Warning  Unhealthy  kubelet  Liveness probe failed: timeout after 1s\n  Normal   Killing   kubelet  Container api failed liveness probe, will be restarted\n(приложение стартует ~40 секунд)",
      options: ["Liveness-проба срабатывает раньше, чем приложение успевает подняться", "Неверный образ", "Нет Secret", "Мало CPU на узле"], answer: 0,
      fix: "kubelet убивает контейнер раньше, чем тот успевает стартовать. Добавь <code>startupProbe</code> или увеличь <code>initialDelaySeconds</code> и <code>timeoutSeconds</code> у liveness-пробы." },
    { id: "pvc", status: "Pending", log: "Events:\n  Warning  FailedScheduling  pod has unbound immediate PersistentVolumeClaims\n$ kubectl get pvc\ndata-db-0   Pending   storageClassName: fast-ssd",
      options: ["Не создан том: нет StorageClass fast-ssd", "Ошибка в Python-коде", "Сервис без селектора", "Неверный порт"], answer: 0,
      fix: "PVC просит <code>storageClassName: fast-ssd</code>, а такого класса (или провижинера) в кластере нет. Посмотри <code>kubectl get storageclass</code> и укажи существующий." },
    { id: "exec", status: "CrashLoopBackOff", log: "$ kubectl logs api-7d9\nexec /app/entrypoint.sh: permission denied",
      options: ["У скрипта нет права на выполнение", "Под не помещается на узел", "Нет доступа к сети", "Неверный тег образа"], answer: 0,
      fix: "Файл не исполняемый. В Dockerfile добавь <code>RUN chmod +x /app/entrypoint.sh</code> (или <code>COPY --chmod=755</code>) и пересобери образ." },
  ];

  // ---------------------------------------------------------------- каркас

  const GAMES = [
    { id: "pipeline", icon: "pipeline", name: "Собери пайплайн", desc: "Расставь шаги в правильном порядке" },
    { id: "speed", icon: "bolt", name: "Угадай команду", desc: "60 секунд: описание → команда" },
    { id: "pods", icon: "stetho", name: "Почини под", desc: "Найди причину по kubectl-выводу" },
  ];
  root.innerHTML = `<div class="game-tabs">${GAMES.map((g) => `<button type="button" class="game-tab" data-game="${g.id}"><span class="game-tab-icon">${window.ICON ? ICON(g.icon) : ""}</span><b>${g.name}</b><span>${g.desc}</span><em data-score="${g.id}"></em></button>`).join("")}</div><section class="game-stage" id="game-stage"></section>`;
  const stage = root.querySelector("#game-stage");
  let stop = () => {};
  function scores() {
    const g = G();
    const set = (id, t) => { root.querySelector(`[data-score="${id}"]`).textContent = t; };
    set("pipeline", `собрано ${Object.keys(g.pipeline || {}).length}/${PIPELINES.length}`);
    set("speed", g.speedBest ? `рекорд ${g.speedBest}` : "рекорда пока нет");
    set("pods", `починено ${Object.keys(g.pods || {}).length}/${PODS.length}`);
  }
  function open(id) {
    stop(); stop = () => {};
    root.querySelectorAll(".game-tab").forEach((b) => b.classList.toggle("on", b.dataset.game === id));
    ({ pipeline: pipelineGame, speed: speedGame, pods: podsGame })[id]();
    try { sessionStorage.setItem("devops-game", id); } catch (e) { /* ignore */ }
  }
  root.querySelectorAll(".game-tab").forEach((b) => b.onclick = () => open(b.dataset.game));

  // ---------------------------------------------------------------- собери пайплайн

  function pipelineGame(level) {
    const g = G(); g.pipeline = g.pipeline || {};
    const lvl = PIPELINES[level || 0];
    let picked = [], pool = shuffle(lvl.steps.map((s, i) => ({ s, i }))), tries = 0;
    stage.innerHTML = `<div class="game-levels">${PIPELINES.map((p, k) => `<button type="button" class="chip ${k === (level || 0) ? "on" : ""} ${g.pipeline[p.id] ? "done" : ""}" data-lvl="${k}">${g.pipeline[p.id] ? "✓ " : ""}${esc(p.title)}</button>`).join("")}</div>
      <p class="game-help">Нажимай шаги в том порядке, в котором они выполняются. Нажми на шаг в ответе, чтобы вернуть его. Тема из урока ${lvl.lesson}.</p>
      <ol class="pipe-answer" id="pipe-answer"></ol><div class="pipe-pool" id="pipe-pool"></div>
      <div class="game-actions"><button type="button" class="btn btn-primary" id="pipe-check" disabled>Проверить</button><button type="button" class="btn btn-ghost" id="pipe-reset">Перемешать заново</button></div>
      <div id="pipe-result"></div>`;
    stage.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = () => pipelineGame(+b.dataset.lvl));
    const ans = stage.querySelector("#pipe-answer"), poolEl = stage.querySelector("#pipe-pool"), res = stage.querySelector("#pipe-result"), check = stage.querySelector("#pipe-check");
    function draw(marks) {
      ans.innerHTML = picked.map((x, k) => `<li class="pipe-step ${marks ? (marks[k] ? "ok" : "bad") : ""}" data-k="${k}"><span>${k + 1}</span>${esc(x.s)}</li>`).join("") || '<li class="pipe-empty">сюда встанут шаги</li>';
      poolEl.innerHTML = pool.map((x, k) => `<button type="button" class="pipe-chip" data-k="${k}">${esc(x.s)}</button>`).join("");
      ans.querySelectorAll("[data-k]").forEach((el) => el.onclick = () => { pool.push(picked.splice(+el.dataset.k, 1)[0]); res.innerHTML = ""; draw(); });
      poolEl.querySelectorAll("[data-k]").forEach((el) => el.onclick = () => { picked.push(pool.splice(+el.dataset.k, 1)[0]); res.innerHTML = ""; draw(); });
      check.disabled = pool.length > 0;
    }
    check.onclick = () => {
      tries++;
      const marks = picked.map((x, k) => x.i === k);
      draw(marks);
      if (marks.every(Boolean)) {
        const first = !g.pipeline[lvl.id];
        g.pipeline[lvl.id] = today(); save();
        if (window.APP) APP.track("lab");
        res.innerHTML = `<div class="game-win"><b>Пайплайн собран${tries === 1 ? " с первой попытки" : ""} ✓</b><p>${esc(lvl.why)}</p>${(level || 0) + 1 < PIPELINES.length ? '<button type="button" class="btn btn-primary" id="pipe-next">Следующий →</button>' : ""}</div>`;
        const next = res.querySelector("#pipe-next");
        if (next) next.onclick = () => pipelineGame((level || 0) + 1);
        if (first) { xp(15, `пайплайн «${lvl.title}»`); if (window.FX) FX.confetti(); }
        scores();
      } else {
        const n = marks.filter(Boolean).length;
        res.innerHTML = `<div class="game-miss">На своём месте ${n} из ${marks.length}. Красные шаги стоят не там — нажми на них, чтобы вернуть, и попробуй ещё.</div>`;
        if (window.FX) FX.bot.react("no");
      }
    };
    stage.querySelector("#pipe-reset").onclick = () => pipelineGame(level || 0);
    draw();
  }

  // ---------------------------------------------------------------- угадай команду

  function speedGame() {
    const g = G();
    stage.innerHTML = `<div class="speed-intro"><p class="game-help">За 60 секунд выбери команду по описанию. Верный ответ — +1 очко, ошибка отнимает 3 секунды.</p>
      <div class="speed-cats">${[["all", "все"], ["linux", "linux"], ["git", "git"], ["docker", "docker"], ["k8s", "kubectl"], ["iac", "iac"]].map(([k, t], i) => `<label class="chip"><input type="radio" name="cat" value="${k}" ${i ? "" : "checked"}> ${t}</label>`).join("")}</div>
      <button type="button" class="btn btn-primary btn-lg" id="speed-go">▶ Старт</button>${g.speedBest ? `<p class="game-help">Рекорд: <b>${g.speedBest}</b></p>` : ""}</div>`;
    stage.querySelector("#speed-go").onclick = () => {
      const cat = stage.querySelector("input[name=cat]:checked").value;
      const bank = COMMANDS.filter((c) => cat === "all" || c[2] === cat);
      let left = 60, score = 0, wrong = [], queue = shuffle(bank), cur = null, timer = 0;
      stage.innerHTML = `<div class="speed-bar"><span>⏱ <b id="sp-time">60</b></span><span>очки <b id="sp-score">0</b></span></div>
        <div class="speed-q" id="sp-q"></div><div class="speed-opts" id="sp-opts"></div>`;
      const q = stage.querySelector("#sp-q"), opts = stage.querySelector("#sp-opts");
      function next() {
        if (!queue.length) queue = shuffle(bank);
        cur = queue.pop();
        const same = bank.filter((c) => c !== cur && c[2] === cur[2]);
        const others = shuffle(same.length >= 3 ? same : COMMANDS.filter((c) => c !== cur)).slice(0, 3);
        const choices = shuffle([cur, ...others]);
        q.textContent = cur[0];
        opts.innerHTML = choices.map((c, k) => `<button type="button" class="speed-opt" data-k="${k}"><code>${esc(c[1])}</code></button>`).join("");
        opts.querySelectorAll("button").forEach((b) => b.onclick = () => {
          const pick = choices[+b.dataset.k];
          if (pick === cur) { score++; stage.querySelector("#sp-score").textContent = score; b.classList.add("ok"); setTimeout(next, 180); }
          else { left = Math.max(0, left - 3); wrong.push(cur); b.classList.add("bad"); opts.classList.add("shake"); setTimeout(() => opts.classList.remove("shake"), 300); tick(0); }
        });
      }
      function tick(d) {
        left -= d; stage.querySelector("#sp-time").textContent = left;
        if (left <= 0) finish();
      }
      function finish() {
        clearInterval(timer); stop = () => {};
        const best = score > (g.speedBest || 0);
        if (best) g.speedBest = score;
        let bonus = "";
        if (score >= 10 && g.speedDay !== today()) { g.speedDay = today(); bonus = " · +10 XP за сегодня"; xp(10, "скоростной раунд команд"); }
        save(); scores();
        if (window.APP && score >= 5) APP.track("lab");
        const miss = [...new Set(wrong)];
        stage.innerHTML = `<div class="game-win"><b>Время вышло: ${score} ${score % 10 === 1 && score % 100 !== 11 ? "очко" : score % 10 >= 2 && score % 10 <= 4 && (score % 100 < 10 || score % 100 >= 20) ? "очка" : "очков"}${best ? " — новый рекорд! 🏆" : ""}${bonus}</b>
          ${miss.length ? `<p>Повтори эти команды:</p><ul class="speed-miss">${miss.map((c) => `<li>${esc(c[0])} — <code>${esc(c[1])}</code></li>`).join("")}</ul>` : "<p>Ни одной ошибки 👌</p>"}
          <button type="button" class="btn btn-primary" id="speed-again">Ещё раунд</button></div>`;
        stage.querySelector("#speed-again").onclick = speedGame;
        if (best && score >= 5 && window.FX) FX.confetti();
      }
      timer = setInterval(() => tick(1), 1000);
      stop = () => clearInterval(timer);
      next();
    };
  }

  // ---------------------------------------------------------------- почини под

  function podsGame() {
    const g = G(); g.pods = g.pods || {};
    const order = PODS.filter((p) => !g.pods[p.id]).concat(PODS.filter((p) => g.pods[p.id]));
    let i = 0;
    function show() {
      const p = order[i % order.length];
      stage.innerHTML = `<p class="game-help">Под не работает. Прочитай вывод kubectl и выбери причину. Починено ${Object.keys(g.pods).length} из ${PODS.length}.</p>
        <div class="pod-card"><div class="pod-head"><span class="pod-dot"></span>api-7d9 <b>${esc(p.status)}</b></div><pre class="pod-log">${esc(p.log)}</pre></div>
        <div class="speed-opts pod-opts">${shuffle(p.options.map((o, k) => [o, k])).map(([o, k]) => `<button type="button" class="speed-opt" data-k="${k}">${esc(o)}</button>`).join("")}</div><div id="pod-res"></div>`;
      let tried = false;
      stage.querySelectorAll(".pod-opts button").forEach((b) => b.onclick = () => {
        const k = +b.dataset.k, res = stage.querySelector("#pod-res");
        if (k !== p.answer) { b.classList.add("bad"); b.disabled = true; tried = true; if (window.FX) FX.bot.react("no"); return; }
        b.classList.add("ok");
        stage.querySelectorAll(".pod-opts button").forEach((x) => x.disabled = true);
        stage.querySelector(".pod-card").classList.add("fixed");
        if (window.APP) APP.track("lab");
        const first = !g.pods[p.id] && !tried;
        if (!g.pods[p.id] && !tried) { g.pods[p.id] = today(); save(); xp(10, `диагноз «${p.status}»`); scores(); }
        res.innerHTML = `<div class="game-win"><b>${tried ? "Верно, со второй попытки" : "Диагноз верный ✓"}</b><p>${p.fix}</p>${!first && !g.pods[p.id] ? "<p class=\"game-help\">Опыт за этот под дают, если угадать с первой попытки — он вернётся в очередь.</p>" : ""}<button type="button" class="btn btn-primary" id="pod-next">Следующий под →</button></div>`;
        res.querySelector("#pod-next").onclick = () => { i++; show(); };
      });
    }
    show();
  }

  scores();
  let startGame = "pipeline";
  try { startGame = sessionStorage.getItem("devops-game") || startGame; } catch (e) { /* ignore */ }
  open(GAMES.some((x) => x.id === startGame) ? startGame : "pipeline");
})();
