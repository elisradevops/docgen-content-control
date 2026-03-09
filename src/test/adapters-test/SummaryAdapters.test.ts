import ReleaseComponentDataSkinAdapter from '../../adapters/ReleaseComponentsDataSkinAdapter';
import TestLogDataSkinAdapter from '../../adapters/TestLogDataSkinAdapter';
import TestResultGroupSummaryDataSkinAdapter from '../../adapters/TestResultGroupSummaryDataSkinAdapter';
import TestResultsSummaryDataSkinAdapter from '../../adapters/TestResultsSummaryDataSkinAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Summary adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps release components', () => {
    const adapter = new ReleaseComponentDataSkinAdapter();
    const rows = adapter.jsonSkinAdapter([{ artifactName: 'CompA', artifactVersion: '1.2.3' }]);

    expect(rows).toHaveLength(1);
    expect(rows?.[0].fields).toEqual([
      { name: '#', value: '1', width: '5.5%' },
      { name: 'Software Components', value: 'CompA', width: '36.1%' },
      { name: 'Version', value: '1.2.3', width: '23.6%' },
      { name: 'Comments', value: '' },
    ]);
  });

  it('logs release component mapping errors', () => {
    const adapter = new ReleaseComponentDataSkinAdapter();
    const rows = adapter.jsonSkinAdapter(null as any);
    expect(rows).toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
  });

  it('maps test log execution row', () => {
    const adapter = new TestLogDataSkinAdapter();
    const rows = adapter.jsonSkinDataAdapter([
      {
        testId: 12,
        testName: 'TC name',
        executedDate: '2026-01-15T10:11:12.000Z',
        performedBy: 'User A',
      },
    ]);

    expect(rows).toHaveLength(1);
    const fields = rows[0].fields;
    expect(fields.find((f: any) => f.name === 'Test Id')?.value).toBe('12');
    expect(fields.find((f: any) => f.name === 'Execution Date')?.value).toContain('/');
    expect(fields.find((f: any) => f.name === 'Performed By')?.value).toBe('User A');
  });

  it('logs test log mapping errors', () => {
    const adapter = new TestLogDataSkinAdapter();
    const rows = adapter.jsonSkinDataAdapter(null as any);
    expect(rows).toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
  });

  it('sorts group summary and keeps Total last', () => {
    const adapter = new TestResultGroupSummaryDataSkinAdapter();
    const rows = adapter.jsonSkinDataAdapter([
      {
        testGroupName: 'Total',
        passed: 5,
        failed: 1,
        blocked: 0,
        notApplicable: 0,
        notRun: 2,
        total: 8,
        successPercentage: '62%',
      },
      {
        testGroupName: 'Alpha',
        passed: 1,
        failed: 0,
        blocked: 0,
        notApplicable: 0,
        notRun: 0,
        total: 1,
        successPercentage: '100%',
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].fields.find((f: any) => f.name === 'Test Group')?.value).toBe('Alpha');
    expect(rows[1].fields.find((f: any) => f.name === 'Test Group')?.value).toBe('Total');
    expect(rows[1].fields.find((f: any) => f.name === '#')?.value).toBe('');
  });

  it('logs group summary mapping errors', () => {
    const adapter = new TestResultGroupSummaryDataSkinAdapter();
    const rows = adapter.jsonSkinDataAdapter(null as any);
    expect(rows).toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
  });

  it('maps test results summary with and without configuration column', () => {
    const adapter = new TestResultsSummaryDataSkinAdapter();
    const raw = [
      {
        testGroupName: 'Group A',
        testId: 4,
        testName: 'TC',
        runStatus: 'Pass',
        configuration: 'Win',
      },
    ];

    const withConfig = adapter.jsonSkinDataAdapter(raw, true);
    const withoutConfig = adapter.jsonSkinDataAdapter(raw, false);

    expect(withConfig[0].fields.find((f: any) => f.name === 'Configuration')?.value).toBe('Win');
    expect(withConfig[0].fields.find((f: any) => f.name === 'Run Status')?.width).toBe('9.4%');
    expect(withoutConfig[0].fields.find((f: any) => f.name === 'Configuration')).toBeUndefined();
    expect(withoutConfig[0].fields.find((f: any) => f.name === 'Run Status')?.width).toBe('10.8%');
  });

  it('logs test results summary mapping errors', () => {
    const adapter = new TestResultsSummaryDataSkinAdapter();
    const rows = adapter.jsonSkinDataAdapter(null as any, false);
    expect(rows).toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
  });
});
