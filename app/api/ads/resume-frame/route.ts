import { NextResponse } from "next/server";

import {
  extractYoutubeFrame,
} from "@/lib/ads/extract-frame";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId")?.trim();
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json(
      { error: "Invalid videoId" },
      { status: 400 },
    );
  }

  const rawT = searchParams.get("t");
  const timestampSeconds =
    rawT !== null && rawT !== "" ? Number(rawT) : NaN;
  const wantExtract =
    Number.isFinite(timestampSeconds) && timestampSeconds >= 0;

  if (!wantExtract) {
    return NextResponse.json(
      { error: "A paused-video timestamp is required to capture a resume frame" },
      { status: 400 },
    );
  }

  try {
    const extracted = await extractYoutubeFrame({ videoId, timestampSeconds });
    return new NextResponse(new Uint8Array(extracted.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, max-age=0",
        "X-Resume-Frame-Source": extracted.source,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[resume-frame] exact frame extraction failed:", detail);
    return NextResponse.json(
      { error: `Could not capture the paused video frame: ${detail}` },
      { status: 502 },
    );
  }
}
