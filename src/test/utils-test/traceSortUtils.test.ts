import {
  buildSuiteOrdinalIndex,
  sortSourceTargetsMapByTestCaseSuite,
  sortSourceTargetsMapByLinkedTestCaseSuite,
} from '../../utils/traceSortUtils';

describe('traceSortUtils', () => {
  describe('buildSuiteOrdinalIndex', () => {
    it('assigns increasing ordinals in DFS suite order across suites', () => {
      const suites = [
        { testCases: [{ id: 10 }, { id: 11 }] },
        { testCases: [{ id: 20 }] },
      ];

      const index = buildSuiteOrdinalIndex(suites);

      expect(index.get(10)).toBe(0);
      expect(index.get(11)).toBe(1);
      expect(index.get(20)).toBe(2);
    });

    it('first occurrence wins if a test case id repeats', () => {
      const suites = [{ testCases: [{ id: 5 }] }, { testCases: [{ id: 5 }] }];

      const index = buildSuiteOrdinalIndex(suites);

      expect(index.get(5)).toBe(0);
    });

    it('handles missing/empty suites and testCases gracefully', () => {
      expect(buildSuiteOrdinalIndex([]).size).toBe(0);
      expect(buildSuiteOrdinalIndex(undefined as any).size).toBe(0);
      expect(buildSuiteOrdinalIndex([{ testCases: undefined }] as any).size).toBe(0);
    });
  });

  describe('sortSourceTargetsMapByTestCaseSuite (test-req direction)', () => {
    it('orders source test cases by their suite ordinal', () => {
      const ordinalByTestCaseId = new Map([
        [200, 0],
        [100, 1],
      ]);
      const map = new Map<any, any[]>([
        [{ id: 100 }, [{ id: 1 }]],
        [{ id: 200 }, [{ id: 2 }]],
      ]);

      const sorted = sortSourceTargetsMapByTestCaseSuite(map, ordinalByTestCaseId);

      expect([...sorted.keys()].map((k) => k.id)).toEqual([200, 100]);
    });

    it('falls back to Infinity (sorts last) for test cases absent from the plan, preserving relative order among them', () => {
      const ordinalByTestCaseId = new Map([[100, 0]]);
      const map = new Map<any, any[]>([
        [{ id: 999 }, []],
        [{ id: 100 }, []],
        [{ id: 888 }, []],
      ]);

      const sorted = sortSourceTargetsMapByTestCaseSuite(map, ordinalByTestCaseId);

      expect([...sorted.keys()].map((k) => k.id)).toEqual([100, 999, 888]);
    });
  });

  describe('sortSourceTargetsMapByLinkedTestCaseSuite (req-test direction)', () => {
    it('orders requirements by the minimum suite ordinal among their linked test cases', () => {
      const ordinalByTestCaseId = new Map([
        [10, 5],
        [20, 1],
        [30, 3],
      ]);
      const map = new Map<any, any[]>([
        [{ id: 'req-A' }, [{ id: 10 }]],
        [{ id: 'req-B' }, [{ id: 20 }, { id: 30 }]],
      ]);

      const sorted = sortSourceTargetsMapByLinkedTestCaseSuite(map, ordinalByTestCaseId);

      expect([...sorted.keys()].map((k) => k.id)).toEqual(['req-B', 'req-A']);
    });

    it('sorts targets within each requirement by suite ordinal', () => {
      const ordinalByTestCaseId = new Map([
        [10, 5],
        [20, 1],
      ]);
      const map = new Map<any, any[]>([[{ id: 'req-A' }, [{ id: 10 }, { id: 20 }]]]);

      const sorted = sortSourceTargetsMapByLinkedTestCaseSuite(map, ordinalByTestCaseId);

      expect(sorted.get([...sorted.keys()][0])!.map((t) => t.id)).toEqual([20, 10]);
    });

    it('requirements with no matching suite ordinal sort last', () => {
      const ordinalByTestCaseId = new Map([[10, 0]]);
      const map = new Map<any, any[]>([
        [{ id: 'req-unmatched' }, [{ id: 999 }]],
        [{ id: 'req-matched' }, [{ id: 10 }]],
      ]);

      const sorted = sortSourceTargetsMapByLinkedTestCaseSuite(map, ordinalByTestCaseId);

      expect([...sorted.keys()].map((k) => k.id)).toEqual(['req-matched', 'req-unmatched']);
    });

    it('requirements with empty target arrays sort last', () => {
      const ordinalByTestCaseId = new Map([[10, 0]]);
      const map = new Map<any, any[]>([
        [{ id: 'req-empty' }, []],
        [{ id: 'req-matched' }, [{ id: 10 }]],
      ]);

      const sorted = sortSourceTargetsMapByLinkedTestCaseSuite(map, ordinalByTestCaseId);

      expect([...sorted.keys()].map((k) => k.id)).toEqual(['req-matched', 'req-empty']);
    });
  });
});
