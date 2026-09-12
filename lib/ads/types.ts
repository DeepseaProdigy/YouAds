// Brief schema for in-context pause ads.
//
// Design principle: the brief carries what only the ADVERTISER knows.
// The vision expander carries what only the FRAME knows.
// If a field could be inferred by looking at the paused frame, it does not
// belong here. If it could not, it must be here or it will be lost.

export type AdPhase =
  | "idle"
  | "arming"
  | "waiting_frame"
  | "ad"
  | "transition"
  | "finishing"
  | "failed";

export type AdCategory =
  | "cpg"
  | "consumer_tech"
  | "dtc_apparel"
  | "beauty"
  | "home"
  | "beverage"
  | "b2b_hardware";

export type SurfaceAffordance =
  | "hand"
  | "flat_surface"
  | "lap"
  | "wall"
  | "floor"
  | "worn_on_body"
  | "near_window"
  | "ambient_only";

export type AdBrief = {
  id: string;
  campaign_id: string;
  version: number;
  enabled: boolean;

  product_label: string;
  category: AdCategory;

  audience: string;
  benefit: string;
  desire_frame: string;
  ritual: string;
  social_proof?: string;

  hero_beat: string;

  placement: {
    prefers: SurfaceAffordance[];
    scale_ref: string;
    never: string[];
  };

  lighting_shift: string;
  focus_target: string;
  must_show: string[];
  must_not: string[];

  transition_hint: string;
  end_card_feel: string;

  tone: string;

  target_rules: {
    content_categories?: string[];
    regions?: string[];
    exclude_contexts?: string[];
  };
};

/** Emitted by the expander. Two prompts, one coherent arc. */
export type ExpandedAd = {
  brief_id: string;
  frame_read: string;
  safe_to_insert: boolean;
  safety_reason?: string;
  primary_prompt: string;
  transition_prompt: string;
};

export type TargetingContext = {
  region?: string;
  content_category?: string;
};

export type AdSessionRecord = {
  id: string;
  youtube_video_id: string;
  resume_timestamp_seconds: number;
  resume_frame_path: string | null;
  prompt_id: string;
  prompt_version: number;
  product_label: string;
  frame_read: string;
  /** Final expanded Orbis primary prompt (0–10s). */
  prompt: string;
  /** Final expanded Orbis transition prompt (~10–15s). */
  transition_prompt: string;
  status: "active" | "finished" | "failed";
  started_at: number;
};

export type StartAdRequest = {
  youtube_video_id: string;
  resume_timestamp_seconds: number;
  resume_frame_base64?: string;
  /** Required product brief id from the catalog. */
  brief_id?: string;
  targeting_context?: TargetingContext;
};

export type StartAdResponse = {
  ad_session_id?: string;
  duration_seconds?: number;
  prompt?: string;
  prompt_id?: string;
  prompt_version?: number;
  product_label?: string;
  frame_read?: string;
  expanded_with?: string;
  skipped?: boolean;
  safety_reason?: string;
  rubric_pass?: boolean;
  rubric_failures?: string[];
};

export type TransitionAdResponse = {
  transition_prompt: string;
};

export type FinishAdResponse = {
  ok: true;
};

/** @deprecated alias while callers migrate */
export type AdPrompt = AdBrief;
