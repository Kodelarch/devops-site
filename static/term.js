/* DevOps-маршрут: терминал-тренажёр. Учебный Linux в браузере: виртуальная файловая система, процессы,
   конвейеры и упрощённый git (ветки, слияние, конфликты). Квесты проверяют состояние «сервера». */
(function () {
  "use strict";

  const root = document.getElementById("terminal");
  if (!root) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const HOME = "/home/student";

  // ---------------------------------------------------------------- «сервер»

  let FS, PROCS, REPOS, cwd, history, ran;
  function accessLog() {
    const ips = ["10.0.0.5", "10.0.0.7", "10.0.0.5", "10.0.0.9", "10.0.0.5", "10.0.0.12", "10.0.0.7", "10.0.0.5"];
    const reqs = [["GET", "/", 200], ["GET", "/api/items", 200], ["POST", "/api/orders", 500], ["GET", "/health", 200], ["GET", "/api/items", 500],
      ["POST", "/login", 401], ["GET", "/old", 404], ["GET", "/api/cart", 200], ["POST", "/api/orders", 500], ["GET", "/", 200]];
    const out = [];
    for (let i = 0; i < 40; i++) {
      const [m, p, c] = reqs[(i * 7) % reqs.length], ip = ips[(i * 3) % ips.length];
      out.push(`${ip} - - [28/Oct/2026:10:${String(i).padStart(2, "0")}:01 +0300] "${m} ${p} HTTP/1.1" ${c} ${c === 200 ? 512 + i : 64}`);
    }
    return out.join("\n") + "\n";
  }
  function fresh() {
    FS = {};
    const dir = (p) => { FS[p] = { dir: true }; };
    const file = (p, content, extra) => { FS[p] = Object.assign({ content, mode: 0o644 }, extra || {}); };
    ["/", "/home", HOME, HOME + "/project", "/etc", "/etc/nginx", "/var", "/var/log", "/var/log/nginx", "/var/log/app", "/tmp"].forEach(dir);
    file(HOME + "/notes.txt", "Сервер shop-prod-1.\nДиск забит? Начни с df -h и du -sh /var/log/*\n");
    file(HOME + "/deploy.sh", "#!/bin/bash\nset -euo pipefail\necho \"Deploying shop...\"\n");
    file("/etc/hosts", "127.0.0.1 localhost\n10.0.0.20 db\n");
    file("/etc/nginx/nginx.conf", "worker_processes auto;\nevents { worker_connections 1024; }\nhttp {\n  server {\n    listen 80;\n    location / { proxy_pass http://127.0.0.1:8000; }\n  }\n}\n");
    file("/var/log/nginx/access.log", accessLog());
    file("/var/log/nginx/error.log", "2026/10/28 10:02:01 [error] upstream timed out while reading response header\n");
    file("/var/log/app/app.log", "INFO started\nERROR KeyError: 'PAYMENT_PROVIDER_URL'\n", { size: 120 * 1048576 });
    file("/var/log/app/debug.log", "DEBUG ... (18 ГБ отладочного вывода, который забыли выключить)\n", { size: 18 * 1073741824 });
    file("/var/log/syslog", "Oct 28 10:00:01 shop-prod-1 CRON[1201]: (root) CMD (backup.sh)\n", { size: 40 * 1048576 });
    PROCS = [
      { pid: 1, user: "root", cpu: 0.0, mem: 0.3, cmd: "/sbin/init" },
      { pid: 640, user: "root", cpu: 0.0, mem: 0.2, cmd: "sshd: /usr/sbin/sshd -D" },
      { pid: 812, user: "root", cpu: 0.1, mem: 0.4, cmd: "nginx: master process" },
      { pid: 813, user: "www-data", cpu: 1.2, mem: 0.9, cmd: "nginx: worker process" },
      { pid: 901, user: "postgres", cpu: 2.5, mem: 8.1, cmd: "postgres -D /var/lib/postgresql/16/main" },
      { pid: 1500, user: "student", cpu: 0.0, mem: 0.1, cmd: "-bash" },
      { pid: 4242, user: "nobody", cpu: 98.7, mem: 3.2, cmd: "/tmp/.x/miner.sh --pool evil.example" },
    ];
    REPOS = {};
    // ~/shop: main и feature меняют одну и ту же строку config.txt
    const shop = HOME + "/shop";
    dir(shop);
    const base = { "config.txt": "port=80\nworkers=2\n", "app.py": "print('shop')\n" };
    const repo = newRepo();
    const c1 = commit(repo, "init", base, []);
    const c2 = commit(repo, "порт 8080 для нового балансировщика", Object.assign({}, base, { "config.txt": "port=8080\nworkers=2\n" }), [c1]);
    const c3 = commit(repo, "временный порт 8000", Object.assign({}, base, { "config.txt": "port=8000\nworkers=2\n" }), [c1]);
    repo.branches = { main: c3, feature: c2 }; repo.head = "main";
    repo.index = Object.assign({}, repo.commits[c3].files);
    Object.entries(repo.index).forEach(([f, c]) => file(shop + "/" + f, c));
    REPOS[shop] = repo;
    cwd = HOME; history = []; ran = new Set();
  }
  const human = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1).replace(".0", "") + "G" : b >= 1048576 ? Math.round(b / 1048576) + "M" : b >= 1024 ? Math.round(b / 1024) + "K" : b + "";
  const sizeOf = (p) => FS[p].dir ? Object.keys(FS).filter((k) => k.startsWith(p === "/" ? "/" : p + "/") && !FS[k].dir).reduce((a, k) => a + sizeOf(k), 0) : (FS[p].size || FS[p].content.length);
  const DISK = 50 * 1073741824, BASE_USED = 29.8 * 1073741824;
  const diskUsed = () => BASE_USED + sizeOf("/var/log");

  function resolve(p) {
    if (!p) return cwd;
    if (p === "~" || p.startsWith("~/")) p = HOME + p.slice(1);
    const parts = (p.startsWith("/") ? [] : cwd.split("/").filter(Boolean));
    p.split("/").forEach((x) => { if (!x || x === ".") return; if (x === "..") parts.pop(); else parts.push(x); });
    return "/" + parts.join("/");
  }
  const children = (d) => Object.keys(FS).filter((k) => k !== d && k.startsWith(d === "/" ? "/" : d + "/") && !k.slice(d === "/" ? 1 : d.length + 1).includes("/")).sort();
  const base = (p) => p.split("/").pop() || "/";
  const short = (p) => p === HOME ? "~" : p.startsWith(HOME + "/") ? "~" + p.slice(HOME.length) : p;
  const modeStr = (e) => (e.dir ? "d" : "-") + [6, 3, 0].map((s) => { const b = ((e.mode || (e.dir ? 0o755 : 0o644)) >> s) & 7; return (b & 4 ? "r" : "-") + (b & 2 ? "w" : "-") + (b & 1 ? "x" : "-"); }).join("");

  // ---------------------------------------------------------------- git

  function newRepo() { return { commits: {}, branches: { main: null }, head: "main", index: {}, merge: null, seq: 0 }; }
  function commit(repo, msg, files, parents) {
    const id = (0x1a2b3c + (++repo.seq) * 0x9e37).toString(16).slice(-7);
    repo.commits[id] = { id, msg, files: Object.assign({}, files), parents };
    return id;
  }
  function repoOf(dir) { let d = dir; while (d) { if (REPOS[d]) return [d, REPOS[d]]; if (d === "/") break; d = d.slice(0, d.lastIndexOf("/")) || "/"; } return [null, null]; }
  const headFiles = (r) => r.branches[r.head] ? r.commits[r.branches[r.head]].files : {};
  function workFiles(rd) { const o = {}; children(rd).forEach((p) => { if (!FS[p].dir) o[base(p)] = FS[p].content; }); return o; }
  function setWork(rd, files) {
    children(rd).forEach((p) => { if (!FS[p].dir) delete FS[p]; });
    Object.entries(files).forEach(([f, c]) => { FS[rd + "/" + f] = { content: c, mode: 0o644 }; });
  }
  const ancestors = (r, id) => { const s = new Set(), st = [id]; while (st.length) { const x = st.pop(); if (x && !s.has(x)) { s.add(x); st.push(...r.commits[x].parents); } } return s; };
  function mergeText(b, o, t) {
    if (o === t) return [o, false];
    if (o === b) return [t, false];
    if (t === b) return [o, false];
    const bl = (b || "").split("\n"), ol = o.split("\n"), tl = t.split("\n");
    if (bl.length !== ol.length || ol.length !== tl.length) return [`<<<<<<< HEAD\n${o}=======\n${t}>>>>>>> theirs\n`, true];
    let conflict = false;
    const out = ol.map((x, i) => {
      if (x === tl[i]) return x; if (x === bl[i]) return tl[i]; if (tl[i] === bl[i]) return x;
      conflict = true; return `<<<<<<< HEAD\n${x}\n=======\n${tl[i]}\n>>>>>>> feature`;
    });
    return [out.join("\n"), conflict];
  }
  function git(args) {
    const sub = args[0];
    if (sub === "init") {
      if (REPOS[cwd]) return `Reinitialized existing Git repository in ${cwd}/.git/`;
      REPOS[cwd] = newRepo(); return `Initialized empty Git repository in ${cwd}/.git/`;
    }
    const [rd, r] = repoOf(cwd);
    if (!r) return "fatal: not a git repository (or any of the parent directories): .git";
    const work = workFiles(rd), head = headFiles(r);
    if (sub === "status") {
      const lines = [`On branch ${r.head}`];
      if (r.merge) lines.push("You have unmerged paths.\n  (fix conflicts and run \"git commit\")");
      const staged = Object.keys(Object.assign({}, r.index, head)).filter((f) => r.index[f] !== head[f]);
      const changed = Object.keys(r.index).filter((f) => f in work && work[f] !== r.index[f]);
      const untracked = Object.keys(work).filter((f) => !(f in r.index));
      const unmerged = staged.filter((f) => r.merge && (work[f] || "").includes("<<<<<<<"));
      if (unmerged.length) lines.push("Unmerged paths:\n  (use \"git add <file>...\" to mark resolution)", ...unmerged.map((f) => `\tboth modified:   ${f}`));
      const ready = staged.filter((f) => !unmerged.includes(f));
      if (ready.length) lines.push("Changes to be committed:", ...ready.map((f) => `\t${f in r.index ? (f in head ? "modified" : "new file") : "deleted"}:   ${f}`));
      if (changed.length) lines.push("Changes not staged for commit:", ...changed.map((f) => `\tmodified:   ${f}`));
      if (untracked.length) lines.push("Untracked files:", ...untracked.map((f) => `\t${f}`));
      if (!staged.length && !changed.length && !untracked.length) lines.push(r.branches[r.head] ? "nothing to commit, working tree clean" : "No commits yet\n\nnothing to commit (create/copy files and use \"git add\" to track)");
      return lines.join("\n");
    }
    if (sub === "add") {
      const list = args.slice(1);
      if (!list.length) return "Nothing specified, nothing added.";
      (list.includes(".") || list.includes("-A") ? Object.keys(Object.assign({}, work, r.index)) : list).forEach((f) => { if (f in work) r.index[f] = work[f]; else delete r.index[f]; });
      return "";
    }
    if (sub === "commit") {
      const mi = args.indexOf("-m"); if (mi < 0 || !args[mi + 1]) return "Укажи сообщение: git commit -m \"что сделано\"";
      if (Object.values(r.index).some((c) => c.includes("<<<<<<<"))) return "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add <file>'";
      if (!r.merge && JSON.stringify(r.index) === JSON.stringify(head)) return "nothing to commit, working tree clean";
      const parents = [r.branches[r.head], r.merge].filter(Boolean);
      const id = commit(r, args[mi + 1], r.index, parents);
      r.branches[r.head] = id; r.merge = null;
      return `[${r.head} ${id}] ${args[mi + 1]}\n ${Object.keys(r.index).length} file(s) in snapshot`;
    }
    if (sub === "log") {
      const out = []; let id = r.branches[r.head];
      while (id) { const c = r.commits[id]; out.push(`${id} ${c.parents.length > 1 ? "Merge: " : ""}${c.msg}`); id = c.parents[0]; }
      return out.join("\n") || "fatal: your current branch 'main' does not have any commits yet";
    }
    if (sub === "branch") {
      if (args[1]) { if (!r.branches[r.head]) return "fatal: сначала сделай первый коммит"; r.branches[args[1]] = r.branches[r.head]; return ""; }
      return Object.keys(r.branches).map((b) => (b === r.head ? "* " : "  ") + b).join("\n");
    }
    if (sub === "switch" || sub === "checkout") {
      const create = args[1] === "-c" || args[1] === "-b", name = create ? args[2] : args[1];
      if (!name) return "Укажи ветку";
      if (create) { if (r.branches[name] !== undefined) return `fatal: a branch named '${name}' already exists`; r.branches[name] = r.branches[r.head]; r.head = name; return `Switched to a new branch '${name}'`; }
      if (r.branches[name] === undefined) return `fatal: invalid reference: ${name}`;
      if (JSON.stringify(work) !== JSON.stringify(r.index) || JSON.stringify(r.index) !== JSON.stringify(head)) return "error: Your local changes would be overwritten by checkout.\nPlease commit your changes or stash them before you switch branches.";
      r.head = name; r.index = Object.assign({}, headFiles(r)); setWork(rd, r.index);
      return `Switched to branch '${name}'`;
    }
    if (sub === "merge") {
      if (args[1] === "--abort") { r.merge = null; r.index = Object.assign({}, head); setWork(rd, head); return ""; }
      const name = args[1], theirs = r.branches[name];
      if (!theirs) return `merge: ${name} - not something we can merge`;
      const ours = r.branches[r.head];
      if (ancestors(r, ours).has(theirs)) return "Already up to date.";
      if (ancestors(r, theirs).has(ours)) { r.branches[r.head] = theirs; r.index = Object.assign({}, r.commits[theirs].files); setWork(rd, r.index); return `Updating ${ours}..${theirs}\nFast-forward`; }
      const anc = ancestors(r, theirs); let b = ours; const q = [ours]; const seen = new Set();
      while (q.length) { const x = q.shift(); if (anc.has(x)) { b = x; break; } if (!seen.has(x)) { seen.add(x); q.push(...r.commits[x].parents); } }
      const bf = r.commits[b].files, of = r.commits[ours].files, tf = r.commits[theirs].files;
      const files = {}, conflicts = [];
      new Set([...Object.keys(of), ...Object.keys(tf)]).forEach((f) => { const [txt, c] = mergeText(bf[f], of[f] || "", tf[f] || ""); files[f] = txt; if (c) conflicts.push(f); });
      setWork(rd, files);
      if (conflicts.length) {
        r.merge = theirs; r.index = Object.assign({}, files);
        return conflicts.map((f) => `Auto-merging ${f}\nCONFLICT (content): Merge conflict in ${f}`).join("\n") + "\nAutomatic merge failed; fix conflicts and then commit the result.";
      }
      r.index = files; const id = commit(r, `Merge branch '${name}'`, files, [ours, theirs]); r.branches[r.head] = id;
      return `Merge made by the 'ort' strategy.`;
    }
    if (sub === "diff") {
      const out = [];
      Object.keys(work).forEach((f) => { if (f in r.index && work[f] !== r.index[f]) { out.push(`--- a/${f}\n+++ b/${f}`); r.index[f].split("\n").forEach((l) => { if (l && !work[f].split("\n").includes(l)) out.push("-" + l); }); work[f].split("\n").forEach((l) => { if (l && !r.index[f].split("\n").includes(l)) out.push("+" + l); }); } });
      return out.join("\n");
    }
    return `git: '${sub}' is not supported here. Доступно: init, status, add, commit, log, branch, switch, checkout, merge, diff`;
  }

  // ---------------------------------------------------------------- команды

  function tokens(line) {
    const out = []; let cur = "", q = null, has = false;
    for (const ch of line) {
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === "'" || ch === '"') { q = ch; has = true; continue; }
      if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ""; has = false; continue; }
      cur += ch;
    }
    if (cur || has) out.push(cur);
    // * в путях: разворачиваем по файловой системе
    return out.flatMap((t) => {
      if (!t.includes("*")) return [t];
      const full = resolve(t), dir = full.slice(0, full.lastIndexOf("/")) || "/", re = new RegExp("^" + base(full).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      const hits = FS[dir] ? children(dir).filter((p) => re.test(base(p))) : [];
      return hits.length ? hits.map((p) => (t.startsWith("/") ? p : t.includes("/") ? t.slice(0, t.lastIndexOf("/") + 1) + base(p) : base(p))) : [t];
    });
  }
  const flags = (args) => { const f = new Set(), rest = []; args.forEach((a) => { if (/^-[a-zA-Z]+$/.test(a)) a.slice(1).split("").forEach((c) => f.add(c)); else rest.push(a); }); return [f, rest]; };
  const readFile = (p) => { const r = resolve(p); if (!FS[r]) throw `${p}: No such file or directory`; if (FS[r].dir) throw `${p}: Is a directory`; return FS[r].content; };
  const lines = (s) => s.replace(/\n$/, "").split("\n").filter((x, i, a) => !(x === "" && a.length === 1));

  const CMD = {
    help: () => "Команды: ls cd pwd cat head tail grep wc sort uniq awk echo touch mkdir rm mv cp chmod find du df free ps top kill whoami history clear\nА ещё: git (init/status/add/commit/log/branch/switch/merge/diff), systemctl status, ./скрипт, answer <ответ>\nКонвейеры | и перенаправление > >> работают.",
    pwd: () => cwd,
    whoami: () => "student",
    hostname: () => "shop-prod-1",
    clear: () => { out.innerHTML = ""; return ""; },
    history: () => history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n"),
    cd: (a) => { const p = resolve(a[0] || "~"); if (!FS[p]) throw `cd: ${a[0]}: No such file or directory`; if (!FS[p].dir) throw `cd: ${a[0]}: Not a directory`; cwd = p; return ""; },
    ls: (a) => {
      const [f, rest] = flags(a); const targets = rest.length ? rest : ["."];
      return targets.map((t) => {
        const p = resolve(t); if (!FS[p]) throw `ls: cannot access '${t}': No such file or directory`;
        const items = FS[p].dir ? children(p).filter((c) => f.has("a") || !base(c).startsWith(".")) : [p];
        const row = (c) => f.has("l") ? `${modeStr(FS[c])} 1 student student ${String(f.has("h") ? human(sizeOf(c)) : sizeOf(c)).padStart(8)} Oct 28 10:00 ${base(c)}${FS[c].dir ? "/" : ""}` : base(c) + (FS[c].dir ? "/" : "");
        const listing = (f.has("a") && FS[p].dir ? [".", ".."].map((x) => f.has("l") ? `drwxr-xr-x 1 student student     4096 Oct 28 10:00 ${x}` : x) : []).concat(items.map(row));
        return (targets.length > 1 ? t + ":\n" : "") + (f.has("l") ? listing.join("\n") : listing.join("  "));
      }).join("\n\n");
    },
    cat: (a, inp) => a.length ? a.map(readFile).join("") : inp,
    head: (a, inp) => { const [n, files] = num(a, 10); return lines(files.length ? readFile(files[0]) : inp).slice(0, n).join("\n"); },
    tail: (a, inp) => { const [n, files] = num(a.filter((x) => x !== "-f"), 10); return lines(files.length ? readFile(files[0]) : inp).slice(-n).join("\n"); },
    wc: (a, inp) => { const [f, files] = flags(a); const t = files.length ? readFile(files[0]) : inp; const n = lines(t).filter((x) => x !== "" || t).length; return f.has("l") || !f.size ? `${t ? n : 0}${files[0] ? " " + files[0] : ""}` : ""; },
    grep: (a, inp) => {
      const [f, rest] = flags(a); const pat = rest[0]; if (pat === undefined) throw "usage: grep [-icnvr] PATTERN [FILE...]";
      let re; try { re = new RegExp(pat, f.has("i") ? "i" : ""); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), f.has("i") ? "i" : ""); }
      let files = rest.slice(1);
      if (f.has("r")) files = files.flatMap((x) => { const p = resolve(x || "."); return FS[p] && FS[p].dir ? Object.keys(FS).filter((k) => k.startsWith(p + "/") && !FS[k].dir) : [x]; });
      const src = files.length ? files.map((x) => [x, readFile(x)]) : [[null, inp]];
      const res = [];
      src.forEach(([name, text]) => {
        const hits = lines(text).map((l, i) => [l, i + 1]).filter(([l]) => re.test(l) !== f.has("v"));
        if (f.has("c")) res.push((src.length > 1 ? name + ":" : "") + hits.length);
        else hits.forEach(([l, i]) => res.push((src.length > 1 ? short(resolve(name)) + ":" : "") + (f.has("n") ? i + ":" : "") + l));
      });
      return res.join("\n");
    },
    sort: (a, inp) => {
      let key = 0; const ki = a.findIndex((x) => /^-k\d*$/.test(x));
      if (ki >= 0) { key = parseInt(a[ki].slice(2) || a[ki + 1], 10) - 1; a = a.filter((_, i) => i !== ki && !(a[ki] === "-k" && i === ki + 1)); }
      const [f, files] = flags(a); let l = lines(files.length ? readFile(files[0]) : inp);
      const field = (x) => key > 0 ? (x.trim().split(/\s+/)[key] || "") : x;
      const val = (x) => { const m = field(x).trim().match(/^([\d.]+)([KMG]?)/); return m ? parseFloat(m[1]) * ({ K: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1) : 0; };
      l = f.has("n") || f.has("h") ? l.sort((x, y) => val(x) - val(y)) : l.sort((x, y) => field(x) < field(y) ? -1 : field(x) > field(y) ? 1 : 0);
      return (f.has("r") ? l.reverse() : l).join("\n");
    },
    uniq: (a, inp) => { const [f] = flags(a); const o = []; lines(inp).forEach((x) => { const last = o[o.length - 1]; if (last && last[1] === x) last[0]++; else o.push([1, x]); }); return o.map(([n, x]) => f.has("c") ? `${String(n).padStart(7)} ${x}` : x).join("\n"); },
    awk: (a, inp) => {
      const prog = a[0] || "", m = prog.match(/^\{\s*print\s+(.+?)\s*\}$/); if (!m) throw "awk: здесь поддерживается только '{print $N}'";
      const text = a[1] ? readFile(a[1]) : inp;
      return lines(text).map((l) => { const f = l.trim().split(/\s+/); return m[1].split(/\s*,\s*/).map((x) => x === "$0" ? l : f[parseInt(x.slice(1), 10) - 1] || "").join(" "); }).join("\n");
    },
    echo: (a) => a.join(" "),
    touch: (a) => { a.forEach((x) => { const p = resolve(x); if (!FS[p]) FS[p] = { content: "", mode: 0o644 }; }); return ""; },
    mkdir: (a) => { const [f, rest] = flags(a); rest.forEach((x) => { const p = resolve(x); const parent = p.slice(0, p.lastIndexOf("/")) || "/"; if (!FS[parent] && !f.has("p")) throw `mkdir: cannot create directory '${x}': No such file or directory`; let acc = ""; p.split("/").filter(Boolean).forEach((s) => { acc += "/" + s; if (!FS[acc]) FS[acc] = { dir: true }; }); }); return ""; },
    rm: (a) => {
      const [f, rest] = flags(a);
      rest.forEach((x) => {
        const p = resolve(x);
        if (!FS[p]) { if (!f.has("f")) throw `rm: cannot remove '${x}': No such file or directory`; return; }
        if (p === "/" || p === HOME) throw "rm: отказано — это учебный сервер, но привычку лучше не заводить 🙂";
        if (FS[p].dir && !f.has("r")) throw `rm: cannot remove '${x}': Is a directory`;
        Object.keys(FS).forEach((k) => { if (k === p || k.startsWith(p + "/")) delete FS[k]; });
      });
      return "";
    },
    mv: (a) => { const [src, dst] = a; const s = resolve(src); if (!FS[s]) throw `mv: cannot stat '${src}'`; let d = resolve(dst); if (FS[d] && FS[d].dir) d += "/" + base(s); Object.keys(FS).forEach((k) => { if (k === s || k.startsWith(s + "/")) { FS[d + k.slice(s.length)] = FS[k]; delete FS[k]; } }); return ""; },
    cp: (a) => { const [src, dst] = a.filter((x) => !x.startsWith("-")); const s = resolve(src); if (!FS[s] || FS[s].dir) throw `cp: cannot stat '${src}'`; let d = resolve(dst); if (FS[d] && FS[d].dir) d += "/" + base(s); FS[d] = Object.assign({}, FS[s]); return ""; },
    chmod: (a) => {
      const [m, ...files] = a; if (!files.length) throw "usage: chmod MODE FILE";
      files.forEach((x) => {
        const p = resolve(x); if (!FS[p]) throw `chmod: cannot access '${x}': No such file or directory`;
        const e = FS[p], cur = e.mode || (e.dir ? 0o755 : 0o644);
        if (/^[0-7]{3}$/.test(m)) e.mode = parseInt(m, 8);
        else { const mm = m.match(/^([ugoa]*)([+-])([rwx]+)$/); if (!mm) throw `chmod: invalid mode: '${m}'`; const who = mm[1] || "a"; let bits = 0; mm[3].split("").forEach((c) => { const v = { r: 4, w: 2, x: 1 }[c]; if (/[ua]/.test(who)) bits |= v << 6; if (/[ga]/.test(who)) bits |= v << 3; if (/[oa]/.test(who)) bits |= v; }); e.mode = mm[2] === "+" ? cur | bits : cur & ~bits; }
      });
      return "";
    },
    find: (a) => {
      const start = resolve(a[0] && !a[0].startsWith("-") ? a[0] : "."), ni = a.indexOf("-name"), ti = a.indexOf("-type"), si = a.indexOf("-size");
      const re = ni >= 0 ? new RegExp("^" + a[ni + 1].replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$") : null;
      const min = si >= 0 ? parseFloat(a[si + 1]) * ({ k: 1024, M: 1048576, G: 1073741824 }[a[si + 1].slice(-1)] || 1) : 0;
      return Object.keys(FS).filter((k) => (k === start || k.startsWith(start === "/" ? "/" : start + "/")) && (!re || re.test(base(k))) && (ti < 0 || (a[ti + 1] === "d") === !!FS[k].dir) && (!min || (!FS[k].dir && sizeOf(k) > min))).sort().map((k) => a[0] && !a[0].startsWith("-") ? (a[0].startsWith("/") ? k : a[0].replace(/\/$/, "") + k.slice(start.length)) : "." + k.slice(start.length)).join("\n");
    },
    du: (a) => { const [, rest] = flags(a); return (rest.length ? rest : ["."]).map((x) => { const p = resolve(x); if (!FS[p]) throw `du: cannot access '${x}'`; return `${human(sizeOf(p))}\t${x}`; }).join("\n"); },
    df: () => { const u = diskUsed(); return `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G  ${human(u).padStart(4)}  ${human(DISK - u).padStart(4)}  ${Math.round((u / DISK) * 100)}% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm`; },
    free: () => "               total        used        free      shared  buff/cache   available\nMem:           7.7Gi       2.1Gi       3.2Gi        12Mi       2.4Gi       5.3Gi\nSwap:          2.0Gi          0B       2.0Gi",
    uptime: () => ` 10:41:07 up 12 days,  3:02,  1 user,  load average: ${PROCS.some((p) => p.pid === 4242) ? "1.98, 1.95, 1.90" : "0.21, 0.35, 0.80"}`,
    ps: () => "USER         PID %CPU %MEM COMMAND\n" + PROCS.map((p) => `${p.user.padEnd(10)} ${String(p.pid).padStart(5)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${p.cmd}`).join("\n"),
    top: () => "top - 10:41:07 up 12 days, load average: " + (PROCS.some((p) => p.pid === 4242) ? "1.98" : "0.21") + "\n  PID USER       %CPU %MEM COMMAND\n" + PROCS.slice().sort((x, y) => y.cpu - x.cpu).map((p) => `${String(p.pid).padStart(5)} ${p.user.padEnd(10)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${p.cmd.split(" ")[0]}`).join("\n") + "\n(в настоящем top экран обновляется, выход — q)",
    kill: (a) => { const pid = parseInt(a.filter((x) => !x.startsWith("-"))[0], 10); const p = PROCS.find((x) => x.pid === pid); if (!p) throw `kill: (${a[a.length - 1]}) - No such process`; if (pid === 1) throw "kill: (1) - Operation not permitted"; PROCS = PROCS.filter((x) => x !== p); return ""; },
    systemctl: (a) => { const svc = a[1] || ""; if (a[0] === "status") return svc.startsWith("nginx") ? "● nginx.service - A high performance web server\n     Active: active (running) since Mon 2026-10-16; 12 days ago\n   Main PID: 812 (nginx)" : `Unit ${svc}.service could not be found.`; if (["restart", "reload", "start", "stop"].includes(a[0])) return "==== AUTHENTICATING FOR org.freedesktop.systemd1.manage-units ====\n(на учебном сервере нужен sudo — и он здесь не нужен для заданий)"; throw "usage: systemctl status|restart SERVICE"; },
    journalctl: () => "Oct 28 10:02:01 shop-prod-1 nginx[813]: upstream timed out while reading response header",
    sudo: (a) => run1(a, ""),
    git: (a) => git(a),
    answer: (a) => { lastAnswer = a.join(" ").trim(); return lastAnswer ? `Ответ принят: ${lastAnswer}` : "Напиши ответ после answer, например: answer 42"; },
  };
  function num(a, d) { const i = a.indexOf("-n"); if (i >= 0) return [parseInt(a[i + 1], 10), a.filter((_, k) => k !== i && k !== i + 1)]; const m = a.find((x) => /^-\d+$/.test(x)); return m ? [parseInt(m.slice(1), 10), a.filter((x) => x !== m)] : [d, a]; }
  let lastAnswer = null;

  function run1(argv, input) {
    const [name, ...args] = argv;
    if (!name) return input;
    if (name.startsWith("./") || name.startsWith("/") && FS[resolve(name)] && !FS[resolve(name)].dir) {
      const p = resolve(name); if (!FS[p]) throw `${name}: No such file or directory`;
      if (!((FS[p].mode || 0o644) & 0o100)) throw `-bash: ${name}: Permission denied`;
      ran.add(p); return FS[p].content.includes("Deploying") ? "Deploying shop...\n✓ готово" : "";
    }
    const fn = CMD[name];
    if (!fn) throw `${name}: command not found`;
    return fn(args, input);
  }
  function exec(line) {
    let redirect = null, append = false;
    const m = line.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);
    if (m && !/['"]/.test(m[3])) { line = m[1]; append = m[2] === ">>"; redirect = m[3]; }
    // делим по | вне кавычек
    const parts = []; let cur = "", q = null;
    for (const ch of line) { if (q) { if (ch === q) q = null; cur += ch; } else if (ch === "'" || ch === '"') { q = ch; cur += ch; } else if (ch === "|") { parts.push(cur); cur = ""; } else cur += ch; }
    parts.push(cur);
    let data = "";
    for (const part of parts) data = String(run1(tokens(part.trim()), data) ?? "");
    if (redirect) {
      const p = resolve(redirect), text = data ? data.replace(/\n?$/, "\n") : "";
      if (FS[p] && FS[p].dir) throw `-bash: ${redirect}: Is a directory`;
      FS[p] = Object.assign(FS[p] || { mode: 0o644 }, { content: append && FS[p] ? FS[p].content + text : text });
      delete FS[p].size;
      return "";
    }
    return data;
  }

  // ---------------------------------------------------------------- квесты

  const count500 = () => accessLog().split("\n").filter((l) => / 500 /.test(l)).length;
  const topIp = () => { const c = {}; accessLog().trim().split("\n").forEach((l) => { const ip = l.split(" ")[0]; c[ip] = (c[ip] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };
  const QUESTS = [
    { id: "nav", title: "Осмотрись", task: "Перейди в каталог с логами nginx и посмотри, какие там файлы.", hint: "cd /var/log/nginx, затем ls -l", test: (c) => cwd === "/var/log/nginx" && /^ls\b/.test(c) },
    { id: "500", title: "Ошибки в логе", task: "Сколько запросов в access.log закончились кодом 500? Ответь командой answer.", hint: "grep -c ' 500 ' /var/log/nginx/access.log", test: () => lastAnswer === String(count500()) },
    { id: "ip", title: "Самый активный клиент", task: "Какой IP сделал больше всего запросов? Ответь командой answer.", hint: "awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -1", test: () => lastAnswer === topIp() },
    { id: "disk", title: "Диск забит", task: "df -h показывает почти 100%. Найди самый большой файл в /var/log и удали его.", hint: "du -sh /var/log/* и du -sh /var/log/app/* — затем rm", test: () => !FS["/var/log/app/debug.log"] },
    { id: "miner", title: "Чужой процесс", task: "Сервер тормозит. Найди процесс, который съел CPU, и заверши его.", hint: "ps aux или top, затем kill PID", test: () => !PROCS.some((p) => p.pid === 4242) },
    { id: "chmod", title: "Скрипт не запускается", task: "Сделай ~/deploy.sh исполняемым и запусти его.", hint: "chmod +x ~/deploy.sh, затем cd ~ и ./deploy.sh", test: () => ran.has(HOME + "/deploy.sh") },
    { id: "repo", title: "Первый коммит", task: "В ~/project создай git-репозиторий, добавь файл README.md и закоммить его.", hint: "cd ~/project · git init · echo '# Project' > README.md · git add README.md · git commit -m 'init'", test: () => { const r = REPOS[HOME + "/project"]; return !!(r && r.branches.main && "README.md" in r.commits[r.branches.main].files); } },
    { id: "merge", title: "Конфликт слияния", task: "В ~/shop влей ветку feature в main. Будет конфликт: оставь port=8080 и заверши слияние коммитом.", hint: "cd ~/shop · git merge feature · cat config.txt · echo 'port=8080' > config.txt · echo 'workers=2' >> config.txt · git add config.txt · git commit -m 'merge feature'", test: () => { const r = REPOS[HOME + "/shop"]; if (!r) return false; const c = r.commits[r.branches.main]; return c.parents.length === 2 && /port=8080/.test(c.files["config.txt"]) && !/<<<|>>>|===/.test(c.files["config.txt"]); } },
  ];
  const solvedStore = () => { if (!window.APP) return {}; const s = APP.state(); s.games = s.games || {}; s.games.term = s.games.term || {}; return s.games.term; };
  let solvedNow = new Set();
  function checkQuests(cmd) {
    QUESTS.forEach((q) => {
      if (solvedNow.has(q.id) || !q.test(cmd)) return;
      solvedNow.add(q.id);
      if (window.APP) APP.track("lab");
      print(`✓ Задание «${q.title}» выполнено`, "t-ok");
      const st = solvedStore();
      if (window.APP && !st[q.id]) { st[q.id] = 1; APP.addXP(10, `терминал: ${q.title}`); }
      drawQuests();
    });
  }

  // ---------------------------------------------------------------- интерфейс

  root.innerHTML = `<div class="term-grid"><div class="term-box"><div class="term-bar"><span></span><span></span><span></span><b>student@shop-prod-1</b></div>
      <div class="term-out" id="t-out"></div>
      <label class="term-in"><span class="term-ps" id="t-ps"></span><input id="t-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Команда"></label></div>
    <div class="term-quests"><div class="ex-col-title">Задания</div><ol id="t-quests"></ol>
      <button type="button" class="btn btn-ghost" id="t-reset">↺ Сбросить сервер</button>
      <p class="k8s-hint">Это учебная имитация Linux: ничего не сломаешь. Стрелки ↑↓ — история команд, Tab — дополнение имени файла, <code>help</code> — список команд.</p></div></div>`;
  const out = root.querySelector("#t-out"), input = root.querySelector("#t-input"), ps = root.querySelector("#t-ps");
  const prompt = () => `student@shop-prod-1:${short(cwd)}$`;
  function print(text, cls) { if (text === "") return; const el = document.createElement("div"); el.className = cls || ""; el.textContent = text; out.appendChild(el); out.scrollTop = out.scrollHeight; }
  function drawQuests() {
    const st = solvedStore();
    root.querySelector("#t-quests").innerHTML = QUESTS.map((q) => `<li class="${solvedNow.has(q.id) ? "done" : st[q.id] ? "was" : ""}"><b>${esc(q.title)}</b><span>${esc(q.task)}</span><details><summary>подсказка</summary><code>${esc(q.hint)}</code></details></li>`).join("");
  }
  function boot() {
    fresh(); solvedNow = new Set(); lastAnswer = null; out.innerHTML = "";
    print("Добро пожаловать на shop-prod-1 (Ubuntu 24.04 LTS) — учебный сервер.", "t-dim");
    print("Справа задания. Набери help, чтобы увидеть команды.", "t-dim");
    ps.textContent = prompt(); drawQuests();
  }
  let hpos = 0;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const line = input.value; input.value = "";
      print(`${prompt()} ${line}`, "t-cmd");
      if (line.trim()) { history.push(line); hpos = history.length; }
      try { const res = line.trim() ? exec(line.trim()) : ""; print(res); }
      catch (err) { print(typeof err === "string" ? err : "ошибка: " + err.message, "t-err"); }
      ps.textContent = prompt();
      checkQuests(line.trim());
    } else if (e.key === "ArrowUp") { e.preventDefault(); if (hpos > 0) input.value = history[--hpos]; }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (hpos < history.length - 1) input.value = history[++hpos]; else { hpos = history.length; input.value = ""; } }
    else if (e.key === "Tab") {
      e.preventDefault();
      const parts = input.value.split(" "), last = parts.pop(), full = resolve(last || "."), dir = last.includes("/") ? full.slice(0, full.lastIndexOf("/")) || "/" : cwd;
      const pre = last.includes("/") ? last.slice(last.lastIndexOf("/") + 1) : last;
      const hits = FS[dir] ? children(dir).map(base).filter((n) => n.startsWith(pre)) : [];
      if (hits.length === 1) { const p = (last.includes("/") ? last.slice(0, last.lastIndexOf("/") + 1) : "") + hits[0]; input.value = [...parts, p + (FS[(dir === "/" ? "" : dir) + "/" + hits[0]].dir ? "/" : "")].join(" "); }
      else if (hits.length > 1) print(hits.join("  "), "t-dim");
    } else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
  });
  root.querySelector(".term-box").addEventListener("click", () => { if (!window.getSelection().toString()) input.focus(); });
  root.querySelector("#t-reset").onclick = () => { boot(); input.focus(); };
  boot();
})();
