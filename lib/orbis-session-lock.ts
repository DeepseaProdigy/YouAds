/** Cross-tab lock so only one browser tab holds an Orbis session at a time. */

const LOCK_KEY = "orbis-reactor-active-tab";
const HEARTBEAT_MS = 2_000;
const STALE_MS = 6_000;

export type OrbisTabLock = {
  tabId: string;
  updatedAt: number;
};

let tabId: string | null = null;

function getTabId(): string {
  if (typeof window === "undefined") {
    tabId ??= crypto.randomUUID();
    return tabId;
  }
  const stored = sessionStorage.getItem("orbis-tab-instance-id");
  if (stored) {
    tabId = stored;
    return stored;
  }
  const next = crypto.randomUUID();
  sessionStorage.setItem("orbis-tab-instance-id", next);
  tabId = next;
  return next;
}

function readLock(): OrbisTabLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrbisTabLock;
    if (
      typeof parsed.tabId !== "string" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(next: OrbisTabLock): void {
  localStorage.setItem(LOCK_KEY, JSON.stringify(next));
}

/** Returns false when another tab recently claimed the Orbis slot. */
export function acquireOrbisTabLock(): boolean {
  const mine = getTabId();
  const existing = readLock();
  if (
    existing &&
    existing.tabId !== mine &&
    Date.now() - existing.updatedAt < STALE_MS
  ) {
    return false;
  }
  writeLock({ tabId: mine, updatedAt: Date.now() });
  return true;
}

export function refreshOrbisTabLock(): void {
  writeLock({ tabId: getTabId(), updatedAt: Date.now() });
}

export function releaseOrbisTabLock(): void {
  const existing = readLock();
  if (existing?.tabId === getTabId()) {
    localStorage.removeItem(LOCK_KEY);
  }
}

export function otherTabOwnsOrbisLock(): boolean {
  const existing = readLock();
  return (
    existing !== null &&
    existing.tabId !== getTabId() &&
    Date.now() - existing.updatedAt < STALE_MS
  );
}

export function startOrbisTabLockHeartbeat(): () => void {
  refreshOrbisTabLock();
  const id = window.setInterval(refreshOrbisTabLock, HEARTBEAT_MS);
  return () => window.clearInterval(id);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isQuotaExceededError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("quota_exceeded") ||
    lower.includes("concurrent_sessions") ||
    (lower.includes("429") && lower.includes("session"))
  );
}
