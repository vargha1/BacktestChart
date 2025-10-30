import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // log to server console for debugging
    console.debug("[DEV-LOG]", JSON.stringify(body));
  } catch (err) {
    console.debug("[DEV-LOG] failed to parse body", err);
  }
  return NextResponse.json({ ok: true });
}
