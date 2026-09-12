import { NextResponse } from "next/server";

import {
  deleteResumeFrame,
  getSession,
  updateSession,
} from "@/lib/ads/store";
import { stopSessionOrbisStream } from "@/lib/ads/orbis-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "Ad session not found" },
      { status: 404 },
    );
  }

  // Finish is a safety net as well as an audit update: a browser can unload
  // before its explicit /orbis/stop call reaches us.
  await stopSessionOrbisStream(id).catch(() => undefined);
  await deleteResumeFrame(session.resume_frame_path);
  updateSession(id, {
    status: "finished",
    resume_frame_path: null,
  });

  return NextResponse.json(
    { ok: true as const },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
