import { NextResponse } from "next/server";
import { startSessionOrbisStream } from "@/lib/ads/orbis-service";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await startSessionOrbisStream((await params).id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
