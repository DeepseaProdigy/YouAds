import { runPauseAdGates } from "@/lib/ads/rubric";
import type { ExpandedAd } from "@/lib/ads/types";

/**
 * Tiny node-side smoke for G3/G5 regex — run with:
 * npx tsx lib/ads/rubric.smoke.ts
 */
const badCamera: ExpandedAd = {
  brief_id: "smoke",
  frame_read: "a room",
  safe_to_insert: true,
  primary_prompt: Array(230).fill("warm").join(" ") +
    " then we cut to a new kitchen and zoom in on the product.",
  transition_prompt:
    Array(100).fill("soft").join(" ") +
    " restore the original grade and focal plane as it was.",
};

const badText: ExpandedAd = {
  brief_id: "smoke",
  frame_read: "a desk",
  safe_to_insert: true,
  primary_prompt:
    Array(230).fill("desk").join(" ") +
    " a logo and caption appear with 12:40 on the UI.",
  transition_prompt:
    Array(100).fill("return").join(" ") +
    " restore original light and focal plane.",
};

for (const [name, sample] of [
  ["camera", badCamera],
  ["text", badText],
] as const) {
  const result = runPauseAdGates(sample);
  console.log(name, result.failures.join(",") || "pass");
}
