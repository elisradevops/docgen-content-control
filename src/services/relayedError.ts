import logger from "./logger";

// A route's catch block relays a failure that happened in the data provider. When the data
// provider's TFSServices already emitted its dedicated error-level "ADO request failed" record
// for that error (it marks the attached request description `reported`), logging the same
// failure at error level here would create a second Issue for one root cause — so the relay is a
// warning. Any other failure (not an ADO error, or one the provider did not report) is this
// route's own to record at error. Reads the flag loosely, so it is safe with older provider
// versions, which simply never set it.
export function logRelayedError(message: string, error: unknown): void {
  const reported = !!(error as { adoRequest?: { reported?: boolean } } | null | undefined)?.adoRequest?.reported;
  if (reported) logger.warn(message);
  else logger.error(message);
}
