"use client";

import type { RefObject } from "react";

type YoutubeStageProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  ready: boolean;
};

export function YoutubeStage({ hostRef, ready }: YoutubeStageProps) {
  return (
    <div className="yt-stage">
      <div className="yt-frame">
        <div ref={hostRef} />
      </div>
      {!ready && (
        <div className="yt-loading">Loading YouTube player…</div>
      )}
    </div>
  );
}
