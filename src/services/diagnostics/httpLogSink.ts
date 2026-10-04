// The LogSink installed in this process (index.ts), consumed by DiagnosticsTransport
// (services/logger.ts) — and, since docgen-data-provider-package and docgen-dg-skins-package
// run in-process inside this service (they're npm dependencies, not separate services), by
// their own copies of the same transport too. Relays batches to api-gate's
// POST /diagnostics/logs, since only api-gate holds Mongo credentials — this service has
// none. Buffers in memory and flushes on a timer or a size threshold, whichever comes first,
// the same shape as api-gate's MongoLogSink (a separate file: the two repos don't share code,
// same discipline as logger.ts/runContext.ts). Never lets an ingest failure propagate into
// whatever code path called logger.warn/error — losing the dashboard must never break
// generation.
import axios from 'axios';
import { LogSink, DiagnosticEvent, installLogSink } from '../logSink';

const FLUSH_INTERVAL_MS = Number(process.env.DIAGNOSTICS_FLUSH_INTERVAL_MS) || 2000;
const FLUSH_BATCH_SIZE = Number(process.env.DIAGNOSTICS_FLUSH_BATCH_SIZE) || 500;
const BUFFER_MAX = Number(process.env.DIAGNOSTICS_BUFFER_MAX) || 10_000;
// Dropping one event at a time with shift() is O(n) per push once the buffer is full; dropping a
// slice makes it O(1) amortized.
const DROP_CHUNK = Math.max(1, Math.floor(BUFFER_MAX / 10));
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const ERROR_LOG_INTERVAL_MS = 30_000;
const MAX_BATCHES_PER_FLUSH = 20;

const isConfigured = (): boolean => !!process.env.DIAGNOSTICS_INGEST_URL && !!process.env.DIAGNOSTICS_INGEST_TOKEN;

// Network failures and 5xx/429 are worth retrying; any other 4xx (a bad token, a rejected
// payload) will fail identically every time, so the batch is dropped instead.
const isRetryable = (e: any): boolean => {
  const status = e?.response?.status;
  return status === undefined || status >= 500 || status === 429;
};

export class HttpLogSink implements LogSink {
  private buffer: DiagnosticEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private droppedSinceLastWarning = 0;
  private droppedTotal = 0;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private retryNotBefore = 0;
  private lastErrorLogAt = 0;

  push(event: DiagnosticEvent): void {
    if (this.buffer.length >= BUFFER_MAX) {
      const dropped = this.buffer.splice(0, DROP_CHUNK).length;
      this.droppedSinceLastWarning += dropped;
      this.droppedTotal += dropped;
    }
    this.buffer.push(event);
    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // One flush in flight at a time: a burst of pushes (each one past the batch size calls
  // flush()) shares the running flush instead of stacking concurrent POSTs against a slow
  // api-gate. `force` skips the retry backoff — used at shutdown, the last chance to send.
  flush(force = false): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.buffer.length === 0) return Promise.resolve();
    // Read lazily, not captured at module load — config that can legitimately change at runtime
    // (or isn't set yet when this module happens to load, e.g. under test) has to be read at the
    // point of use.
    if (!isConfigured()) return Promise.resolve();
    if (!force && Date.now() < this.retryNotBefore) return Promise.resolve();
    this.inFlight = this.drain().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async drain(): Promise<void> {
    for (let i = 0; i < MAX_BATCHES_PER_FLUSH && this.buffer.length > 0; i++) {
      const batch = this.buffer.slice(0, FLUSH_BATCH_SIZE);
      const droppedBefore = this.droppedTotal;
      try {
        await this.post(batch);
      } catch (e) {
        this.logFailure(e);
        if (isRetryable(e)) {
          // Keep the events (still bounded by BUFFER_MAX) and try again after a growing pause.
          this.failures++;
          this.retryNotBefore = Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** (this.failures - 1), BACKOFF_MAX_MS);
          return;
        }
        this.removeSent(batch.length, droppedBefore);
        continue;
      }
      this.failures = 0;
      this.retryNotBefore = 0;
      this.removeSent(batch.length, droppedBefore);
    }
    if (this.droppedSinceLastWarning > 0) {
      // eslint-disable-next-line no-console
      console.warn(`HttpLogSink dropped ${this.droppedSinceLastWarning} events under backpressure`);
      this.droppedSinceLastWarning = 0;
    }
  }

  // Events dropped from the front while the POST was in flight were part of the batch too.
  private removeSent(batchLength: number, droppedBefore: number): void {
    const droppedDuring = this.droppedTotal - droppedBefore;
    this.buffer.splice(0, Math.max(0, batchLength - droppedDuring));
  }

  // Never through `logger` — that would recurse back into DiagnosticsTransport, which pushes
  // into this same sink. Only the message and status: the AxiosError itself carries the ingest
  // token header and the whole events body. Throttled so a persistent failure isn't one line
  // per flush.
  private logFailure(e: any): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLogAt = now;
    // eslint-disable-next-line no-console
    console.error(`HttpLogSink failed to relay events to api-gate: ${e?.message ?? e} (status ${e?.response?.status ?? 'none'})`);
  }

  private post(events: DiagnosticEvent[]): Promise<unknown> {
    return axios.post(
      `${process.env.DIAGNOSTICS_INGEST_URL}/diagnostics/logs`,
      { events },
      { timeout: 5000, headers: { 'x-docgen-ingest-token': process.env.DIAGNOSTICS_INGEST_TOKEN } }
    );
  }
}

let installed: HttpLogSink | null = null;

// Without a URL and token nothing could ever be sent, and an installed sink would just pin a full
// buffer of events for the life of the process — so it is not installed at all.
export function installHttpLogSink(): HttpLogSink | undefined {
  if (installed) return installed;
  if (!isConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('DIAGNOSTICS_INGEST_URL / DIAGNOSTICS_INGEST_TOKEN not set: diagnostics relay disabled');
    return undefined;
  }
  installed = new HttpLogSink();
  installLogSink(installed);
  installed.start();
  return installed;
}
