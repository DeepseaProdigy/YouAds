"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type StreamResponse = {
  stream_id: string;
  status: string;
  frames_url: string;
};

const DEFAULT_PROMPT =
  "A premium travel ad for a secluded coastal retreat. A single cinematic unbroken shot, warm sunlight, refined natural textures, no text, no logos, no captions.";

function toWebSocketUrl(serviceUrl: string, framesUrl: string) {
  const base = new URL(serviceUrl);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return new URL(framesUrl, base).toString();
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function AdStreamConsole() {
  const serviceUrl =
    process.env.NEXT_PUBLIC_ORBIS_SERVICE_URL ?? "http://localhost:8000";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [transitionPrompt, setTransitionPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [streamId, setStreamId] = useState("");
  const [status, setStatus] = useState("Ready to create an ad stream");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!streamId) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => Math.min(value + 1, 15));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [streamId]);

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  const drawFrame = (data: string) => {
    const imageElement = new Image();
    imageElement.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      canvas.getContext("2d")?.drawImage(imageElement, 0, 0);
    };
    imageElement.src = `data:image/jpeg;base64,${data}`;
  };

  const connectRelay = (framesUrl: string) => {
    socketRef.current?.close();
    const socket = new WebSocket(toWebSocketUrl(serviceUrl, framesUrl));
    socketRef.current = socket;
    socket.onopen = () => setStatus("Streaming generated frames");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type?: string; data?: string };
      if (message.type === "frame" && message.data) drawFrame(message.data);
    };
    socket.onerror = () => setStatus("Frame relay connection failed");
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
    };
  };

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const start = async () => {
    if (!prompt.trim()) return setStatus("Enter an approved ad prompt first");
    setBusy(true);
    setStatus("Starting Reactor / Orbis stream…");
    setElapsed(0);
    try {
      const response = await fetch(`${serviceUrl}/v1/ad-streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_prompt: prompt.trim(),
          resume_frame_base64: image ? await readFileAsBase64(image) : undefined,
        }),
      });
      const result = (await response.json()) as StreamResponse | { detail?: string };
      if (!response.ok || !("stream_id" in result)) {
        throw new Error("detail" in result ? result.detail : "Could not start stream");
      }
      setStreamId(result.stream_id);
      connectRelay(result.frames_url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start stream");
    } finally {
      setBusy(false);
    }
  };

  const steer = async () => {
    if (!streamId || !transitionPrompt.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(
        `${serviceUrl}/v1/ad-streams/${streamId}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transition_prompt: transitionPrompt.trim() }),
        },
      );
      if (!response.ok) throw new Error((await response.json()).detail || "Steer failed");
      setStatus("Transition prompt sent to the live Orbis stream");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Steer failed");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!streamId) return;
    setBusy(true);
    try {
      await fetch(`${serviceUrl}/v1/ad-streams/${streamId}`, { method: "DELETE" });
      socketRef.current?.close();
      setStreamId("");
      setStatus("Stream stopped — original-video resume point is ready");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ad-console">
      <aside className="ad-control-panel">
        <p className="eyebrow">Orbis ad laboratory</p>
        <h1>Build the break.<br />Land the return.</h1>
        <p className="console-intro">
          Upload the original-video resume frame, write the approved ad prompt,
          then steer the live stream back to the source scene.
        </p>

        <label className="upload-zone">
          <input accept="image/*" type="file" onChange={onImageChange} />
          {imagePreview ? <img alt="Resume frame preview" src={imagePreview} /> : <span>＋ Upload resume frame<br /><small>Optional image anchor</small></span>}
        </label>

        <label>
          Approved ad prompt
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="button-row">
          <button disabled={busy || Boolean(streamId)} onClick={start}>Start 15s ad</button>
          <button className="danger" disabled={busy || !streamId} onClick={stop}>Stop</button>
        </div>
      </aside>

      <div className="ad-stage">
        <div className="stage-topline"><span>LIVE ORBIS RELAY</span><span>{streamId ? `${elapsed}s / 15s` : "OFFLINE"}</span></div>
        <div className="canvas-frame">
          <canvas ref={canvasRef} />
          {!streamId && <div className="canvas-empty">Your generated ad stream will appear here.</div>}
          <div className="stage-status">{status}</div>
        </div>
        <div className="timeline"><i style={{ width: `${(elapsed / 15) * 100}%` }} /></div>
        <div className="timeline-labels"><span>0s · Ad starts</span><span>10s · Steer</span><span>15s · Resume</span></div>

        <div className="transition-card">
          <div><p className="eyebrow">Second 10 transition</p><strong>Steer toward the original video</strong></div>
          <textarea
            placeholder="Describe the saved resume frame and the desired handoff…"
            value={transitionPrompt}
            onChange={(event) => setTransitionPrompt(event.target.value)}
          />
          <button disabled={busy || !streamId || !transitionPrompt.trim()} onClick={steer}>Send transition prompt</button>
        </div>
      </div>
    </section>
  );
}
