import { NextResponse } from "next/server";

import {
  extractYoutubeFrame,
  fetchYoutubeThumbnail,
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

  let source: "stream" | "thumbnail" = "thumbnail";
  let bytes: Buffer;
  let extractError = "";

  if (wantExtract) {
    try {
      const extracted = await extractYoutubeFrame({
        videoId,
        timestampSeconds,
      });
      bytes = extracted.bytes;
      source = "stream";
    } catch (caught) {
      extractError =
        caught instanceof Error ? caught.message : String(caught);
      console.warn(
        "[resume-frame] stream extract failed, using thumbnail:",
        extractError,
      );
      bytes = await fetchYoutubeThumbnail(videoId);
      source = "thumbnail";
    }
  } else {
    bytes = await fetchYoutubeThumbnail(videoId);
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store, max-age=0",
      "X-Resume-Frame-Source": source,
      ...(extractError
        ? { "X-Resume-Frame-Extract-Error": extractError.slice(0, 200) }
        : {}),
    },
  });
}
