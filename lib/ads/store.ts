import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AdSessionRecord } from "@/lib/ads/types";

const sessions = new Map<string, AdSessionRecord>();

const TMP_DIR = path.join(process.cwd(), "tmp", "ads");

export function getActiveSessionCount(): number {
  let n = 0;
  for (const s of sessions.values()) {
    if (s.status === "active") n += 1;
  }
  return n;
}

export function getSession(id: string): AdSessionRecord | undefined {
  return sessions.get(id);
}

export function putSession(session: AdSessionRecord): void {
  sessions.set(session.id, session);
}

export function updateSession(
  id: string,
  patch: Partial<AdSessionRecord>,
): AdSessionRecord | undefined {
  const current = sessions.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  sessions.set(id, next);
  return next;
}

export async function saveResumeFrame(
  base64: string,
): Promise<string> {
  await mkdir(TMP_DIR, { recursive: true });
  const id = randomUUID();
  const filePath = path.join(TMP_DIR, `${id}.jpg`);
  const raw = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  await writeFile(filePath, Buffer.from(raw, "base64"));
  return filePath;
}

export async function deleteResumeFrame(
  filePath: string | null,
): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Temp file may already be gone.
  }
}
