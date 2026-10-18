// An error that escapes a route or a middleware used to produce Express's default HTML 500 and no
// structured log record, so api-gate saw only "Request failed with status code 500".
import express from 'express';
import * as bodyParser from 'body-parser';
import http from 'http';
import type { AddressInfo } from 'net';
import { attachRunContext, setRunStep } from '../../services/runContext';
import { unhandledErrorHandler } from '../../services/unhandledErrorHandler';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedLogger = logger as unknown as { error: jest.Mock; warn: jest.Mock };

function request(
  port: number,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; contentType: string; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port, method: 'POST', path, headers: { 'content-type': 'application/json', ...options.headers } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, contentType: String(res.headers['content-type']), body: JSON.parse(data) })
        );
      }
    );
    req.on('error', reject);
    req.write(options.body ?? '{}');
    req.end();
  });
}

describe('unhandledErrorHandler', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use(attachRunContext);
    app.use(bodyParser.json());
    app.post('/throws', () => {
      throw new Error('boom outside any try/catch');
    });
    app.post('/throws-in-step', () => {
      setRunStep('generate-content-control', { type: 'change-description-table', title: 'required-states-and-modes' });
      throw new Error('boom inside a step');
    });
    app.post('/throws-string', () => {
      throw 'a bare string';
    });
    app.post('/throws-coded', () => {
      throw Object.assign(new Error('teapot'), { statusCode: 418, code: 'TEAPOT' });
    });
    app.use(unhandledErrorHandler);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    mockedLogger.error.mockClear();
    mockedLogger.warn.mockClear();
  });

  test('answers a JSON 500 carrying the message and the run id, and logs it', async () => {
    const res = await request(port, '/throws', { headers: { 'x-docgen-run-id': 'run-123' } });

    expect(res.status).toBe(500);
    expect(res.contentType).toContain('application/json');
    expect(res.body).toMatchObject({ message: 'boom outside any try/catch', step: 'unhandled', runId: 'run-123' });
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('boom outside any try/catch'),
      expect.objectContaining({ stack: expect.any(String) })
    );
  });

  test('keeps the ambient step of the request instead of overwriting it', async () => {
    const res = await request(port, '/throws-in-step', { headers: { 'x-docgen-run-id': 'run-9' } });

    expect(res.status).toBe(500);
    expect(res.body.step).toBe('generate-content-control');
    // The record must not carry an explicit step, or the logger's ambient step/control stamping is lost.
    const meta = mockedLogger.error.mock.calls[0][1];
    expect(meta).not.toHaveProperty('step');
  });

  test('copes with a thrown string', async () => {
    const res = await request(port, '/throws-string');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('a bare string');
  });

  test('keeps the status and code the error carried', async () => {
    const res = await request(port, '/throws-coded');

    expect(res.status).toBe(418);
    expect(res.body).toMatchObject({ message: 'teapot', code: 'TEAPOT' });
  });

  test('a body-parser rejection keeps its 400, is reported as JSON, and is a warning not an error', async () => {
    const res = await request(port, '/throws', { body: '{ not json' });

    expect(res.status).toBe(400);
    expect(res.body.step).toBe('unhandled');
    expect(mockedLogger.warn).toHaveBeenCalledWith(expect.stringContaining('unhandled request error'));
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  test('returns only bounded code frames, never the message again', async () => {
    const res = await request(port, '/throws');

    expect(res.body.stack).toMatch(/^\s+at /);
    expect(res.body.stack).not.toContain('boom outside any try/catch');
    expect(res.body.stack.split('\n').length).toBeLessThanOrEqual(8);
  });
});
