"use client";

import { useCallback, useEffect, useRef } from "react";

import type { OrbisSession } from "@/hooks/use-orbis-session";
import type { YouTubePlayerApi } from "@/hooks/use-youtube-player";
import {
  blobToBase64,
  fetchResumeFrameBlob,
  finishAdSession,
  startAdSession,
  transitionAdSession,
} from "@/lib/ads/api";
import {
  AD_SECONDS,
  FIRST_FRAME_TIMEOUT_MS,
  STEER_LEAD_MS,
  TRANSITION_AT,
} from "@/lib/ads/constants";
import { useAdStore } from "@/lib/ads/ad-store";
import { formatOrbisError } from "@/lib/ads/format-orbis-error";

type UseAdControllerArgs = {
  youtube: YouTubePlayerApi;
  orbis: OrbisSession;
  videoId: string;
  briefId: string;
};

export function useAdController({
  youtube,
  orbis,
  videoId,
  briefId,
}: UseAdControllerArgs) {
  const phase = useAdStore((s) => s.phase);
  const autoBreakUsed = useAdStore((s) => s.autoBreakUsed);
  const clockRef = useRef<number | null>(null);
  const visualStartRef = useRef<number | null>(null);
  const steeredRef = useRef(false);
  const finishingRef = useRef(false);
  const firstFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sessionIdRef = useRef<string | null>(null);
  const resumeAtRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (clockRef.current !== null) {
      window.clearInterval(clockRef.current);
      clockRef.current = null;
    }
    if (firstFrameTimerRef.current) {
      clearTimeout(firstFrameTimerRef.current);
      firstFrameTimerRef.current = null;
    }
  }, []);

  const resumeYouTube = useCallback(() => {
    const at = resumeAtRef.current;
    try {
      if (typeof at === "number") {
        youtube.seekTo(at);
      }
      youtube.play();
    } catch {
      useAdStore.getState().setError("Could not resume the video");
    }
  }, [youtube]);

  const teardownAd = useCallback(
    async (opts?: { failed?: boolean; error?: string }) => {
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
          await finishAdSession(id).catch(() => undefined);
        }
      } finally {
        try {
          if (orbis.runStarted) {
            await orbis.pause().catch(() => undefined);
            // Clear between ads so the next break can start again.
            await orbis.reset().catch(() => undefined);
          }
        } catch {
          // Prefer resuming YouTube even if Orbis teardown fails.
        }
        if (opts?.failed) {
          store.markFailed(opts.error || "Ad failed");
        }
        resumeYouTube();
        store.markIdle();
        finishingRef.current = false;
      }
    },
    [clearTimers, orbis, resumeYouTube],
  );

  const skipAd = useCallback(() => {
    void teardownAd();
  }, [teardownAd]);

  const runTransition = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || steeredRef.current) return;
    steeredRef.current = true;
    useAdStore.getState().markTransition();
    try {
      const { transition_prompt } = await transitionAdSession(id);
      await orbis.steerWithPrompt(transition_prompt);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : String(caught);
      await teardownAd({ failed: true, error: message });
    }
  }, [orbis, teardownAd]);

  const startClock = useCallback(() => {
    visualStartRef.current = performance.now();
    useAdStore.getState().markAdPlaying();
    if (clockRef.current !== null) {
      window.clearInterval(clockRef.current);
    }
    clockRef.current = window.setInterval(() => {
      const start = visualStartRef.current;
      if (start === null) return;
      const elapsed = performance.now() - start;
      useAdStore.getState().setVisualElapsedMs(elapsed);

      const steerAtMs = TRANSITION_AT * 1000 - STEER_LEAD_MS;
      if (elapsed >= steerAtMs && !steeredRef.current) {
        void runTransition();
      }
      if (elapsed >= AD_SECONDS * 1000) {
        void teardownAd();
      }
    }, 100);
  }, [runTransition, teardownAd]);

  const beginBreak = useCallback(
    async (source: "trigger" | "auto") => {
      const store = useAdStore.getState();
      if (store.phase !== "idle") return;
      if (!youtube.ready) return;
      if (!orbis.connected) {
        if (source === "trigger") {
          store.setError("Orbis is not connected yet");
        }
        return;
      }

      const eligible = youtube.isEligibleBreak({
        bypassCues: source === "trigger",
        autoBreakUsed,
      });
      if (!eligible) {
        if (source === "trigger") {
          store.setError(
            "Break not eligible yet (avoid the first 5s and last 10s).",
          );
        }
        return;
      }

      youtube.pause();
      const resumeTimestamp = youtube.getCurrentTime();
      resumeAtRef.current = resumeTimestamp;
      store.beginArming({ videoId, resumeTimestamp });
      if (source === "auto") store.markAutoBreakUsed();

      try {
        const { blob, source: frameSource } = await fetchResumeFrameBlob(
          videoId,
          resumeTimestamp,
        );
        store.setResumeFrameNote(
          frameSource === "stream"
            ? `resume frame: stream extract at ${resumeTimestamp.toFixed(1)}s`
            : "resume frame: thumbnail fallback (stream extract failed)",
        );
        const base64 = await blobToBase64(blob);
        const frameFile = new File([blob], "resume.jpg", {
          type: "image/jpeg",
        });

        const started = await startAdSession({
          youtube_video_id: videoId,
          resume_timestamp_seconds: resumeTimestamp,
          resume_frame_base64: base64,
          brief_id: briefId,
          targeting_context: {
            region: "US",
            content_category: "general",
          },
        });

        if (started.skipped) {
          store.setError(
            started.safety_reason
              ? `Ad skipped: ${started.safety_reason}`
              : "Ad skipped for brand safety",
          );
          resumeYouTube();
          store.markIdle();
          finishingRef.current = false;
          return;
        }

        if (!started.ad_session_id || !started.prompt) {
          throw new Error("Ad start returned no session prompt");
        }

        sessionIdRef.current = started.ad_session_id;
        store.setSessionMeta({
          adSessionId: started.ad_session_id,
          promptId: started.prompt_id || "",
          promptVersion: started.prompt_version || 0,
          approvedPrompt: started.prompt,
        });
        store.markWaitingFrame();
        store.incrementStartCount();
        steeredRef.current = false;

        firstFrameTimerRef.current = setTimeout(() => {
          const phaseNow = useAdStore.getState().phase;
          if (
            phaseNow === "waiting_frame" ||
            phaseNow === "arming"
          ) {
            void teardownAd({
              failed: true,
              error: "Timed out waiting for first Orbis frame",
            });
          }
        }, FIRST_FRAME_TIMEOUT_MS);

        await orbis.startAdRun(frameFile, started.prompt);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        await teardownAd({ failed: true, error: message });
      }
    },
    [autoBreakUsed, briefId, orbis, resumeYouTube, teardownAd, videoId, youtube],
  );

  const triggerBreak = useCallback(() => {
    void beginBreak("trigger");
  }, [beginBreak]);

  const warmedRef = useRef(false);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);

  const connectOnce = useCallback(() => {
    // Guard against overlapping connect() calls (e.g. the warm-up timer
    // firing while a manual "Connect Orbis" click is already in flight).
    // Reactor caps concurrent_sessions_per_model at 1, so a double-call
    // from the same tab is enough to trip the same "quota exceeded" error
    // as a truly stale session.
    if (connectingRef.current) return;
    connectingRef.current = true;
    void orbis
      .connectSession()
      .finally(() => {
        connectingRef.current = false;
      });
  }, [orbis]);

  // Warm Orbis once the provider reports disconnected.
  useEffect(() => {
    if (warmedRef.current) return;
    if (orbis.status !== "disconnected") return;
    warmedRef.current = true;
    warmTimerRef.current = setTimeout(() => {
      warmTimerRef.current = null;
      connectOnce();
    }, 250);
    return () => {
      if (warmTimerRef.current !== null) {
        clearTimeout(warmTimerRef.current);
        warmTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbis.status]);

  const reconnectOrbis = useCallback(() => {
    useAdStore.getState().setError("");
    warmedRef.current = true;
    // Cancel the pending auto-warm connect so a manual click can't race it
    // into opening a second session on the same key.
    if (warmTimerRef.current !== null) {
      clearTimeout(warmTimerRef.current);
      warmTimerRef.current = null;
    }
    connectOnce();
  }, [connectOnce]);

  // Surface capacity errors in the rail without auto-retry storms.
  useEffect(() => {
    if (!orbis.error) return;
    useAdStore.getState().setError(formatOrbisError(orbis.error));
  }, [orbis.error]);

  // Visual 0s when Orbis reports generation_started.
  useEffect(() => {
    const store = useAdStore.getState();
    if (
      store.phase === "waiting_frame" &&
      orbis.runStarted &&
      !store.overlayVisible
    ) {
      if (firstFrameTimerRef.current) {
        clearTimeout(firstFrameTimerRef.current);
        firstFrameTimerRef.current = null;
      }
      startClock();
    }
  }, [orbis.runStarted, startClock]);

  // Auto-break cue polling while idle.
  useEffect(() => {
    if (phase !== "idle" || !youtube.ready) return;
    const id = window.setInterval(() => {
      if (useAdStore.getState().phase !== "idle") return;
      if (
        youtube.nearestCueHit(useAdStore.getState().autoBreakUsed)
      ) {
        void beginBreak("auto");
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [beginBreak, phase, youtube]);

  // Fail closed on Orbis command errors during an ad.
  useEffect(() => {
    if (!orbis.error) return;
    const current = useAdStore.getState().phase;
    if (
      current === "arming" ||
      current === "waiting_frame" ||
      current === "ad" ||
      current === "transition"
    ) {
      void teardownAd({ failed: true, error: orbis.error });
    }
  }, [orbis.error, teardownAd]);

  // Unload / pagehide best-effort finish. Also tell Reactor to drop the
  // WebRTC session explicitly — without this, a reload or tab close leaves
  // the session "current" on Reactor's side until their own heartbeat
  // timeout expires, which is what trips concurrent_sessions_per_model
  // (limit=1) on the very next page load from the same tab/key.
  useEffect(() => {
    const onHide = () => {
      const id = sessionIdRef.current;
      if (id) {
        void finishAdSession(id, { keepalive: true }).catch(
          () => undefined,
        );
        sessionIdRef.current = null;
      }
      if (orbis.connected) {
        void orbis.disconnectSession().catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [orbis]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    triggerBreak,
    skipAd,
    reconnectOrbis,
  };
}
