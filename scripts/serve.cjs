#!/usr/bin/env node
/** Production: inference API + Next.js (honours PORT for Render/Railway/Fly). */
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const py = process.env.PYTHON || "python3";
const webPort = process.env.PORT || "47281";
const mlPort = process.env.ML_PORT || "8765";

function run(cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ML_API_URL: process.env.ML_API_URL || `http://127.0.0.1:${mlPort}` },
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
  "127.0.0.1",
  "--port",
  mlPort,
]);

const web = run("npx", ["next", "start", "--hostname", "0.0.0.0", "--port", webPort]);

function shutdown() {
  try {
    if (ml.pid) process.kill(ml.pid);
  } catch {
    /* already gone */
  }
  try {
    if (web.pid) process.kill(web.pid);
  } catch {
    /* already gone */
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

console.log(`ABYSS public site: http://0.0.0.0:${webPort}`);
