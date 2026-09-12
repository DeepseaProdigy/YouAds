"use client";

import { useCallback, useEffect, useRef } from "react";

import type { YouTubePlayerApi } from "@/hooks/use-youtube-player";
import {
  blobToBase64,
  fetchResumeFrameBlob,
  finishAdSession,
  startAdSession,
  startOrbisAdStream,
  steerOrbisAdStream,
  stopOrbisAdStream,
} from "@/lib/ads/api";
import { AD_SECONDS, FIRST_FRAME_TIMEOUT_MS, STEER_LEAD_MS, TRANSITION_AT } from "@/lib/ads/constants";
import { useAdStore } from "@/lib/ads/ad-store";

type UseAdControllerArgs = {
  youtube: YouTubePlayerApi;
  videoId: string;
  briefId: string;
};

export function useAdController({ youtube, videoId, briefId }: UseAdControllerArgs) {
  const phase = useAdStore((s) => s.phase);
  const autoBreakUsed = useAdStore((s) => s.autoBreakUsed);
  const clockRef = useRef<number | null>(null);
  const visualStartRef = useRef<number | null>(null);
  const steeredRef = useRef(false);
  const finishingRef = useRef(false);
  const firstFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const resumeAtRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (clockRef.current !== null) window.clearInterval(clockRef.current);
    if (firstFrameTimerRef.current !== null) window.clearTimeout(firstFrameTimerRef.current);
    clockRef.current = null;
    firstFrameTimerRef.current = null;
  }, []);

  const resumeYouTube = useCallback(() => {
    try {
      if (typeof resumeAtRef.current === "number") youtube.seekTo(resumeAtRef.current);
      youtube.play();
    } catch {
      useAdStore.getState().setError("Could not resume the video");
    }
  }, [youtube]);

  const teardownAd = useCallback(async (options?: { failed?: boolean; error?: string }) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearTimers();
    steeredRef.current = false;
    visualStartRef.current = null;
    const store = useAdStore.getState();
    store.markFinishing();
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    try {
      if (id) {
        await stopOrbisAdStream(id).catch(() => undefined);
        await finishAdSession(id).catch(() => undefined);
      }
    } finally {
      if (options?.failed) store.markFailed(options.error || "Ad failed");
      resumeYouTube();
      store.markIdle();
      finishingRef.current = false;
    }
  }, [clearTimers, resumeYouTube]);

  const runTransition = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || steeredRef.current) return;
    steeredRef.current = true;
    useAdStore.getState().markTransition();
    try {
      await steerOrbisAdStream(id);
    } catch (error) {
      await teardownAd({ failed: true, error: error instanceof Error ? error.message : String(error) });
    }
  }, [teardownAd]);

  const startClock = useCallback(() => {
    if (visualStartRef.current !== null) return;
    visualStartRef.current = performance.now();
    useAdStore.getState().markAdPlaying();
    clockRef.current = window.setInterval(() => {
      const start = visualStartRef.current;
      if (start === null) return;
      const elapsed = performance.now() - start;
      useAdStore.getState().setVisualElapsedMs(elapsed);
      if (elapsed >= TRANSITION_AT * 1000 - STEER_LEAD_MS) void runTransition();
      if (elapsed >= AD_SECONDS * 1000) void teardownAd();
    }, 100);
  }, [runTransition, teardownAd]);

  const onRelayFirstFrame = useCallback(() => {
    if (firstFrameTimerRef.current !== null) window.clearTimeout(firstFrameTimerRef.current);
    firstFrameTimerRef.current = null;
    if (useAdStore.getState().phase === "waiting_frame") startClock();
  }, [startClock]);

  const beginBreak = useCallback(async (source: "trigger" | "auto") => {
    const store = useAdStore.getState();
    if (store.phase !== "idle" || !youtube.ready) return;
    if (!briefId) {
      store.setError("Choose a product before starting an ad break");
      return;
    }
    if (!youtube.isEligibleBreak({ bypassCues: source === "trigger", autoBreakUsed })) {
      if (source === "trigger") store.setError("Break not eligible yet (avoid the first 5s and last 10s).");
      return;
    }

    youtube.pause();
    const resumeTimestamp = youtube.getCurrentTime();
    resumeAtRef.current = resumeTimestamp;
    store.beginArming({ videoId, resumeTimestamp });
    if (source === "auto") store.markAutoBreakUsed();

    try {
      const frame = await fetchResumeFrameBlob(videoId, resumeTimestamp);
      store.setResumeFrameNote(frame.source === "stream"
        ? `resume frame: stream extract at ${resumeTimestamp.toFixed(1)}s`
        : "resume frame: thumbnail fallback (stream extract failed)");
      const started = await startAdSession({
        youtube_video_id: videoId,
        resume_timestamp_seconds: resumeTimestamp,
        resume_frame_base64: await blobToBase64(frame.blob),
        brief_id: briefId,
        targeting_context: { region: "US", content_category: "general" },
      });
      if (started.skipped) throw new Error(started.safety_reason || "Ad skipped for brand safety");
      if (!started.ad_session_id || !started.prompt) throw new Error("Ad start returned no session prompt");

      sessionIdRef.current = started.ad_session_id;
      store.setSessionMeta({
        adSessionId: started.ad_session_id,
        promptId: started.prompt_id || "",
        promptVersion: started.prompt_version || 0,
        approvedPrompt: started.prompt,
      });
      store.markWaitingFrame();
      store.incrementStartCount();
      const stream = await startOrbisAdStream(started.ad_session_id);
      store.setRelayUrl(stream.frames_url);
      firstFrameTimerRef.current = setTimeout(() => {
        if (useAdStore.getState().phase === "waiting_frame") {
          void teardownAd({ failed: true, error: "Timed out waiting for first Orbis frame" });
        }
      }, FIRST_FRAME_TIMEOUT_MS);
    } catch (error) {
      await teardownAd({ failed: true, error: error instanceof Error ? error.message : String(error) });
    }
  }, [autoBreakUsed, briefId, teardownAd, videoId, youtube]);

  useEffect(() => {
    if (phase !== "idle" || !youtube.ready) return;
    const interval = window.setInterval(() => {
      if (useAdStore.getState().phase === "idle" && youtube.nearestCueHit(useAdStore.getState().autoBreakUsed)) {
        void beginBreak("auto");
      }
    }, 400);
    return () => window.clearInterval(interval);
  }, [beginBreak, phase, youtube]);

  useEffect(() => {
    const onPageHide = () => {
      const id = sessionIdRef.current;
      if (!id) return;
      void stopOrbisAdStream(id, { keepalive: true }).catch(() => undefined);
      void finishAdSession(id, { keepalive: true }).catch(() => undefined);
      sessionIdRef.current = null;
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    triggerBreak: () => void beginBreak("trigger"),
    skipAd: () => void teardownAd(),
    onRelayFirstFrame,
  };
}
