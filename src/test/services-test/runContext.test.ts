import * as winston from 'winston';
import Transport from 'winston-transport';
import { withRunContext } from '../../services/logger';
import { attachRunContext, runContextStore } from '../../services/runContext';

class CaptureTransport extends Transport {
  lines: Record<string, unknown>[] = [];
  log(info: Record<string, unknown>, callback: () => void) {
    this.lines.push(JSON.parse((info as any)[Symbol.for('message')] ?? JSON.stringify(info)));
    callback();
  }
}
function makeTestLogger() {
  const capture = new CaptureTransport();
  const logger = winston.createLogger({
    level: 'silly',
    format: winston.format.combine(withRunContext(), winston.format.json()),
    transports: [capture],
  });
  return { logger, capture };
}

describe('withRunContext', () => {
  test('is a no-op when the store was never populated', () => {
    const { logger, capture } = makeTestLogger();
    logger.info('outside any run');
    expect(capture.lines[0].runId).toBeUndefined();
  });

  test('stamps runId onto every log emitted inside store.run(...)', () => {
    const { logger, capture } = makeTestLogger();
    runContextStore.run({ runId: 'run-123' }, () => {
      logger.info('inside the run');
    });
    logger.info('outside again');
    expect(capture.lines[0].runId).toBe('run-123');
    expect(capture.lines[1].runId).toBeUndefined();
  });

  test('async work started inside the run keeps the runId across the await boundary', async () => {
    const { logger, capture } = makeTestLogger();
    await runContextStore.run({ runId: 'run-async' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      logger.info('after await');
    });
    expect(capture.lines[0].runId).toBe('run-async');
  });
});

// Mock req/res since supertest isn't in this repo's dependencies — attachRunContext only
// reads req.header() and calls next(), so a minimal fake is enough to exercise it directly.
function fakeReq(headers: Record<string, string>) {
  return { header: (name: string) => headers[name.toLowerCase()] } as any;
}

describe('attachRunContext middleware', () => {
  test('wraps next() in the store when x-docgen-run-id is a valid header', () => {
    const { logger, capture } = makeTestLogger();
    let seenInsideNext: unknown;
    attachRunContext(fakeReq({ 'x-docgen-run-id': 'abc-123_XYZ' }), {} as any, () => {
      seenInsideNext = runContextStore.getStore()?.runId;
      logger.info('handled inside middleware');
    });
    expect(seenInsideNext).toBe('abc-123_XYZ');
    expect(capture.lines[0].runId).toBe('abc-123_XYZ');
  });

  test('calls next() without a store when the header is absent', () => {
    let called = false;
    attachRunContext(fakeReq({}), {} as any, () => {
      called = true;
      expect(runContextStore.getStore()).toBeUndefined();
    });
    expect(called).toBe(true);
  });

  test('rejects a malformed header value instead of trusting it into the store', () => {
    let called = false;
    attachRunContext(fakeReq({ 'x-docgen-run-id': 'not a valid id; DROP TABLE runs' }), {} as any, () => {
      called = true;
      expect(runContextStore.getStore()).toBeUndefined();
    });
    expect(called).toBe(true);
  });

  test('rejects a header value over 64 characters', () => {
    let called = false;
    attachRunContext(fakeReq({ 'x-docgen-run-id': 'a'.repeat(65) }), {} as any, () => {
      called = true;
      expect(runContextStore.getStore()).toBeUndefined();
    });
    expect(called).toBe(true);
  });
});
