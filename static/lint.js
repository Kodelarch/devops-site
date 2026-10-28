/* DevOps-маршрут: линтер Dockerfile, манифестов Kubernetes и .gitlab-ci.yml.
   Правила — регулярные выражения по строкам и простые проверки структуры; у каждого — объяснение и ссылка на урок. */
(function () {
  "use strict";

  const root = document.getElementById("lint");
  if (!root) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const L = (slug, sec) => `lessons/${slug}.html${sec ? "#s-" + sec : ""}`;

  function detect(t) {
    if (/^\s*FROM\s+\S+/mi.test(t) && /^\s*(RUN|COPY|CMD|ENTRYPOINT|WORKDIR)\b/mi.test(t)) return "docker";
    if (/^\s*(apiVersion|kind)\s*:/m.test(t)) return "k8s";
    if (/^\s*(stages|script|image|variables|include|workflow)\s*:/m.test(t) || /^\s+script\s*:/m.test(t)) return "ci";
    return null;
  }
  const secretRe = /(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY)\s*[=:]\s*["']?[^\s"'$]{4,}/i;

  // ---------------------------------------------------------------- Dockerfile
  function lintDocker(lines) {
    const out = [], add = (line, sev, msg, link) => out.push({ line, sev, msg, link });
    let hasUser = false, cmdCount = 0, sawCopyAll = 0, depsAfterCopy = false, hasWorkdir = false;
    lines.forEach((raw, i) => {
      const n = i + 1, l = raw.trim();
      if (!l || l.startsWith("#")) return;
      const m = l.match(/^(\w+)\s+(.*)$/); if (!m) return;
      const ins = m[1].toUpperCase(), arg = m[2];
      if (ins === "FROM") {
        const img = arg.split(/\s+/)[0];
        if (/:latest$/.test(img) || (!img.includes(":") && !img.includes("@") && img.toLowerCase() !== "scratch")) add(n, "error", `Образ \`${img}\` без фиксированной версии: сегодня и через месяц соберутся разные образы. Укажи тег, например \`python:3.13-slim\`.`, L("3-1"));
        if (/^(ubuntu|debian|centos|fedora)(:|$)/.test(img)) add(n, "info", "Полноценный дистрибутив в основе — образ будет большим. Для приложения подойдёт `-slim` или `alpine`, а для сборки — многоэтапный Dockerfile.", L("3-1"));
      }
      if (ins === "USER") hasUser = !/^(root|0)\b/.test(arg);
      if (ins === "WORKDIR") hasWorkdir = true;
      if (ins === "ADD" && !/https?:\/\/|\.tar/.test(arg)) add(n, "warn", "`ADD` умеет скачивать и распаковывать — это неочевидно. Для обычного копирования используют `COPY`.", L("3-1"));
      if (ins === "CMD" || ins === "ENTRYPOINT") { if (ins === "CMD") cmdCount++; if (!arg.trim().startsWith("[")) add(n, "warn", `${ins} в shell-форме: процесс запускается через \`sh -c\` и не получает SIGTERM, поэтому \`docker stop\` ждёт 10 секунд и убивает его. Используй exec-форму: \`${ins} ["python", "main.py"]\`.`, L("1-1", 5)); }
      if (ins === "COPY" && /^\.\s+\.?/.test(arg.replace(/--\S+\s+/g, ""))) sawCopyAll = n;
      if (ins === "RUN") {
        if (sawCopyAll && /(pip3? install|npm (ci|install)|poetry install|apt-get install|go mod download)/.test(arg)) depsAfterCopy = sawCopyAll;
        if (/apt-get install/.test(arg) && !/--no-install-recommends/.test(arg)) add(n, "info", "`apt-get install` без `--no-install-recommends` тянет лишние пакеты — образ толще.", L("3-1"));
        if (/apt-get install/.test(arg) && !/rm -rf \/var\/lib\/apt\/lists/.test(arg)) add(n, "warn", "После `apt-get install` в том же RUN удаляют кеш: `&& rm -rf /var/lib/apt/lists/*`. Иначе он навсегда остаётся в слое.", L("3-1"));
        if (/^apt-get update\s*$/.test(arg.trim())) add(n, "warn", "`apt-get update` отдельной командой: слой закешируется, и следующий `apt-get install` возьмёт устаревший список пакетов. Объединяй: `apt-get update && apt-get install …`.", L("3-1"));
        if (/pip3? install/.test(arg) && !/--no-cache-dir/.test(arg)) add(n, "info", "`pip install` без `--no-cache-dir` оставляет кеш пакетов в образе.", L("3-1"));
        if (/curl[^|]*\|\s*(ba)?sh|wget[^|]*\|\s*(ba)?sh/.test(arg)) add(n, "warn", "Скрипт из интернета сразу в shell: что скачается завтра — неизвестно. Скачай, проверь контрольную сумму и только потом запускай.", L("6-2"));
        if (/\bsudo\b/.test(arg)) add(n, "warn", "`sudo` в Dockerfile не нужен: RUN и так выполняется от root (до инструкции USER).", L("3-1"));
        if (/^cd\s|&&\s*cd\s/.test(arg) && !hasWorkdir) add(n, "info", "Вместо `cd` внутри RUN используют `WORKDIR` — он действует на все следующие инструкции.", L("3-1"));
        if (/chmod\s+(-R\s+)?777/.test(arg)) add(n, "error", "`chmod 777` — любой процесс может изменить файлы. Давай минимально нужные права.", L("1-1", 3));
      }
      if ((ins === "ENV" || ins === "ARG") && secretRe.test(arg)) add(n, "error", "Секрет в ENV/ARG остаётся в слоях образа и виден через `docker history`. Передавай его при запуске (переменные окружения, Secret) или через `RUN --mount=type=secret`.", L("6-1", 10));
    });
    if (depsAfterCopy) add(depsAfterCopy, "warn", "`COPY . .` стоит до установки зависимостей: любая правка кода сбрасывает кеш, и зависимости ставятся заново. Сначала скопируй только `requirements.txt`, установи зависимости, потом копируй код.", L("3-1"));
    if (!hasUser) add(0, "warn", "Нет инструкции `USER`: приложение работает от root внутри контейнера. Создай пользователя и переключись на него в конце Dockerfile.", L("6-2"));
    if (cmdCount > 1) add(0, "warn", "Несколько `CMD` — работает только последняя.", L("3-1"));
    return out;
  }

  // ---------------------------------------------------------------- Kubernetes
  function lintK8s(lines, t) {
    const out = [], add = (line, sev, msg, link) => out.push({ line, sev, msg, link });
    const at = (re) => { const k = lines.findIndex((l) => re.test(l)); return k + 1; };
    const DEPRECATED = { "extensions/v1beta1": "apps/v1 (Deployment) или networking.k8s.io/v1 (Ingress)", "apps/v1beta1": "apps/v1", "apps/v1beta2": "apps/v1", "networking.k8s.io/v1beta1": "networking.k8s.io/v1", "batch/v1beta1": "batch/v1", "policy/v1beta1": "policy/v1", "autoscaling/v2beta2": "autoscaling/v2", "autoscaling/v2beta1": "autoscaling/v2" };
    lines.forEach((l, i) => {
      const n = i + 1;
      const av = l.match(/^\s*apiVersion:\s*(\S+)/); if (av && DEPRECATED[av[1]]) add(n, "error", `\`${av[1]}\` удалён из Kubernetes — манифест не применится. Используй ${DEPRECATED[av[1]]}.`, L("5-1"));
      const im = l.match(/^\s*-?\s*image:\s*["']?([^\s"']+)/);
      if (im && (/:latest$/.test(im[1]) || (!/[:@]/.test(im[1].split("/").pop())))) add(n, "error", `Образ \`${im[1]}\` без версии: поды на разных узлах могут оказаться с разным кодом, а откат невозможен. Укажи точный тег.`, L("5-1"));
      if (/privileged:\s*true/.test(l)) add(n, "error", "`privileged: true` — контейнер получает почти root-доступ к узлу. Почти никогда не нужен.", L("6-2"));
      if (/^\s*hostPath:/.test(l)) add(n, "warn", "`hostPath` привязывает под к конкретному узлу и открывает доступ к его файловой системе. Для данных используют PVC.", L("5-2"));
      if (/^\s*-?\s*name:\s*\S*(PASSWORD|SECRET|TOKEN|KEY)\S*\s*$/i.test(l) && /^\s*value:\s*\S/.test(lines[i + 1] || "")) add(n + 1, "error", "Секрет прямо в манифесте попадёт в Git. Используй `valueFrom.secretKeyRef` и Kubernetes Secret.", L("5-2"));
      if (/^\s*replicas:\s*1\s*$/.test(l) && /kind:\s*Deployment/.test(t)) add(n, "info", "Одна реплика: при обновлении или падении узла сервис будет недоступен. Для боевого сервиса — от 2.", L("5-1"));
      if (/^\s*type:\s*NodePort/.test(l)) add(n, "info", "NodePort открывает порт на каждом узле. Наружу сервисы обычно публикуют через Ingress или Gateway API.", L("5-2", 5));
    });
    if (/kind:\s*(Deployment|StatefulSet|DaemonSet)/.test(t)) {
      if (!/resources:/.test(t)) add(at(/^\s*-?\s*image:/), "warn", "Нет `resources`: без requests планировщик не знает, сколько места нужно поду, а без limits один под может съесть весь узел. HPA без requests тоже не работает.", L("5-1"));
      else { if (!/requests:/.test(t)) add(at(/resources:/), "warn", "Нет `requests` — планировщик не знает, сколько ресурсов нужно поду.", L("5-1")); if (!/limits:/.test(t)) add(at(/resources:/), "info", "Нет `limits.memory` — утечка памяти в одном поде может положить весь узел.", L("1-1", 6)); }
      if (!/readinessProbe:/.test(t)) add(at(/^\s*-?\s*image:/), "warn", "Нет `readinessProbe`: трафик пойдёт в под, который ещё не готов, — при каждом выкате будут ошибки.", L("5-1"));
      if (!/livenessProbe:/.test(t)) add(at(/^\s*-?\s*image:/), "info", "Нет `livenessProbe`: зависший процесс никто не перезапустит.", L("5-1"));
      if (!/runAsNonRoot:\s*true|runAsUser:\s*[1-9]/.test(t)) add(0, "info", "Нет `securityContext.runAsNonRoot: true` — контейнер может работать от root.", L("6-2"));
      const sel = t.match(/matchLabels:\s*\n\s+app:\s*(\S+)/), tpl = t.match(/template:\s*\n\s+metadata:\s*\n\s+labels:\s*\n\s+app:\s*(\S+)/);
      if (sel && tpl && sel[1] !== tpl[1]) add(at(/matchLabels:/), "error", `selector ищет \`app: ${sel[1]}\`, а у подов метка \`app: ${tpl[1]}\` — Deployment не создастся (или не найдёт свои поды).`, L("5-1"));
    }
    return out;
  }

  // ---------------------------------------------------------------- GitLab CI
  function lintCi(lines, t) {
    const out = [], add = (line, sev, msg, link) => out.push({ line, sev, msg, link });
    lines.forEach((l, i) => {
      const n = i + 1;
      if (/^\s*(only|except):/.test(l)) add(n, "warn", "`only`/`except` устарели — используй `rules:` с условиями `if:`.", L("3-2"));
      const im = l.match(/^\s*(?:image|name):\s*["']?([\w.\-/]+(?::[\w.\-]+)?)["']?\s*$/);
      if (im && /^\s*image:|^\s+name:/.test(l) && (/:latest$/.test(im[1]) || (!im[1].includes(":") && /\//.test(im[1]) === false && /^[a-z]/.test(im[1]) && !/^\$/.test(im[1])))) add(n, "warn", `Образ \`${im[1]}\` без версии — пайплайн однажды сломается сам по себе. Зафиксируй тег.`, L("3-2"));
      if (/docker:dind|docker:[\d.]+-dind/.test(l)) add(n, "info", "Docker-in-Docker требует privileged-раннера. В Kubernetes-раннере образы собирают BuildKit rootless или Buildah.", L("6-1", 7));
      if (secretRe.test(l) && !/\$\{?\w+\}?/.test(l.split(/[=:]/).slice(1).join(":"))) add(n, "error", "Секрет записан прямо в .gitlab-ci.yml и попадёт в историю Git. Храни его в Settings → CI/CD → Variables (Masked, Protected).", L("3-2"));
      if (/allow_failure:\s*true/.test(l)) add(n, "info", "`allow_failure: true` — падение этого задания не остановит пайплайн. Для тестов и проверок безопасности это обычно ошибка.", L("3-2"));
      if (/curl[^|]*\|\s*(ba)?sh/.test(l)) add(n, "warn", "Скрипт из интернета сразу в shell: зафиксируй версию и проверяй контрольную сумму.", L("6-2"));
      if (/kubectl apply.*--record/.test(l)) add(n, "info", "`--record` устарел и удалён в новых версиях kubectl.", L("6-1"));
    });
    if (!/^stages:/m.test(t)) add(0, "info", "Нет списка `stages:` — все задания попадут в стадию по умолчанию `test`. Явный порядок стадий читается проще.", L("3-2"));
    if (/deploy/i.test(t) && /prod/i.test(t) && !/when:\s*manual/.test(t)) add(0, "warn", "Похоже, деплой в прод запускается автоматически. Обычно прод выкатывают по тегу и по кнопке: `when: manual`.", L("6-1", 9));
    return out;
  }

  function lint(t) {
    const kind = detect(t), lines = t.replace(/\r/g, "").split("\n");
    if (!kind) return { kind: null, issues: [] };
    const issues = [];
    if (kind !== "docker") lines.forEach((l, i) => {
      if (/\t/.test(l.match(/^\s*/)[0])) issues.push({ line: i + 1, sev: "error", msg: "Табуляция в отступе — YAML запрещает табы, файл не распарсится. Используй пробелы.", link: L("5-1") });
      else { const ind = l.match(/^ */)[0].length; if (l.trim() && !l.trim().startsWith("#") && ind % 2) issues.push({ line: i + 1, sev: "warn", msg: "Нечётный отступ — проверь вложенность: в YAML уровень определяется только пробелами.", link: L("5-1") }); }
    });
    issues.push(...(kind === "docker" ? lintDocker(lines) : kind === "k8s" ? lintK8s(lines, t) : lintCi(lines, t)));
    return { kind, issues: issues.sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.sev] - { error: 0, warn: 1, info: 2 }[b.sev]) || a.line - b.line) };
  }

  // ---------------------------------------------------------------- задачи «почини файл»
  const TASKS = [
    { id: "docker", title: "Почини Dockerfile", goal: "Убери все ошибки и предупреждения.", text: `FROM python
ENV DB_PASSWORD=supersecret123
RUN apt-get update
RUN apt-get install -y curl
COPY . .
RUN pip install -r requirements.txt
EXPOSE 8000
CMD python main.py` },
    { id: "k8s", title: "Почини Deployment", goal: "Убери все ошибки и предупреждения.", text: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop-api
    spec:
      containers:
        - name: shop
          image: registry.local/shop:latest
          env:
            - name: DB_PASSWORD
              value: supersecret123` },
    { id: "ci", title: "Почини .gitlab-ci.yml", goal: "Убери все ошибки и предупреждения.", text: `test:
  image: python
  script:
    - pytest
  allow_failure: true
  only:
    - main

deploy_prod:
  image: alpine
  variables:
    API_TOKEN: glpat-abc123secret
  script:
    - ./deploy.sh prod
  only:
    - main` },
  ];

  root.innerHTML = `<div class="lint-tasks">${TASKS.map((t) => `<button type="button" class="chip" data-task="${t.id}">🔧 ${t.title}</button>`).join("")}<button type="button" class="chip" data-task="">✎ Свой файл</button></div>
    <div class="lint-goal" id="lint-goal"></div>
    <div class="lint-grid"><div><textarea id="lint-in" class="sqlbox-input" spellcheck="false" rows="20" placeholder="Вставь сюда Dockerfile, манифест Kubernetes или .gitlab-ci.yml"></textarea></div>
    <div><div class="lint-sum" id="lint-sum"></div><div class="lint-list" id="lint-list"></div></div></div>`;
  const input = root.querySelector("#lint-in");
  let task = null, timer = 0;
  function solvedStore() { if (!window.APP) return {}; const s = APP.state(); s.games = s.games || {}; s.games.lint = s.games.lint || {}; return s.games.lint; }
  function draw() {
    const { kind, issues } = lint(input.value);
    const names = { docker: "Dockerfile", k8s: "манифест Kubernetes", ci: ".gitlab-ci.yml" };
    const cnt = (s) => issues.filter((x) => x.sev === s).length;
    root.querySelector("#lint-sum").innerHTML = !input.value.trim() ? '<span class="ex-empty">Вставь файл или выбери задачу сверху — проверка идёт на лету.</span>'
      : !kind ? '<span class="ex-empty">Не похоже ни на Dockerfile, ни на манифест Kubernetes, ни на .gitlab-ci.yml.</span>'
      : `<b>${names[kind]}</b><span class="lint-c error">ошибок ${cnt("error")}</span><span class="lint-c warn">предупреждений ${cnt("warn")}</span><span class="lint-c info">советов ${cnt("info")}</span>`;
    root.querySelector("#lint-list").innerHTML = issues.map((x) => `<div class="lint-item ${x.sev}"><span class="lint-line">${x.line ? "стр. " + x.line : "файл"}</span><div>${md(x.msg)} <a href="${x.link}">урок →</a></div></div>`).join("")
      || (kind ? '<div class="lint-ok">✓ Замечаний нет — так и держать.</div>' : "");
    if (task && kind && !cnt("error") && !cnt("warn")) {
      root.querySelector("#lint-goal").innerHTML = `<b>✓ ${task.title}: готово!</b> Остались только советы — их можно учесть по желанию.`;
      root.querySelector("#lint-goal").className = "lint-goal done";
      const st = solvedStore();
      if (window.APP && !st[task.id]) { st[task.id] = 1; APP.addXP(15, task.title.toLowerCase()); APP.track("lab"); if (window.FX) FX.confetti(); }
    }
  }
  function pick(id) {
    task = TASKS.find((t) => t.id === id) || null;
    root.querySelectorAll("[data-task]").forEach((b) => b.classList.toggle("on", b.dataset.task === (id || "")));
    const g = root.querySelector("#lint-goal");
    g.className = "lint-goal"; g.innerHTML = task ? `<b>${task.title}.</b> ${task.goal} Редактируй прямо в поле — замечания обновляются сами. За первое решение +15 XP.` : "Вставь свой файл: проверка ничего никуда не отправляет, всё работает в браузере.";
    input.value = task ? task.text : ""; draw(); input.focus();
  }
  root.querySelectorAll("[data-task]").forEach((b) => b.onclick = () => pick(b.dataset.task));
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(draw, 250); });
  input.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); const s = input.selectionStart; input.setRangeText("  ", s, input.selectionEnd, "end"); } });
  pick("docker");
  window.LINT = lint;
})();
