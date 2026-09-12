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
      "Orbis session slot is full (limit 1 on this key). Close other tabs " +
      "using Orbis, press Disconnect here, wait a few seconds, then press " +
      "Connect Orbis. The app will retry automatically."
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
