"use client";

import { AD_SECONDS } from "@/lib/ads/constants";
import { useAdStore } from "@/lib/ads/ad-store";
import { formatOrbisError } from "@/lib/ads/format-orbis-error";

type AdRailProps = {
  orbisStatus: string;
  orbisEvents: string[];
  orbisConnected: boolean;
  orbisError: string;
  youtubeReady: boolean;
};

export function AdRail({
  orbisStatus,
  orbisEvents,
  orbisConnected,
  orbisError,
  youtubeReady,
}: AdRailProps) {
  const phase = useAdStore((s) => s.phase);
  const visualElapsedMs = useAdStore((s) => s.visualElapsedMs);
  const promptId = useAdStore((s) => s.promptId);
  const promptVersion = useAdStore((s) => s.promptVersion);
  const startCount = useAdStore((s) => s.startCount);
  const resetCount = useAdStore((s) => s.resetCount);
  const resumeFrameNote = useAdStore((s) => s.resumeFrameNote);
  const resumeTimestamp = useAdStore((s) => s.resumeTimestamp);
  const error = useAdStore((s) => s.error);
  const approvedPrompt = useAdStore((s) => s.approvedPrompt);

  const elapsed = (visualElapsedMs / 1000).toFixed(1);

  return (
    <aside className="ad-rail">
      <h2>Ad telemetry</h2>
      <dl className="ad-telemetry">
        <div>
          <dt>Phase</dt>
          <dd>{phase}</dd>
        </div>
        <div>
          <dt>Visual clock</dt>
          <dd>
            {elapsed}s / {AD_SECONDS}s
          </dd>
        </div>
        <div>
          <dt>Prompt</dt>
          <dd>
            {promptId
              ? `${promptId} v${promptVersion}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Starts / resets</dt>
          <dd>
            {startCount} / {resetCount}
          </dd>
        </div>
        <div>
          <dt>Resume at</dt>
          <dd>
            {resumeTimestamp !== null
              ? `${resumeTimestamp.toFixed(2)}s`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>YouTube</dt>
          <dd>{youtubeReady ? "ready" : "loading"}</dd>
        </div>
        <div>
          <dt>Orbis</dt>
          <dd>
            {orbisConnected ? orbisStatus : "disconnected"}
          </dd>
        </div>
      </dl>

      <p className="ad-note">{resumeFrameNote}</p>

      {approvedPrompt && (
        <div className="ad-prompt-preview">
          <strong>Approved prompt</strong>
          <p>{approvedPrompt}</p>
        </div>
      )}

      <div className="ad-events">
        <strong>Orbis events</strong>
        <code>
          {orbisEvents.length
            ? orbisEvents.join(" · ")
            : "No events yet"}
        </code>
      </div>

      {orbisError && (
        <p className="error">{formatOrbisError(orbisError)}</p>
      )}
      {error && <p className="error">{error}</p>}
    </aside>
  );
}
