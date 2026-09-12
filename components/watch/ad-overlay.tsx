"use client";

import { OrbisRelayPlayer } from "@/components/watch/orbis-relay-player";
import { AD_SECONDS } from "@/lib/ads/constants";
import { useAdStore } from "@/lib/ads/ad-store";

export function AdOverlay({ onSkip, onFirstFrame }: { onSkip: () => void; onFirstFrame: () => void }) {
  const preparing = useAdStore((s) => s.preparing);
  const overlayVisible = useAdStore((s) => s.overlayVisible);
  const visualElapsedMs = useAdStore((s) => s.visualElapsedMs);
  const phase = useAdStore((s) => s.phase);
  const relayUrl = useAdStore((s) => s.relayUrl);
  const showCover = preparing || overlayVisible || ["arming", "waiting_frame", "ad", "transition", "finishing"].includes(phase);
  if (!showCover) return null;

  const remaining = Math.max(0, Math.ceil(AD_SECONDS - visualElapsedMs / 1000));
  return (
    <div className="ad-overlay" aria-live="polite">
      {(preparing || phase === "waiting_frame" || phase === "arming") && !overlayVisible && <div className="ad-preparing">Preparing generated ad…</div>}
      {relayUrl && <div className="ad-player-layer"><OrbisRelayPlayer framesUrl={relayUrl} onFirstFrame={onFirstFrame} /></div>}
      {overlayVisible && <div className="ad-chrome">
        <span className="ad-chip">Generated ad</span>
        <span className="ad-countdown">{remaining}</span>
        <button type="button" className="ad-skip" onClick={onSkip}>Skip</button>
      </div>}
    </div>
  );
}
