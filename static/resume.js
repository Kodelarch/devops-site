/* DevOps-маршрут: «Что я умею» — резюме, собранное из прогресса курса. Навыки берутся из пройденных уроков,
   проекты — из чек-листов портфолио. Шапку (имя, контакты) можно править прямо на странице. Печать → PDF. */
(function () {
  "use strict";

  const root = document.getElementById("resume");
  if (!root || !window.APP) return;
  const D = JSON.parse(document.getElementById("page-data").textContent);
  const C = window.COURSE;
  const KEY = "devops-course-resume";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let me = { name: "Имя Фамилия", role: "Junior DevOps-инженер", contacts: "Город · email · Telegram", github: "github.com/username", about: "", showLearning: true };
  try { me = Object.assign(me, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* ignore */ }
  const saveMe = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) { /* ignore */ } };

  function collect() {
    const S = APP.state();
    const lessons = Object.keys(C.lessons), pct = (s) => APP.lessonPct(s);
    const done = lessons.filter((s) => pct(s) === 100), learning = lessons.filter((s) => pct(s) >= 30 && pct(s) < 100);
    const groups = {};
    D.groups.forEach((g) => { groups[g] = []; });
    lessons.forEach((s) => (D.skills[s] || []).forEach(([g, text]) => { if (pct(s) === 100) groups[g].push({ text, state: "done" }); else if (pct(s) >= 30) groups[g].push({ text, state: "learning" }); }));
    const tools = [];
    done.forEach((s) => (D.tools[s] || []).forEach((t) => { if (!tools.includes(t)) tools.push(t); }));
    const projects = D.projects.map((p) => Object.assign({ pct: APP.projectPct(p.slug) }, p)).filter((p) => p.pct >= 30).sort((a, b) => b.pct - a.pct);
    const practice = Object.values(S.practice || {}).filter(Boolean).length;
    return { done, learning, groups, tools, projects, practice, lessons };
  }

  function draw() {
    const r = collect();
    const intro = me.about || `Прохожу практический курс DevOps от Linux до Kubernetes: пройдено ${r.done.length} из ${r.lessons.length} уроков${r.practice ? `, руками выполнено ${r.practice} практических заданий` : ""}${r.projects.length ? `, ${r.projects.length} ${r.projects.length === 1 ? "проект" : r.projects.length < 5 ? "проекта" : "проектов"} в портфолио` : ""}.`;
    const groups = Object.entries(r.groups).map(([g, list]) => {
      const shown = list.filter((x) => x.state === "done" || me.showLearning);
      return shown.length ? `<div class="cv-group"><h3>${esc(g)}</h3><ul>${shown.map((x) => `<li class="${x.state}">${esc(x.text)}${x.state === "learning" ? ' <span class="cv-tag">изучаю</span>' : ""}</li>`).join("")}</ul></div>` : "";
    }).join("");
    root.innerHTML = `<div class="cv-tools no-print">
        <button type="button" class="btn btn-primary" id="cv-print">🖨 Сохранить в PDF</button>
        <button type="button" class="btn" id="cv-copy">📋 Скопировать текстом (для hh.ru)</button>
        <label class="cv-check"><input type="checkbox" id="cv-learning" ${me.showLearning ? "checked" : ""}> показывать то, что изучаю сейчас</label>
        <span class="game-help">Шапку и текст «О себе» можно править прямо здесь — сохраняется само.</span></div>
      <article class="cv">
        <header class="cv-head"><div><h1 contenteditable="true" data-f="name">${esc(me.name)}</h1><div class="cv-role" contenteditable="true" data-f="role">${esc(me.role)}</div></div>
          <div class="cv-contacts"><div contenteditable="true" data-f="contacts">${esc(me.contacts)}</div><div contenteditable="true" data-f="github">${esc(me.github)}</div></div></header>
        <section><h2>О себе</h2><p contenteditable="true" data-f="about" class="cv-about">${esc(intro)}</p></section>
        ${r.tools.length ? `<section><h2>Стек</h2><p class="cv-stack">${r.tools.map((t) => `<span>${esc(t)}</span>`).join("")}</p></section>` : ""}
        <section><h2>Навыки</h2>${groups || '<p class="game-help">Пока пусто — навыки появятся, когда ты пройдёшь первые уроки целиком.</p>'}</section>
        ${r.projects.length ? `<section><h2>Проекты</h2>${r.projects.map((p) => `<div class="cv-project"><div class="cv-project-head"><b>${esc(p.title)}</b><span>${p.pct === 100 ? "готов" : `в работе · ${p.pct}%`}</span></div><p>${esc(p.summary)}</p>${p.repo ? `<a href="${esc(p.repo)}">${esc(p.repo)}</a>` : ""}</div>`).join("")}</section>` : ""}
        <section><h2>Обучение</h2><p>Практический курс «DevOps-маршрут»: Linux и сети, Python и SQL, Docker и CI/CD, облака и IaC, Kubernetes и GitOps, DevSecOps — ${Math.round((r.done.length / r.lessons.length) * 100)}% пройдено.</p></section>
      </article>`;
    root.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("input", () => { me[el.dataset.f] = el.innerText.trim(); saveMe(); }));
    root.querySelector("#cv-learning").onchange = (e) => { me.showLearning = e.target.checked; saveMe(); draw(); };
    root.querySelector("#cv-print").onclick = () => window.print();
    root.querySelector("#cv-copy").onclick = async () => {
      const txt = root.querySelector(".cv").innerText.replace(/\n{3,}/g, "\n\n");
      try { await navigator.clipboard.writeText(txt); APP.toast("Резюме скопировано текстом ✓", "level"); } catch (e) { APP.toast("Не получилось скопировать", ""); }
    };
  }
  draw();
})();
