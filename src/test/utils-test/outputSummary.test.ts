import { computeOutputSummary } from '../../utils/outputSummary';

describe('computeOutputSummary', () => {
  test('reports an empty result for no sections', () => {
    const summary = computeOutputSummary({ title: 'Empty', wordObjects: [] });
    expect(summary).toEqual({
      sectionCount: 0,
      rowCount: 0,
      itemsOut: 0,
      bytes: expect.any(Number),
      emptyResult: true,
    });
  });

  test('counts sections, rows and items for a populated result', () => {
    const summary = computeOutputSummary({
      title: 'Changes',
      wordObjects: [
        {
          type: 'table',
          rows: [
            { id: 1, name: 'a' },
            { id: 2, name: 'b' },
          ],
        },
      ],
    });
    expect(summary.sectionCount).toBe(1);
    expect(summary.rowCount).toBeGreaterThan(0);
    expect(summary.itemsOut).toBeGreaterThan(0);
    expect(summary.emptyResult).toBe(false);
  });

  test('never throws on a circular or hostile input', () => {
    const circular: any = { title: 'Circular', wordObjects: [] };
    circular.wordObjects.push({ self: circular });

    expect(() => computeOutputSummary(circular)).not.toThrow();
    expect(() => computeOutputSummary(null)).not.toThrow();
    expect(() => computeOutputSummary(undefined)).not.toThrow();
    expect(computeOutputSummary(null).emptyResult).toBe(true);
  });
});
