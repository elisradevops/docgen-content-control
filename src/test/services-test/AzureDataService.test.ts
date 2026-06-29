const getTicketsDataProviderMock = jest.fn();
const getPipelinesDataProviderMock = jest.fn();

jest.mock('@elisra-devops/docgen-data-provider', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getTicketsDataProvider: getTicketsDataProviderMock,
    getPipelinesDataProvider: getPipelinesDataProviderMock,
  })),
}));

import AzureDataService from '../../services/AzureDataService';

describe('AzureDataService historical query methods', () => {
  const ticketsProvider = {
    GetSharedQueries: jest.fn(),
    GetHistoricalQueries: jest.fn(),
    GetHistoricalQueryResults: jest.fn(),
    CompareHistoricalQueryResults: jest.fn(),
  };
  const pipelinesProvider = {
    GetAllReleaseHistory: jest.fn(),
    GetReleaseHistory: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getTicketsDataProviderMock.mockResolvedValue(ticketsProvider);
    getPipelinesDataProviderMock.mockResolvedValue(pipelinesProvider);
  });

  it('getHistoricalQueries delegates to tickets data provider', async () => {
    ticketsProvider.GetHistoricalQueries.mockResolvedValueOnce([{ id: 'q1' }]);
    const svc = new AzureDataService('https://org/', 'pat');

    const result = await svc.getHistoricalQueries('tp', 'shared');

    expect(ticketsProvider.GetHistoricalQueries).toHaveBeenCalledWith('tp', 'shared');
    expect(result).toEqual([{ id: 'q1' }]);
  });

  it('getHistoricalQueries passes through path as-is', async () => {
    ticketsProvider.GetHistoricalQueries.mockResolvedValueOnce([{ id: 'q1' }]);
    const svc = new AzureDataService('https://org/', 'pat');

    await svc.getHistoricalQueries('tp', 'Shared Queries');

    expect(ticketsProvider.GetHistoricalQueries).toHaveBeenCalledWith('tp', 'Shared Queries');
  });

  it('getSharedQueries defaults to shared path', async () => {
    ticketsProvider.GetSharedQueries.mockResolvedValueOnce({ acquiredTrees: [] });
    const svc = new AzureDataService('https://org/', 'pat');

    await svc.getSharedQueries('tp', 'STD');

    expect(ticketsProvider.GetSharedQueries).toHaveBeenCalledWith('tp', 'shared', 'STD');
  });

  it('getSharedQueries passes through path as-is', async () => {
    ticketsProvider.GetSharedQueries.mockResolvedValueOnce({ acquiredTrees: [] });
    const svc = new AzureDataService('https://org/', 'pat');

    await svc.getSharedQueries('tp', 'STD', 'Shared Queries');

    expect(ticketsProvider.GetSharedQueries).toHaveBeenCalledWith('tp', 'Shared Queries', 'STD');
  });

  it('getHistoricalQueryResults delegates with queryId, project, and asOf', async () => {
    ticketsProvider.GetHistoricalQueryResults.mockResolvedValueOnce({ queryId: 'q1', rows: [] });
    const svc = new AzureDataService('https://org/', 'pat');

    const result = await svc.getHistoricalQueryResults('q1', 'tp', '2026-01-01T10:00:00.000Z');

    expect(ticketsProvider.GetHistoricalQueryResults).toHaveBeenCalledWith(
      'q1',
      'tp',
      '2026-01-01T10:00:00.000Z',
    );
    expect(result).toEqual({ queryId: 'q1', rows: [] });
  });

  it('compareHistoricalQueryResults delegates to CompareHistoricalQueryResults', async () => {
    ticketsProvider.CompareHistoricalQueryResults.mockResolvedValueOnce({ rows: [] });
    const svc = new AzureDataService('https://org/', 'pat');

    const result = await svc.compareHistoricalQueryResults(
      'q2',
      'tp',
      '2025-12-22T17:08:00.000Z',
      '2025-12-28T08:57:00.000Z',
    );

    expect(ticketsProvider.CompareHistoricalQueryResults).toHaveBeenCalledWith(
      'q2',
      'tp',
      '2025-12-22T17:08:00.000Z',
      '2025-12-28T08:57:00.000Z',
    );
    expect(result).toEqual({ rows: [] });
  });

  it('getReleaseDefinitionHistory delegates to shallow release history', async () => {
    pipelinesProvider.GetReleaseHistory.mockResolvedValueOnce({ value: [{ id: 1 }] });
    const svc = new AzureDataService('https://org/', 'pat');

    const result = await svc.getReleaseDefinitionHistory('tp', '123');

    expect(pipelinesProvider.GetReleaseHistory).toHaveBeenCalledWith('tp', '123');
    expect(pipelinesProvider.GetAllReleaseHistory).not.toHaveBeenCalled();
    expect(result).toEqual({ value: [{ id: 1 }] });
  });
});

describe('AzureDataService.getTraceColumns', () => {
  const ticketsProvider = {
    GetTraceColumnsByType: jest.fn(),
  };

  const getTicketsDataProviderMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getTicketsDataProviderMock.mockResolvedValue(ticketsProvider);
  });

  it('delegates to GetTraceColumnsByType with correct wiql hrefs', async () => {
    const expected = { Requirement: [{ referenceName: 'Custom.Foo', name: 'Foo' }], 'Test Case': [] };
    ticketsProvider.GetTraceColumnsByType.mockResolvedValueOnce(expected);

    const svc = new AzureDataService('https://org/', 'pat');
    // Inject mock provider
    (svc as any).dg = { getTicketsDataProvider: getTicketsDataProviderMock };

    const reqTestQuery = { wiql: { href: 'https://ado/wiql/rt' } };
    const testReqQuery = { wiql: { href: 'https://ado/wiql/tr' } };
    const result = await svc.getTraceColumns(reqTestQuery, testReqQuery, 'my-project');

    expect(ticketsProvider.GetTraceColumnsByType).toHaveBeenCalledWith(
      'https://ado/wiql/rt',
      'https://ado/wiql/tr',
      'my-project',
    );
    expect(result).toEqual(expected);
  });

  it('passes undefined hrefs when queries are null', async () => {
    ticketsProvider.GetTraceColumnsByType.mockResolvedValueOnce({ Requirement: [], 'Test Case': [] });

    const svc = new AzureDataService('https://org/', 'pat');
    (svc as any).dg = { getTicketsDataProvider: getTicketsDataProviderMock };

    await svc.getTraceColumns(null, null, 'my-project');

    expect(ticketsProvider.GetTraceColumnsByType).toHaveBeenCalledWith(
      undefined,
      undefined,
      'my-project',
    );
  });
});
