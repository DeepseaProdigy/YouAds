import { NextResponse } from "next/server";

import { getSession } from "@/lib/ads/store";

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
  if (session.status !== "active") {
    return NextResponse.json(
      { error: "Ad session is not active" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { transition_prompt: session.transition_prompt },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
