"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AdOverlay } from "@/components/watch/ad-overlay";
import { AdRail } from "@/components/watch/ad-rail";
import { YoutubeStage } from "@/components/watch/youtube-stage";
import { useAdController } from "@/hooks/use-ad-controller";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { useAdStore } from "@/lib/ads/ad-store";
import { DEFAULT_YOUTUBE_VIDEO_ID } from "@/lib/ads/constants";
import { listProductCatalog } from "@/lib/ads/prompt-bank";
import {
  ORBIS_MODEL_NAME,
  ORBIS_TRACKS,
  requestReactorJwt,
} from "@/lib/orbis";

const PRODUCT_CATALOG = listProductCatalog();

function readVideoIdFromUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_YOUTUBE_VIDEO_ID;
  }
  const param = new URLSearchParams(window.location.search).get("v");
  if (param && /^[a-zA-Z0-9_-]{6,20}$/.test(param)) return param;
  return DEFAULT_YOUTUBE_VIDEO_ID;
}

/** Accepts "95", "95.5", or "1:35" and returns seconds, or null if invalid. */
function parseTimestampInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(trimmed);
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  return null;
}

function formatTimestamp(seconds: number): string {
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  const frac = seconds - whole;
  if (mins > 0) {
    return frac > 0
      ? `${mins}:${String(secs).padStart(2, "0")}.${frac.toFixed(1).slice(2)}`
      : `${mins}:${String(secs).padStart(2, "0")}`;
  }
  return frac > 0 ? seconds.toFixed(1) : String(whole);
}

export function WatchShell() {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const getJwt = useCallback(() => {
    jwtPromise.current ??= requestReactorJwt();
    return jwtPromise.current;
  }, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
  }, []);

  const modelTracks = useMemo(() => [...ORBIS_TRACKS], []);
  const connectOptions = useMemo(
    () => ({ autoConnect: false as const }),
    [],
  );

  const [videoId, setVideoId] = useState(readVideoIdFromUrl);
  const [videoInput, setVideoInput] = useState(videoId);

  return (
    <section className="watch-shell">
      <ReactorProvider
        apiUrl="https://api.reactor.inc"
        modelName={ORBIS_MODEL_NAME}
        modelTracks={modelTracks}
        connectOptions={connectOptions}
        jwtToken={getJwt}
      >
        <WatchSession
          clearJwt={clearJwt}
          videoId={videoId}
          videoInput={videoInput}
          setVideoInput={setVideoInput}
          onApplyVideoId={(next) => {
            const trimmed = next.trim();
            if (!/^[a-zA-Z0-9_-]{6,20}$/.test(trimmed)) return;
            setVideoId(trimmed);
            const url = new URL(window.location.href);
            url.searchParams.set("v", trimmed);
            window.history.replaceState({}, "", url);
          }}
        />
      </ReactorProvider>
    </section>
  );
}

function WatchSession({
  clearJwt,
  videoId,
  videoInput,
  setVideoInput,
  onApplyVideoId,
}: {
  clearJwt: () => void;
  videoId: string;
  videoInput: string;
  setVideoInput: (value: string) => void;
  onApplyVideoId: (value: string) => void;
}) {
  const orbis = useOrbisSession(clearJwt);
  const youtube = useYouTubePlayer(videoId);
  const [briefId, setBriefId] = useState(
    PRODUCT_CATALOG[0]?.id ?? "",
  );
  const [promptOverride, setPromptOverride] = useState("");
  const [breakTimeInput, setBreakTimeInput] = useState("");
  const [breakTimeError, setBreakTimeError] = useState("");
  const {
    triggerBreak,
    scheduledBreakAt,
    scheduleBreakAt,
    skipAd,
    reconnectOrbis,
    disconnectOrbis,
  } = useAdController({
      youtube,
      orbis,
      videoId,
      briefId,
      promptOverride,
    });

  const phase = useAdStore((s) => s.phase);
  const storeError = useAdStore((s) => s.error);
  const orbisAutoRetrying = useAdStore((s) => s.orbisAutoRetrying);
  const orbisRetryAttempt = useAdStore((s) => s.orbisRetryAttempt);
  const orbisRetryAt = useAdStore((s) => s.orbisRetryAt);
  const busy = phase !== "idle" && phase !== "failed";

  const [retryCountdown, setRetryCountdown] = useState(0);
  useEffect(() => {
    if (!orbisAutoRetrying || orbisRetryAt === null) {
      setRetryCountdown(0);
      return;
    }
    const tick = () => {
      setRetryCountdown(Math.max(0, Math.ceil((orbisRetryAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [orbisAutoRetrying, orbisRetryAt]);

  const canTrigger =
    youtube.ready &&
    orbis.connected &&
    phase === "idle" &&
    Boolean(briefId);

  const scheduleActive = scheduledBreakAt !== null;
  const canSchedule = canTrigger && !scheduleActive;

  return (
    <>
      <header className="watch-chrome">
        <p className="wordmark">
          Orbis Ads
          <span>in-video</span>
        </p>
        <form
          className="video-id-form"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyVideoId(videoInput);
          }}
        >
          <label>
            Video id
            <input
              value={videoInput}
              onChange={(event) => setVideoInput(event.target.value)}
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <button type="submit" disabled={busy}>
            Load
          </button>
        </form>
        <label className="product-picker">
          Product
          <select
            value={briefId}
            disabled={busy}
            onChange={(event) => setBriefId(event.target.value)}
          >
            {PRODUCT_CATALOG.map((item) => (
              <option key={item.id} value={item.id}>
                {item.product_label} ({item.category})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="trigger-break"
          disabled={!canTrigger}
          onClick={triggerBreak}
        >
          Trigger ad break
        </button>
        {!orbis.connected && (
          <button
            type="button"
            className="reconnect-orbis"
            disabled={orbis.controlsBusy || phase !== "idle"}
            onClick={reconnectOrbis}
          >
            {orbisAutoRetrying
              ? `Retrying in ${retryCountdown}s… (Connect now)`
              : "Connect Orbis"}
          </button>
        )}
        {orbis.connected && (
          <button
            type="button"
            className="disconnect-orbis"
            disabled={orbis.controlsBusy || busy}
            onClick={disconnectOrbis}
          >
            Disconnect
          </button>
        )}
      </header>

      {orbis.controlsBusy && orbis.retryTotal > 0 && !orbisAutoRetrying && (
        <p className="stage-hint retry-hint">
          Connecting to Orbis… retry {orbis.retryAttempt}/{orbis.retryTotal}
          {" "}(a busy key slot can take up to ~2 minutes to free up).
        </p>
      )}

      {orbisAutoRetrying && !orbis.connected && (
        <p className="stage-hint retry-hint">
          Orbis session slot is full — this usually means a stale session
          (a crashed tab, a hard refresh, or another page/browser using this
          key) is still open on the server. Auto-retrying attempt{" "}
          {orbisRetryAttempt} in {retryCountdown}s. Close any other tabs/
          windows using Orbis to speed this up, or press Connect Orbis to
          retry immediately.
        </p>
      )}

      <div className="ad-controls">
        <form
          className="timestamp-form"
          onSubmit={(event) => {
            event.preventDefault();
            const seconds = parseTimestampInput(breakTimeInput);
            if (seconds === null) {
              setBreakTimeError("Use seconds (95) or mm:ss (1:35)");
              return;
            }
            setBreakTimeError("");
            scheduleBreakAt(seconds);
          }}
        >
          <label>
            Run ad at timestamp
            <input
              placeholder="e.g. 1:35 or 95"
              value={breakTimeInput}
              onChange={(event) => {
                setBreakTimeInput(event.target.value);
                setBreakTimeError("");
              }}
              disabled={!canSchedule}
              spellCheck={false}
            />
          </label>
          <button type="submit" disabled={!canSchedule || !breakTimeInput.trim()}>
            Schedule
          </button>
          {breakTimeError && (
            <span className="field-error">{breakTimeError}</span>
          )}
        </form>

        {scheduleActive && scheduledBreakAt !== null && (
          <div className="schedule-status">
            <span>
              Scheduled for {formatTimestamp(scheduledBreakAt)} — waiting for
              playback…
            </span>
            <button
              type="button"
              className="schedule-cancel"
              disabled={busy}
              onClick={() => scheduleBreakAt(null)}
            >
              Cancel
            </button>
          </div>
        )}

        <label className="prompt-override">
          Ad prompt override (optional — leave blank to auto-generate from
          the paused frame)
          <textarea
            value={promptOverride}
            onChange={(event) => setPromptOverride(event.target.value)}
            placeholder="Write the exact Orbis prompt to send for the 0–10s ad beat…"
            disabled={busy}
            rows={3}
            spellCheck
          />
        </label>
      </div>

      <div className="watch-grid">
        <div className="stage-stack">
          <YoutubeStage
            hostRef={youtube.hostRef}
            ready={youtube.ready}
          />
          <AdOverlay
            connected={orbis.connected}
            muted={orbis.muted}
            runStarted={orbis.runStarted}
            status={orbis.status}
            onSkip={skipAd}
          />
        </div>
        <AdRail
          orbisStatus={orbis.status}
          orbisEvents={orbis.events}
          orbisConnected={orbis.connected}
          orbisError={orbis.error}
          youtubeReady={youtube.ready}
        />
      </div>

      {(youtube.error || storeError) && (
        <p className="stage-error">
          {youtube.error || storeError}
        </p>
      )}
      {!orbis.connected && !storeError && (
        <p className="stage-hint">
          YouTube can play without Orbis. Connect Orbis when
          capacity is free, then Trigger ad break.
        </p>
      )}
    </>
  );
}
