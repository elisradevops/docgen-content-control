// What the caller (api-gate) receives when /generate-content-control fails. Only the response body
// carries the reason across the hop, so it must hold the message and the code however the failure
// was thrown (an Error, or - before this was fixed - a bare string).
import express from 'express';
import * as bodyParser from 'body-parser';
import http from 'http';
import type { AddressInfo } from 'net';
import { Routes } from '../../routes';

const mockGenerate = jest.fn();

jest.mock('../../controllers', () =>
  jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    generateContentControl: (...args: unknown[]) => mockGenerate(...args),
  }))
);

jest.mock('../../services/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function post(port: number, path: string, body: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port, method: 'POST', path, headers: { 'content-type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

describe('POST /generate-content-control failure response', () => {
  let server: http.Server;
  let port: number;
  const request = {
    orgUrl: 'https://dev.azure.com/org/',
    token: 'pat',
    projectName: 'P',
    contentControlOptions: { type: 'required-states-and-modes', title: 'required-states-and-modes' },
  };

  beforeAll(async () => {
    const app = express();
    app.use(bodyParser.json());
    new Routes().routes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('carries the message and code of a thrown Error', async () => {
    mockGenerate.mockRejectedValueOnce(
      Object.assign(new Error('issue uploading to minio due to : The specified bucket does not exist'), {
        code: 'NoSuchBucket',
      })
    );

    const res = await post(port, '/generate-content-control', request);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      message: 'issue uploading to minio due to : The specified bucket does not exist',
      code: 'NoSuchBucket',
      step: 'generate-content-control',
      contentControlTitle: 'required-states-and-modes',
    });
  });

  test('carries the top frames of content-control\'s own stack, so the caller can see where it failed', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('x is not a function'));

    const res = await post(port, '/generate-content-control', request);

    expect(res.body.stack).toMatch(/^\s+at /);
    expect(res.body.stack).not.toContain('x is not a function');
    expect(res.body.stack.split('\n').length).toBeLessThanOrEqual(8);
  });

  test('still carries a message when something other than an Error was thrown', async () => {
    mockGenerate.mockRejectedValueOnce('a bare string failure');

    const res = await post(port, '/generate-content-control', request);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('a bare string failure');
    expect(res.body.stack).toBeUndefined();
  });
});
