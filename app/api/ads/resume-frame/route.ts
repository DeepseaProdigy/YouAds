import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId")?.trim();
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json(
      { error: "Invalid videoId" },
      { status: 400 },
    );
  }

  const candidates = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];

  let lastError = "Could not fetch thumbnail";
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = `Thumbnail HTTP ${response.status}`;
        continue;
      }
      const bytes = await response.arrayBuffer();
      // YouTube sometimes returns a tiny placeholder for missing maxres.
      if (bytes.byteLength < 2_000) {
        lastError = "Thumbnail too small; trying fallback";
        continue;
      }
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch (caught) {
      lastError =
        caught instanceof Error ? caught.message : String(caught);
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
