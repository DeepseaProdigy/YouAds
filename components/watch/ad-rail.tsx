"use client";

import { AD_SECONDS } from "@/lib/ads/constants";
import { useAdStore } from "@/lib/ads/ad-store";

export function AdRail({ youtubeReady }: { youtubeReady: boolean }) {
  const phase = useAdStore((s) => s.phase);
  const elapsed = useAdStore((s) => s.visualElapsedMs);
  const promptId = useAdStore((s) => s.promptId);
  const promptVersion = useAdStore((s) => s.promptVersion);
  const resumeTimestamp = useAdStore((s) => s.resumeTimestamp);
  const resumeFrameNote = useAdStore((s) => s.resumeFrameNote);
  const approvedPrompt = useAdStore((s) => s.approvedPrompt);
  const relayUrl = useAdStore((s) => s.relayUrl);
  const error = useAdStore((s) => s.error);

  return <aside className="ad-rail">
    <h2>Ad telemetry</h2>
    <dl className="ad-telemetry">
      <div><dt>Phase</dt><dd>{phase}</dd></div>
      <div><dt>Visual clock</dt><dd>{(elapsed / 1000).toFixed(1)}s / {AD_SECONDS}s</dd></div>
      <div><dt>Prompt</dt><dd>{promptId ? `${promptId} v${promptVersion}` : "—"}</dd></div>
      <div><dt>Resume at</dt><dd>{resumeTimestamp === null ? "—" : `${resumeTimestamp.toFixed(2)}s`}</dd></div>
      <div><dt>YouTube</dt><dd>{youtubeReady ? "ready" : "loading"}</dd></div>
      <div><dt>Orbis</dt><dd>{relayUrl ? "server stream connected" : "backend-managed"}</dd></div>
    </dl>
    <p className="ad-note">{resumeFrameNote}</p>
    {approvedPrompt && <div className="ad-prompt-preview"><strong>Approved prompt</strong><p>{approvedPrompt}</p></div>}
    {error && <p className="error">{error}</p>}
  </aside>;
}
