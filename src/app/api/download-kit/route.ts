import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const file = path.join(process.cwd(), "public", "aqua-vision-check-kit.zip");
  const buf = await readFile(file);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="aqua-vision-check-kit.zip"',
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
