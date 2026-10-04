import { createServer } from 'http';
import { applyServerTimeouts, resolveKeepAliveMs } from '../../services/serverTimeouts';

describe('resolveKeepAliveMs', () => {
  test('defaults to 65s, above any client keep-alive', () => {
    expect(resolveKeepAliveMs(undefined)).toBe(65_000);
  });
  test('uses a valid override', () => {
    expect(resolveKeepAliveMs('120000')).toBe(120_000);
  });
  test.each(['', 'abc', '0', '-5', 'NaN'])('falls back to the default for %p', (raw) => {
    expect(resolveKeepAliveMs(raw)).toBe(65_000);
  });
});

describe('applyServerTimeouts', () => {
  test('sets keepAliveTimeout and a headersTimeout strictly above it', () => {
    const server = createServer();
    applyServerTimeouts(server, 30_000);
    expect(server.keepAliveTimeout).toBe(30_000);
    expect(server.headersTimeout).toBe(31_000);
    server.close();
  });
});
