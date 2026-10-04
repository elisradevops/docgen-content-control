// Regression guard for the prod symptom "a record carries a run id but no project / doc type":
// the ambient run context must survive everything a real generation request goes through
// between attachRunContext and the data provider — body parsing (which resumes the chain from a
// stream event, not from inside the run() callback), awaits, timers, and concurrent tasks —
// with all four fields intact, and without mixing up two requests in flight at once.
import express from 'express';
import * as bodyParser from 'body-parser';
import http from 'http';
import type { AddressInfo } from 'net';
import { attachRunContext, runContextStore } from '../../services/runContext';

type Seen = { runId?: string; docType?: string; project?: string } | undefined;
const snapshot = (): Seen => {
  const s = runContextStore.getStore();
  return s ? { runId: s.runId, docType: s.docType, project: s.project } : undefined;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function post(port: number, headers: Record<string, string>, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { port, method: 'POST', path: '/work', headers: { 'content-type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('run context propagation through the real middleware order', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    // Same order as app.ts: attachRunContext first, then the JSON body parser, then the route.
    app.use(attachRunContext);
    app.use(bodyParser.json({ limit: '50mb' }));
    app.post('/work', async (req, res) => {
      const afterBody = snapshot();
      await pause(Number(req.body.delayMs) || 0);
      const afterAwait = snapshot();
      const inTimer = await new Promise<Seen>((resolve) => setTimeout(() => resolve(snapshot()), 5));
      const inImmediate = await new Promise<Seen>((resolve) => setImmediate(() => resolve(snapshot())));
      // Fan-out like generate-content-control: many concurrent tasks, some delayed.
      const inTasks = await Promise.all(
        [1, 2, 3, 4, 5].map(async (i) => {
          await pause(i * 3);
          return snapshot();
        })
      );
      res.json({ afterBody, afterAwait, inTimer, inImmediate, inTasks });
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const headers = (id: string, project: string, docType: string) => ({
    'x-docgen-run-id': id,
    'x-docgen-project': project,
    'x-docgen-doc-type': docType,
  });

  test('runId, docType and project are visible at every point after body parsing', async () => {
    const out = await post(port, headers('run-a', 'MEWP', 'STD'), { delayMs: 10 });
    const expected = { runId: 'run-a', docType: 'STD', project: 'MEWP' };
    expect(out.afterBody).toEqual(expected);
    expect(out.afterAwait).toEqual(expected);
    expect(out.inTimer).toEqual(expected);
    expect(out.inImmediate).toEqual(expected);
    out.inTasks.forEach((t: Seen) => expect(t).toEqual(expected));
  });

  test('concurrent requests never see each other\'s context', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        post(port, headers(`run-${i}`, `Project-${i}`, i % 2 ? 'SVD' : 'STD'), { delayMs: (i % 4) * 7 })
      )
    );
    results.forEach((out, i) => {
      const expected = { runId: `run-${i}`, docType: i % 2 ? 'SVD' : 'STD', project: `Project-${i}` };
      [out.afterBody, out.afterAwait, out.inTimer, out.inImmediate, ...out.inTasks].forEach((seen: Seen) =>
        expect(seen).toEqual(expected)
      );
    });
  });

  test('a request without a run id has no run context at all (no stale context from a neighbour)', async () => {
    await post(port, headers('run-busy', 'Busy', 'STD'), { delayMs: 20 });
    const out = await post(port, {}, { delayMs: 0 });
    // (JSON turns an undefined array entry into null, hence == null.)
    expect(out.afterBody == null).toBe(true);
    expect(out.inTasks.every((t: Seen) => t == null)).toBe(true);
  });
});
