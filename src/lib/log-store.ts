import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { ScanLogEntry } from "@/lib/types";

const DIR = join(process.cwd(), "data");
const FILE = join(DIR, "survey-log.json");

function ensure() {
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(FILE)) writeFileSync(FILE, "[]\n");
}

export function readLog(): ScanLogEntry[] {
  ensure();
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as ScanLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendLog(entry: ScanLogEntry): ScanLogEntry[] {
  const rows = readLog();
  rows.unshift(entry);
  writeFileSync(FILE, JSON.stringify(rows.slice(0, 500), null, 2) + "\n");
  return rows;
}
