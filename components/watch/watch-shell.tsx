"use client";

import { useState } from "react";

import { AdOverlay } from "@/components/watch/ad-overlay";
import { AdRail } from "@/components/watch/ad-rail";
import { YoutubeStage } from "@/components/watch/youtube-stage";
import { useAdController } from "@/hooks/use-ad-controller";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { useAdStore } from "@/lib/ads/ad-store";
import { DEFAULT_YOUTUBE_VIDEO_ID } from "@/lib/ads/constants";
import { listProductCatalog } from "@/lib/ads/prompt-bank";

const PRODUCT_CATALOG = listProductCatalog();

function readVideoIdFromUrl(): string {
  if (typeof window === "undefined") return DEFAULT_YOUTUBE_VIDEO_ID;
  const param = new URLSearchParams(window.location.search).get("v");
  return param && /^[a-zA-Z0-9_-]{6,20}$/.test(param) ? param : DEFAULT_YOUTUBE_VIDEO_ID;
}

export function WatchShell() {
  const [videoId, setVideoId] = useState(readVideoIdFromUrl);
  const [videoInput, setVideoInput] = useState(videoId);
  const youtube = useYouTubePlayer(videoId);
  const [briefId, setBriefId] = useState(PRODUCT_CATALOG[0]?.id ?? "");
  const { triggerBreak, skipAd, onRelayFirstFrame } = useAdController({ youtube, videoId, briefId });
  const phase = useAdStore((s) => s.phase);
  const storeError = useAdStore((s) => s.error);
  const busy = phase !== "idle" && phase !== "failed";
  const canTrigger = youtube.ready && phase === "idle" && Boolean(briefId);

  const applyVideoId = (value: string) => {
    const trimmed = value.trim();
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(trimmed)) return;
    setVideoId(trimmed);
    const url = new URL(window.location.href);
    url.searchParams.set("v", trimmed);
    window.history.replaceState({}, "", url);
  };

  return (
    <section className="watch-shell">
      <header className="watch-chrome">
        <p className="wordmark">Orbis Ads<span>in-video</span></p>
        <form className="video-id-form" onSubmit={(event) => { event.preventDefault(); applyVideoId(videoInput); }}>
          <label>Video id
            <input value={videoInput} onChange={(event) => setVideoInput(event.target.value)} spellCheck={false} disabled={busy} />
          </label>
          <button type="submit" disabled={busy}>Load</button>
        </form>
        <label className="product-picker">Product
          <select value={briefId} disabled={busy} onChange={(event) => setBriefId(event.target.value)}>
            {PRODUCT_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.product_label} ({item.category})</option>)}
          </select>
        </label>
        <button type="button" className="trigger-break" disabled={!canTrigger} onClick={triggerBreak}>Trigger ad break</button>
      </header>

      <div className="watch-grid">
        <div className="stage-stack">
          <YoutubeStage hostRef={youtube.hostRef} ready={youtube.ready} />
          <AdOverlay onSkip={skipAd} onFirstFrame={onRelayFirstFrame} />
        </div>
        <AdRail youtubeReady={youtube.ready} />
      </div>

      {(youtube.error || storeError) && <p className="stage-error">{youtube.error || storeError}</p>}
      {!storeError && <p className="stage-hint">Orbis runs in the backend. Trigger an ad break to create a server-owned stream.</p>}
    </section>
  );
}
