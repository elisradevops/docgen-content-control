"use strict";
import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";

export interface RunContext {
  runId: string;
  // Phase 6b — per-run capture policy, forwarded by api-gate's installRunIdForwarding
  // alongside x-docgen-run-id. Absent means 'normal' (today's warn/error-only behavior).
  captureMode?: 'verbose' | 'retain-on-failure';
  // Phase 7b — forwarded by api-gate's installRunIdForwarding alongside x-docgen-run-id.
  // Unlike captureMode this isn't a fixed whitelist (docType is an open vocabulary — MinIO
  // folder names, not an enum, per docgen-api-gate's runDocType.ts), so re-validation here is
  // normalization (trim/uppercase/clamp) rather than a whitelist check.
  docType?: string;
  // Phase 7c — forwarded by api-gate's installRunIdForwarding as x-docgen-project so every
  // log event emitted by content-control during a run carries the project name.
  project?: string;
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
const DOC_TYPE_MAX_LENGTH = 40;

// Same normalization api-gate's own runDocType.ts applies before it ever reaches a header —
// re-applied here since a header is untrusted input on this hop too, even though api-gate is
// the trust boundary that decides the value in the first place.
function normalizeDocType(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase().slice(0, DOC_TYPE_MAX_LENGTH);
}

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
    const docType = normalizeDocType(req.header("x-docgen-doc-type"));
    const rawProject = req.header("x-docgen-project");
    const project = rawProject && rawProject.trim() ? rawProject.trim().slice(0, 128) : undefined;
    runContextStore.run({ runId, captureMode, docType, project }, next);
  } else {
    next();
  }
}
