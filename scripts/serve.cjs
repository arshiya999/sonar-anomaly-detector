#!/usr/bin/env node
/** Production: YOLO + ops API (if DATABASE_URL) + Next.js. Honours PORT. */
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const py = process.env.PYTHON || "python3";
const webPort = process.env.PORT || "47281";
const mlPort = process.env.ML_PORT || "8765";
const opsPort = process.env.OPS_PORT || "8766";
const children = [];

function run(cmd, args, extra = {}) {
  const child = spawn(cmd, args, {
    cwd: extra.cwd || root,
    stdio: "inherit",
    env: { ...process.env, ...extra.env },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code);
  });
  return child;
}

run(py, ["-m", "uvicorn", "--app-dir", "ml", "server:app", "--host", "127.0.0.1", "--port", mlPort], {
  env: { ML_API_URL: process.env.ML_API_URL || `http://127.0.0.1:${mlPort}` },
});

if (process.env.DATABASE_URL) {
  run(py, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", opsPort], {
    cwd: path.join(root, "backend"),
    env: { PYTHONPATH: path.join(root, "backend") },
  });
}

run("npx", ["next", "start", "--hostname", "0.0.0.0", "--port", webPort], {
  env: {
    ML_API_URL: process.env.ML_API_URL || `http://127.0.0.1:${mlPort}`,
    OPS_API_URL: process.env.OPS_API_URL || `http://127.0.0.1:${opsPort}`,
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

console.log(`Aqua Vision: http://0.0.0.0:${webPort}`);
