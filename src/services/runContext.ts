"use strict";
import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";

export interface RunContext {
  runId: string;
  // Phase 6b — per-run capture policy, forwarded by api-gate's installRunIdForwarding
  // alongside x-docgen-run-id. Absent means 'normal' (today's warn/error-only behavior).
  captureMode?: 'verbose' | 'retain-on-failure';
}

// Symbol.for uses the global symbol registry, so every duplicated copy of this file across
// the DocGen packages — hoisted or nested at any depth by npm — converges on the same
// AsyncLocalStorage instance. Keying by module identity instead would silently split into
// two stores and runId would go missing with no visible error.
const KEY = Symbol.for("elisradevops.docgen.runContext");

export const runContextStore: AsyncLocalStorage<RunContext> =
  ((globalThis as Record<symbol, unknown>)[KEY] as AsyncLocalStorage<RunContext> | undefined) ??
  ((globalThis as Record<symbol, unknown>)[KEY] = new AsyncLocalStorage<RunContext>());

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CAPTURE_MODES = new Set(["verbose", "retain-on-failure"]);

// First middleware in the chain (see app.ts) so the whole request lifecycle — including
// downstream data-provider/skins calls made while handling it — runs inside the store.
// api-gate is the trust boundary that validates/mints x-docgen-run-id; here a missing or
// malformed value is just "no run context" (existing no-op behavior), not an error. Same
// treatment for x-docgen-capture-mode — api-gate already validated it, this just re-checks
// the same whitelist rather than trusting the header blindly a second hop in.
export function attachRunContext(req: Request, _res: Response, next: NextFunction): void {
  const runId = req.header("x-docgen-run-id");
  if (runId && RUN_ID_PATTERN.test(runId)) {
    const rawCaptureMode = req.header("x-docgen-capture-mode");
    const captureMode = rawCaptureMode && CAPTURE_MODES.has(rawCaptureMode)
      ? (rawCaptureMode as "verbose" | "retain-on-failure")
      : undefined;
    runContextStore.run({ runId, captureMode }, next);
  } else {
    next();
  }
}
