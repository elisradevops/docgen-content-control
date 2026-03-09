import TestReporterDataSkinAdapter from '../../adapters/TestReporterDataSkinAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

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

  it('should parse legacy string history, map configuration and include step rich content', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});

    const raw = [
      {
        suiteName: 'Suite B',
        testCase: { id: 2, title: 'TC-2', url: 'u2', result: 'Passed', comment: 'ok' },
        history:
          '2025-12-24T12:30:48.980Z - Eden: <div>legacy-1</div>\n\n' +
          '2025-12-24T12:30:49.980Z - microsoft.teamfoundation.system: <div>skip-me</div>',
        configurationName: 'Config-A',
        customFieldX: 'custom-value',
        stepNo: '10',
        stepAction: '<p>action-html</p>',
        stepExpected: '<p>expected-html</p>',
        stepStatus: 'Failed',
        stepComments: 'bad result',
      },
    ];

    const out = await adapter.jsonSkinDataAdapter(raw as any);
    expect(out).toHaveLength(1);
    const tc = out[0].testCases[0] as any;
    expect(tc.configuration).toBe('Config-A');
    expect(tc.customFieldX).toBe('custom-value');
    expect(tc.historyEntries).toHaveLength(1);
    expect(tc.historyEntries[0]).toContain('legacy-1');
    expect(tc.testSteps).toHaveLength(1);
    expect(tc.testSteps[0].stepRunStatus).toBe('Failed');
    expect(tc.testSteps[0].stepErrorMessage).toBe('bad result');
    expect(tc.testSteps[0].stepAction).toBeTruthy();
    expect(tc.testSteps[0].stepExpected).toBeTruthy();
  });

  it('should keep normalizing history from later rows when first row has no history', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});
    const raw = [
      {
        suiteName: 'Suite C',
        testCase: { id: 3, title: 'TC-3', url: 'u3', result: null, comment: null },
      },
      {
        suiteName: 'Suite C',
        testCase: { id: 3, title: 'TC-3', url: 'u3', result: null, comment: null },
        history: [{ createdDate: '2025-12-24T12:30:48.980Z', createdBy: 'User', text: '<p>h</p>' }],
      },
    ];

    const out = await adapter.jsonSkinDataAdapter(raw as any);
    expect(out[0].testCases[0].historyEntries).toHaveLength(1);
    expect(out[0].testCases[0].historyEntries[0]).toContain('User');
  });

  it('should handle unsupported history types and debug when entries are filtered out', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});

    // Directly exercise the fallback return path in normalizeHistoryEntries.
    const normalized = await (adapter as any).normalizeHistoryEntries(123);
    expect(normalized).toEqual([]);

    const raw = [
      {
        suiteName: 'Suite D',
        testCase: { id: 4, title: 'TC-4', url: 'u4', result: null, comment: null },
        history: [
          {
            createdDate: '2026-01-01T10:00:00.000Z',
            createdBy: 'microsoft.teamfoundation.system',
            text: '<p>auto</p>',
          },
        ],
      },
      {
        suiteName: 'Suite D',
        testCase: { id: 4, title: 'TC-4', url: 'u4', result: null, comment: null },
        history: [
          {
            createdDate: '2026-01-01T10:00:00.000Z',
            createdBy: 'microsoft.teamfoundation.system',
            text: '<p>auto</p>',
          },
        ],
      },
    ];

    const out = await adapter.jsonSkinDataAdapter(raw as any);
    expect(out[0].testCases[0].historyEntries).toBeUndefined();
    expect((logger as any).debug).toHaveBeenCalled();
  });

  it('returns undefined and logs when step HTML cleanup throws', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});
    (adapter as any).htmlUtils.cleanHtml = jest.fn().mockRejectedValue(new Error('clean boom'));

    const out = await adapter.jsonSkinDataAdapter([
      {
        suiteName: 'Suite E',
        testCase: { id: 5, title: 'TC-5', url: 'u5', result: null, comment: null },
        stepNo: '1',
        stepAction: '<p>x</p>',
      },
    ] as any);

    expect(out).toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
  });

  it('keeps stable order by original index when history timestamps are equal', async () => {
    const adapter = new TestReporterDataSkinAdapter('/template', 'proj', {});
    const out = await adapter.jsonSkinDataAdapter([
      {
        suiteName: 'Suite F',
        testCase: { id: 6, title: 'TC-6', url: 'u6', result: null, comment: null },
        history: [
          { createdDate: '2026-01-01T10:00:00.000Z', createdBy: 'First', text: '<p>one</p>' },
          { createdDate: '2026-01-01T10:00:00.000Z', createdBy: 'Second', text: '<p>two</p>' },
        ],
      },
    ] as any);

    expect(out[0].testCases[0].historyEntries[0]).toContain('First');
    expect(out[0].testCases[0].historyEntries[1]).toContain('Second');
  });
});
