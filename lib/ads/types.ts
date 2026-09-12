export type AdPhase =
  | "idle"
  | "arming"
  | "waiting_frame"
  | "ad"
  | "transition"
  | "finishing"
  | "failed";

export type AdPrompt = {
  id: string;
  campaign_id: string;
  prompt: string;
  transition_hint: string;
  target_rules: {
    regions?: string[];
    content_categories?: string[];
  };
  enabled: boolean;
  version: number;
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
  prompt: string;
  transition_hint: string;
  status: "active" | "finished" | "failed";
  started_at: number;
};

export type StartAdRequest = {
  youtube_video_id: string;
  resume_timestamp_seconds: number;
  resume_frame_base64?: string;
  targeting_context?: TargetingContext;
};

export type StartAdResponse = {
  ad_session_id: string;
  duration_seconds: number;
  prompt: string;
  prompt_id: string;
  prompt_version: number;
};

export type TransitionAdResponse = {
  transition_prompt: string;
};

export type FinishAdResponse = {
  ok: true;
};
