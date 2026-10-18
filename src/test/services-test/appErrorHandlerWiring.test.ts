// The error handler only sees errors from what is registered before it, so its position is the
// property that matters: a later app.use() added after it would silently take it out of the path.
import App from '../../app';
import { unhandledErrorHandler } from '../../services/unhandledErrorHandler';

// The real Routes file is large and nothing here depends on it: a stub that registers one route is enough
// to prove the handler comes after the routes, and keeps the file out of the coverage totals.
jest.mock('../../routes', () => ({
  Routes: class {
    routes(app: any) {
      app.post('/stub', (_req: any, res: any) => res.sendStatus(204));
    }
  },
}));
jest.mock('../../services/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('App error handling wiring', () => {
  test('the unhandled-error handler is the last layer, after every route', () => {
    const stack: any[] = (new App().app as any)._router.stack;

    expect(stack[stack.length - 1].handle).toBe(unhandledErrorHandler);
    const routeLayers = stack.filter((layer) => layer.route);
    expect(routeLayers.length).toBeGreaterThan(0);
    expect(stack.lastIndexOf(routeLayers[routeLayers.length - 1])).toBeLessThan(stack.length - 1);
  });
});
