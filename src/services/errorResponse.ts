import { boundedStack } from "./errorStack";

// A thrown value is not always an Error (a string, a bare object): read its message without assuming one.
export const errorMessage = (error: any): string => error?.message || String(error);

// The JSON body of a failed generation request. api-gate reads it to say why a content control failed,
// so it carries the message, the code and the top stack frames of whatever was thrown.
export function errorResponseBody(error: any, step: string, extra: Record<string, unknown> = {}) {
  return {
    message: errorMessage(error),
    code: error?.code,
    stack: boundedStack(error),
    step,
    ...extra,
  };
}
