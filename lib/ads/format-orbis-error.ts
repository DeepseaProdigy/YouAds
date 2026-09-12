/** Map Reactor/Orbis transport errors to short UI copy. */
export function formatOrbisError(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  if (
    lower.includes("no available capacity") ||
    lower.includes("no available servers")
  ) {
    return (
      "Orbis has no free servers right now. Wait a minute, " +
      "then press Connect Orbis."
    );
  }
  if (
    lower.includes("quota_exceeded") ||
    lower.includes("concurrent_sessions")
  ) {
    return (
      "Another Orbis session is still open on this key " +
      "(limit 1). Close other tabs, wait ~30s, then Connect Orbis."
    );
  }
  if (lower.includes("429")) {
    return (
      "Reactor rate-limited the session create. Wait briefly, " +
      "then press Connect Orbis."
    );
  }
  return text;
}
