// Pure helpers for reordering Trace Analysis query-mode rows by test-suite order
// (DFS pre-order, matching the generated test-description section) instead of the
// ADO query's own ORDER BY. Used only when traceAnalysisRequest.sortBy[direction] === 'suite'.

/**
 * Builds a testCaseId -> suite ordinal index from the DFS-ordered suite list produced by
 * TestDataFactory.fetchTestData() (this.testDataRaw.suites: { temp: suite, testCases }[]).
 * First occurrence wins if a test case were ever to appear under more than one suite.
 */
export function buildSuiteOrdinalIndex(suites: Array<{ testCases?: Array<{ id: any }> }>): Map<number, number> {
  const ordinalByTestCaseId = new Map<number, number>();
  let ordinal = 0;
  for (const suite of suites || []) {
    for (const testCase of suite?.testCases || []) {
      const id = Number(testCase?.id);
      if (!Number.isNaN(id) && !ordinalByTestCaseId.has(id)) {
        ordinalByTestCaseId.set(id, ordinal);
      }
      ordinal++; // increments even on a duplicate/invalid id: ordinal is a DFS position counter, not an entry count

    }
  }
  return ordinalByTestCaseId;
}

function ordinalOf(id: any, ordinalByTestCaseId: Map<number, number>): number {
  const ordinal = ordinalByTestCaseId.get(Number(id));
  return ordinal === undefined ? Number.POSITIVE_INFINITY : ordinal;
}

/**
 * Test Case -> Requirement direction: source rows ARE test cases, so sort them directly
 * by their own suite ordinal. Stable sort preserves prior (query) order among ties/missing.
 */
export function sortSourceTargetsMapByTestCaseSuite(
  sourceTargetsMap: Map<any, any[]>,
  ordinalByTestCaseId: Map<number, number>
): Map<any, any[]> {
  const sortedEntries = [...sourceTargetsMap.entries()].sort(
    ([sourceA], [sourceB]) => ordinalOf(sourceA?.id, ordinalByTestCaseId) - ordinalOf(sourceB?.id, ordinalByTestCaseId)
  );
  return new Map(sortedEntries);
}

/**
 * Requirement -> Test Case direction: source rows are requirements (not in any suite), so a
 * requirement is ordered by the earliest suite ordinal among its linked test-case targets.
 * Targets within each requirement are also sorted by suite ordinal.
 */
export function sortSourceTargetsMapByLinkedTestCaseSuite(
  sourceTargetsMap: Map<any, any[]>,
  ordinalByTestCaseId: Map<number, number>
): Map<any, any[]> {
  const minOrdinalOfTargets = (targets: any[]) =>
    (targets || []).reduce(
      (min, target) => Math.min(min, ordinalOf(target?.id, ordinalByTestCaseId)),
      Number.POSITIVE_INFINITY
    );

  const sortedEntries = [...sourceTargetsMap.entries()]
    .map(([source, targets]) => [source, [...targets].sort((a, b) => ordinalOf(a?.id, ordinalByTestCaseId) - ordinalOf(b?.id, ordinalByTestCaseId))] as [any, any[]])
    .sort(([, targetsA], [, targetsB]) => minOrdinalOfTargets(targetsA) - minOrdinalOfTargets(targetsB));

  return new Map(sortedEntries);
}
