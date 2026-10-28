/* DevOps-маршрут: эффекты — салют, окна наград, полёт XP, фон-«матрица», появление при прокрутке и робот-помощник.
   Подключается до app.js; app.js вызывает window.FX. Без анимаций (prefers-reduced-motion) всё работает, но спокойно. */
(function () {
  "use strict";

  const BOT_KEY = "devops-course-bot";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const NEON = ["#39ff88", "#2de2e6", "#a78bfa", "#ff3ea5", "#ffb84d", "#60a5fa"];
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  document.documentElement.classList.add("fx");

  let pointer = null;
  document.addEventListener("pointerdown", (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

  // ---------------------------------------------------------------- салют

  function confetti(count) {
    if (reduced) return;
    const c = el("canvas", "fx-confetti"), ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    document.body.appendChild(c);
    const parts = [];
    const n = count || 160;
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : innerWidth + 10, y: innerHeight * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9), vy: -(9 + Math.random() * 10),
        w: 4 + Math.random() * 6, h: 2 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        color: NEON[i % NEON.length], glyph: Math.random() < 0.18 ? (Math.random() < 0.5 ? "1" : "0") : null,
      });
    }
    const start = performance.now();
    (function frame(t) {
      const age = t - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1800) / 900);
      for (const p of parts) {
        p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        if (p.glyph) { ctx.font = "bold 13px JetBrains Mono, monospace"; ctx.fillText(p.glyph, 0, 0); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < 2700) requestAnimationFrame(frame); else c.remove();
    })(start);
  }

  // ---------------------------------------------------------------- окна наград (очередь)

  const queue = [];
  let open = null;
  const idleWaiters = [];

  function showNext() {
    if (open || !queue.length) {
      if (!open && !queue.length) while (idleWaiters.length) idleWaiters.shift()();
      return;
    }
    const item = queue.shift();
    const overlay = el("div", "fx-overlay");
    overlay.innerHTML = item.html;
    document.body.appendChild(overlay);
    open = overlay;
    requestAnimationFrame(() => overlay.classList.add("show"));
    $$lines(overlay);
    if (item.confetti) setTimeout(() => confetti(item.confetti), 120);
    let timer = setTimeout(close, item.ms || 6500);
    function close() {
      if (open !== overlay) return;
      clearTimeout(timer); document.removeEventListener("keydown", onKey);
      overlay.classList.remove("show");
      setTimeout(() => { overlay.remove(); open = null; showNext(); }, reduced ? 0 : 220);
    }
    function onKey(e) { if (e.key === "Escape" || e.key === "Enter") close(); }
    overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("[data-close]")) close(); });
    overlay.addEventListener("mouseenter", () => { clearTimeout(timer); });
    document.addEventListener("keydown", onKey);
    const btn = overlay.querySelector("[data-close]"); if (btn) btn.focus({ preventScroll: true });
  }
  function $$lines(root) {
    root.querySelectorAll(".fx-line").forEach((line, k) => { line.style.animationDelay = (reduced ? 0 : 150 + k * 260) + "ms"; });
  }
  function enqueue(item) { queue.push(item); showNext(); }
  function whenIdle(fn) { if (!open && !queue.length) fn(); else idleWaiters.push(fn); }

  function celebrate(o) {
    const lines = (o.lines || []).map((l) => `<div class="fx-line ${l.cls || ""}">${l.html || esc(l.text)}</div>`).join("");
    enqueue({
      confetti: 180,
      html: `<div class="fx-modal term" role="dialog" aria-label="${esc(o.title)}">
        <div class="term-bar"><i></i><i></i><i></i>${esc(o.bar || "student@devops: ~/route")}</div>
        <div class="term-body">${lines}
          <div class="fx-big fx-line">${esc(o.title)}</div>
          ${o.xp ? `<div class="fx-line fx-xp">+${o.xp} XP</div>` : ""}
          <div class="fx-actions fx-line"><button class="btn btn-primary" data-close>${esc(o.button || "Дальше ▸")}</button></div>
        </div></div>`,
    });
    bot.react("party");
  }

  function levelUp(level, title) {
    enqueue({
      confetti: 220, ms: 5500,
      html: `<div class="fx-level" role="dialog" aria-label="Новый уровень">
        <div class="fx-level-kicker">level up</div>
        <div class="fx-level-num" data-text="LVL ${level}">LVL ${level}</div>
        <div class="fx-level-title">${esc(title)}</div>
        <button class="btn btn-primary" data-close>Круто ▸</button></div>`,
    });
    bot.say(`Уровень ${level}! Теперь ты «${title}». Так держать.`, "party");
  }

  // ---------------------------------------------------------------- достижения и XP

  const achBox = el("div", "fx-achievements");
  function achievement(icon, name, desc) {
    if (!achBox.isConnected) document.body.appendChild(achBox);
    const card = el("div", "fx-ach", `<div class="fx-ach-icon">${icon}</div><div><div class="fx-ach-kicker">achievement unlocked</div>
      <div class="fx-ach-name">${esc(name)}</div>${desc ? `<div class="fx-ach-desc">${esc(desc)}</div>` : ""}</div>`);
    achBox.appendChild(card);
    setTimeout(() => card.classList.add("out"), 4200);
    setTimeout(() => card.remove(), 4700);
  }

  function flyXP(n) {
    const target = document.getElementById("xp");
    if (!target || n <= 0) return;
    const to = target.getBoundingClientRect();
    const from = pointer || { x: innerWidth / 2, y: innerHeight / 2 };
    const chip = el("div", "fx-xpfly", `+${n} XP`);
    chip.style.left = from.x + "px"; chip.style.top = from.y + "px";
    document.body.appendChild(chip);
    const bump = () => { const s = target.closest(".stat"); if (s) { s.classList.remove("bump"); void s.offsetWidth; s.classList.add("bump"); } };
    if (reduced || !chip.animate) { chip.remove(); bump(); return; }
    const dx = to.left + to.width / 2 - from.x, dy = to.top + to.height / 2 - from.y;
    chip.animate([
      { transform: "translate(-50%, -50%) scale(.6)", opacity: 0 },
      { transform: "translate(-50%, -150%) scale(1.15)", opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0.2 },
    ], { duration: 900, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = () => { chip.remove(); bump(); };
  }

  // ---------------------------------------------------------------- фон и появление

  function matrix(canvas) {
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    const words = ["kubectl", "docker", "git", "ssh", "helm", "apply", "ls -la", "grep", "curl", "200 OK", "SELECT", "make", "0", "1", "{}", "$", "|", "&&", "yaml"];
    const size = 14;
    let cols = [], w = 0, h = 0, visible = true, last = 0;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Array.from({ length: Math.ceil(w / (size * 1.6)) }, () => ({ y: Math.random() * -h, speed: 0.6 + Math.random() * 1.4, word: words[(Math.random() * words.length) | 0] }));
    }
    resize(); addEventListener("resize", resize);
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);
    (function frame(t) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden || t - last < 40) return;
      last = t;
      const dark = getComputedStyle(document.documentElement).getPropertyValue("--glow-a").trim() === "1";
      ctx.clearRect(0, 0, w, h);
      ctx.font = `600 ${size - 2}px JetBrains Mono, monospace`;
      cols.forEach((col, i) => {
        const x = i * size * 1.6;
        for (let k = 0; k < col.word.length; k++) {
          const y = col.y - k * size;
          if (y < -size || y > h + size) continue;
          const a = k === 0 ? 0.9 : Math.max(0, 0.55 - k * 0.07);
          ctx.fillStyle = k === 0 ? (dark ? `rgba(200,255,225,${a})` : `rgba(11,154,82,${a})`) : (dark ? `rgba(57,255,136,${a})` : `rgba(11,154,82,${a * 0.6})`);
          ctx.fillText(col.word[col.word.length - 1 - k], x, y);
        }
        col.y += col.speed * size * 0.35;
        if (col.y - col.word.length * size > h) { col.y = -Math.random() * h * 0.5; col.word = words[(Math.random() * words.length) | 0]; col.speed = 0.6 + Math.random() * 1.4; }
      });
    })(0);
  }

  function cursorGlow() {
    if (!finePointer || reduced) return;
    const g = el("div", "fx-cursor");
    document.body.appendChild(g);
    let raf = 0, x = 0, y = 0;
    addEventListener("pointermove", (e) => {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(() => { g.style.transform = `translate(${x}px, ${y}px)`; raf = 0; });
    }, { passive: true });
  }

  function reveal() {
    const items = document.querySelectorAll(".part-head, .lesson-card, .project-card, .milestone-head, .stat-card, .achievement, .task, .quiz-q, .pipeline");
    if (reduced || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -6% 0px" });
    items.forEach((it) => {
      const sibs = it.parentElement ? Array.from(it.parentElement.children) : [];
      it.style.setProperty("--d", (Math.max(0, sibs.indexOf(it)) % 6) * 60 + "ms");
      it.classList.add("reveal");
      io.observe(it);
    });
  }

  // ---------------------------------------------------------------- робот-помощник

  const FACTS = [
    "Команда <code>!!</code> в Bash повторяет предыдущую. <code>sudo !!</code> — классика, когда забыла sudo.",
    "<code>Ctrl+R</code> в терминале ищет по истории команд. Экономит часы.",
    "Kubernetes часто пишут как k8s: между k и s ровно восемь букв.",
    "Логотип Docker — кит Молли, который везёт контейнеры на спине.",
    "<code>git reflog</code> помнит, где была HEAD. Почти любую «потерянную» работу можно вернуть.",
    "Код 418 «I'm a teapot» — настоящий HTTP-статус, первоапрельская шутка 1998 года.",
    "Первая буква в <code>chmod 755</code> — права владельца: 7 = чтение + запись + выполнение.",
    "<code>docker system df</code> показывает, сколько места съели образы и тома.",
    "Слово «Ansible» взято из фантастики: так называли устройство мгновенной связи.",
    "Terraform хранит, что он создал, в state-файле. Потеряешь state — Terraform «забудет» инфраструктуру.",
    "<code>kubectl explain pod.spec</code> — встроенная документация прямо в терминале.",
    "SRE придумали в Google в 2003 году: «что будет, если поручить эксплуатацию программисту».",
    "На собеседовании «не знаю, но проверила бы так…» звучит сильнее, чем угадывание.",
    "<code>curl -I</code> показывает только заголовки ответа — быстрый способ проверить сервис.",
    "Правило: если делаешь что-то руками третий раз — пора писать скрипт.",
    "<code>ss -tulpn</code> показывает, какой процесс слушает какой порт.",
    "В YAML отступы — это синтаксис. Табуляция там запрещена.",
    "Лучший пет-проект — тот, который ты можешь объяснить от коммита до продакшена.",
  ];
  const PRAISE = ["Верно! 🎯", "Точно в цель.", "Отлично, так и отвечают на собеседовании.", "Да! Пайплайн зелёный ✓", "Чётко. Дальше!"];
  const SUPPORT = ["Мимо, но это нормально — прочитай пояснение.", "Ошибка — тоже данные. Попробуй ещё раз.", "Почти! Посмотри, что пишут в пояснении.", "Не страшно: на ошибках учатся быстрее."];

  const BOT_SVG = `<svg class="bot-svg" viewBox="0 0 16 18" shape-rendering="crispEdges" aria-hidden="true">
    <rect class="bot-antenna" x="7" y="0" width="2" height="2"/><rect class="bot-metal" x="7.5" y="2" width="1" height="2"/>
    <rect class="bot-head" x="2" y="4" width="12" height="9" rx="1"/>
    <rect class="bot-metal" x="0" y="7" width="2" height="3"/><rect class="bot-metal" x="14" y="7" width="2" height="3"/>
    <g class="eyes-idle"><rect class="bot-eye" x="5" y="7" width="2" height="3"/><rect class="bot-eye" x="9" y="7" width="2" height="3"/></g>
    <g class="eyes-happy"><path class="bot-eye-line" d="M4.6 9.4 L6 7.8 L7.4 9.4 M8.6 9.4 L10 7.8 L11.4 9.4"/></g>
    <g class="eyes-sad"><rect class="bot-eye" x="5" y="8" width="2" height="1.4"/><rect class="bot-eye" x="9" y="8" width="2" height="1.4"/></g>
    <rect class="bot-mouth" x="6" y="11" width="4" height="1"/>
    <rect class="bot-body" x="4" y="13" width="8" height="4" rx="1"/><rect class="bot-chest" x="7" y="14" width="2" height="2"/>
  </svg>`;

  const bot = (function () {
    let root = null, bubble = null, text = null, hideTimer = 0, moodTimer = 0, mini = false;
    try { mini = localStorage.getItem(BOT_KEY) === "mini"; } catch (e) { /* ignore */ }
    function mount() {
      if (root) return;
      root = el("div", "bot" + (mini ? " mini" : ""));
      root.innerHTML = `<div class="bot-bubble" role="status" aria-live="polite"><button class="bot-close" title="Свернуть робота" aria-label="Свернуть робота">×</button><div class="bot-text"></div></div>
        <button class="bot-btn" title="Робот-помощник: нажми, чтобы узнать факт" aria-label="Робот-помощник">${BOT_SVG}</button>`;
      document.body.appendChild(root);
      bubble = root.querySelector(".bot-bubble"); text = root.querySelector(".bot-text");
      root.querySelector(".bot-btn").onclick = () => {
        if (mini) { setMini(false); say("Я снова здесь! Нажимай на меня — расскажу что-нибудь полезное.", "happy"); return; }
        fact();
      };
      root.querySelector(".bot-close").onclick = () => { hide(); setMini(true); };
    }
    function setMini(v) { mini = v; root.classList.toggle("mini", v); try { localStorage.setItem(BOT_KEY, v ? "mini" : "on"); } catch (e) { /* ignore */ } }
    function mood(m, ms) {
      if (!root) return;
      root.dataset.mood = m || "idle";
      clearTimeout(moodTimer);
      if (m && m !== "idle") moodTimer = setTimeout(() => { root.dataset.mood = "idle"; }, ms || 2600);
    }
    function say(html, m, ms) {
      mount();
      mood(m, ms);
      if (mini) return;
      text.innerHTML = html;
      bubble.classList.add("show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, ms || 7000);
    }
    function hide() { if (bubble) bubble.classList.remove("show"); }
    function fact() { say(`<span class="bot-kicker">// факт</span>${FACTS[(Math.random() * FACTS.length) | 0]}`, "happy", 9000); }
    function react(kind) {
      mount();
      if (kind === "ok") say(PRAISE[(Math.random() * PRAISE.length) | 0], "happy", 3500);
      else if (kind === "no") say(SUPPORT[(Math.random() * SUPPORT.length) | 0], "sad", 4500);
      else if (kind === "party") mood("happy", 5000);
    }
    return { mount, say, react, fact };
  })();

  window.FX = {
    confetti, celebrate, levelUp, achievement, flyXP, whenIdle, bot,
    init(kind) {
      bot.mount();
      cursorGlow();
      reveal();
      if (kind === "index") matrix(document.getElementById("matrix"));
    },
  };
})();
