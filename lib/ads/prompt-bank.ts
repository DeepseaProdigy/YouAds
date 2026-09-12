// Ten pause-ad briefs. Each is an advertiser creative brief, not an Orbis
// prompt. The vision expander writes the prompt from the frame.
//
// Every hero_beat is achievable in a locked shot in under four seconds.
// If you add a SKU and cannot write that field, the SKU does not belong here.

import type { AdBrief, TargetingContext } from "@/lib/ads/types";

export const PROMPT_BANK: AdBrief[] = [
  {
    id: "ad_phone_lowlight",
    campaign_id: "cmp_flagship_phone",
    version: 3,
    enabled: true,
    product_label: "flagship smartphone",
    category: "consumer_tech",
    audience: "people who keep losing the moment to a bad photo",
    benefit: "the shot survives the dark",
    desire_frame: "quiet competence, no effort visible",
    ritual: "the half-second between noticing something and it being gone",
    social_proof: "the ease of it, as if this were unremarkable",
    hero_beat:
      "the screen wakes and the dim part of this exact room resolves " +
      "bright and clean on it, out-resolving what the eye can see",
    placement: {
      prefers: ["hand", "flat_surface"],
      scale_ref: "fits a palm, screen roughly a third of frame height",
      never: ["floating", "floor", "propped against the lens"],
    },
    lighting_shift:
      "ambient light dips a quarter-stop while the screen becomes the " +
      "dominant source, cool white against the scene warmth",
    focus_target:
      "the screen surface, with the room behind it falling soft",
    must_show: [
      "flat matte edge",
      "seamless glass front",
      "camera module as a low raised plateau",
    ],
    must_not: [
      "UI text",
      "app icons",
      "notification bars",
      "visible fingerprints",
    ],
    transition_hint:
      "the screen dims to black, the hand lowers the device out of the " +
      "focal plane, ambient light returns",
    end_card_feel: "the room exactly as it was, one degree calmer",
    tone: "understated, precise, unhurried",
    target_rules: {
      content_categories: [
        "tech",
        "travel",
        "vlog",
        "music",
        "gaming",
        "general",
      ],
    },
  },
  {
    id: "ad_shampoo_matte",
    campaign_id: "cmp_matte_haircare",
    version: 2,
    enabled: true,
    product_label: "matte-finish shampoo bottle",
    category: "beauty",
    audience: "people whose hair looks heavy by noon",
    benefit: "texture that holds without weight",
    desire_frame: "clean, light, the feeling of a fresh start mid-day",
    ritual: "the shower that resets the day",
    hero_beat:
      "a single strand of hair in frame lifts and separates, then " +
      "settles with visible spring rather than falling flat",
    placement: {
      prefers: ["flat_surface", "hand", "near_window"],
      scale_ref: "about the height of a coffee mug in the same shot",
      never: [
        "bathroom relocation",
        "submerged",
        "shelf that does not exist in frame",
      ],
    },
    lighting_shift:
      "a soft key builds from the existing brightest direction, " +
      "raising specular highlight on hair and bottle shoulder",
    focus_target:
      "the bottle shoulder first, then a pull to the hair itself",
    must_show: [
      "soft-touch matte cylinder",
      "flat disc cap",
      "gentle shoulder taper",
    ],
    must_not: [
      "label text",
      "foam in unnatural places",
      "wet floor",
      "steam that obscures the room",
    ],
    transition_hint:
      "the bottle slides back out of the focal plane, highlight drops, " +
      "hair settles into its original state",
    end_card_feel: "lighter air in the same room",
    tone: "fresh, tactile, gently confident",
    target_rules: {
      content_categories: [
        "beauty",
        "lifestyle",
        "fashion",
        "vlog",
        "fitness",
        "general",
      ],
    },
  },
  {
    id: "ad_plant_subscription",
    campaign_id: "cmp_green_delivery",
    version: 2,
    enabled: true,
    product_label: "potted houseplant in a ceramic vessel",
    category: "home",
    audience: "renters whose rooms feel unfinished",
    benefit: "a room that feels lived in, delivered",
    desire_frame: "unhurried, softly alive",
    ritual: "the Saturday where the apartment finally gets attention",
    social_proof:
      "a second, older plant already thriving at the edge of frame",
    hero_beat:
      "leaves move in air that was still a second ago, one leaf turning " +
      "toward the light source already in the shot",
    placement: {
      prefers: ["flat_surface", "floor", "near_window"],
      scale_ref:
        "roughly knee height if floor-standing, or forearm height on a surface",
      never: [
        "hovering",
        "blocking the subject face",
        "replacing existing furniture",
      ],
    },
    lighting_shift:
      "existing daylight warms half a stop and grows softer, as if a " +
      "cloud passed off the sun",
    focus_target:
      "the nearest leaf edge, with its own shadow on the wall behind",
    must_show: [
      "matte ceramic vessel",
      "visible soil surface",
      "leaf translucency where light passes through",
    ],
    must_not: [
      "plastic sheen",
      "nursery tags",
      "water pooling",
      "seasonal decoration",
    ],
    transition_hint:
      "air stills, the leaf stops turning, warmth returns to the original grade",
    end_card_feel: "the same room, now clearly someone's home",
    tone: "calm, domestic, quietly pleased",
    target_rules: {
      content_categories: [
        "home",
        "lifestyle",
        "diy",
        "wellness",
        "vlog",
        "study",
        "general",
      ],
    },
  },
  {
    id: "ad_earbuds_isolation",
    campaign_id: "cmp_wireless_audio",
    version: 4,
    enabled: true,
    product_label: "wireless earbuds and charging case",
    category: "consumer_tech",
    audience: "people who work in rooms that are never quiet enough",
    benefit: "the noise stops being your problem",
    desire_frame: "relief, then focus",
    ritual: "the moment you decide to actually concentrate",
    hero_beat:
      "the case lid opens, one earbud lifts out, and everything in " +
      "frame beyond arm's length goes soft and still as it seats in the ear",
    placement: {
      prefers: ["hand", "flat_surface", "worn_on_body"],
      scale_ref:
        "case fills a closed fist, each bud the size of a thumb tip",
      never: ["oversized", "wires of any kind", "floating mid-air"],
    },
    lighting_shift:
      "peripheral areas of the frame lose a stop and desaturate slightly " +
      "while the near field holds its exposure",
    focus_target: "the case interior at open, then the bud as it rises",
    must_show: [
      "pebble-smooth case",
      "magnetic seat recess",
      "stem-free bud profile",
    ],
    must_not: [
      "brand text",
      "LED indicator patterns spelling anything",
      "ear canal interior",
    ],
    transition_hint:
      "peripheral exposure and saturation lift back to baseline, the " +
      "case closes with the lid settling flush",
    end_card_feel: "the room audible again, but chosen",
    tone: "modern, tactile, slightly cinematic",
    target_rules: {
      content_categories: [
        "tech",
        "music",
        "study",
        "productivity",
        "gaming",
        "commute",
        "general",
      ],
    },
  },
  {
    id: "ad_watch_slim",
    campaign_id: "cmp_slim_wearable",
    version: 2,
    enabled: true,
    product_label: "slim smartwatch on a woven band",
    category: "consumer_tech",
    audience: "people who want the data without the gadget",
    benefit: "it disappears until you need it",
    desire_frame: "effortless order",
    ritual: "the glance you take without breaking stride",
    hero_beat:
      "a wrist already in frame turns slightly and the face wakes, a " +
      "single clean arc of light sweeping the dial once",
    placement: {
      prefers: ["worn_on_body", "hand", "flat_surface"],
      scale_ref: "the case no wider than the wrist it sits on",
      never: [
        "worn by a person not already in frame",
        "oversized bezel",
        "strap dangling",
      ],
    },
    lighting_shift:
      "a narrow specular sweep crosses the crystal, the rest of the " +
      "grade unchanged",
    focus_target:
      "the dial surface and the band weave immediately beside it",
    must_show: [
      "thin case profile from the side",
      "woven band texture",
      "seamless crystal-to-case edge",
    ],
    must_not: [
      "readable time",
      "health metrics",
      "numerals",
      "notification content",
    ],
    transition_hint:
      "the dial goes dark, the wrist relaxes back to its original angle, " +
      "specular sweep exits frame",
    end_card_feel:
      "nothing added to the room, something settled in the person",
    tone: "minimal, assured, almost silent",
    target_rules: {
      content_categories: [
        "tech",
        "fitness",
        "business",
        "travel",
        "lifestyle",
        "general",
      ],
    },
  },
  {
    id: "ad_desk_lamp_cordless",
    campaign_id: "cmp_portable_light",
    version: 1,
    enabled: true,
    product_label: "cordless aluminium desk lamp",
    category: "home",
    audience:
      "people who work wherever there is space, not wherever there is an outlet",
    benefit: "good light follows you",
    desire_frame: "control over your own environment",
    ritual: "the hour after the sun gives up",
    hero_beat:
      "the lamp head tilts and a warm pool of light lands on a surface " +
      "already in frame, lifting detail that was in shadow",
    placement: {
      prefers: ["flat_surface", "hand"],
      scale_ref: "about two hand-spans tall, base the size of a coaster",
      never: ["wall-mounted", "trailing a cable", "lighting the camera"],
    },
    lighting_shift:
      "a new practical source enters from the lamp position, warm and " +
      "directional, existing ambient drops slightly to let it read",
    focus_target: "the lit pool on the surface, then the lamp head edge",
    must_show: [
      "brushed aluminium arm",
      "weighted flat base",
      "visible light falloff on the surface",
    ],
    must_not: [
      "power cable",
      "switch labels",
      "bulb filament detail",
      "lens flare across the whole frame",
    ],
    transition_hint:
      "the warm pool fades, the lamp head returns to neutral, ambient " +
      "exposure recovers",
    end_card_feel:
      "the corner of the room that was unusable now obviously usable",
    tone: "practical, warm, quietly designed",
    target_rules: {
      content_categories: [
        "home",
        "diy",
        "study",
        "productivity",
        "design",
        "general",
      ],
    },
  },
  {
    id: "ad_coldbrew_can",
    campaign_id: "cmp_cold_brew",
    version: 2,
    enabled: true,
    product_label: "slim matte cold brew can",
    category: "beverage",
    audience: "people whose afternoon starts at 3pm",
    benefit:
      "smooth enough to drink slowly, strong enough not to need to",
    desire_frame: "cool relief without a jolt",
    ritual: "the second wind",
    hero_beat:
      "condensation beads and one drop runs the length of the can, then " +
      "the tab lifts with a visible pressure release",
    placement: {
      prefers: ["hand", "flat_surface"],
      scale_ref: "taller and narrower than a standard soda can",
      never: [
        "half-crushed",
        "in ice buckets that are not in frame",
        "spilled",
      ],
    },
    lighting_shift:
      "a cool rim light picks out the can edge while the scene body " +
      "stays at its original temperature",
    focus_target: "the condensation on the near side of the can",
    must_show: [
      "matte cylindrical body",
      "cold sweat on the surface",
      "clean tab geometry",
    ],
    must_not: [
      "label copy",
      "nutrition panel",
      "pouring into a glass with a logo",
      "ice cubes floating unsupported",
    ],
    transition_hint:
      "the rim light softens, the can lowers below the focal plane, " +
      "condensation stops catching light",
    end_card_feel: "the same afternoon, with more of it left",
    tone: "crisp, casual, a little cool",
    target_rules: {
      content_categories: [
        "food",
        "lifestyle",
        "study",
        "vlog",
        "gaming",
        "work",
        "general",
      ],
    },
  },
  {
    id: "ad_runner_dtc",
    campaign_id: "cmp_dtc_running",
    version: 1,
    enabled: true,
    product_label: "knit-upper running shoe",
    category: "dtc_apparel",
    audience:
      "people who run three times a week and are tired of being sold to as athletes",
    benefit: "built for the distance you actually run",
    desire_frame: "honest capability, no hype",
    ritual: "lacing up before you can change your mind",
    hero_beat:
      "the knit upper flexes once as weight shifts onto it, the midsole " +
      "compressing and returning in a single visible cycle",
    placement: {
      prefers: ["floor", "hand", "flat_surface"],
      scale_ref: "true foot scale against anything already in the shot",
      never: [
        "mid-air action pose",
        "on a treadmill that is not in frame",
        "muddied",
      ],
    },
    lighting_shift:
      "a low raking light crosses the floor plane, picking out knit " +
      "texture and midsole edge in relief",
    focus_target: "the flex point where upper meets midsole",
    must_show: [
      "knit weave texture",
      "midsole sidewall geometry",
      "outsole tread at the edge",
    ],
    must_not: [
      "logos",
      "swooshes",
      "stripes that read as a mark",
      "size tags",
    ],
    transition_hint:
      "the raking light flattens out, weight comes off the shoe, the " +
      "floor plane returns to ambient",
    end_card_feel:
      "a door somewhere in the room that is now slightly more likely to be opened",
    tone: "plain-spoken, physical, unglamorous in a deliberate way",
    target_rules: {
      content_categories: [
        "fitness",
        "sports",
        "lifestyle",
        "vlog",
        "outdoors",
        "general",
      ],
    },
  },
  {
    id: "ad_serum_glass",
    campaign_id: "cmp_skin_serum",
    version: 1,
    enabled: true,
    product_label: "glass dropper serum bottle",
    category: "beauty",
    audience: "people who have already tried four of these",
    benefit: "you will see it in a week, not a season",
    desire_frame: "patient care that actually pays out",
    ritual: "the last thirty seconds before bed",
    hero_beat:
      "the dropper releases a single bead onto skin already in frame " +
      "and it spreads and vanishes rather than sitting on the surface",
    placement: {
      prefers: ["hand", "flat_surface", "near_window"],
      scale_ref: "shorter than a hand is long, dropper bulb thumb-sized",
      never: [
        "bathroom relocation",
        "mirror reflections that change the shot",
        "dripping",
      ],
    },
    lighting_shift:
      "a soft wrap builds on the near side, lifting skin sheen and " +
      "giving the glass a single clean highlight",
    focus_target:
      "the bead at the dropper tip, then the skin it lands on",
    must_show: [
      "amber or smoked glass body",
      "ribbed dropper collar",
      "fluid clarity in the pipette",
    ],
    must_not: [
      "label text",
      "ingredient claims",
      "before-and-after framing",
      "skin conditions",
    ],
    transition_hint:
      "the highlight softens, the dropper returns to the bottle, the " +
      "wrap light decays back to ambient",
    end_card_feel: "the same face, unchanged, and somehow attended to",
    tone: "clinical warmth, no hyperbole",
    target_rules: {
      content_categories: [
        "beauty",
        "wellness",
        "lifestyle",
        "fashion",
        "general",
      ],
    },
  },
  {
    id: "ad_mesh_node_b2b",
    campaign_id: "cmp_mesh_network",
    version: 1,
    enabled: true,
    product_label: "compact mesh network node",
    category: "b2b_hardware",
    audience: "whoever in the building gets blamed when the wifi drops",
    benefit: "the dead zone stops existing",
    desire_frame: "a problem quietly ceasing to be a problem",
    ritual: "the fix you do once and never think about again",
    social_proof: "a second identical node visible further back in the space",
    hero_beat:
      "a status ring on the node settles from pulsing to steady, and a " +
      "device already in frame stops buffering",
    placement: {
      prefers: ["flat_surface", "wall", "hand"],
      scale_ref: "about the footprint of a drink coaster, palm height",
      never: [
        "server rack that is not in frame",
        "cable spaghetti",
        "ceiling mount",
      ],
    },
    lighting_shift:
      "a faint cool glow from the node lifts the immediate surface, " +
      "everything else holds",
    focus_target: "the status ring, then the device it just fixed",
    must_show: [
      "soft-cornered housing",
      "single unbroken status ring",
      "flush rear port recess",
    ],
    must_not: [
      "signal bar graphics",
      "network names",
      "speed numbers",
      "brand text",
    ],
    transition_hint:
      "the glow fades to nothing, the node becomes ordinary furniture " +
      "again, exposure returns to baseline",
    end_card_feel: "a space where nobody is about to complain",
    tone: "dry, competent, faintly relieved",
    target_rules: {
      content_categories: [
        "tech",
        "business",
        "productivity",
        "diy",
        "home",
        "general",
      ],
    },
  },
];

/** @deprecated use PROMPT_BANK */
export const AD_PROMPT_BANK = PROMPT_BANK;

export const getBrief = (id: string) =>
  PROMPT_BANK.find((b) => b.id === id && b.enabled);

export const briefsForCategory = (category: string) =>
  PROMPT_BANK.filter(
    (b) =>
      b.enabled &&
      (b.target_rules.content_categories?.includes(category) ?? true),
  );

export function selectAdPrompt(
  targeting: TargetingContext = {},
): AdBrief | null {
  const enabled = PROMPT_BANK.filter((b) => b.enabled);
  if (!enabled.length) return null;

  const region = targeting.region?.toUpperCase();
  const category = targeting.content_category?.toLowerCase();

  const scored = enabled.map((brief) => {
    let score = 0;
    const { regions, content_categories } = brief.target_rules;
    if (region && regions?.includes(region)) score += 2;
    if (category && content_categories?.includes(category)) {
      score += 3;
    } else if (content_categories?.includes("general")) {
      score += 1;
    }
    return { brief, score };
  });

  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best).map((s) => s.brief);
  if (!top.length) return enabled[0] ?? null;

  const index = Math.floor(Math.random() * top.length);
  return top[index] ?? top[0] ?? null;
}
