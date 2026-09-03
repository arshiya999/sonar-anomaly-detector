import { NextRequest } from "next/server";

const ML = process.env.ML_API_URL ?? "http://127.0.0.1:8765";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const res = await fetch(`${ML}/detect`, { method: "POST", body: form });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
