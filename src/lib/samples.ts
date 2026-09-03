import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { SampleItem } from "@/lib/types";

export function loadSamples(): SampleItem[] {
  const dir = join(process.cwd(), "public", "samples");
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as SampleItem[];
    return parsed.filter((item) => existsSync(join(dir, item.file)));
  }
  return readdirSync(dir)
    .filter((name) => /\.(jpg|jpeg|png|webp)$/i.test(name))
    .map((file) => ({
      file,
      meta: file.replace(/\.[^.]+$/, ".meta.json"),
      example_class: "debris",
    }));
}
