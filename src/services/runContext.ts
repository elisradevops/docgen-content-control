"use strict";
import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";

export interface RunContext {
  runId: string;
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

// First middleware in the chain (see app.ts) so the whole request lifecycle — including
// downstream data-provider/skins calls made while handling it — runs inside the store.
// api-gate is the trust boundary that validates/mints x-docgen-run-id; here a missing or
// malformed value is just "no run context" (existing no-op behavior), not an error.
export function attachRunContext(req: Request, _res: Response, next: NextFunction): void {
  const runId = req.header("x-docgen-run-id");
  if (runId && RUN_ID_PATTERN.test(runId)) {
    runContextStore.run({ runId }, next);
  } else {
    next();
  }
}
