/**
 * Resolve the Pi agent WebSocket URL.
 *
 * Defaults to the same origin as the current page so the scheme matches the
 * page protocol (wss:// for https pages, ws:// otherwise) — a plain ws://
 * URL is blocked by browsers as mixed content on https pages and the vite
 * dev server only accepts wss when TLS is enabled.  Override with
 * VITE_PI_AGENT_WS_URL when the agent backend is hosted elsewhere.
 */
export function getAgentWsUrl(): string {
  const env = import.meta.env.VITE_PI_AGENT_WS_URL;
  if (env) return env;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/agent/ws`;
}
