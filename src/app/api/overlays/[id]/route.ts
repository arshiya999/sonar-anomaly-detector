import { existsSync, readFileSync } from "fs";
import { overlayFilePath } from "@/lib/log-store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[\w-]+$/.test(id)) {
    return new Response("Bad overlay id", { status: 400 });
  }
  const file = overlayFilePath(id);
  if (!existsSync(file)) {
    return new Response("Overlay not found", { status: 404 });
  }
  return new Response(readFileSync(file), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
