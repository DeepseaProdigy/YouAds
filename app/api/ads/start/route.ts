import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AD_SECONDS } from "@/lib/ads/constants";
import {
  buildFallbackExpanded,
  expandPrompt,
} from "@/lib/ads/expand-prompt";
import { selectAdPrompt } from "@/lib/ads/prompt-bank";
import { runPauseAdGates } from "@/lib/ads/rubric";
import {
  getActiveSessionCount,
  putSession,
  saveResumeFrame,
} from "@/lib/ads/store";
import type { AdBrief, ExpandedAd, StartAdRequest } from "@/lib/ads/types";

export const runtime = "nodejs";
export const maxDuration = 120;

async function expandBestEffort(
  brief: AdBrief,
  frameBase64: string,
): Promise<{ expanded: ExpandedAd; expandedWith: string }> {
  let expanded: ExpandedAd;
  let expandedWith = "openai-vision";

  try {
    expanded = await expandPrompt(brief, frameBase64);
  } catch (caught) {
    console.warn("[ads/start] vision expand failed:", caught);
    expanded = buildFallbackExpanded(brief);
    expandedWith = "fallback";
  }

  // Never refuse. Empty model output → fallback.
  if (
    !expanded.primary_prompt.trim() ||
    !expanded.transition_prompt.trim()
  ) {
    expanded = buildFallbackExpanded(brief);
    expandedWith = "fallback-empty";
  }

  expanded.safe_to_insert = true;
  expanded.safety_reason = "";

  let rubric = runPauseAdGates(expanded);
  if (!rubric.pass && expandedWith.startsWith("openai-vision")) {
    console.warn(
      "[ads/start] rubric fail, regenerating once:",
      rubric.failures.join(","),
    );
    try {
      expanded = await expandPrompt(brief, frameBase64);
      expanded.safe_to_insert = true;
      expanded.safety_reason = "";
      expandedWith = "openai-vision-retry";
      rubric = runPauseAdGates(expanded);
    } catch (caught) {
      console.warn("[ads/start] regenerate failed:", caught);
    }
  }

  if (!rubric.pass) {
    console.warn(
      "[ads/start] rubric soft-fail, shipping anyway:",
      rubric.failures.join(","),
    );
    if (
      !expanded.primary_prompt.trim() ||
      !expanded.transition_prompt.trim()
    ) {
      expanded = buildFallbackExpanded(brief);
      expandedWith = "fallback-after-rubric";
    }
  }

  return { expanded, expandedWith };
}

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
    if (!body.resume_frame_base64) {
      return NextResponse.json(
        { error: "resume_frame_base64 is required" },
        { status: 400 },
      );
    }

    const brief = selectAdPrompt(
      body.targeting_context,
      body.brief_id?.trim(),
    );
    if (!brief) {
      return NextResponse.json(
        {
          error: body.brief_id
            ? `Unknown or disabled brief_id: ${body.brief_id}`
            : "No eligible ad brief in the bank",
        },
        { status: body.brief_id ? 400 : 503 },
      );
    }

    const framePath = await saveResumeFrame(body.resume_frame_base64);
    const { expanded, expandedWith } = await expandBestEffort(
      brief,
      body.resume_frame_base64,
    );

    const id = randomUUID();
    putSession({
      id,
      youtube_video_id: videoId,
      resume_timestamp_seconds: resumeAt,
      resume_frame_path: framePath,
      prompt_id: brief.id,
      prompt_version: brief.version,
      product_label: brief.product_label,
      frame_read: expanded.frame_read,
      prompt: expanded.primary_prompt,
      transition_prompt: expanded.transition_prompt,
      status: "active",
      started_at: Date.now(),
    });

    const rubric = runPauseAdGates(expanded);

    return NextResponse.json(
      {
        ad_session_id: id,
        duration_seconds: AD_SECONDS,
        prompt: expanded.primary_prompt,
        prompt_id: brief.id,
        prompt_version: brief.version,
        product_label: brief.product_label,
        frame_read: expanded.frame_read,
        expanded_with: expandedWith,
        rubric_pass: rubric.pass,
        rubric_failures: rubric.failures,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : String(caught);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
