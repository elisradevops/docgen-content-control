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

export class HttpLogSink implements LogSink {
  private buffer: DiagnosticEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private droppedSinceLastWarning = 0;

  push(event: DiagnosticEvent): void {
    if (this.buffer.length >= BUFFER_MAX) {
      this.buffer.shift();
      this.droppedSinceLastWarning++;
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

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    // Read lazily, not captured at module load — dotenv.config() runs before this module is
    // ever imported in production (index.ts), but a module-level const would still be the
    // wrong shape: config that can legitimately change at runtime (or simply isn't set yet
    // when this module happens to load, e.g. under test) has to be read at the point of use.
    if (!process.env.DIAGNOSTICS_INGEST_URL || !process.env.DIAGNOSTICS_INGEST_TOKEN) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.postWithOneRetry(batch);
      if (this.droppedSinceLastWarning > 0) {
        // eslint-disable-next-line no-console
        console.warn(`HttpLogSink dropped ${this.droppedSinceLastWarning} events under backpressure`);
        this.droppedSinceLastWarning = 0;
      }
    } catch (e) {
      // Never through `logger` — that would recurse back into DiagnosticsTransport, which
      // pushes into this same sink. The batch is dropped, not requeued — an unbounded retry
      // queue is worse than losing one batch of dashboard data.
      // eslint-disable-next-line no-console
      console.error('HttpLogSink failed to relay events to api-gate', e);
    }
  }

  private async postWithOneRetry(events: DiagnosticEvent[]): Promise<void> {
    try {
      await this.post(events);
    } catch (e) {
      await this.post(events);
    }
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

export function installHttpLogSink(): HttpLogSink {
  if (installed) return installed;
  installed = new HttpLogSink();
  installLogSink(installed);
  installed.start();
  return installed;
}
