export interface Settled<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
}

const DEFAULT_FETCH_CONCURRENCY = 4;
const MAX_FETCH_CONCURRENCY = 8;

/** DOCGEN_FETCH_CONCURRENCY, default 4, between 1 and 8 (the same setting the data provider's prefetches use). Read at call time. */
export function fetchConcurrency(raw: string | undefined = process.env.DOCGEN_FETCH_CONCURRENCY): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_FETCH_CONCURRENCY) : DEFAULT_FETCH_CONCURRENCY;
}

/**
 * Runs `fn` over `items` with a small bounded pool and returns the outcomes in the items' own order.
 * Callers that then walk the outcomes in order keep their sequential ordering and first-failure
 * behaviour while the work overlaps. It never rejects: a failure is returned as `{ ok: false, error }`.
 */
export async function settleBounded<I, R>(
  items: I[],
  fn: (item: I, index: number) => Promise<R>,
  concurrency = fetchConcurrency()
): Promise<Settled<R>[]> {
  const outcomes: Settled<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        outcomes[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        outcomes[index] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return outcomes;
}
