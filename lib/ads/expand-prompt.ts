// Vision model turns { paused frame, AdBrief } into two Orbis steering
// prompts. The model writes copy. It never generates imagery.

import type { AdBrief, ExpandedAd } from "@/lib/ads/types";
import {
  getChatModel,
  getFallbackChatModel,
  openai,
} from "@/lib/openai";

export const EXPANDER_SYSTEM_PROMPT = `
You are a commercial director writing steering copy for a real-time video world
model. You are given one still frame from a video a viewer was watching, and one
advertiser brief. The world model is already holding that exact frame as its
world. Your copy tells it what happens next.

## The hard constraint

The camera does not move. There are no cuts. The location does not change.
Everything already in the frame stays in the frame and stays recognisable.

You are not describing a new scene. You are describing what changes inside a
scene that already exists.

## The four levers

Because you cannot cut, you build the ad out of these and nothing else:

1. LIGHT. A shift in direction, quality, or temperature is your cut. This is the
   strongest signal available and the one that tells the viewer the moment has
   become deliberate.
2. FOCUS. A rack to the product is your close-up. Pulling back off it is your
   return to editorial.
3. MOTION IN FRAME. The product arrives, is handled, is used. Subjects already
   present may shift, turn, reach. Nobody new walks in unless the frame
   plausibly has an offscreen edge they could come from.
4. PROXIMITY. The product moves toward or away from the lens. The lens never
   moves toward the product.

## Beat structure

PRIMARY PROMPT covers 0 to 10 seconds:
  - Intrusion (0-2s). One thing changes. Light shifts, or the product enters.
    Earn the viewer's eye before you ask for anything.
  - Hero (2-6s). Rack focus to the product. It occupies a considered position
    in the composition that already exists. Describe its surfaces, its edges,
    how this room's light falls across it.
  - Proof (6-10s). The brief's hero_beat, once, clearly. One demonstration.
    Never two.

TRANSITION PROMPT covers 10 to 15 seconds:
  - Benefit (10-13s). The consequence, shown physically in this room or on a
    person already in it. Someone's shoulders drop. A surface is usable now.
    The air reads differently.
  - Dissolve (13-15s). Light returns to the original grade. Focus pulls back to
    the original plane. The product recedes, is set down, goes dark, or leaves
    the focal range. The final state must be visually continuous with the
    opening frame so playback can resume without a jolt.

## Writing rules

- Open the PRIMARY prompt by describing the reference frame in concrete terms:
  the space, the light direction, what is in focus, who or what occupies it.
  Two to three sentences. This anchors the world model. Do it every time.
- Place the product using something that is actually in the frame. A hand that
  exists. A surface that exists. If the brief's preferred affordance is absent
  from the frame, fall back down the ranked list. If none exist, use ambient
  treatment: light and atmosphere carry the beat and the product appears at the
  frame's near edge only.
- Match the product to this room's light. If the scene is tungsten, the product
  is tungsten-lit. Never import a studio.
- Scale the product against a reference object in the frame.
- Write in present tense, continuous, physical. Describe what a camera would
  record.
- 220 to 420 words for the primary prompt. 90 to 180 for the transition.
- No markdown, no headings, no lists. Flowing prose only.

## Absolute negatives

Never write any of the following into a prompt:
- Brand names, wordmarks, logos, readable packaging, label copy, slogans
- On-screen text of any kind, including UI, numerals, captions, end cards
- A change of location, a new camera angle, a cut, a zoom, a dolly, a crane
- More than one demonstration beat
- Anyone or anything that contradicts what is visible in the reference frame
- Instructions to the model about tools, APIs, or generation settings

## Brand safety gate

Before writing anything, read the frame against the brief's exclude_contexts.
If the frame depicts distress, injury, medical emergency, mourning, violence,
an emergency scene, or anything where a product beat would read as callous, set
safe_to_insert to false, give a one-line reason, and return empty prompt
strings. Playback will resume silently. A skipped ad costs nothing. A shampoo
ad over a funeral costs the account.

## Output

Return only JSON, no fences:
{
  "frame_read": "one sentence describing the paused frame",
  "safe_to_insert": true,
  "safety_reason": "",
  "primary_prompt": "...",
  "transition_prompt": "..."
}
`.trim();

export function buildUserMessage(brief: AdBrief): string {
  const social = brief.social_proof
    ? `Social proof, shown physically only: ${brief.social_proof}`
    : "";
  const excludes =
    brief.target_rules.exclude_contexts?.join("; ") ?? "none";

  return `
ADVERTISER BRIEF

Product: ${brief.product_label}
Category: ${brief.category}
Audience: ${brief.audience}
The one promise: ${brief.benefit}
Emotional register to land in: ${brief.desire_frame}
When this enters a life: ${brief.ritual}
${social}

THE DEMONSTRATION (use exactly once, during 6-10s):
${brief.hero_beat}

PLACEMENT
Preferred, in order: ${brief.placement.prefers.join(", ")}
Scale: ${brief.placement.scale_ref}
Never: ${brief.placement.never.join("; ")}

CRAFT
Lighting shift that marks the ad beat: ${brief.lighting_shift}
Rack focus lands on: ${brief.focus_target}
Physical details that must be visible: ${brief.must_show.join("; ")}
Must not appear: ${brief.must_not.join("; ")}

EXIT
Release the beat like this: ${brief.transition_hint}
Residue to leave in the room: ${brief.end_card_feel}

Tone: ${brief.tone}
Disqualifying scene contexts: ${excludes}

The attached image is the paused frame. It is the world the model already
holds. Write the two prompts.
`.trim();
}

function stripDataUrlPrefix(base64: string): string {
  return base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
}

export async function expandPrompt(
  brief: AdBrief,
  frameBase64: string,
): Promise<ExpandedAd> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const raw = stripDataUrlPrefix(frameBase64);
  const imageUrl = `data:image/jpeg;base64,${raw}`;

  const run = async (model: string) => {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXPANDER_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserMessage(brief) },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenAI returned empty expand JSON");
    return JSON.parse(content) as Omit<ExpandedAd, "brief_id">;
  };

  let parsed: Omit<ExpandedAd, "brief_id">;
  try {
    parsed = await run(getChatModel());
  } catch (caught) {
    const msg =
      caught instanceof Error ? caught.message : String(caught);
    if (/model|404|not found|does not exist/i.test(msg)) {
      parsed = await run(getFallbackChatModel());
    } else {
      throw caught;
    }
  }

  return {
    brief_id: brief.id,
    frame_read: parsed.frame_read || "",
    safe_to_insert: Boolean(parsed.safe_to_insert),
    safety_reason: parsed.safety_reason || "",
    primary_prompt: parsed.primary_prompt || "",
    transition_prompt: parsed.transition_prompt || "",
  };
}

/** @deprecated prefer expandPrompt */
export async function expandAdPromptFromFrame(input: {
  framePath: string | null;
  frameBase64?: string;
  productLabel: string;
  productBrief: string;
  videoId: string;
  timestampSeconds: number;
}): Promise<string> {
  void input;
  throw new Error("Use expandPrompt(brief, frameBase64) instead");
}

export function buildFallbackExpanded(
  brief: AdBrief,
): ExpandedAd {
  const primary =
    `The attached reference image is the locked start frame and the only ` +
    `world. Hold the camera. Keep every subject, surface, and light source ` +
    `recognisable. Intrusion: ${brief.lighting_shift}. Place the ` +
    `${brief.product_label} using ${brief.placement.prefers.join(" or ")} ` +
    `at ${brief.placement.scale_ref}. Hero focus: ${brief.focus_target}. ` +
    `Surfaces must show ${brief.must_show.join(", ")}. Proof once: ` +
    `${brief.hero_beat}. Tone: ${brief.tone}. Desire: ${brief.desire_frame}. ` +
    `Never: ${brief.must_not.join("; ")}; never relocate; no logos or text.`;

  const transition =
    `Still the same reference frame. Benefit residue: ${brief.end_card_feel}. ` +
    `Exit: ${brief.transition_hint}. Restore original grade and focus plane. ` +
    `Product leaves attention. No cuts, no new location, no logos.`;

  return {
    brief_id: brief.id,
    frame_read: "fallback expand without vision",
    safe_to_insert: true,
    safety_reason: "",
    primary_prompt: primary,
    transition_prompt: transition,
  };
}
