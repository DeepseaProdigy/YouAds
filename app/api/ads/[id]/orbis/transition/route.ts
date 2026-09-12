import { NextResponse } from "next/server";
import { getSession } from "@/lib/ads/store";
import { transitionSessionOrbisStream } from "@/lib/ads/orbis-service";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    await transitionSessionOrbisStream(id);
    const session = getSession(id);
    return NextResponse.json({ stream_id: session?.orbis_stream_id, status: "transitioning", frames_url: "" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
