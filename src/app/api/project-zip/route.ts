import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME = "aqua-vision-sih26057.zip";

function candidates() {
  const root = process.cwd();
  return [
    path.join(root, NAME),
    path.join(root, "public", NAME),
  ];
}

async function zipPath() {
  for (const file of candidates()) {
    try {
      await access(file);
      return file;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET() {
  const file = await zipPath();
  if (!file) {
    return new Response("Zip is missing. Ask the operator to rebuild aqua-vision-sih26057.zip.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const info = await stat(file);
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${NAME}"`,
      "Content-Length": String(info.size),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
