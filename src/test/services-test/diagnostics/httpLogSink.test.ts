jest.mock('axios');

import axios from 'axios';
import { HttpLogSink } from '../../../services/diagnostics/httpLogSink';
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

  test('retries exactly once on a failed post, then succeeds', async () => {
    mockPost.mockRejectedValueOnce(new Error('network blip')).mockResolvedValueOnce({ status: 200 });
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    await sink.flush();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  test('drops the batch after the retry also fails, without throwing', async () => {
    mockPost.mockRejectedValue(new Error('still down'));
    const sink = new HttpLogSink();
    sink.push(makeEvent());
    await expect(sink.flush()).resolves.toBeUndefined();
    expect(mockPost).toHaveBeenCalledTimes(2);
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
    expect(buffer).toHaveLength(10_000);
    expect(buffer[buffer.length - 1].message).toBe('the newest event');
  });
});
