import { loadSamples } from "@/lib/samples";

export async function GET() {
  return Response.json(loadSamples());
}
