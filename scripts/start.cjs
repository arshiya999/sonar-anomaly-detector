#!/usr/bin/env node
/**
 * Start inference API + Next.js dashboard (Windows / macOS / Linux).
 */
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const port = process.env.PORT || "47281";
const mlPort = process.env.ML_PORT || "8765";

function run(cmd, args, extra = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extra.env },
  });
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code);
  });
  return child;
}

const ml = run(py, [
  "-m",
  "uvicorn",
  "--app-dir",
  "ml",
  "server:app",
  "--host",
  "0.0.0.0",
  "--port",
  mlPort,
]);

const web = run("npx", ["next", "dev", "--hostname", "0.0.0.0", "--port", port]);

function shutdown() {
  if (ml.pid) process.kill(ml.pid);
  if (web.pid) process.kill(web.pid);
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

console.log(`\nABYSS dashboard:  http://127.0.0.1:${port}`);
console.log(`Inference API:    http://127.0.0.1:${mlPort}/health\n`);
