export interface Settled<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
}

/**
 * Runs `fn` over `items` with a small bounded pool and returns the outcomes in the items' own order.
 * Callers that then walk the outcomes in order keep their sequential ordering and first-failure
 * behaviour while the work overlaps. It never rejects: a failure is returned as `{ ok: false, error }`.
 */
export async function settleBounded<I, R>(
  items: I[],
  fn: (item: I, index: number) => Promise<R>,
  concurrency = 4
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
