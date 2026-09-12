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
  deleteResumeFrame,
  getActiveSessionCount,
  putSession,
  saveResumeFrame,
} from "@/lib/ads/store";
import type {
  AdBrief,
  ExpandedAd,
  StartAdRequest,
} from "@/lib/ads/types";

export const runtime = "nodejs";
export const maxDuration = 120;

async function expandWithGates(
  brief: AdBrief,
  frameBase64: string,
): Promise<{
  expanded: ExpandedAd;
  expandedWith: string;
  rubricFailures: string[];
}> {
  let expanded: ExpandedAd;
  let expandedWith = "openai-vision";

  try {
    expanded = await expandPrompt(brief, frameBase64);
  } catch (caught) {
    console.warn("[ads/start] vision expand failed:", caught);
    expanded = buildFallbackExpanded(brief);
    expandedWith = "fallback";
  }

  let rubric = runPauseAdGates(expanded);

  // Safety abort — do not regenerate.
  if (!expanded.safe_to_insert) {
    return {
      expanded,
      expandedWith,
      rubricFailures: rubric.failures,
    };
  }

  // Soft length / craft failures: one regenerate, then fallback.
  if (!rubric.pass && expandedWith === "openai-vision") {
    console.warn(
      "[ads/start] rubric fail, regenerating once:",
      rubric.failures.join(","),
    );
    try {
      expanded = await expandPrompt(brief, frameBase64);
      expandedWith = "openai-vision-retry";
      rubric = runPauseAdGates(expanded);
    } catch (caught) {
      console.warn("[ads/start] regenerate failed:", caught);
    }
  }

  if (!rubric.pass && expanded.safe_to_insert) {
    console.warn(
      "[ads/start] rubric still failing, trying fallback brief expand",
      rubric.failures.join(","),
    );
    expanded = buildFallbackExpanded(brief);
    expandedWith = "fallback-after-rubric";
    rubric = runPauseAdGates(expanded);
  }

  return {
    expanded,
    expandedWith,
    rubricFailures: rubric.failures,
  };
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

    const brief = selectAdPrompt(body.targeting_context);
    if (!brief) {
      return NextResponse.json(
        { error: "No eligible ad brief in the bank" },
        { status: 503 },
      );
    }

    const framePath = await saveResumeFrame(body.resume_frame_base64);
    const { expanded, expandedWith, rubricFailures } =
      await expandWithGates(brief, body.resume_frame_base64);

    if (!expanded.safe_to_insert) {
      await deleteResumeFrame(framePath);
      return NextResponse.json(
        {
          skipped: true,
          safety_reason:
            expanded.safety_reason ||
            "Frame failed brand-safety gate",
          prompt_id: brief.id,
          product_label: brief.product_label,
          frame_read: expanded.frame_read,
          rubric_failures: rubricFailures,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const finalRubric = runPauseAdGates(expanded);
    if (!finalRubric.pass) {
      await deleteResumeFrame(framePath);
      return NextResponse.json(
        {
          skipped: true,
          safety_reason: `Rubric gates failed: ${finalRubric.failures.join(", ")}`,
          prompt_id: brief.id,
          product_label: brief.product_label,
          frame_read: expanded.frame_read,
          rubric_failures: finalRubric.failures,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

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
        rubric_pass: true,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : String(caught);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
