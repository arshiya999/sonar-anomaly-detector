#!/usr/bin/env node
/**
 * Start YOLO API + ops API (PostgreSQL) + Next.js dashboard.
 */
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const port = process.env.PORT || "47281";
const mlPort = process.env.ML_PORT || "8765";
const opsPort = process.env.OPS_PORT || "8766";

const children = [];

function run(cmd, args, extra = {}) {
  const child = spawn(cmd, args, {
    cwd: extra.cwd || root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extra.env },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code);
  });
  return child;
}

run(py, ["-m", "uvicorn", "--app-dir", "ml", "server:app", "--host", "0.0.0.0", "--port", mlPort]);
run(py, ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", opsPort], {
  cwd: path.join(root, "backend"),
  env: { PYTHONPATH: path.join(root, "backend") },
});
run("npx", ["next", "dev", "--hostname", "0.0.0.0", "--port", port], {
  env: {
    ML_API_URL: `http://127.0.0.1:${mlPort}`,
    OPS_API_URL: `http://127.0.0.1:${opsPort}`,
  },
});

function shutdown() {
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(child.pid);
      } catch {
        /* already gone */
      }
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

console.log(`\nAqua Vision dashboard: http://127.0.0.1:${port}`);
console.log(`YOLO inference:       http://127.0.0.1:${mlPort}/health`);
console.log(`Ops / PostgreSQL API: http://127.0.0.1:${opsPort}/api/system/status\n`);
