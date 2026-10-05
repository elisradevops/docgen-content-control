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

  test('stamps docType onto every log emitted inside store.run(...), same as runId', () => {
    const { logger, capture } = makeTestLogger();
    runContextStore.run({ runId: 'run-123', docType: 'SVD' }, () => {
      logger.info('inside the run');
    });
    expect(capture.lines[0].docType).toBe('SVD');
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

  test.each(['verbose', 'retain-on-failure'])('accepts a valid x-docgen-capture-mode: %s', (mode) => {
    let seenInsideNext: unknown;
    attachRunContext(fakeReq({ 'x-docgen-run-id': 'abc-123', 'x-docgen-capture-mode': mode }), {} as any, () => {
      seenInsideNext = runContextStore.getStore()?.captureMode;
    });
    expect(seenInsideNext).toBe(mode);
  });

  test('drops a malformed x-docgen-capture-mode rather than trusting it', () => {
    let seenInsideNext: unknown;
    attachRunContext(
      fakeReq({ 'x-docgen-run-id': 'abc-123', 'x-docgen-capture-mode': 'DROP TABLE runs' }),
      {} as any,
      () => {
        seenInsideNext = runContextStore.getStore()?.captureMode;
      }
    );
    expect(seenInsideNext).toBeUndefined();
  });

  test('decodes a percent-encoded project name (what api-gate sends for non-ASCII names)', () => {
    let seen: any;
    attachRunContext(
      fakeReq({ 'x-docgen-run-id': 'abc-123', 'x-docgen-project': encodeURIComponent('פרויקט MEWP') }),
      {} as any,
      () => {
        seen = runContextStore.getStore();
      }
    );
    expect(seen.project).toBe('פרויקט MEWP');
  });

  test('uses an ordinary or malformed-escape project value as sent', () => {
    const seenFor = (project: string) => {
      let seen: any;
      attachRunContext(fakeReq({ 'x-docgen-run-id': 'abc-123', 'x-docgen-project': project }), {} as any, () => {
        seen = runContextStore.getStore();
      });
      return seen.project;
    };
    expect(seenFor('Cube ADCS')).toBe('Cube ADCS');
    expect(seenFor('100%')).toBe('100%');
    expect(seenFor('%E0%A4%A')).toBe('%E0%A4%A');
  });

  test('normalizes a valid x-docgen-doc-type header (trim, uppercase)', () => {
    let seenInsideNext: unknown;
    attachRunContext(fakeReq({ 'x-docgen-run-id': 'abc-123', 'x-docgen-doc-type': '  svd  ' }), {} as any, () => {
      seenInsideNext = runContextStore.getStore()?.docType;
    });
    expect(seenInsideNext).toBe('SVD');
  });

  test('leaves docType undefined when the header is absent', () => {
    let seenInsideNext: unknown;
    attachRunContext(fakeReq({ 'x-docgen-run-id': 'abc-123' }), {} as any, () => {
      seenInsideNext = runContextStore.getStore()?.docType;
    });
    expect(seenInsideNext).toBeUndefined();
  });

  test('clamps an oversized x-docgen-doc-type header to 40 characters', () => {
    let seenInsideNext: unknown;
    attachRunContext(
      fakeReq({ 'x-docgen-run-id': 'abc-123', 'x-docgen-doc-type': 'a'.repeat(60) }),
      {} as any,
      () => {
        seenInsideNext = runContextStore.getStore()?.docType;
      }
    );
    expect(seenInsideNext).toBe('A'.repeat(40));
  });
});
