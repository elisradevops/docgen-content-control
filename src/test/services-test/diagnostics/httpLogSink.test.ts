jest.mock('axios');

import axios from 'axios';
import { HttpLogSink, installHttpLogSink } from '../../../services/diagnostics/httpLogSink';
import type { DiagnosticEvent } from '../../../services/logSink';

const mockPost = axios.post as jest.Mock;

function makeEvent(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    ts: new Date().toISOString(),
    level: 'error',
    service: 'dg-content-control',
    version: '1.131.0',
    message: 'upstream call failed',
    ...overrides,
  };
}

describe('HttpLogSink', () => {
  const ORIGINAL_URL = process.env.DIAGNOSTICS_INGEST_URL;
  const ORIGINAL_TOKEN = process.env.DIAGNOSTICS_INGEST_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DIAGNOSTICS_INGEST_URL = 'http://dg-api-gate:3000';
    process.env.DIAGNOSTICS_INGEST_TOKEN = 'the-secret';
    mockPost.mockResolvedValue({ status: 200 });
  });

  afterAll(() => {
    process.env.DIAGNOSTICS_INGEST_URL = ORIGINAL_URL;
    process.env.DIAGNOSTICS_INGEST_TOKEN = ORIGINAL_TOKEN;
  });

  test('the timer flushes on a half-second default, so a live-tail viewer is not left waiting', () => {
    jest.useFakeTimers();
    try {
      const sink = new HttpLogSink();
      sink.push(makeEvent());
      sink.start();
      jest.advanceTimersByTime(499);
      expect(mockPost).not.toHaveBeenCalled();
      jest.advanceTimersByTime(2);
      expect(mockPost).toHaveBeenCalledTimes(1);
      sink.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  test('buffers events without posting until flush() is called', () => {
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('flush() posts the buffered batch to the configured ingest URL with the token header', async () => {
    const sink = new HttpLogSink();
    sink.push(makeEvent({ message: 'first' }));
    sink.push(makeEvent({ message: 'second' }));
    await sink.flush();
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = mockPost.mock.calls[0];
    expect(url).toBe('http://dg-api-gate:3000/diagnostics/logs');
    expect(body.events).toHaveLength(2);
    expect(opts.headers['x-docgen-ingest-token']).toBe('the-secret');
  });

  test('keeps the batch on a network failure and retries it after the backoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T10:00:00Z'));
    try {
      mockPost.mockRejectedValueOnce(new Error('network blip')).mockResolvedValueOnce({ status: 200 });
      const sink = new HttpLogSink();
      sink.push(makeEvent());
      await sink.flush();
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect((sink as any).buffer).toHaveLength(1);

      await sink.flush(); // still inside the 1s backoff
      expect(mockPost).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date('2026-10-04T10:00:02Z'));
      await sink.flush();
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect((sink as any).buffer).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('backoff grows on repeated failures and force flush ignores it', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T10:00:00Z'));
    try {
      mockPost.mockRejectedValue(Object.assign(new Error('down'), { response: { status: 503 } }));
      const sink = new HttpLogSink();
      sink.push(makeEvent());
      await sink.flush();
      jest.setSystemTime(new Date('2026-10-04T10:00:01.500Z'));
      await sink.flush();
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect((sink as any).retryNotBefore - Date.now()).toBeGreaterThan(1500); // 2s step, not 1s

      await sink.flush(true);
      expect(mockPost).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not retry a 4xx: the batch is dropped', async () => {
    mockPost.mockRejectedValue(Object.assign(new Error('unauthorized'), { response: { status: 401 } }));
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    await expect(sink.flush()).resolves.toBeUndefined();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect((sink as any).buffer).toHaveLength(0);
  });

  test('concurrent flushes share one in-flight POST', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockPost.mockReturnValue(new Promise((r) => (release = r)));
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    const first = sink.flush();
    const second = sink.flush();
    expect(second).toBe(first);
    release({ status: 200 });
    await first;
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('events pushed while a POST is in flight are kept for the next one', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockPost.mockReturnValueOnce(new Promise((r) => (release = r))).mockResolvedValue({ status: 200 });
    const sink = new HttpLogSink();
    sink.push(makeEvent({ message: 'a' }));
    const flushing = sink.flush();
    sink.push(makeEvent({ message: 'b' }));
    release({ status: 200 });
    await flushing;
    expect(mockPost.mock.calls[0][1].events.map((e: DiagnosticEvent) => e.message)).toEqual(['a']);
    expect(mockPost.mock.calls[1][1].events.map((e: DiagnosticEvent) => e.message)).toEqual(['b']);
  });

  test('never logs the ingest token or the events body when a post fails', async () => {
    const err: any = new Error('boom');
    err.config = { headers: { 'x-docgen-ingest-token': 'the-secret' }, data: '{"events":[{"message":"private"}]}' };
    mockPost.mockRejectedValue(err);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    await sink.flush();
    const printed = JSON.stringify(spy.mock.calls);
    expect(printed).toContain('boom');
    expect(printed).not.toContain('the-secret');
    expect(printed).not.toContain('private');
    spy.mockRestore();
  });

  test('is a no-op when the ingest URL/token are not configured', async () => {
    delete process.env.DIAGNOSTICS_INGEST_URL;
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    await sink.flush();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('drops the oldest event under backpressure once the buffer cap is hit', () => {
    const sink = new HttpLogSink();
    jest.spyOn(sink, 'flush').mockResolvedValue(undefined);
    (sink as any).buffer = new Array(10_000).fill(0).map(() => makeEvent());
    sink.push(makeEvent({ message: 'the newest event' }));
    const buffer: DiagnosticEvent[] = (sink as any).buffer;
    // Drops a tenth of the buffer in one slice (O(1) amortized) rather than one event per push.
    expect(buffer).toHaveLength(9_001);
    expect(buffer[buffer.length - 1].message).toBe('the newest event');
  });

  test('installHttpLogSink installs nothing when the ingest URL/token are not configured', () => {
    delete process.env.DIAGNOSTICS_INGEST_TOKEN;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(installHttpLogSink()).toBeUndefined();
    warn.mockRestore();
  });
});
