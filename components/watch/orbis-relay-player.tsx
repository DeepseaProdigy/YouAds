"use client";

import { useEffect, useRef } from "react";

export function OrbisRelayPlayer({
  framesUrl,
  onFirstFrame,
}: {
  framesUrl: string | null;
  onFirstFrame: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seenFrame = useRef(false);

  useEffect(() => {
    if (!framesUrl) return;
    seenFrame.current = false;
    const service = process.env.NEXT_PUBLIC_ORBIS_SERVICE_URL ?? "http://localhost:8000";
    const base = new URL(service);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(new URL(framesUrl, base).toString());
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type?: string; data?: string };
      if (message.type !== "frame" || !message.data) return;
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        if (!seenFrame.current) {
          seenFrame.current = true;
          onFirstFrame();
        }
      };
      image.src = `data:image/jpeg;base64,${message.data}`;
    };
    return () => socket.close();
  }, [framesUrl, onFirstFrame]);

  return <canvas className="orbis-relay-player" ref={canvasRef} />;
}
