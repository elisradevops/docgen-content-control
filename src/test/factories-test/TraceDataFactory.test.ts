import TraceDataFactory from '../../factories/TraceDataFactory';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('TraceDataFactory', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  function createFactory(overrides: Partial<any> = {}) {
    const testDataProvider = {
      GetTestPlans: jest.fn().mockResolvedValue({ value: [{ id: 7, name: 'Plan 7' }] }),
      GetTestSuitesByPlan: jest.fn().mockResolvedValue([
        { id: 101, name: 'Suite 101' },
        { id: 102, name: 'Suite 102' },
      ]),
      GetTestCasesBySuites: jest.fn().mockResolvedValue([
        { id: 1, suit: 101 },
        { id: 2, suit: 102 },
      ]),
    };
    const ticketsDataProvider = {
      GetQueryResultById: jest.fn().mockResolvedValue([
        { fields: [{ value: 1001 }] },
        { fields: [{ value: 1002 }] },
      ]),
      GetLinksByIds: jest.fn().mockResolvedValue([
        {
          id: 1001,
          title: 'TC 1001',
          url: 'u1',
          links: [
            { id: 2001, title: 'Req 2001', type: 'Related' },
            { id: 2002, title: 'Req 2002', type: 'Ignored' },
          ],
        },
      ]),
    };
    const dgDataProvider = {
      getTestDataProvider: jest.fn().mockResolvedValue(testDataProvider),
      getTicketsDataProvider: jest.fn().mockResolvedValue(ticketsDataProvider),
    };

    const factory = new TraceDataFactory(
      'MEWP',
      overrides.testPlanId ?? 7,
      overrides.testSuiteArray ?? [101],
      overrides.queryId ?? '',
      overrides.linkTypeFilterArray ?? ['Related'],
      dgDataProvider as any
    );
    return { factory, dgDataProvider, testDataProvider, ticketsDataProvider };
  }

  it('fetches test-plan data and creates plan+suites payload', async () => {
    const { factory, testDataProvider } = createFactory({ testSuiteArray: [101] });
    await factory.fetchTestData();

    expect(testDataProvider.GetTestPlans).toHaveBeenCalledWith('MEWP');
    expect(testDataProvider.GetTestSuitesByPlan).toHaveBeenCalled();
    expect(testDataProvider.GetTestCasesBySuites).toHaveBeenCalled();
    expect((factory as any).testDataRaw.suites).toHaveLength(1);
    expect((factory as any).testDataRaw.suites[0].suite.id).toBe(101);
    expect((factory as any).testDataRaw.suites[0].testCases).toHaveLength(1);
  });

  it('adopts only links matching requested relation types', async () => {
    const { factory } = createFactory();

    await factory.jsonSkinDataAdpater(
      [
        {
          id: 10,
          title: 'WI-10',
          url: 'http://wi/10',
          customerRequirmentId: 'SR-1',
          links: [
            { id: 20, title: 'L-20', type: 'Related' },
            { id: 21, title: 'L-21', type: 'Other' },
          ],
        },
      ] as any,
      true
    );

    const adopted = (factory as any).adoptedData;
    expect(adopted).toHaveLength(1);
    expect(adopted[0].fields[0]).toMatchObject({ value: 10 });
    expect(adopted[0].fields[2]).toMatchObject({ value: 20 });
  });

  it('handles query mode and executes links fetch', async () => {
    const { factory, ticketsDataProvider } = createFactory({ testPlanId: 0, queryId: 'query-1' });

    await factory.fetchData();

    expect(ticketsDataProvider.GetQueryResultById).toHaveBeenCalledWith('query-1', 'MEWP');
    expect(ticketsDataProvider.GetLinksByIds).toHaveBeenCalledWith('MEWP', [1001, 1002]);
    expect((logger as any).debug).toHaveBeenCalled();
  });

  it('covers fetchData error paths without throwing', async () => {
    const { factory, dgDataProvider, ticketsDataProvider, testDataProvider } = createFactory({
      testPlanId: 7,
      queryId: '',
    });

    testDataProvider.GetTestPlans.mockRejectedValueOnce(new Error('plan failure'));
    ticketsDataProvider.GetLinksByIds.mockRejectedValueOnce(new Error('links failure'));
    const adoptSpy = jest.spyOn(factory as any, 'jsonSkinDataAdpater').mockRejectedValueOnce(new Error('adopt'));

    await expect(factory.fetchData()).resolves.toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
    expect(dgDataProvider.getTicketsDataProvider).toHaveBeenCalled();
    expect(adoptSpy).toHaveBeenCalled();
  });

  it('swallows fetchTestData inner test-case retrieval error branch', async () => {
    const { factory, testDataProvider } = createFactory();
    testDataProvider.GetTestCasesBySuites.mockRejectedValueOnce(new Error('cases boom'));

    await expect(factory.fetchTestData()).resolves.toEqual([]);
  });
});
