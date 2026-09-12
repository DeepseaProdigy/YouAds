import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AD_SECONDS } from "@/lib/ads/constants";
import {
  buildTransitionPrompt,
  selectAdPrompt,
} from "@/lib/ads/prompt-bank";
import {
  getActiveSessionCount,
  putSession,
  saveResumeFrame,
} from "@/lib/ads/store";
import type { StartAdRequest } from "@/lib/ads/types";

export async function POST(request: Request) {
  try {
    if (getActiveSessionCount() > 0) {
      return NextResponse.json(
        { error: "An ad session is already active" },
        { status: 409 },
      );
    }

    const body = (await request.json()) as StartAdRequest;
    const videoId = body.youtube_video_id?.trim();
    const resumeAt = body.resume_timestamp_seconds;

    if (!videoId) {
      return NextResponse.json(
        { error: "youtube_video_id is required" },
        { status: 400 },
      );
    }
    if (typeof resumeAt !== "number" || Number.isNaN(resumeAt)) {
      return NextResponse.json(
        { error: "resume_timestamp_seconds is required" },
        { status: 400 },
      );
    }

    const prompt = selectAdPrompt(body.targeting_context);
    if (!prompt) {
      return NextResponse.json(
        { error: "No eligible ad prompt in the bank" },
        { status: 503 },
      );
    }

    let framePath: string | null = null;
    if (body.resume_frame_base64) {
      framePath = await saveResumeFrame(body.resume_frame_base64);
    }

    const id = randomUUID();
    putSession({
      id,
      youtube_video_id: videoId,
      resume_timestamp_seconds: resumeAt,
      resume_frame_path: framePath,
      prompt_id: prompt.id,
      prompt_version: prompt.version,
      prompt: prompt.prompt,
      transition_hint: buildTransitionPrompt(
        prompt.transition_hint,
        videoId,
      ),
      status: "active",
      started_at: Date.now(),
    });

    return NextResponse.json(
      {
        ad_session_id: id,
        duration_seconds: AD_SECONDS,
        prompt: prompt.prompt,
        prompt_id: prompt.id,
        prompt_version: prompt.version,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : String(caught);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
