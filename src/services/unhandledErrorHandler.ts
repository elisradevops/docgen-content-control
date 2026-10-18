import type { NextFunction, Request, Response } from "express";
import logger from "./logger";
import { runContextStore } from "./runContext";
import { boundedStack } from "./errorStack";

// Last middleware in the chain (see app.ts). Without it an error that escapes a route handler or a
// middleware - body-parser rejecting a payload, a throw outside a route's own try/catch - got
// Express's default HTML 500: nothing in the structured log and no JSON body, so the caller
// (api-gate) recorded a bare "Request failed with status code 500". The status stays what the error
// carried (body-parser sets 400/413); anything else is a 500.
export function unhandledErrorHandler(error: any, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  const message = error?.message || String(error);
  const explicit = Number(error?.statusCode || error?.status || 0);
  const status = Number.isFinite(explicit) && explicit >= 400 && explicit < 600 ? explicit : 500;
  // No explicit `step` on the record: the logger stamps the ambient step and content control of the
  // request, and an explicit value would overwrite them. A client error (400/413 from the body parser)
  // is the caller's problem, not an Issue.
  const record = `unhandled request error : ${message}`;
  if (status >= 500) logger.error(record, { stack: error?.stack });
  else logger.warn(record);
  const store = runContextStore.getStore();
  res.status(status).json({
    message,
    code: typeof error?.code === "string" ? error.code : undefined,
    stack: boundedStack(error),
    step: store?.step ?? "unhandled",
    runId: store?.runId,
  });
}
