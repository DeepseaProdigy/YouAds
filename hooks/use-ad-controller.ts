"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import {
  isQuotaExceededError,
  otherTabOwnsOrbisLock,
} from "@/lib/orbis-session-lock";

/** Outer rounds of the "slot is full" auto-retry, on top of the ~12 inner
 * backoff attempts `useOrbisSession` already runs per round. Each round is
 * spaced out further apart to outlast a stale/zombie session's server-side
 * timeout without the user re-clicking Connect. */
const AUTO_RETRY_MAX_ROUNDS = 6;
const AUTO_RETRY_DELAY_MS = 20_000;

type UseAdControllerArgs = {
  youtube: YouTubePlayerApi;
  orbis: OrbisSession;
  videoId: string;
  briefId: string;
  /** Hand-written prompt that overrides the AI-expanded one when non-empty. */
  promptOverride?: string;
};

export function useAdController({
  youtube,
  orbis,
  videoId,
  briefId,
  promptOverride,
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
  const scheduleFiredRef = useRef(false);
  const [scheduledBreakAt, setScheduledBreakAt] = useState<number | null>(
    null,
  );

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

        const trimmedOverride = promptOverride?.trim();
        const started = await startAdSession({
          youtube_video_id: videoId,
          resume_timestamp_seconds: resumeTimestamp,
          resume_frame_base64: base64,
          brief_id: briefId,
          targeting_context: {
            region: "US",
            content_category: "general",
          },
          ...(trimmedOverride
            ? { prompt_override: trimmedOverride }
            : {}),
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
    [
      autoBreakUsed,
      briefId,
      orbis,
      promptOverride,
      resumeYouTube,
      teardownAd,
      videoId,
      youtube,
    ],
  );

  const triggerBreak = useCallback(() => {
    void beginBreak("trigger");
  }, [beginBreak]);

  const scheduleBreakAt = useCallback(
    (seconds: number | null) => {
      if (seconds === null) {
        scheduleFiredRef.current = false;
        setScheduledBreakAt(null);
        return;
      }
      if (!Number.isFinite(seconds) || seconds < 0) return;
      scheduleFiredRef.current = false;
      setScheduledBreakAt(seconds);
      youtube.play();
    },
    [youtube],
  );

  const warmedRef = useRef(false);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const autoRetryAttemptRef = useRef(0);

  const clearAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current !== null) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    autoRetryAttemptRef.current = 0;
    useAdStore.getState().setOrbisAutoRetrying({ retrying: false });
  }, []);

  const connectOnce = useCallback(() => {
    if (connectingRef.current) return;
    if (otherTabOwnsOrbisLock()) {
      useAdStore
        .getState()
        .setError(
          "Orbis is active in another browser tab. Close it or disconnect " +
            "there first.",
        );
      return;
    }
    connectingRef.current = true;
    void orbis
      .connectSession()
      .finally(() => {
        connectingRef.current = false;
      });
  }, [orbis]);

  useEffect(() => {
    if (warmedRef.current) return;
    if (orbis.status !== "disconnected") return;
    if (otherTabOwnsOrbisLock()) return;
    warmedRef.current = true;
    warmTimerRef.current = setTimeout(() => {
      warmTimerRef.current = null;
      if (otherTabOwnsOrbisLock()) return;
      connectOnce();
    }, 1_500);
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
    clearAutoRetry();
    warmedRef.current = true;
    if (warmTimerRef.current !== null) {
      clearTimeout(warmTimerRef.current);
      warmTimerRef.current = null;
    }
    if (connectingRef.current) return;
    connectingRef.current = true;
    void orbis
      .disconnectSession()
      .then(() => orbis.connectSession())
      .finally(() => {
        connectingRef.current = false;
      });
  }, [clearAutoRetry, orbis]);

  const disconnectOrbis = useCallback(() => {
    useAdStore.getState().setError("");
    clearAutoRetry();
    if (warmTimerRef.current !== null) {
      clearTimeout(warmTimerRef.current);
      warmTimerRef.current = null;
    }
    void orbis.disconnectSession();
  }, [clearAutoRetry, orbis]);

  useEffect(() => {
    if (!orbis.error) return;
    useAdStore.getState().setError(formatOrbisError(orbis.error));
  }, [orbis.error]);

  // Once connected, drop any pending auto-retry.
  useEffect(() => {
    if (orbis.connected) clearAutoRetry();
  }, [clearAutoRetry, orbis.connected]);

  // "Slot is full" almost always means a stale session is still open under
  // this key (a crashed tab, a hard refresh, /agent-lab's demo connection,
  // etc.) that only clears once the Reactor server times it out. Instead of
  // surfacing the same error forever and making the user keep clicking
  // Connect, keep quietly retrying in the background for a few minutes.
  useEffect(() => {
    if (!orbis.error) return;
    if (orbis.connected) return;
    if (!isQuotaExceededError(orbis.error)) return;
    if (connectingRef.current) return;
    if (autoRetryTimerRef.current !== null) return;
    if (autoRetryAttemptRef.current >= AUTO_RETRY_MAX_ROUNDS) return;

    autoRetryAttemptRef.current += 1;
    const attempt = autoRetryAttemptRef.current;
    useAdStore.getState().setOrbisAutoRetrying({
      retrying: true,
      attempt,
      retryAt: Date.now() + AUTO_RETRY_DELAY_MS,
    });
    autoRetryTimerRef.current = setTimeout(() => {
      autoRetryTimerRef.current = null;
      if (otherTabOwnsOrbisLock()) return;
      connectOnce();
    }, AUTO_RETRY_DELAY_MS);
  }, [connectOnce, orbis.connected, orbis.error]);

  useEffect(() => () => clearAutoRetry(), [clearAutoRetry]);

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

  // Scheduled break: fire once playback reaches the chosen timestamp.
  useEffect(() => {
    if (scheduledBreakAt === null) return;
    if (phase !== "idle" || !youtube.ready) return;
    const id = window.setInterval(() => {
      if (scheduleFiredRef.current) return;
      if (useAdStore.getState().phase !== "idle") return;
      if (youtube.getCurrentTime() >= scheduledBreakAt) {
        scheduleFiredRef.current = true;
        setScheduledBreakAt(null);
        void beginBreak("trigger");
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [beginBreak, phase, scheduledBreakAt, youtube]);

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

  useEffect(() => {
    const onHide = () => {
      const id = sessionIdRef.current;
      if (id) {
        void finishAdSession(id, { keepalive: true }).catch(
          () => undefined,
        );
        sessionIdRef.current = null;
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    triggerBreak,
    scheduledBreakAt,
    scheduleBreakAt,
    skipAd,
    reconnectOrbis,
    disconnectOrbis,
    cancelAutoRetry: clearAutoRetry,
  };
}
