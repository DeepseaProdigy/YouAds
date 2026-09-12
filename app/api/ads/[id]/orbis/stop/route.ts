import { NextResponse } from "next/server";
import { stopSessionOrbisStream } from "@/lib/ads/orbis-service";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await stopSessionOrbisStream((await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
