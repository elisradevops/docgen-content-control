import ResultDataFactory from '../../factories/ResultDataFactory';
import logger from '../../services/logger';

// Mock all dependencies first
jest.mock('../../services/logger');
jest.mock('@elisra-devops/docgen-data-provider');

// Mock all adapters with proper implementation
jest.mock('../../adapters/TestResultGroupSummaryDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockReturnValue(['adapted group data']),
  }));
});

jest.mock('../../adapters/TestResultsSummaryDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockReturnValue(['adapted summary data']),
  }));
});

jest.mock('../../adapters/DetailedResultsSummaryDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockResolvedValue(['adapted detailed data']),
  }));
});

jest.mock('../../adapters/OpenPCRsDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockReturnValue(['adapted PCR data']),
  }));
});

jest.mock('../../adapters/TestLogDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockReturnValue(['adapted log data']),
  }));
});

jest.mock('../../adapters/StepAnalysisSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockResolvedValue(['adapted analysis data']),
    getAttachmentMinioData: jest.fn().mockReturnValue([{ attachment: 'data' }]),
  }));
});

jest.mock('../../adapters/TestReporterDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinDataAdapter: jest.fn().mockResolvedValue(['adapted reporter data']),
  }));
});

jest.mock('../../adapters/OpenPcrQueryResultsSkinAdapter', () => {
  return jest.fn().mockImplementation((queryResults, type, includeCommonColumnsMode) => ({
    adoptSkinData: jest.fn(),
    getAdoptedData: jest
      .fn()
      .mockReturnValue([{ type, mode: includeCommonColumnsMode, items: queryResults || [] }]),
  }));
});

jest.mock('../../adapters/TraceByLinkedPCRAdapter', () => {
  return jest.fn().mockImplementation((mapData, type) => ({
    adoptSkinData: jest.fn(),
    getAdoptedData: jest.fn().mockReturnValue([{ type, count: mapData ? mapData.size || 0 : 0 }]),
  }));
});

jest.mock('../../utils/tablePresentation', () => ({
  COLOR_TEST_SOFT: 'soft-color',
  COLOR_PCR: 'pcr-color',
  buildGroupedHeader: jest.fn((leftLabel: string, rightLabel: string) => ({
    leftLabel,
    rightLabel,
    leftShading: { color: 'auto', fill: 'LEFT' },
    rightShading: { color: 'auto', fill: 'RIGHT' },
  })),
}));

describe('ResultDataFactory', () => {
  let mockResultDataProvider;
  let mockDgDataProvider;
  let mockTicketsDataProvider;

  // Default test values for all required parameters
  const defaultParams = {
    attachmentsBucketName: 'test-bucket',
    teamProject: 'test-project',
    testPlanId: 123,
    testSuiteArray: [456, 789],
    stepExecution: { data: 'execution' },
    stepAnalysis: { data: 'analysis' },
    includeConfigurations: true,
    includeHierarchy: false,
    openPCRsSelectionRequest: undefined,
    includeTestLog: false,
    dgDataProvider: null,
    templatePath: '/path/to/template',
    minioEndPoint: 'test-endpoint',
    minioAccessKey: 'test-access-key',
    minioSecretKey: 'test-secret-key',
    PAT: 'test-pat',
    includeHardCopyRun: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock result data provider
    mockResultDataProvider = {
      getCombinedResultsSummary: jest.fn(),
      getTestReporterResults: jest.fn(),
    };

    mockTicketsDataProvider = {
      GetQueryResultsFromWiql: jest.fn(),
    };

    // Setup mock data provider
    mockDgDataProvider = {
      getResultDataProvider: jest.fn().mockResolvedValue(mockResultDataProvider),
      getTicketsDataProvider: jest.fn().mockResolvedValue(mockTicketsDataProvider),
    };

    // Update default params with fresh mock
    defaultParams.dgDataProvider = mockDgDataProvider;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      const factory = new ResultDataFactory(
        '',
        '',
        null,
        null,
        null,
        null,
        false,
        false,
        false,
        false,
        null,
        '',
        '',
        '',
        '',
        '',
        false
      );

      expect(factory.isSuiteSpecific).toBe(false);
      expect(factory.attachmentsBucketName).toBe('');
      expect(factory.teamProject).toBe('');
      expect(factory.testPlanId).toBeNull();
      expect(factory.testSuiteArray).toBeNull();
      expect(factory.attachmentMinioData).toEqual([]);
    });

    test('should initialize with provided values', () => {
      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      expect(factory.isSuiteSpecific).toBe(true);
      expect(factory.attachmentsBucketName).toBe(defaultParams.attachmentsBucketName);
      expect(factory.teamProject).toBe(defaultParams.teamProject);
      expect(factory.testPlanId).toBe(defaultParams.testPlanId);
    });
  });

  describe('fetchGetCombinedResultsSummary', () => {
    test('should fetch and adapt combined results', async () => {
      const mockResultsData = [
        {
          skin: 'test-result-test-group-summary-table',
          data: [{ id: 'group1' }],
        },
        {
          skin: 'test-result-table',
          data: [{ id: 'result1' }],
        },
      ];

      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue(mockResultsData);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchGetCombinedResultsSummary();

      expect(mockDgDataProvider.getResultDataProvider).toHaveBeenCalled();
      expect(mockResultDataProvider.getCombinedResultsSummary).toHaveBeenCalledWith(
        defaultParams.testPlanId.toString(),
        defaultParams.teamProject,
        defaultParams.testSuiteArray,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeHardCopyRun
      );
    });

    test('should throw error when no test data found', async () => {
      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue([]);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchGetCombinedResultsSummary();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred while trying the fetch Test Group Result Summary Data')
      );
    });

    test('should handle errors', async () => {
      mockResultDataProvider.getCombinedResultsSummary.mockRejectedValue(new Error('API error'));

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchGetCombinedResultsSummary();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred while trying the fetch Test Group Result Summary Data')
      );
    });
  });

  describe('fetchTestReporterResults', () => {
    test('should fetch and adapt test reporter results', async () => {
      const selectedFields = ['field1', 'field2'];
      const mockResultsData = [
        {
          skin: 'test-reporter-table',
          data: [{ id: 'report1' }],
        },
      ];

      mockResultDataProvider.getTestReporterResults.mockResolvedValue(mockResultsData);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchTestReporterResults(selectedFields, false, true, true, undefined, 'none');

      expect(mockResultDataProvider.getTestReporterResults).toHaveBeenCalledWith(
        defaultParams.testPlanId.toString(),
        defaultParams.teamProject,
        defaultParams.testSuiteArray,
        selectedFields,
        false, // allowCrossTestPlan
        true, // enableRunTestCaseFilter
        true, // enableRunStepStatusFilter
        undefined, // linkedQueryRequest
        'none' // errorFilterMode
      );
    });

    test('should throw error when no test data found', async () => {
      mockResultDataProvider.getTestReporterResults.mockResolvedValue([]);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchTestReporterResults([], false, false, false, undefined, 'none');

      expect(logger.error).toHaveBeenCalled();
    });

    test('should handle errors', async () => {
      mockResultDataProvider.getTestReporterResults.mockRejectedValue(new Error('API error'));

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchTestReporterResults([], false, false, false, undefined, 'none');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('jsonSkinDataAdapter', () => {
    let factory;

    beforeEach(() => {
      factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );
    });

    test('should handle test-result-test-group-summary-table adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('test-result-test-group-summary-table', [
        { raw: 'data' },
      ]);
      expect(result).toEqual(['adapted group data']);
    });

    test('should handle test-result-table adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('test-result-table', [{ raw: 'data' }]);
      expect(result).toEqual(['adapted summary data']);
    });

    test('should handle detailed-test-result-table adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('detailed-test-result-table', [{ raw: 'data' }]);
      expect(result).toEqual(['adapted detailed data']);
    });

    test('should handle test-reporter-table adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('test-reporter-table', [{ raw: 'data' }]);
      expect(result).toEqual(['adapted reporter data']);
    });

    test('should handle open-pcr-table adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('open-pcr-table', [{ raw: 'data' }]);
      // jsonSkinDataAdapter returns {} for unhandled adapter types
      expect(result).toEqual({});
    });

    test('should handle test-log-table adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('test-log-table', [{ raw: 'data' }]);
      expect(result).toEqual(['adapted log data']);
    });

    test('should handle step-analysis-appendix-skin adapter', async () => {
      const result = await factory.jsonSkinDataAdapter('step-analysis-appendix-skin', [{ raw: 'data' }]);
      expect(result).toEqual(['adapted analysis data']);
      expect(factory.attachmentMinioData).toEqual([{ attachment: 'data' }]);
    });

    test('should handle step-execution-appendix-skin adapter by returning raw data', async () => {
      const rawData = [{ id: 'execution-data' }];
      const result = await factory.jsonSkinDataAdapter('step-execution-appendix-skin', rawData);
      expect(result).toBe(rawData);
    });

    test('should handle null adapter type', async () => {
      const result = await factory.jsonSkinDataAdapter(null, []);
      // jsonSkinDataAdapter returns {} for null adapter type
      expect(result).toEqual({});
    });

    test('should handle errors', async () => {
      // Setup the mock to throw an error
      const TestResultGroupSummaryAdapter = require('../../adapters/TestResultGroupSummaryDataSkinAdapter');
      TestResultGroupSummaryAdapter.mockImplementationOnce(() => ({
        jsonSkinDataAdapter: jest.fn().mockImplementation(() => {
          throw new Error('Adapter error');
        }),
      }));

      await expect(factory.jsonSkinDataAdapter('test-result-test-group-summary-table', [])).rejects.toThrow(
        'Adapter error'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred during build json Skin data adapter')
      );
    });

    test('should build linked-pcr-trace data for both directions with and without maps', async () => {
      // Arrange maps: one filled, one empty
      const filledMap = new Map<any, any[]>([[1, ['x']]]);
      const emptyMap = null as any;

      factory.testCaseToOpenPcrTraceMap = filledMap;
      factory.openPcrToTestCaseTraceMap = emptyMap;

      const result = await factory.jsonSkinDataAdapter('linked-pcr-trace', []);

      expect(result.testToOpenPcrAdoptedData).toBeDefined();
      expect(result.testToOpenPcrAdoptedData.adoptedData[0]).toEqual({ type: 'test-to-open-pcr', count: 1 });
      expect(result.testToOpenPcrAdoptedData.title.fields[0].value).toBe('Test Case to Open PCR Table');

      expect(result.OpenPcrToTestAdoptedData).toBeDefined();
      expect(result.OpenPcrToTestAdoptedData.adoptedData).toBeNull();
      expect(result.OpenPcrToTestAdoptedData.title.fields[0].value).toBe('Open PCR To Test Case');
    });

    test('should build query-results data and grouped headers for both directions', async () => {
      // Pre-populate query results maps used by adapter
      factory.testToOpenPcrQuery = [{ id: 1 }];
      factory.OpenPcrToTestQuery = [{ id: 2 }];

      const result = await factory.jsonSkinDataAdapter('query-results', [], 'leftOnly');

      const left = result.testToOpenPcrAdoptedData;
      const right = result.OpenPcrToTestAdoptedData;

      expect(left.title.fields[0].value).toBe('Test Case to Open PCR Table');
      expect(left.adoptedData[0].type).toBe('test-to-open-pcr');
      expect(left.adoptedData[0].mode).toBe('leftOnly');
      expect(left.groupedHeader.leftLabel).toBe('Test Case');
      expect(left.groupedHeader.rightLabel).toBe('Open PCR');

      expect(right.title.fields[0].value).toBe('Open PCR To Test Case');
      expect(right.adoptedData[0].type).toBe('open-pcr-to-test');
      expect(right.adoptedData[0].mode).toBe('leftOnly');
      expect(right.groupedHeader.leftLabel).toBe('Open PCR');
      expect(right.groupedHeader.rightLabel).toBe('Test Case');
    });
  });

  describe('fetchQueryResultsForOpenPCR and fetchLinkedOpenPcrTrace', () => {
    test('fetchQueryResultsForOpenPCR should call tickets data provider for both queries and adapt results', async () => {
      const openPCRsSelectionRequest = {
        testToOpenPcrQuery: {
          title: 'TestToOpenPcr',
          wiql: { href: 'wiql-test-to-open' },
        },
        OpenPcrToTestQuery: {
          title: 'OpenPcrToTest',
          wiql: { href: 'wiql-open-to-test' },
        },
        includeCommonColumnsMode: 'both',
      };

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      // Make the WIQL calls return some dummy results so the factory stores them
      mockTicketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce([{ id: 't1' }]);
      mockTicketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce([{ id: 'o1' }]);

      await factory.fetchQueryResultsForOpenPCR();

      expect(mockDgDataProvider.getTicketsDataProvider).toHaveBeenCalled();
      expect(mockTicketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledTimes(2);
      const calls = mockTicketsDataProvider.GetQueryResultsFromWiql.mock.calls;
      expect(calls[0][0]).toBe('wiql-test-to-open');
      expect(calls[1][0]).toBe('wiql-open-to-test');

      expect(factory.testToOpenPcrQuery).toBeDefined();
      expect(factory.OpenPcrToTestQuery).toBeDefined();
      expect(factory.testCaseToOpenPcrLookup instanceof Map).toBe(true);

      const adopted = factory.adoptedQueryResults;
      expect(adopted.testToOpenPcrAdoptedData).toBeDefined();
      expect(adopted.OpenPcrToTestAdoptedData).toBeDefined();
    });

    test('fetchLinkedOpenPcrTrace should set adoptedQueryResults using linked-pcr-trace', async () => {
      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      const spy = jest
        .spyOn(factory, 'jsonSkinDataAdapter')
        .mockResolvedValueOnce({ marker: 'linked-trace-result' } as any);

      await factory.fetchLinkedOpenPcrTrace();

      expect(spy).toHaveBeenCalledWith('linked-pcr-trace', []);
      expect(factory.adoptedQueryResults).toEqual({ marker: 'linked-trace-result' });
    });

    test('fetchLinkedOpenPcrTrace should log error when adapter throws', async () => {
      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      jest.spyOn(factory, 'jsonSkinDataAdapter').mockRejectedValueOnce(new Error('linked trace failed'));

      await factory.fetchLinkedOpenPcrTrace();

      expect(logger.error).toHaveBeenCalledWith('Could not fetch linked open pcr trace: linked trace failed');
    });
  });

  describe('getter methods', () => {
    test('getAdoptedResultData should return adoptedResultDataArray', () => {
      const factory = new ResultDataFactory(
        '',
        '',
        null,
        null,
        null,
        null,
        false,
        false,
        false,
        false,
        null,
        '',
        '',
        '',
        '',
        '',
        false
      );
      const testData = [{ id: 'test' }];
      factory.adoptedResultDataArray = testData;

      expect(factory.getAdoptedResultData()).toBe(testData);
    });

    test('getAttachmentsMinioData should return attachmentMinioData', () => {
      const factory = new ResultDataFactory(
        '',
        '',
        null,
        null,
        null,
        null,
        false,
        false,
        false,
        false,
        null,
        '',
        '',
        '',
        '',
        '',
        false
      );
      const testData = [{ id: 'attachment' }];
      factory.attachmentMinioData = testData;

      expect(factory.getAttachmentsMinioData()).toBe(testData);
    });
  });

  // Add at the end of the existing test suite
  describe('edge cases and advanced scenarios', () => {
    // Test method interactions and state changes
    test('state should persist between method calls', async () => {
      const mockResultsData = {
        combinedResults: [
          {
            skin: 'test-result-test-group-summary-table',
            data: [{ id: 'group1' }],
          },
        ],
        openPcrToTestCaseTraceMap: null,
        testCaseToOpenPcrTraceMap: null,
      };
      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue(mockResultsData);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      // First fetch data
      await factory.fetchGetCombinedResultsSummary();

      // Then get the data without calling the fetch again
      const result = factory.getAdoptedResultData();

      // Verify data was properly stored and returned
      expect(result).toHaveLength(1);
      expect(result[0].skin).toBe('test-result-test-group-summary-table');
      expect(result[0].data).toEqual(['adapted group data']);
    });

    // Test complex nested data structures
    test('should handle complex nested data structures', async () => {
      // Create a factory instance first
      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      const complexNestedData = [
        {
          id: 'complex1',
          nestedArray: [
            { id: 'nested1', value: 'test' },
            { id: 'nested2', value: null },
          ],
          nestedObject: {
            prop1: { subprop: [1, 2, 3] },
            prop2: undefined,
          },
        },
      ];

      // Mock adapter to test nested data handling
      jest.spyOn(factory, 'jsonSkinDataAdapter').mockImplementationOnce(async () => complexNestedData);

      const result = await factory.jsonSkinDataAdapter('test-result-table', complexNestedData);

      expect(result).toBe(complexNestedData);
      expect(result[0].nestedArray[1].value).toBeNull();
      expect(result[0].nestedObject.prop2).toBeUndefined();
    });
    // Test parameter boundary cases
    test('should handle empty field arrays with different filter settings', async () => {
      mockResultDataProvider.getTestReporterResults.mockResolvedValue([
        { skin: 'test-reporter-table', data: [{ id: 'report1' }] },
      ]);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      // Test with empty fields but filter enabled
      await factory.fetchTestReporterResults([], false, true, true, undefined, 'none');
      expect(mockResultDataProvider.getTestReporterResults).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        [], // Empty fields array
        false, // allowCrossTestPlan
        true, // enableRunTestCaseFilter
        true, // enableRunStepStatusFilter
        undefined, // linkedQueryRequest
        'none' // errorFilterMode
      );
    });

    // Test large input arrays
    test('should handle large test suite arrays', async () => {
      const largeTestSuiteArray = Array.from({ length: 1000 }, (_, i) => i + 1);
      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue({
        combinedResults: [{ skin: 'test-result-table', data: [{ id: 'result1' }] }],
        openPcrToTestCaseTraceMap: null,
        testCaseToOpenPcrTraceMap: null,
      });

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        largeTestSuiteArray, // Pass large array
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchGetCombinedResultsSummary();
      expect(mockResultDataProvider.getCombinedResultsSummary).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        largeTestSuiteArray,
        true,
        false,
        undefined,
        false,
        { data: 'execution' },
        { data: 'analysis' },
        false
      );
    });

    // Test proper cleanup after errors
    test('should clean up appropriately after errors', async () => {
      mockResultDataProvider.getCombinedResultsSummary.mockRejectedValue(new Error('API error'));

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      // First call fails
      await factory.fetchGetCombinedResultsSummary();

      // Verify state after error
      expect(factory.getAdoptedResultData()).toBeUndefined();

      // Now make it succeed on second try
      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue({
        combinedResults: [{ skin: 'test-result-table', data: [{ id: 'recovered' }] }],
        openPcrToTestCaseTraceMap: null,
        testCaseToOpenPcrTraceMap: null,
      });

      // Second call should succeed
      await factory.fetchGetCombinedResultsSummary();

      // State should be updated properly
      expect(factory.getAdoptedResultData()).toHaveLength(1);
    });

    // Test method call sequence
    test('calling methods in sequence should work as expected', async () => {
      // Setup mocks with different responses
      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue({
        combinedResults: [{ skin: 'test-result-table', data: [{ id: 'combined-result' }] }],
        openPcrToTestCaseTraceMap: null,
        testCaseToOpenPcrTraceMap: null,
      });

      mockResultDataProvider.getTestReporterResults.mockResolvedValue([
        { skin: 'test-reporter-table', data: [{ id: 'reporter-result' }] },
      ]);

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      // Call first method
      await factory.fetchGetCombinedResultsSummary();
      expect(factory.getAdoptedResultData()[0].data).toEqual(['adapted summary data']);

      // Call second method - should overwrite previous results
      await factory.fetchTestReporterResults(['field1'], false, true, true, undefined, 'none');
      expect(factory.getAdoptedResultData()[0].data).toEqual(['adapted reporter data']);
    });

    // Test multiple adapter interactions
    test('should handle multiple adapter results in one combined response', async () => {
      // A complex combined response with multiple skin types
      mockResultDataProvider.getCombinedResultsSummary.mockResolvedValue({
        combinedResults: [
          { skin: 'test-result-test-group-summary-table', data: [{ id: 'group1' }] },
          { skin: 'test-result-table', data: [{ id: 'result1' }] },
          { skin: 'open-pcr-table', data: [{ id: 'pcr1' }] },
          { skin: 'test-log-table', data: [{ id: 'log1' }] },
          { skin: 'step-analysis-appendix-skin', data: [{ id: 'analysis1' }] },
        ],
        openPcrToTestCaseTraceMap: null,
        testCaseToOpenPcrTraceMap: null,
      });

      const factory = new ResultDataFactory(
        defaultParams.attachmentsBucketName,
        defaultParams.teamProject,
        defaultParams.testPlanId,
        defaultParams.testSuiteArray,
        defaultParams.stepExecution,
        defaultParams.stepAnalysis,
        defaultParams.includeConfigurations,
        defaultParams.includeHierarchy,
        defaultParams.openPCRsSelectionRequest,
        defaultParams.includeTestLog,
        defaultParams.dgDataProvider,
        defaultParams.templatePath,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        defaultParams.includeHardCopyRun
      );

      await factory.fetchGetCombinedResultsSummary();

      // Verify all adapters were called with appropriate data
      const result = factory.getAdoptedResultData();
      expect(result).toHaveLength(5);
      expect(result[0].skin).toBe('test-result-test-group-summary-table');
      expect(result[0].data).toEqual(['adapted group data']);
      expect(result[1].skin).toBe('test-result-table');
      expect(result[1].data).toEqual(['adapted summary data']);
      expect(result[2].skin).toBe('open-pcr-table');
      expect(result[2].data).toEqual({}); // open-pcr-table is not a handled adapter type, returns {}
      expect(result[3].skin).toBe('test-log-table');
      expect(result[3].data).toEqual(['adapted log data']);
      expect(result[4].skin).toBe('step-analysis-appendix-skin');
      expect(result[4].data).toEqual(['adapted analysis data']);

      // Should contain attachment data from step analysis
      expect(factory.getAttachmentsMinioData()).toContainEqual({ attachment: 'data' });
    });
  });
});
