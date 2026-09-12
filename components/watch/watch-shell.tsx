"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import {
  useCallback,
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
  const { triggerBreak, skipAd, reconnectOrbis } = useAdController({
    youtube,
    orbis,
    videoId,
    briefId,
  });

  const phase = useAdStore((s) => s.phase);
  const storeError = useAdStore((s) => s.error);
  const busy = phase !== "idle" && phase !== "failed";

  const canTrigger =
    youtube.ready &&
    orbis.connected &&
    phase === "idle" &&
    Boolean(briefId);

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
            Connect Orbis
          </button>
        )}
      </header>

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
