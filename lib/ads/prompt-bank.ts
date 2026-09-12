import type { AdPrompt, TargetingContext } from "@/lib/ads/types";

/**
 * Shared lock: the resume frame is the world. Product copy only adds a beat
 * inside that world — never a new location or cinematic reboot.
 */
export const FRAME_CONTINUITY_LOCK =
  "Use the attached reference image as the exact scene. Keep the same place, " +
  "subjects, wardrobe, lighting, camera angle, and framing. Do not cut to a " +
  "new location. Do not invent a different room, city, or landscape. Only " +
  "add a subtle product moment that could plausibly appear in this shot. " +
  "No logos, captions, packaging text, watermarks, or brand names on screen.";

const RETURN_TO_FRAME =
  "Remove the product beat and morph back to the attached resume frame. " +
  "Same place, subjects, lighting, and camera. No logos, captions, or new " +
  "focal subjects.";

function productPrompt(productBeat: string): string {
  return `${FRAME_CONTINUITY_LOCK} ${productBeat}`;
}

export const AD_PROMPT_BANK: AdPrompt[] = [
  {
    id: "phone-flagship",
    campaign_id: "demo-phone",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["tech", "hardware", "general"],
    },
    prompt: productPrompt(
      "In this same scene, someone casually holds up a slim modern " +
        "smartphone — glass back, soft edge glow — as if checking a " +
        "message. Keep motion small and natural to the existing shot.",
    ),
    transition_hint: RETURN_TO_FRAME,
  },
  {
    id: "shampoo-bottle",
    campaign_id: "demo-beauty",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["beauty", "home", "general"],
    },
    prompt: productPrompt(
      "In this same scene, a simple matte shampoo bottle rests in frame " +
        "as if it belongs here — on a nearby surface or in someone's hand. " +
        "Soft practical light only. Tiny natural motion, no product spin.",
    ),
    transition_hint: RETURN_TO_FRAME,
  },
  {
    id: "houseplant",
    campaign_id: "demo-plants",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["home", "outdoors", "general"],
    },
    prompt: productPrompt(
      "In this same scene, a healthy potted plant becomes noticeable in " +
        "the existing space — leaves catching the current light. Camera " +
        "stays put; only a gentle living sway in the foliage.",
    ),
    transition_hint: RETURN_TO_FRAME,
  },
  {
    id: "hardware-gadget",
    campaign_id: "demo-hardware",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["hardware", "tech", "general"],
    },
    prompt: productPrompt(
      "In this same scene, a compact hardware invention appears in someone's " +
        "hands or on a surface already in frame — a small metal-and-plastic " +
        "gadget with a quiet status light. Demonstrate a tiny interaction " +
        "without leaving this shot.",
    ),
    transition_hint: RETURN_TO_FRAME,
  },
  {
    id: "wireless-earbuds",
    campaign_id: "demo-audio",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["tech", "general"],
    },
    prompt: productPrompt(
      "In this same scene, a person already in frame puts in a pair of " +
        "sleek wireless earbuds, or the open charging case sits naturally " +
        "in the existing composition. Keep the camera locked to this world.",
    ),
    transition_hint: RETURN_TO_FRAME,
  },
  {
    id: "smartwatch",
    campaign_id: "demo-wearable",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["tech", "hardware", "general"],
    },
    prompt: productPrompt(
      "In this same scene, a slim smartwatch on a wrist already in frame " +
        "lights up softly as someone glances at it. Stay inside the reference " +
        "image's space; no new background.",
    ),
    transition_hint: RETURN_TO_FRAME,
  },
];

/** Prefer category matches; otherwise rotate among general-eligible ads. */
export function selectAdPrompt(
  targeting: TargetingContext = {},
): AdPrompt | null {
  const enabled = AD_PROMPT_BANK.filter((p) => p.enabled);
  if (!enabled.length) return null;

  const region = targeting.region?.toUpperCase();
  const category = targeting.content_category?.toLowerCase();

  const scored = enabled.map((prompt) => {
    let score = 0;
    const { regions, content_categories } = prompt.target_rules;
    if (region && regions?.includes(region)) score += 2;
    if (category && content_categories?.includes(category)) {
      score += 3;
    } else if (content_categories?.includes("general")) {
      score += 1;
    }
    return { prompt, score };
  });

  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best).map((s) => s.prompt);
  if (!top.length) return enabled[0] ?? null;

  // Variety across breaks when several prompts tie.
  const index = Math.floor(Math.random() * top.length);
  return top[index] ?? top[0] ?? null;
}

export function buildTransitionPrompt(
  hint: string,
  videoId: string,
): string {
  return (
    `${FRAME_CONTINUITY_LOCK} ${hint} ` +
    `Return to continuity for YouTube video ${videoId}. ` +
    "Hold a steady camera. Match the resume frame as closely as possible."
  );
}
