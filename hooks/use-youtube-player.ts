"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  AUTO_BREAK_CUES,
  BREAK_EDGE_END_S,
  BREAK_EDGE_START_S,
} from "@/lib/ads/constants";

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
};

type YtNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: Record<string, unknown>,
  ) => YtPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No window"));
  }
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector("script[data-yt-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.ytApi = "1";
      document.head.appendChild(script);
    }
  });
  return apiLoadPromise;
}

export type YouTubePlayerApi = {
  ready: boolean;
  error: string;
  hostRef: RefObject<HTMLDivElement | null>;
  pause: () => void;
  play: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  loadVideoById: (videoId: string) => void;
  isEligibleBreak: (opts?: {
    bypassCues?: boolean;
    autoBreakUsed?: boolean;
  }) => boolean;
  nearestCueHit: (autoBreakUsed: boolean) => boolean;
};

export function useYouTubePlayer(
  videoId: string,
): YouTubePlayerApi {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await loadYouTubeApi();
        if (cancelled || !hostRef.current || !window.YT) return;

        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        playerRef.current = new window.YT.Player(hostRef.current, {
          videoId: videoIdRef.current,
          width: "100%",
          height: "100%",
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onError: () => {
              if (!cancelled) {
                setError("YouTube player error");
              }
            },
          },
        });
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : String(caught),
          );
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    playerRef.current.loadVideoById(videoId);
  }, [ready, videoId]);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const play = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
  }, []);

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.getCurrentTime() ?? 0;
  }, []);

  const getDuration = useCallback(() => {
    return playerRef.current?.getDuration() ?? 0;
  }, []);

  const getPlayerState = useCallback(() => {
    return playerRef.current?.getPlayerState() ?? -1;
  }, []);

  const loadVideoById = useCallback((nextId: string) => {
    playerRef.current?.loadVideoById(nextId);
  }, []);

  const isEligibleBreak = useCallback(
    (opts?: { bypassCues?: boolean; autoBreakUsed?: boolean }) => {
      const t = getCurrentTime();
      const duration = getDuration();
      if (t < BREAK_EDGE_START_S) return false;
      if (duration > 0 && t > duration - BREAK_EDGE_END_S) {
        return false;
      }
      if (opts?.bypassCues) return true;
      if (opts?.autoBreakUsed) return false;
      return nearestCue(t);
    },
    [getCurrentTime, getDuration],
  );

  const nearestCueHit = useCallback(
    (autoBreakUsed: boolean) => {
      if (autoBreakUsed) return false;
      return nearestCue(getCurrentTime());
    },
    [getCurrentTime],
  );

  return {
    ready,
    error,
    hostRef,
    pause,
    play,
    seekTo,
    getCurrentTime,
    getDuration,
    getPlayerState,
    loadVideoById,
    isEligibleBreak,
    nearestCueHit,
  };
}

function nearestCue(t: number): boolean {
  return AUTO_BREAK_CUES.some((cue) => Math.abs(t - cue) < 0.6);
}
