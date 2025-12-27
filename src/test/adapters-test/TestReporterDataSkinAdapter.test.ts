import TestReporterDataSkinAdapter from '../../adapters/TestReporterDataSkinAdapter';

describe('TestReporterDataSkinAdapter - history formatting', () => {
  it('should format history as local time, strip html, and order newest-first', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});

    const raw = [
      {
        suiteName: 'Suite A',
        testCase: { id: 1, title: 'TC', url: 'u', result: null, comment: null },
        history: [
          { createdDate: '2025-12-24T12:30:48.980Z', createdBy: 'Eden', text: '<div>test<br>1</div>' },
          { createdDate: '2025-12-24T12:30:52.090Z', createdBy: 'Eden', text: '<div>test<br>2</div>' },
        ],
      },
    ];

    const out = await adapter.jsonSkinDataAdapter(raw);
    expect(out).toHaveLength(1);
    expect(out[0].suiteName).toBe('Suite A');
    expect(out[0].testCases).toHaveLength(1);

    const historyEntries = out[0].testCases[0].historyEntries as string[];
    const steps = out[0].testCases[0].testSteps as any[];
    expect(steps).toBeUndefined();
    expect(historyEntries).toHaveLength(2);
    expect(historyEntries[0]).toContain('24/12/2025, 14:30:52 - Eden: test\n2');
    expect(historyEntries[1]).toContain('24/12/2025, 14:30:48 - Eden: test\n1');
    expect(`${historyEntries[0]}`).not.toContain('<div>');
    expect(`${historyEntries[0]}`).not.toContain('<br>');
  });

  it('should emit historyEntries separately from testSteps', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});

    const raw = [
      {
        suiteName: 'Suite A',
        testCase: { id: 1, title: 'TC', url: 'u', result: null, comment: null },
        stepNo: '1',
        stepStatus: 'Passed',
        history: [
          { createdDate: '2025-12-24T12:30:54.090Z', createdBy: 'Eden', text: '<div>h3</div>' },
          { createdDate: '2025-12-24T12:30:52.090Z', createdBy: 'Eden', text: '<div>h2</div>' },
          { createdDate: '2025-12-24T12:30:48.980Z', createdBy: 'Eden', text: '<div>h1</div>' },
        ],
      },
      {
        suiteName: 'Suite A',
        testCase: { id: 1, title: 'TC', url: 'u', result: null, comment: null },
        stepNo: '2',
        stepStatus: 'Failed',
      },
    ];

    const out = await adapter.jsonSkinDataAdapter(raw);
    const steps = out[0].testCases[0].testSteps as any[];
    const historyEntries = out[0].testCases[0].historyEntries as string[];
    expect(steps).toHaveLength(2);
    expect(historyEntries).toHaveLength(3);
    expect(historyEntries[0]).toContain('24/12/2025, 14:30:54 - Eden: h3');
    expect(historyEntries[1]).toContain('24/12/2025, 14:30:52 - Eden: h2');
    expect(historyEntries[2]).toContain('24/12/2025, 14:30:48 - Eden: h1');
  });
});
