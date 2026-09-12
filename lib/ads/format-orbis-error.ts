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
    // This is a Reactor-account-level cap, not something the client's
    // requested max_sessions can raise. Surface the raw reason so the
    // real limit/count from Reactor is visible instead of a guessed number.
    return (
      "Another Orbis session is still open on this key. " +
      "Close every tab/window that ever connected, wait a bit, then " +
      `Connect Orbis. (Reactor said: "${text}")`
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
