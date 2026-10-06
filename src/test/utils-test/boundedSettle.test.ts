import { settleBounded } from '../../utils/boundedSettle';

describe('settleBounded', () => {
  test('returns outcomes in item order and never exceeds the concurrency bound', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const outcomes = await settleBounded(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20 - n * 2));
        inFlight--;
        return n * 10;
      },
      3
    );

    expect(outcomes.map((o) => o.value)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(maxInFlight).toBe(3);
  });

  test('records a failure at its own index without rejecting', async () => {
    const boom = new Error('boom');
    const outcomes = await settleBounded([1, 2, 3], async (n) => {
      if (n === 2) throw boom;
      return n;
    });

    expect(outcomes[1]).toEqual({ ok: false, error: boom });
    expect(outcomes[0].ok).toBe(true);
    expect(outcomes[2].ok).toBe(true);
  });

  test('resolves immediately for no items', async () => {
    expect(await settleBounded([], async () => 1)).toEqual([]);
  });
});
