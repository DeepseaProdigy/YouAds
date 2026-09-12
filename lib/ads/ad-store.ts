"use client";

import { create } from "zustand";

import type { AdPhase } from "@/lib/ads/types";

export type AdStoreState = {
  phase: AdPhase;
  adSessionId: string | null;
  promptId: string | null;
  promptVersion: number | null;
  approvedPrompt: string | null;
  relayUrl: string | null;
  resumeTimestamp: number | null;
  videoId: string | null;
  visualElapsedMs: number;
  startCount: number;
  resetCount: number;
  autoBreakUsed: boolean;
  preparing: boolean;
  overlayVisible: boolean;
  error: string;
  resumeFrameNote: string;
  setPhase: (phase: AdPhase) => void;
  setVisualElapsedMs: (ms: number) => void;
  setError: (error: string) => void;
  setResumeFrameNote: (note: string) => void;
  setRelayUrl: (url: string | null) => void;
  beginArming: (input: {
    videoId: string;
    resumeTimestamp: number;
  }) => void;
  setSessionMeta: (input: {
    adSessionId: string;
    promptId: string;
    promptVersion: number;
    approvedPrompt: string;
  }) => void;
  markWaitingFrame: () => void;
  markAdPlaying: () => void;
  markTransition: () => void;
  markFinishing: () => void;
  markFailed: (error: string) => void;
  markIdle: () => void;
  markAutoBreakUsed: () => void;
  incrementStartCount: () => void;
};

export const useAdStore = create<AdStoreState>((set) => ({
  phase: "idle",
  adSessionId: null,
  promptId: null,
  promptVersion: null,
  approvedPrompt: null,
  relayUrl: null,
  resumeTimestamp: null,
  videoId: null,
  visualElapsedMs: 0,
  startCount: 0,
  resetCount: 0,
  autoBreakUsed: false,
  preparing: false,
  overlayVisible: false,
  error: "",
  resumeFrameNote:
    "resume frame: extracting from stream at pause time (thumbnail fallback)",

  setPhase: (phase) => set({ phase }),
  setVisualElapsedMs: (visualElapsedMs) => set({ visualElapsedMs }),
  setError: (error) => set({ error }),
  setResumeFrameNote: (resumeFrameNote) => set({ resumeFrameNote }),
  setRelayUrl: (relayUrl) => set({ relayUrl }),

  beginArming: ({ videoId, resumeTimestamp }) =>
    set({
      phase: "arming",
      preparing: true,
      overlayVisible: false,
      videoId,
      resumeTimestamp,
      visualElapsedMs: 0,
      error: "",
      adSessionId: null,
      promptId: null,
      promptVersion: null,
      approvedPrompt: null,
      relayUrl: null,
    }),

  setSessionMeta: ({
    adSessionId,
    promptId,
    promptVersion,
    approvedPrompt,
  }) =>
    set({
      adSessionId,
      promptId,
      promptVersion,
      approvedPrompt,
    }),

  markWaitingFrame: () =>
    set({ phase: "waiting_frame", preparing: true }),

  markAdPlaying: () =>
    set({
      phase: "ad",
      preparing: false,
      overlayVisible: true,
      visualElapsedMs: 0,
    }),

  markTransition: () => set({ phase: "transition" }),

  markFinishing: () =>
    set({
      phase: "finishing",
      preparing: false,
      overlayVisible: false,
    }),

  markFailed: (error) =>
    set({
      phase: "failed",
      error,
      preparing: false,
      overlayVisible: false,
    }),

  markIdle: () =>
    set({
      phase: "idle",
      preparing: false,
      overlayVisible: false,
      adSessionId: null,
      approvedPrompt: null,
      relayUrl: null,
      visualElapsedMs: 0,
    }),

  markAutoBreakUsed: () => set({ autoBreakUsed: true }),

  incrementStartCount: () =>
    set((state) => ({ startCount: state.startCount + 1 })),
}));
