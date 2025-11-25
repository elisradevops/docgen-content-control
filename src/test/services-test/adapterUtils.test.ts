import { toTimestamp, formatLocalIL, buildReleaseRunChangeComparator } from '../../services/adapterUtils';

describe('adapterUtils', () => {
  describe('toTimestamp', () => {
    it('returns 0 for falsy values', () => {
      expect(toTimestamp(null)).toBe(0);
      expect(toTimestamp(undefined)).toBe(0);
      expect(toTimestamp('')).toBe(0);
    });

    it('converts valid dates to timestamps', () => {
      const d = new Date('2020-01-01T00:00:00Z');
      expect(toTimestamp(d)).toBe(d.getTime());
      expect(toTimestamp('2020-01-01T00:00:00Z')).toBe(d.getTime());
    });

    it('returns 0 for invalid dates', () => {
      expect(toTimestamp('not-a-date')).toBe(0);
    });
  });

  describe('formatLocalIL', () => {
    const OriginalDate = Date;

    afterEach(() => {
      // Restore Date in case a test overrides it
      global.Date = OriginalDate as any;
    });

    it('returns empty string for falsy input', () => {
      expect(formatLocalIL(undefined as any)).toBe('');
      expect(formatLocalIL(null as any)).toBe('');
    });

    it('formats date using en-IL and Asia/Jerusalem timezone', () => {
      const spy = jest.spyOn(OriginalDate.prototype, 'toLocaleString').mockReturnValue('mocked-il-string');

      const result = formatLocalIL('2020-01-01T10:00:00Z');

      expect(spy).toHaveBeenCalledWith(
        'en-IL',
        expect.objectContaining({
          timeZone: 'Asia/Jerusalem',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(result).toBe('mocked-il-string');

      spy.mockRestore();
    });

    it('returns empty string when Date constructor throws', () => {
      // Force Date constructor to throw to exercise the catch branch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ThrowingDate: any = function () {
        throw new Error('boom');
      } as any;
      ThrowingDate.prototype = OriginalDate.prototype;
      (global as any).Date = ThrowingDate;

      const result = formatLocalIL('2020-01-01');
      expect(result).toBe('');
    });
  });

  describe('buildReleaseRunChangeComparator', () => {
    type Item = {
      version: string;
      run: string;
      change: string;
    };

    const comparator = buildReleaseRunChangeComparator<Item>(
      (i) => i.version,
      (i) => i.run,
      (i) => i.change
    );

    it('orders by release version in descending numeric order', () => {
      const items: Item[] = [
        { version: '1.0.0', run: '2020-01-01T00:00:00Z', change: '2020-01-01T00:00:00Z' },
        { version: '2.0.0', run: '2020-01-01T00:00:00Z', change: '2020-01-01T00:00:00Z' },
        { version: '10.0.0', run: '2020-01-01T00:00:00Z', change: '2020-01-01T00:00:00Z' },
      ];

      const sorted = [...items].sort(comparator);
      expect(sorted.map((i) => i.version)).toEqual(['10.0.0', '2.0.0', '1.0.0']);
    });

    it('orders by release run date when versions are equal', () => {
      const items: Item[] = [
        { version: '1.0.0', run: '2020-01-01T00:00:00Z', change: '2020-01-01T00:00:00Z' },
        { version: '1.0.0', run: '2020-01-02T00:00:00Z', change: '2020-01-01T00:00:00Z' },
      ];

      const sorted = [...items].sort(comparator);
      expect(sorted[0].run).toBe('2020-01-02T00:00:00Z');
    });

    it('orders by change date when versions and run dates are equal', () => {
      const items: Item[] = [
        { version: '1.0.0', run: '2020-01-01T00:00:00Z', change: '2020-01-01T01:00:00Z' },
        { version: '1.0.0', run: '2020-01-01T00:00:00Z', change: '2020-01-01T02:00:00Z' },
      ];

      const sorted = [...items].sort(comparator);
      expect(sorted[0].change).toBe('2020-01-01T02:00:00Z');
    });
  });
});
