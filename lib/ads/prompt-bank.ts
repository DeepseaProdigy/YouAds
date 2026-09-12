import type { AdPrompt, TargetingContext } from "@/lib/ads/types";

export const AD_PROMPT_BANK: AdPrompt[] = [
  {
    id: "travel-neon-rain",
    campaign_id: "demo-travel",
    version: 1,
    enabled: true,
    target_rules: {
      regions: ["US", "CA", "GB"],
      content_categories: ["travel", "general"],
    },
    prompt:
      "Cinematic 16:9 travel ad on a rain-soaked neon city sidewalk at dusk. " +
      "A woman in a yellow raincoat walks toward camera in a medium tracking " +
      "shot. Cool pavement reflections, gentle forward camera move, soft steam. " +
      "No logos, captions, branding, or product packaging.",
    transition_hint:
      "Morph smoothly back to the paused YouTube scene with the same framing, " +
      "subjects, and lighting. Do not add branding, captions, or a new focal " +
      "subject.",
  },
  {
    id: "outdoors-golden-hour",
    campaign_id: "demo-outdoors",
    version: 1,
    enabled: true,
    target_rules: {
      regions: ["US"],
      content_categories: ["outdoors", "general"],
    },
    prompt:
      "Warm golden-hour outdoor lifestyle spot. Wide 16:9 shot of a quiet " +
      "trail overlooking a valley, soft wind in tall grass, slow push-in. " +
      "Natural light only. No logos, text overlays, or product shots.",
    transition_hint:
      "Transition back to the original paused video frame. Keep camera " +
      "framing continuous. Do not invent new characters or branding.",
  },
  {
    id: "kitchen-morning",
    campaign_id: "demo-home",
    version: 2,
    enabled: true,
    target_rules: {
      content_categories: ["home", "general"],
    },
    prompt:
      "Quiet morning kitchen scene, 16:9, soft window light, steam rising " +
      "from a mug on a wooden table. Slow gentle camera drift. No logos, " +
      "packaging, or on-screen text.",
    transition_hint:
      "Return to the saved YouTube resume scene with matching lighting and " +
      "composition. No new branding or captions.",
  },
];

export function selectAdPrompt(
  targeting: TargetingContext = {},
): AdPrompt | null {
  const enabled = AD_PROMPT_BANK.filter((p) => p.enabled);
  if (!enabled.length) return null;

  const region = targeting.region?.toUpperCase();
  const category = targeting.content_category?.toLowerCase();

  const scored = enabled
    .map((prompt) => {
      let score = 0;
      const { regions, content_categories } = prompt.target_rules;
      if (region && regions?.includes(region)) score += 2;
      if (
        category &&
        content_categories?.includes(category)
      ) {
        score += 2;
      } else if (content_categories?.includes("general")) {
        score += 1;
      }
      return { prompt, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.prompt ?? null;
}

export function buildTransitionPrompt(
  hint: string,
  videoId: string,
): string {
  return (
    `${hint} Resume continuity for YouTube video ${videoId}. ` +
    "Hold a steady camera. Match the original scene as closely as possible."
  );
}
