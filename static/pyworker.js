/* DevOps-маршрут: Python (Pyodide) в отдельном потоке, чтобы бесконечный цикл не вешал страницу. */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

let ready = null;
function boot() {
  if (!ready) ready = loadPyodide({ indexURL: PYODIDE });
  return ready;
}

// Запуск кода ученика; при проверке — ещё и тесты в его пространстве имён.
const HARNESS = `
import traceback
ns = {"__name__": "__main__"}
results = []
error = None
try:
    if SETUP:
        exec(SETUP, ns)
    exec(compile(USER_CODE, "main.py", "exec"), ns)
    if "__await__" in ns:
        await ns.pop("__await__")
except BaseException:
    error = traceback.format_exc(limit=-3).replace('File "<exec>", ', "")
if error is None and CASES:
    for expr, expect in CASES:
        want = eval(expect)
        try:
            got = eval(expr, ns)
            results.append((expr, repr(got), expect, got == want))
        except BaseException as e:
            results.append((expr, f"{type(e).__name__}: {e}", expect, False))
(error, results)
`;

self.onmessage = async (e) => {
  const { id, code, setup, cases } = e.data;
  let out = "";
  try {
    const py = await boot();
    py.setStdout({ batched: (s) => { out += s + "\n"; } });
    py.setStderr({ batched: (s) => { out += s + "\n"; } });
    // asyncio.run() внутри Pyodide не работает (цикл событий уже запущен) — выполняем корутину через await
    const user = code.replace(/^asyncio\.run\((.*)\)\s*$/m, "__await__ = $1");
    py.globals.set("USER_CODE", user);
    py.globals.set("SETUP", setup || "");
    py.globals.set("CASES", py.toPy(cases || []));
    const res = (await py.runPythonAsync(HARNESS)).toJs();
    self.postMessage({ id, out, error: res[0] || null, results: res[1] || [] });
  } catch (err) {
    self.postMessage({ id, out, error: String(err && err.message || err), results: [] });
  }
};
self.postMessage({ hello: true });
