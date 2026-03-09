import DgContentControls from '../../controllers';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@elisra-devops/docgen-skins', () =>
  jest.fn().mockImplementation(() => ({
    getDocumentSkin: jest.fn().mockReturnValue({}),
  }))
);

jest.mock('@elisra-devops/docgen-data-provider', () => jest.fn());

describe('DgContentControls.addMewpInternalValidationContent', () => {
  const createController = () =>
    new DgContentControls(
      'https://dev.azure.com/org/',
      'pat',
      'attachments',
      'MEWP',
      'json',
      '',
      'http://minio:9000',
      'ak',
      'sk'
    );

  test('auto-resolves latest Rel suite scope and uses it for internal validation report', async () => {
    const controller = createController();

    const mockResultDataProvider = {
      getMewpInternalValidationFlatResults: jest.fn().mockResolvedValue({
        sheetName: 'MEWP Internal Validation - Plan 123',
        columnOrder: ['Test Case ID'],
        rows: [{ 'Test Case ID': 1001 }],
      }),
    };
    const mockTestDataProvider = {
      GetTestSuitesForPlan: jest.fn().mockResolvedValue({
        testSuites: [
          { id: 1, parentSuiteId: 0, title: 'Root' },
          { id: 10, parentSuiteId: 1, title: 'Rel9' },
          { id: 11, parentSuiteId: 10, title: 'Validation / Sub suite' },
          { id: 20, parentSuiteId: 1, title: 'Rel11' },
          { id: 21, parentSuiteId: 20, title: 'Validation / Sub suite' },
          { id: 30, parentSuiteId: 1, title: 'Non Rel Suite' },
        ],
      }),
    };

    (controller as any).dgDataProviderAzureDevOps = {
      getResultDataProvider: jest.fn().mockResolvedValue(mockResultDataProvider),
      getTestDataProvider: jest.fn().mockResolvedValue(mockTestDataProvider),
    };

    await controller.addMewpInternalValidationContent(123, [10], undefined, false);

    expect(mockTestDataProvider.GetTestSuitesForPlan).toHaveBeenCalledWith('MEWP', '123');
    expect(mockResultDataProvider.getMewpInternalValidationFlatResults).toHaveBeenCalledWith(
      '123',
      'MEWP',
      [20, 21],
      undefined,
      {
        debugMode: false,
      }
    );
  });

  test('throws structured 422 error when latest Rel suite cannot be resolved', async () => {
    const controller = createController();

    const mockResultDataProvider = {
      getMewpInternalValidationFlatResults: jest.fn(),
    };
    const mockTestDataProvider = {
      GetTestSuitesForPlan: jest.fn().mockResolvedValue({
        testSuites: [
          { id: 1, parentSuiteId: 0, title: 'Root' },
          { id: 10, parentSuiteId: 1, title: 'Smoke / Validation' },
          { id: 11, parentSuiteId: 10, title: 'No release marker here' },
        ],
      }),
    };

    (controller as any).dgDataProviderAzureDevOps = {
      getResultDataProvider: jest.fn().mockResolvedValue(mockResultDataProvider),
      getTestDataProvider: jest.fn().mockResolvedValue(mockTestDataProvider),
    };

    await expect(controller.addMewpInternalValidationContent(123, [], undefined, false)).rejects.toMatchObject({
      statusCode: 422,
      code: 'MEWP_LATEST_REL_SUITE_NOT_FOUND',
      message: expect.stringContaining('latest Rel suite'),
    });
    expect(mockResultDataProvider.getMewpInternalValidationFlatResults).not.toHaveBeenCalled();
  });
});

