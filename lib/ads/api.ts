import { AD_SECONDS } from "@/lib/ads/constants";
import type {
  FinishAdResponse,
  OrbisAdStreamResponse,
  StartAdRequest,
  StartAdResponse,
  TransitionAdResponse,
} from "@/lib/ads/types";

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      (body as { error?: string }).error ||
        `Request failed (${response.status})`,
    );
  }
  return body;
}

export async function fetchResumeFrameBlob(
  videoId: string,
  timestampSeconds?: number,
): Promise<{ blob: Blob; source: "stream" | "thumbnail" | "unknown" }> {
  const params = new URLSearchParams({ videoId });
  if (
    typeof timestampSeconds === "number" &&
    Number.isFinite(timestampSeconds)
  ) {
    params.set("t", String(timestampSeconds));
  }
  const response = await fetch(
    `/api/ads/resume-frame?${params.toString()}`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Could not fetch resume frame");
  }
  const header = response.headers.get("X-Resume-Frame-Source");
  const source =
    header === "stream" || header === "thumbnail"
      ? header
      : "unknown";
  return { blob: await response.blob(), source };
}

export async function startAdSession(
  input: StartAdRequest,
): Promise<StartAdResponse> {
  const response = await fetch("/api/ads/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<StartAdResponse>(response);
  if (data.skipped) return data;
  return {
    ...data,
    duration_seconds: data.duration_seconds ?? AD_SECONDS,
  };
}

export async function transitionAdSession(
  adSessionId: string,
): Promise<TransitionAdResponse> {
  const response = await fetch(
    `/api/ads/${encodeURIComponent(adSessionId)}/transition`,
    { method: "POST" },
  );
  return readJson<TransitionAdResponse>(response);
}

export async function finishAdSession(
  adSessionId: string,
  options?: { keepalive?: boolean },
): Promise<FinishAdResponse> {
  const response = await fetch(
    `/api/ads/${encodeURIComponent(adSessionId)}/finish`,
    {
      method: "POST",
      keepalive: options?.keepalive ?? false,
    },
  );
  return readJson<FinishAdResponse>(response);
}

export async function startOrbisAdStream(
  adSessionId: string,
): Promise<OrbisAdStreamResponse> {
  const response = await fetch(
    `/api/ads/${encodeURIComponent(adSessionId)}/orbis/start`,
    { method: "POST" },
  );
  return readJson<OrbisAdStreamResponse>(response);
}

export async function steerOrbisAdStream(
  adSessionId: string,
): Promise<OrbisAdStreamResponse> {
  const response = await fetch(
    `/api/ads/${encodeURIComponent(adSessionId)}/orbis/transition`,
    { method: "POST" },
  );
  return readJson<OrbisAdStreamResponse>(response);
}

export async function stopOrbisAdStream(
  adSessionId: string,
  options?: { keepalive?: boolean },
): Promise<void> {
  const response = await fetch(
    `/api/ads/${encodeURIComponent(adSessionId)}/orbis/stop`,
    { method: "POST", keepalive: options?.keepalive ?? false },
  );
  await readJson<{ ok: true }>(response);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
