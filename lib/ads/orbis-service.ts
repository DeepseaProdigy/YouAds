import { readFile } from "node:fs/promises";

import { getSession, updateSession } from "@/lib/ads/store";

const serviceUrl = (process.env.ORBIS_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function serviceFetch(path: string, init: RequestInit) {
  const response = await fetch(`${serviceUrl}${path}`, { ...init, cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail || `Orbis service request failed (${response.status})`);
  }
  return response;
}

export async function startSessionOrbisStream(adSessionId: string) {
  const session = getSession(adSessionId);
  if (!session) throw new Error("Ad session not found");
  if (!session.resume_frame_path) throw new Error("Saved resume frame is unavailable");
  const bytes = await readFile(session.resume_frame_path);
  const response = await serviceFetch("/v1/ad-streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ad_prompt: session.prompt,
      resume_frame_base64: bytes.toString("base64"),
    }),
  });
  const stream = (await response.json()) as { stream_id: string; status: string; frames_url: string };
  updateSession(adSessionId, { orbis_stream_id: stream.stream_id });
  return stream;
}

export async function transitionSessionOrbisStream(adSessionId: string) {
  const session = getSession(adSessionId);
  if (!session?.orbis_stream_id) throw new Error("Orbis ad stream is not active");
  return serviceFetch(`/v1/ad-streams/${encodeURIComponent(session.orbis_stream_id)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transition_prompt: session.transition_prompt }),
  });
}

export async function stopSessionOrbisStream(adSessionId: string) {
  const session = getSession(adSessionId);
  if (!session?.orbis_stream_id) return;
  await serviceFetch(`/v1/ad-streams/${encodeURIComponent(session.orbis_stream_id)}`, { method: "DELETE" });
  updateSession(adSessionId, { orbis_stream_id: undefined });
}
