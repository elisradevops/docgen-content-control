import type { Server } from "http";

// api-gate reuses idle keep-alive connections to this service (its axios agent has
// keepAlive: true), but Node closes an idle connection after 5s by default — so a request
// sent on a connection the server has just dropped fails with ECONNRESET. Holding idle
// connections longer than any client keeps them makes the client the side that closes first.
const DEFAULT_KEEP_ALIVE_MS = 65_000;

export function resolveKeepAliveMs(raw: string | undefined = process.env.SERVER_KEEP_ALIVE_MS): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_KEEP_ALIVE_MS;
}

export function applyServerTimeouts(server: Server, keepAliveMs: number = resolveKeepAliveMs()): void {
  server.keepAliveTimeout = keepAliveMs;
  // headersTimeout must exceed keepAliveTimeout, or Node can still reset a reused connection.
  server.headersTimeout = keepAliveMs + 1_000;
}
