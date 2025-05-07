jest.mock('cheerio', () => ({
  load: jest.fn().mockReturnValue({
    html: jest.fn().mockReturnValue(''),
    $: jest.fn().mockReturnValue({
      attr: jest.fn(),
      removeAttr: jest.fn(),
      text: jest.fn().mockReturnValue(''),
      find: jest.fn().mockReturnValue({ length: 0 }),
      children: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue([]) }),
    }),
  }),
}));

import TestDataFactory from '../../factories/TestDataFactory';
import HtmlUtils from '../../services/htmlUtils';
import RichTextDataFactory from '../../factories/RichTextDataFactory';
import AttachmentsDataFactory from '../../factories/AttachmentsDataFactory';
import logger from '../../services/logger';

// Mock dependencies
jest.mock('@elisra-devops/docgen-data-provider');
jest.mock('../../services/htmlUtils');
jest.mock('../../factories/RichTextDataFactory');
jest.mock('../../factories/AttachmentsDataFactory');
jest.mock('../../adapters/QueryResultsSkinAdapter');
jest.mock('../../adapters/TraceByLinkedRequirementAdapter');
jest.mock('../../services/logger');

describe('TestDataFactory', () => {
  // Common test fixtures and mocks
  const fixtures = {
    testPlan: { id: 123, name: 'Test Plan 123' },
    testSuite: { id: 456, name: 'Test Suite 456', level: 1 },
    testCase: {
      id: 789,
      title: 'Test Case 789',
      suit: 456,
      description: '<p>Test description</p>',
      steps: [
        {
          stepId: 's1',
          stepPosition: 1,
          action: '<p>Step 1 action</p>',
          expected: '<p>Expected result</p>',
        },
      ],
      relations: [{ type: 'requirement', id: 101, title: 'Requirement 101' }],
    },
  };

  let testDataFactory;
  let mockProviders;
  let defaultParams;

  // Helper setup functions
  const setupMockProviders = () => {
    const testDataProvider = {
      GetTestPlans: jest.fn(),
      GetTestSuitesByPlan: jest.fn(),
      GetTestCasesBySuites: jest.fn(),
      GetTestPoint: jest.fn(),
      GetTestRunById: jest.fn(),
      clearCache: jest.fn(),
    };

    const ticketsDataProvider = {
      GetQueryResultsFromWiql: jest.fn(),
    };

    const dgDataProvider = {
      getTestDataProvider: jest.fn().mockResolvedValue(testDataProvider),
      getTicketsDataProvider: jest.fn().mockResolvedValue(ticketsDataProvider),
    };

    return { testDataProvider, ticketsDataProvider, dgDataProvider };
  };

  const setupDefaultParams = (providers) => ({
    attachmentsBucketName: 'test-bucket',
    teamProject: 'test-project',
    testPlanId: 123,
    testSuiteArray: [456],
    includeAttachments: true,
    attachmentType: 'asEmbedded',
    includeHardCopyRun: false,
    includeAttachmentContent: false,
    runAttachmentMode: 'both',
    includeRequirements: true,
    includeCustomerId: false,
    traceAnalysisRequest: {
      reqTestQuery: { wiql: { href: 'req-test-query-url' } },
      testReqQuery: { wiql: { href: 'test-req-query-url' } },
      includeCommonColumnsMode: 'both',
    },
    includeTestResults: true,
    dgDataProvider: providers.dgDataProvider,
    templatePath: '/test/template/path',
    minioEndPoint: 'minio-endpoint',
    minioAccessKey: 'minio-access-key',
    minioSecretKey: 'minio-secret-key',
    PAT: 'personal-access-token',
    stepResultDetailsMap: new Map(),
  });

  const createTestDataFactory = (params) =>
    new TestDataFactory(
      params.attachmentsBucketName,
      params.teamProject,
      params.testPlanId,
      params.testSuiteArray,
      params.includeAttachments,
      params.attachmentType,
      params.includeHardCopyRun,
      params.includeAttachmentContent,
      params.runAttachmentMode,
      params.includeRequirements,
      params.includeCustomerId,
      params.traceAnalysisRequest,
      params.includeTestResults,
      params.dgDataProvider,
      params.templatePath,
      params.minioEndPoint,
      params.minioAccessKey,
      params.minioSecretKey,
      params.PAT,
      params.stepResultDetailsMap
    );

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup providers
    mockProviders = setupMockProviders();
    defaultParams = setupDefaultParams(mockProviders);

    // Create test instance
    testDataFactory = createTestDataFactory(defaultParams);

    // Setup default mock implementations
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockResolvedValue('cleaned-html'),
    }));

    (RichTextDataFactory as jest.Mock).mockImplementation(() => ({
      factorizeRichTextData: jest.fn().mockResolvedValue('rich-text'),
      attachmentMinioData: [],
      hasValues: true,
    }));

    (AttachmentsDataFactory as jest.Mock).mockImplementation(() => ({
      fetchWiAttachments: jest.fn().mockResolvedValue([
        {
          attachmentMinioPath: 'path/to/attachment',
          minioFileName: 'attachment.jpg',
        },
      ]),
    }));
  });

  describe('Initialization', () => {
    test('should initialize with default values when minimal parameters are provided', () => {
      const factory = new TestDataFactory(
        'bucket-name', // attachmentsBucketName
        'project', // teamProject
        123, // testPlanId
        null, // testSuiteArray
        undefined, // includeAttachments
        undefined, // attachmentType
        undefined, // includeHardCopyRun
        undefined, // includeAttachmentContent
        undefined, // runAttachmentMode
        undefined, // includeRequirements
        undefined, // includeCustomerId
        undefined, // includeLinkedMom
        undefined, // traceAnalysisRequest
        undefined, // includeTestResults
        mockProviders.dgDataProvider, // dgDataProvider
        '', // templatePath (missing)
        undefined, // minioEndPoint (missing)
        undefined, // minioAccessKey (missing)
        undefined, // minioSecretKey (missing)
        undefined // PAT (missing)
        // stepResultDetailsMap is optional
      );

      expect(factory.attachmentsBucketName).toBe('bucket-name');
      expect(factory.teamProject).toBe('project');
      expect(factory.testPlanId).toBe(123);
      expect(factory.testSuiteArray).toBeNull();
      expect(factory.isSuiteSpecific).toBe(false);
      expect(factory.includeAttachments).toBe(true); // default value
      expect(factory.attachmentType).toBe('asEmbedded'); // default value
      expect(factory.requirementToTestCaseTraceMap).toBeInstanceOf(Map);
      expect(factory.testCaseToRequirementsTraceMap).toBeInstanceOf(Map);
      expect(factory.testCaseToRequirementsLookup).toBeInstanceOf(Map);
    });

    test('should set isSuiteSpecific to true when testSuiteArray is provided', () => {
      const factory = new TestDataFactory(
        'bucket', // attachmentsBucketName
        'project', // teamProject
        123, // testPlanId
        [456], // testSuiteArray - non-null
        true, // includeAttachments
        'asEmbedded', // attachmentType
        false, // includeHardCopyRun
        false, // includeAttachmentContent
        'both', // runAttachmentMode
        false, // includeRequirements
        false, // includeCustomerId
        false, // includeLinkedMom
        undefined, // traceAnalysisRequest
        false, // includeTestResults
        mockProviders.dgDataProvider, // dgDataProvider
        '', // templatePath
        undefined, // minioEndPoint
        undefined, // minioAccessKey
        undefined, // minioSecretKey
        undefined // PAT
        // stepResultDetailsMap is optional
      );

      expect(factory.isSuiteSpecific).toBe(true);
      expect(factory.testSuiteArray).toEqual([456]);
    });
  });

  describe('Initialization Edge Cases', () => {
    test('should handle empty test suite array', () => {
      const factory = new TestDataFactory(
        'bucket-name',
        'project',
        123,
        [],
        true,
        'asEmbedded',
        false,
        false,
        'both',
        false,
        false,
        false,
        undefined,
        false,
        mockProviders.dgDataProvider,
        '',
        undefined,
        undefined,
        undefined,
        undefined
      );

      expect(factory.testSuiteArray).toEqual([]);
      expect(factory.isSuiteSpecific).toBe(true);
    });

    test('should handle invalid test plan ID', () => {
      const factory = new TestDataFactory(
        'bucket-name',
        'project',
        -1,
        null,
        true,
        'asEmbedded',
        false,
        false,
        'both',
        false,
        false,
        false,
        undefined,
        false,
        mockProviders.dgDataProvider,
        '',
        undefined,
        undefined,
        undefined,
        undefined
      );

      expect(factory.testPlanId).toBe(-1);
    });

    test('should handle special characters in team project name', () => {
      const specialName = 'Project @#$%^&*()!';
      const factory = new TestDataFactory(
        'bucket-name',
        specialName,
        123,
        null,
        true,
        'asEmbedded',
        false,
        false,
        'both',
        false,
        false,
        false,
        undefined,
        false,
        mockProviders.dgDataProvider,
        '',
        undefined,
        undefined,
        undefined,
        undefined
      );

      expect(factory.teamProject).toBe(specialName);
    });
  });

  describe('Data Fetching', () => {
    beforeEach(() => {
      // Setup common mock responses
      mockProviders.testDataProvider.GetTestPlans.mockResolvedValue({
        count: 1,
        value: [fixtures.testPlan],
      });

      mockProviders.testDataProvider.GetTestSuitesByPlan.mockResolvedValue([fixtures.testSuite]);

      mockProviders.testDataProvider.GetTestCasesBySuites.mockResolvedValue({
        testCasesList: [fixtures.testCase],
        requirementToTestCaseTraceMap: new Map([['req1', ['tc1']]]),
        testCaseToRequirementsTraceMap: new Map([['tc1', ['req1']]]),
      });

      mockProviders.testDataProvider.GetTestPoint.mockResolvedValue({
        count: 0,
        value: [],
      });
    });

    describe('fetchTestData', () => {
      test('should fetch and process test data successfully', async () => {
        // Mock methods that would be called during processing
        testDataFactory.generateSuiteObject = jest.fn().mockResolvedValue([]);
        testDataFactory.jsonSkinDataAdpater = jest.fn().mockResolvedValue('adopted-data');

        await testDataFactory.fetchTestData();

        // Verify correct API calls
        expect(mockProviders.testDataProvider.GetTestPlans).toHaveBeenCalledWith('test-project');
        expect(mockProviders.testDataProvider.GetTestSuitesByPlan).toHaveBeenCalledWith(
          'test-project',
          '123',
          true
        );
        expect(mockProviders.testDataProvider.GetTestCasesBySuites).toHaveBeenCalledWith(
          'test-project',
          '123',
          '124',
          true,
          true,
          false,
          defaultParams.stepResultDetailsMap
        );

        // Verify trace maps are populated
        expect(testDataFactory.requirementToTestCaseTraceMap.size).toBe(1);
        expect(testDataFactory.testCaseToRequirementsTraceMap.size).toBe(1);

        // Verify result data is set
        expect(testDataFactory.testDataRaw).toBeDefined();
        expect(testDataFactory.adoptedTestData).toBe('adopted-data');

        // Verify cache is cleared at the end
        expect(mockProviders.testDataProvider.clearCache).toHaveBeenCalled();
      });

      test('should throw error when no test plans are found', async () => {
        mockProviders.testDataProvider.GetTestPlans.mockResolvedValue({
          count: 0,
          value: [],
        });

        await expect(testDataFactory.fetchTestData()).rejects.toThrow(
          `No test plans for project ${defaultParams.teamProject} were found`
        );
      });

      test('should throw error when no test suites are found', async () => {
        mockProviders.testDataProvider.GetTestSuitesByPlan.mockResolvedValue([]);

        await expect(testDataFactory.fetchTestData()).rejects.toThrow(
          `No test suites for plan id ${defaultParams.testPlanId} were found`
        );
      });

      test('should filter test suites by test suite array when isSuiteSpecific is true', async () => {
        // Setup mocks
        testDataFactory.generateSuiteObject = jest.fn().mockResolvedValue([]);
        testDataFactory.jsonSkinDataAdpater = jest.fn().mockResolvedValue('adopted-data');

        // Add another suite that should be filtered out
        mockProviders.testDataProvider.GetTestSuitesByPlan.mockResolvedValue([
          { id: 456, name: 'Test Suite 456' },
          { id: 789, name: 'Test Suite 789' }, // Should be filtered out
        ]);

        await testDataFactory.fetchTestData();

        // Only the suite with id 456 should be processed
        expect(testDataFactory.generateSuiteObject).toHaveBeenCalledTimes(1);
        expect(testDataFactory.generateSuiteObject).toHaveBeenCalledWith(
          expect.objectContaining({ id: 456 }),
          expect.any(Array)
        );
      });
    });

    describe('generateSuiteObject', () => {
      test('should process test cases and attachments for a suite', async () => {
        // Mock attachment fetching
        testDataFactory.fetchAttachmentData = jest.fn().mockResolvedValue([{ name: 'attachment1.jpg' }]);

        const result = await testDataFactory.generateSuiteObject(fixtures.testSuite, [fixtures.testCase]);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(789);
        expect(result[0].attachmentsData).toEqual([{ name: 'attachment1.jpg' }]);
        expect(testDataFactory.fetchAttachmentData).toHaveBeenCalledTimes(1);
      });

      test('should include test run data when includeTestResults is true', async () => {
        // Setup mocks
        testDataFactory.fetchAttachmentData = jest.fn().mockResolvedValue([]);
        testDataFactory.populateTestRunData = jest.fn().mockResolvedValue([
          {
            id: 789,
            suit: 456,
            title: 'Test Case 789',
            lastTestRun: { id: 999, result: 'Passed' },
          },
        ]);

        const result = await testDataFactory.generateSuiteObject(fixtures.testSuite, [
          { id: 789, suit: 456, title: 'Test Case 789' },
        ]);

        expect(testDataFactory.populateTestRunData).toHaveBeenCalled();
        expect(result[0].lastTestRun).toEqual({ id: 999, result: 'Passed' });
      });

      test('should return undefined when no test cases match the suite', async () => {
        const result = await testDataFactory.generateSuiteObject(
          fixtures.testSuite,
          [{ id: 789, suit: 123 }] // Different suite ID
        );

        expect(result).toBeUndefined();
      });
    });
  });

  describe('Query Results Processing', () => {
    describe('fetchQueryResults', () => {
      test('should fetch and process query results correctly', async () => {
        // Mock query result data
        const reqTestResults = new Map([['req1', ['tc1', 'tc2']]]);
        const testReqResults = new Map([['tc1', ['req1', 'req2']]]);

        mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockImplementation((url) => {
          if (url.includes('req-test')) return Promise.resolve(reqTestResults);
          if (url.includes('test-req')) return Promise.resolve(testReqResults);
          return Promise.resolve(null);
        });

        // Mock the data adapter
        testDataFactory.jsonSkinDataAdpater = jest.fn().mockResolvedValue({
          reqTestAdoptedData: { title: {}, adoptedData: [] },
          testReqAdoptedData: { title: {}, adoptedData: [] },
        });

        await testDataFactory.fetchQueryResults();

        // Verify API calls
        expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledTimes(2);

        // Verify result data is set
        expect(testDataFactory.reqTestQueryResults).toBe(reqTestResults);
        expect(testDataFactory.testReqQueryResults).toBe(testReqResults);

        // Verify adapter is called with correct parameters
        expect(testDataFactory.jsonSkinDataAdpater).toHaveBeenCalledWith('query-results', false, 'both');
      });

      test('should handle API errors gracefully', async () => {
        mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockRejectedValue(
          new Error('Query failed')
        );

        await testDataFactory.fetchQueryResults();

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not fetch query results'));
        expect(testDataFactory.adoptedQueryResults).toBeUndefined();
      });
    });

    describe('fetchLinkedRequirementsTrace', () => {
      test('should process linked requirements trace data', async () => {
        testDataFactory.jsonSkinDataAdpater = jest.fn().mockResolvedValue({
          reqTestAdoptedData: { title: {}, adoptedData: [] },
          testReqAdoptedData: { title: {}, adoptedData: [] },
        });

        await testDataFactory.fetchLinkedRequirementsTrace();

        expect(testDataFactory.jsonSkinDataAdpater).toHaveBeenCalledWith('linked-requirements-trace');
        expect(testDataFactory.adoptedQueryResults).toEqual({
          reqTestAdoptedData: { title: {}, adoptedData: [] },
          testReqAdoptedData: { title: {}, adoptedData: [] },
        });
      });

      test('should handle processing errors gracefully', async () => {
        testDataFactory.jsonSkinDataAdpater = jest.fn().mockRejectedValue(new Error('Adapter failed'));

        await testDataFactory.fetchLinkedRequirementsTrace();

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Could not fetch linked requirements trace')
        );
      });
    });
  });

  describe('Utility Methods', () => {
    describe('calculateColumnWidth', () => {
      const testCases = [
        {
          name: 'should return 31% with step result detail but no attachment',
          hasStepResultDetail: true,
          hasAttachment: false,
          includeSoftCopyRun: false,
          expected: '31%',
        },
        {
          name: 'should return 31% with soft copy run but no attachment',
          hasStepResultDetail: false,
          hasAttachment: false,
          includeSoftCopyRun: true,
          expected: '31%',
        },
        {
          name: 'should return 20.8% with step result detail and attachment',
          hasStepResultDetail: true,
          hasAttachment: true,
          includeSoftCopyRun: false,
          expected: '20.8%',
        },
        {
          name: 'should return 26.9% with attachment but no step result detail',
          hasStepResultDetail: false,
          hasAttachment: true,
          includeSoftCopyRun: false,
          expected: '26.9%',
        },
        {
          name: 'should return 45.8% with no attachment, step result, or soft copy run',
          hasStepResultDetail: false,
          hasAttachment: false,
          includeSoftCopyRun: false,
          expected: '45.8%',
        },
      ];

      testCases.forEach(({ name, hasStepResultDetail, hasAttachment, includeSoftCopyRun, expected }) => {
        test(name, () => {
          const result = testDataFactory['calculateColumnWidth'].call(
            testDataFactory,
            hasStepResultDetail,
            hasAttachment,
            includeSoftCopyRun
          );

          expect(result).toBe(expected);
        });
      });
    });

    describe('extractStepStatus and extractStepComment', () => {
      describe('extractStepStatus', () => {
        test('should return empty string for shared step title', () => {
          const result = testDataFactory['extractStepStatus'].call(testDataFactory, {
            isSharedStepTitle: true,
          });

          expect(result).toBe('');
        });

        test('should return step status when available', () => {
          const result = testDataFactory['extractStepStatus'].call(testDataFactory, { stepStatus: 'Passed' });

          expect(result).toBe('Passed');
        });

        test('should return "Not Run" when status is missing', () => {
          const result = testDataFactory['extractStepStatus'].call(testDataFactory, {});

          expect(result).toBe('Not Run');
        });
      });

      describe('extractStepComment', () => {
        test('should return empty string for shared step title with no comments', () => {
          const result = testDataFactory['extractStepComment'].call(testDataFactory, {
            isSharedStepTitle: true,
          });

          expect(result).toBe('');
        });

        test('should return step comments when available', () => {
          const result = testDataFactory['extractStepComment'].call(testDataFactory, {
            stepComments: 'Some comment',
          });

          expect(result).toBe('Some comment');
        });

        test('should return "No Result" for steps with "Not Run" status', () => {
          const result = testDataFactory['extractStepComment'].call(testDataFactory, {
            stepStatus: 'Not Run',
          });

          expect(result).toBe('No Result');
        });

        test('should return empty string for steps with status other than "Not Run" and no comments', () => {
          const result = testDataFactory['extractStepComment'].call(testDataFactory, {
            stepStatus: 'Passed',
          });

          expect(result).toBe('');
        });
      });
    });

    describe('Data Getters', () => {
      test('getAdoptedTestData should return the adoptedTestData field', async () => {
        testDataFactory.adoptedTestData = 'test-adopted-data';
        const result = await testDataFactory.getAdoptedTestData();
        expect(result).toBe('test-adopted-data');
      });

      test('getAttachmentMinioData should return the attachmentMinioData field', () => {
        testDataFactory.attachmentMinioData = ['test-attachment-data'];
        const result = testDataFactory.getAttachmentMinioData();
        expect(result).toEqual(['test-attachment-data']);
      });
    });
  });
});
