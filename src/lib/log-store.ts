import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { ScanLogEntry } from "@/lib/types";

const DIR = join(process.cwd(), "data");
const FILE = join(DIR, "survey-log.json");
const OVERLAY_DIR = join(DIR, "overlays");

export function overlayFilePath(id: string): string {
  return join(OVERLAY_DIR, `${id}.jpg`);
}

export function saveOverlayJpeg(id: string, b64: string | null | undefined): string | null {
  if (!b64?.trim()) return null;
  mkdirSync(OVERLAY_DIR, { recursive: true });
  writeFileSync(overlayFilePath(id), Buffer.from(b64, "base64"));
  return `/api/overlays/${id}`;
}

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
