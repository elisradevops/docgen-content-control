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
  // Which generation stage this request is, and which content control it serves. Set by the
  // request handlers (setRunStep) on this per-request store, and stamped on every record emitted
  // while serving the request — including the data provider's and skins' own, which read the same
  // store. Each content control is its own request, so concurrent controls never share a store.
  step?: string;
  contentControlType?: string;
  contentControlTitle?: string;
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
// api-gate percent-encodes a header value only when it holds characters a header cannot carry
// (a non-ASCII project name); ordinary values arrive as they are. Decode defensively, so a
// malformed escape is used as sent instead of failing the request.
function decodeHeader(value: string | undefined): string | undefined {
  if (!value || !/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
    const docType = normalizeDocType(decodeHeader(req.header("x-docgen-doc-type")));
    const rawProject = decodeHeader(req.header("x-docgen-project"));
    const project = rawProject && rawProject.trim() ? rawProject.trim().slice(0, 128) : undefined;
    runContextStore.run({ runId, captureMode, docType, project }, next);
  } else {
    next();
  }
}

const STEP_MAX = 60;
const CONTROL_TYPE_MAX = 100;
const CONTROL_TITLE_MAX = 200;

/**
 * Marks the current request's stage (and optionally the content control it serves) on the ambient
 * run context, so records emitted while handling it can be attributed to them. A no-op outside a
 * run. Bounded: the values come from the request body.
 */
export function setRunStep(step: string, contentControl?: { type?: unknown; title?: unknown }): void {
  const store = runContextStore.getStore();
  if (!store) return;
  store.step = String(step).slice(0, STEP_MAX);
  const type = typeof contentControl?.type === "string" ? contentControl.type.trim() : "";
  const title = typeof contentControl?.title === "string" ? contentControl.title.trim() : "";
  if (type) store.contentControlType = type.slice(0, CONTROL_TYPE_MAX);
  if (title) store.contentControlTitle = title.slice(0, CONTROL_TITLE_MAX);
}

