"use client";

import { OrbisPlayer } from "@/components/orbis-player";
import { AD_SECONDS } from "@/lib/ads/constants";
import { useAdStore } from "@/lib/ads/ad-store";

type AdOverlayProps = {
  connected: boolean;
  muted: boolean;
  runStarted: boolean;
  status: string;
  onSkip: () => void;
};

export function AdOverlay({
  connected,
  muted,
  runStarted,
  status,
  onSkip,
}: AdOverlayProps) {
  const preparing = useAdStore((s) => s.preparing);
  const overlayVisible = useAdStore((s) => s.overlayVisible);
  const visualElapsedMs = useAdStore((s) => s.visualElapsedMs);
  const phase = useAdStore((s) => s.phase);

  const showCover =
    preparing ||
    overlayVisible ||
    phase === "arming" ||
    phase === "waiting_frame" ||
    phase === "ad" ||
    phase === "transition" ||
    phase === "finishing";

  if (!showCover) return null;

  const remaining = Math.max(
    0,
    Math.ceil(AD_SECONDS - visualElapsedMs / 1000),
  );

  return (
    <div className="ad-overlay" aria-live="polite">
      {(preparing || phase === "waiting_frame" || phase === "arming") &&
        !overlayVisible && (
          <div className="ad-preparing">Preparing ad…</div>
        )}

      {overlayVisible && (
        <>
          <div className="ad-player-layer">
            <OrbisPlayer
              connected={connected}
              muted={muted}
              runStarted={runStarted}
              status={status}
            />
          </div>
          <div className="ad-chrome">
            <span className="ad-chip">Generated ad</span>
            <span className="ad-countdown">{remaining}</span>
            <button
              type="button"
              className="ad-skip"
              onClick={onSkip}
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
