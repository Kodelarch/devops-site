/* DevOps-маршрут: живой учебный Kubernetes-кластер. Правишь Deployment в YAML → «kubectl apply» →
   планировщик раскладывает поды по узлам с учётом requests, контроллер чинит упавшее, rolling update меняет версии. */
(function () {
  "use strict";

  const root = document.getElementById("cluster");
  if (!root) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

  const NODE_CPU = 2000, NODE_MEM = 4096;
  const IMAGES = { "shop:1.0": "ok", "shop:1.1": "ok", "shop:2.0": "ok", "shop:broken": "crash", "nginx:1.27": "ok" };
  const DEFAULT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: shop
          image: shop:1.0
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              memory: 512Mi`;
  const TASKS = [
    { id: "scale", text: "Масштабируй до 6 реплик", test: (s) => s.spec.replicas === 6 && ready(s) === 6 },
    { id: "update", text: "Обнови образ до shop:1.1 без простоя", test: (s) => s.spec.image === "shop:1.1" && ready(s) === s.spec.replicas && s.pods.every((p) => p.image === "shop:1.1") },
    { id: "pending", text: "Добейся Pending: попроси больше CPU, чем есть на узлах", test: (s) => s.pods.some((p) => p.st === "Pending") },
    { id: "oom", text: "Получи OOMKilled: поставь limits.memory меньше 64Mi", test: (s) => s.pods.some((p) => p.st === "OOMKilled" || p.reason === "OOMKilled") },
    { id: "node", text: "Урони узел и посмотри, как поды переедут", test: (s) => s.nodes.some((n) => !n.up) && ready(s) === s.spec.replicas },
    { id: "pull", text: "Вызови ImagePullBackOff несуществующим тегом", test: (s) => s.pods.some((p) => p.st === "ImagePullBackOff") },
  ];
  const ready = (s) => s.pods.filter((p) => p.st === "Running").length;

  let S, seq = 0, busy = false, reconciling = false;
  const done = new Set();
  function fresh() {
    S = { spec: parse(DEFAULT), nodes: [1, 2, 3].map((i) => ({ name: `node-${i}`, up: true })), pods: [], events: [] };
  }
  function parse(yaml) {
    const num = (re, d) => { const m = yaml.match(re); return m ? m[1] : d; };
    const cpu = (v) => /m$/.test(v) ? parseInt(v) : Math.round(parseFloat(v) * 1000);
    const mem = (v) => /Gi$/.test(v) ? parseFloat(v) * 1024 : /Mi$/.test(v) ? parseFloat(v) : parseFloat(v) / 1048576;
    const replicas = parseInt(num(/replicas:\s*(\d+)/, "1"), 10);
    const image = num(/image:\s*["']?([\w.\-/:]+)/, "shop:1.0");
    const req = yaml.split(/limits:/)[0];
    const lim = (yaml.split(/limits:/)[1] || "");
    return {
      replicas: Math.min(12, Math.max(0, replicas)), image,
      cpu: cpu(((req.match(/cpu:\s*["']?([\d.]+m?)/) || [])[1]) || "100m"),
      mem: mem(((req.match(/memory:\s*["']?([\d.]+(?:Mi|Gi)?)/) || [])[1]) || "128Mi"),
      limit: lim ? mem(((lim.match(/memory:\s*["']?([\d.]+(?:Mi|Gi)?)/) || [])[1]) || "0") : 0,
    };
  }
  const ev = (t, cls) => { S.events.unshift({ t, cls }); S.events = S.events.slice(0, 7); };
  const used = (n) => S.pods.filter((p) => p.node === n.name && p.st !== "Pending").reduce((a, p) => ({ cpu: a.cpu + p.cpu, mem: a.mem + p.mem }), { cpu: 0, mem: 0 });
  function schedule(p) {
    // как kube-scheduler: подходящие узлы с запасом по requests, выбираем наименее загруженный
    const fit = S.nodes.filter((n) => n.up && used(n).cpu + p.cpu <= NODE_CPU && used(n).mem + p.mem <= NODE_MEM);
    if (!fit.length) return null;
    return fit.sort((a, b) => used(a).cpu - used(b).cpu)[0].name;
  }
  const tpl = (spec) => [spec.image, spec.cpu, spec.mem, spec.limit].join("|");
  function mkPod(spec) {
    const hash = ((++seq) * 2654435761 >>> 0).toString(36).slice(-5);
    const id = "shop-" + spec.image.split(":")[1].replace(/\W/g, "") + "-" + hash;
    return { id, tpl: tpl(spec), image: spec.image, cpu: spec.cpu, mem: spec.mem, limit: spec.limit, st: "Pending", node: null, restarts: 0 };
  }
  async function start(p) {
    p.node = schedule(p);
    if (!p.node) { p.st = "Pending"; ev(`${p.id}: FailedScheduling — 0/${S.nodes.length} nodes: Insufficient cpu/memory`, "bad"); draw(); return; }
    ev(`${p.id}: Scheduled → ${p.node}`); p.st = "ContainerCreating"; draw(); await wait(500);
    const kind = IMAGES[p.image];
    if (!kind) { p.st = "ImagePullBackOff"; ev(`${p.id}: Failed to pull image "${p.image}": not found`, "bad"); draw(); return; }
    if (p.limit && p.limit < 64) { p.st = "OOMKilled"; p.reason = "OOMKilled"; p.restarts++; ev(`${p.id}: OOMKilled — limit ${p.limit}Mi, процессу нужно ~90Mi`, "bad"); draw(); await wait(500); p.st = "CrashLoopBackOff"; draw(); return; }
    if (kind === "crash") { p.st = "CrashLoopBackOff"; p.restarts++; ev(`${p.id}: Back-off restarting failed container (exit 1)`, "bad"); draw(); return; }
    p.st = "Running"; ev(`${p.id}: Started, readiness OK`, "good"); draw();
  }
  async function reconcile() {
    if (reconciling) return; reconciling = true;
    try {
      // поды на упавших узлах исчезают — контроллер создаёт замену
      let guard = 0;
      while (guard++ < 40) {
        const alive = S.pods.filter((p) => p.st !== "Terminating");
        if (alive.length < S.spec.replicas) { const p = mkPod(S.spec); S.pods.push(p); await start(p); await wait(150); continue; }
        if (alive.length > S.spec.replicas && !S.stuck) {
          const victim = alive.find((p) => p.st === "Pending") || alive.find((p) => p.st !== "Running") || alive[alive.length - 1];
          victim.st = "Terminating"; ev(`${victim.id}: Killing (scale down)`); draw(); await wait(400);
          S.pods = S.pods.filter((x) => x !== victim); draw(); continue;
        }
        // Pending-поды пробуем запланировать снова (место могло освободиться)
        const pend = S.pods.find((p) => p.st === "Pending" && schedule(p));
        if (pend) { await start(pend); continue; }
        break;
      }
    } finally { reconciling = false; check(); draw(); }
  }
  async function rolling(newSpec) {
    // maxSurge 1, maxUnavailable 0: новый под → готов → только тогда убираем старый
    const old = S.pods.filter((p) => p.tpl !== tpl(newSpec));
    ev(`deployment "shop" rolling update → ${newSpec.image}`);
    for (const o of old) {
      const p = mkPod(newSpec); S.pods.push(p); await start(p); await wait(250);
      if (p.st !== "Running") {
        S.stuck = true;
        ev(`rollout завис: новый под ${p.st}, старые продолжают работать — верни образ и снова apply`, "bad"); draw();
        return false;
      }
      o.st = "Terminating"; draw(); await wait(350);
      S.pods = S.pods.filter((x) => x !== o); draw();
    }
    return true;
  }
  async function apply() {
    if (busy) return; busy = true;
    const text = root.querySelector("#k8s-yaml").value;
    const next = parse(text), prev = S.spec;
    root.querySelector("#k8s-cmd").textContent = "$ kubectl apply -f deploy.yaml\ndeployment.apps/shop configured";
    const templateChanged = next.image !== prev.image || next.cpu !== prev.cpu || next.mem !== prev.mem || next.limit !== prev.limit;
    S.spec = next; S.stuck = false;
    if (templateChanged && S.pods.length) {
      // поды с ошибками старого шаблона просто заменяются
      S.pods = S.pods.filter((p) => p.st === "Running" || p.tpl === tpl(next));
      await rolling(next);
    }
    await reconcile();
    busy = false; draw();
  }
  async function killNode(name) {
    if (busy) return; busy = true;
    const n = S.nodes.find((x) => x.name === name);
    n.up = !n.up;
    if (!n.up) {
      ev(`${name}: NotReady — узел недоступен`, "bad");
      S.pods.filter((p) => p.node === name).forEach((p) => { p.st = "Terminating"; });
      draw(); await wait(700);
      S.pods = S.pods.filter((p) => p.node !== name);
      ev("ReplicaSet: не хватает реплик, создаю замену на живых узлах");
    } else ev(`${name}: Ready — узел вернулся`, "good");
    draw(); await reconcile(); busy = false;
  }
  async function killPod(id) {
    if (busy) return; busy = true;
    const p = S.pods.find((x) => x.id === id); if (!p) { busy = false; return; }
    p.st = "Terminating"; ev(`$ kubectl delete pod ${id}`); draw(); await wait(500);
    S.pods = S.pods.filter((x) => x !== p); draw(); await reconcile(); busy = false;
  }

  function check() {
    TASKS.forEach((t) => {
      if (!done.has(t.id) && t.test(S)) {
        done.add(t.id);
        if (window.APP) APP.track("lab");
        const g = window.APP ? APP.state() : null;
        if (g) {
          g.games = g.games || {}; g.games.cluster = g.games.cluster || {};
          if (!g.games.cluster[t.id]) { g.games.cluster[t.id] = 1; APP.addXP(10, `кластер: ${t.text.toLowerCase()}`); }
        }
      }
    });
  }

  function draw() {
    const nodes = S.nodes.map((n) => {
      const u = used(n), pods = S.pods.filter((p) => p.node === n.name);
      return `<div class="k8s-node ${n.up ? "" : "down"}"><div class="k8s-node-head"><b>${n.name}</b><span>${n.up ? "Ready" : "NotReady"}</span>
        <button type="button" class="k8s-mini" data-node="${n.name}">${n.up ? "💥 уронить" : "↺ поднять"}</button></div>
        <div class="k8s-res"><span>CPU ${u.cpu}m / ${NODE_CPU}m</span><div class="k8s-meter"><i style="width:${Math.min(100, (u.cpu / NODE_CPU) * 100)}%"></i></div>
        <span>RAM ${Math.round(u.mem)}Mi / ${NODE_MEM}Mi</span><div class="k8s-meter mem"><i style="width:${Math.min(100, (u.mem / NODE_MEM) * 100)}%"></i></div></div>
        <div class="k8s-pods">${pods.map(podHtml).join("") || '<span class="ex-empty">нет подов</span>'}</div></div>`;
    }).join("");
    const pending = S.pods.filter((p) => !p.node);
    const tasks = TASKS.map((t) => `<li class="${done.has(t.id) || (window.APP && ((APP.state().games || {}).cluster || {})[t.id]) ? "done" : ""}">${esc(t.text)}</li>`).join("");
    root.querySelector("#k8s-nodes").innerHTML = nodes + (pending.length ? `<div class="k8s-node pending"><div class="k8s-node-head"><b>не размещены</b><span>Pending</span></div><div class="k8s-pods">${pending.map(podHtml).join("")}</div></div>` : "");
    root.querySelector("#k8s-status").innerHTML = `<b>shop</b> · ${ready(S)}/${S.spec.replicas} готово · образ <code>${esc(S.spec.image)}</code> · requests ${S.spec.cpu}m CPU, ${Math.round(S.spec.mem)}Mi`;
    root.querySelector("#k8s-events").innerHTML = S.events.map((e) => `<div class="${e.cls || ""}">${esc(e.t)}</div>`).join("") || '<div class="ex-empty">$ kubectl get events -w</div>';
    root.querySelector("#k8s-tasks").innerHTML = tasks;
    root.querySelectorAll("[data-node]").forEach((b) => b.onclick = () => killNode(b.dataset.node));
    root.querySelectorAll("[data-pod]").forEach((b) => b.onclick = () => killPod(b.dataset.pod));
  }
  function podHtml(p) {
    const cls = { Running: "ok", Pending: "pend", ContainerCreating: "pend", Terminating: "term" }[p.st] || "bad";
    return `<button type="button" class="k8s-pod ${cls}" data-pod="${p.id}" title="Нажми, чтобы удалить под"><b>${esc(p.image.split(":")[1])}</b><span>${esc(p.id)}</span><em>${p.st}${p.restarts ? " ↻" + p.restarts : ""}</em></button>`;
  }

  root.innerHTML = `<div class="k8s-grid"><div class="k8s-editor"><div class="ex-col-title">deploy.yaml</div>
      <textarea id="k8s-yaml" class="sqlbox-input" spellcheck="false" rows="18"></textarea>
      <div class="sqlbox-actions"><button type="button" class="btn btn-primary" id="k8s-apply">▶ kubectl apply</button><button type="button" class="btn btn-ghost" id="k8s-reset">↺ Сбросить кластер</button></div>
      <pre class="ex-term" id="k8s-cmd">$ kubectl get nodes\nnode-1 Ready · node-2 Ready · node-3 Ready</pre>
      <div class="ex-col-title" style="margin-top:14px">Задания</div><ul class="k8s-tasks" id="k8s-tasks"></ul>
      <p class="k8s-hint">Образы: <code>shop:1.0</code>, <code>shop:1.1</code>, <code>shop:2.0</code>, <code>nginx:1.27</code> и <code>shop:broken</code> (падает при старте). Каждый узел — 2 CPU и 4 ГиБ. Клик по поду удаляет его.</p></div>
    <div class="k8s-cluster"><div class="k8s-status" id="k8s-status"></div><div class="k8s-nodes" id="k8s-nodes"></div>
      <div class="ex-col-title" style="margin-top:12px">События</div><div class="k8s-events" id="k8s-events"></div></div></div>`;
  const ta = root.querySelector("#k8s-yaml");
  ta.value = DEFAULT;
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); apply(); }
    if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("  ", s, ta.selectionEnd, "end"); }
  });
  root.querySelector("#k8s-apply").onclick = apply;
  root.querySelector("#k8s-reset").onclick = async () => { if (busy) return; busy = true; fresh(); ta.value = DEFAULT; draw(); await reconcile(); busy = false; };
  fresh(); draw();
  (async () => { busy = true; await reconcile(); busy = false; })();
})();
