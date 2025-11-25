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
jest.mock('../../adapters/TraceQueryResultsSkinAdapter', () => {
  return jest.fn().mockImplementation((queryResults, type, includeCustomerId, includeCommonColumnsMode) => ({
    adoptSkinData: jest.fn(),
    getAdoptedData: jest.fn().mockReturnValue([
      {
        type,
        includeCustomerId,
        mode: includeCommonColumnsMode,
        items: queryResults || [],
      },
    ]),
  }));
});

jest.mock('../../adapters/TraceByLinkedRequirementAdapter', () => {
  return jest.fn().mockImplementation((mapData, type) => ({
    adoptSkinData: jest.fn(),
    getAdoptedData: jest.fn().mockReturnValue([{ type, count: mapData ? mapData.size || 0 : 0 }]),
  }));
});
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
    linkedMomRequest: {
      linkedMomMode: 'none', // Default mode to avoid undefined errors
    },
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
    formattingSettings: {
      trimAdditionalSpacingInDescriptions: false,
      trimAdditionalSpacingInTables: false,
    },
    flatSuiteTestCases: false,
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
      params.linkedMomRequest,
      params.traceAnalysisRequest,
      params.includeTestResults,
      params.dgDataProvider,
      params.templatePath,
      params.minioEndPoint,
      params.minioAccessKey,
      params.minioSecretKey,
      params.PAT,
      params.stepResultDetailsMap,
      params.formattingSettings,
      params.flatSuiteTestCases
    );

  beforeEach(() => {
    // Always recreate providers to ensure fresh mocks with proper implementations
    mockProviders = setupMockProviders();
    defaultParams = setupDefaultParams(mockProviders);

    // Create test instance with fresh providers
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
        undefined, // includeLinkedMom
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

  describe('jsonSkinDataAdpater and helper behaviors', () => {
    test('jsonSkinDataAdpater should build linked-requirements-trace data for both directions', async () => {
      const factory = createTestDataFactory(defaultParams);

      const reqMap = new Map<string, string[]>([['req1', ['tc1', 'tc2']]]);
      const testMap = new Map<string, string[]>([['tc1', ['req1']]]);

      (factory as any).requirementToTestCaseTraceMap = reqMap;
      (factory as any).testCaseToRequirementsTraceMap = testMap;

      const result = await (factory as any).jsonSkinDataAdpater('linked-requirements-trace');

      expect(result.reqTestAdoptedData).toBeDefined();
      expect(result.reqTestAdoptedData.adoptedData[0]).toEqual({ type: 'req-test', count: 1 });
      expect(result.reqTestAdoptedData.title.fields[0].value).toContain('Requirements to Test cases');

      expect(result.testReqAdoptedData).toBeDefined();
      expect(result.testReqAdoptedData.adoptedData[0]).toEqual({ type: 'test-req', count: 1 });
      expect(result.testReqAdoptedData.title.fields[0].value).toContain('Test cases to Requirement');
    });

    test('jsonSkinDataAdpater should return null adoptedData when linked-requirements-trace maps are missing', async () => {
      const factory = createTestDataFactory(defaultParams);

      // Leave requirementToTestCaseTraceMap and testCaseToRequirementsTraceMap undefined
      (factory as any).requirementToTestCaseTraceMap = undefined;
      (factory as any).testCaseToRequirementsTraceMap = undefined;

      const result = await (factory as any).jsonSkinDataAdpater('linked-requirements-trace');

      expect(result.reqTestAdoptedData).toBeDefined();
      expect(result.reqTestAdoptedData.adoptedData).toBeNull();

      expect(result.testReqAdoptedData).toBeDefined();
      expect(result.testReqAdoptedData.adoptedData).toBeNull();
    });

    test('jsonSkinDataAdpater should build query-results data and grouped headers for both directions', async () => {
      const factory = createTestDataFactory(defaultParams);

      (factory as any).reqTestQueryResults = [{ id: 'req1' }];
      (factory as any).testReqQueryResults = [{ id: 'tc1' }];

      const result = await (factory as any).jsonSkinDataAdpater('query-results', false, 'leftOnly');

      const left = result.reqTestAdoptedData;
      const right = result.testReqAdoptedData;

      expect(left.title.fields[0].value).toContain('Requirements to Test cases');
      expect(left.adoptedData[0].type).toBe('req-test');
      expect(left.adoptedData[0].mode).toBe('leftOnly');

      expect(right.title.fields[0].value).toContain('Test cases to Requirement');
      expect(right.adoptedData[0].type).toBe('test-req');
      expect(right.adoptedData[0].mode).toBe('leftOnly');
    });

    test('jsonSkinDataAdpater should return null adoptedData when query-results are missing', async () => {
      const factory = createTestDataFactory(defaultParams);

      // Leave reqTestQueryResults and testReqQueryResults undefined
      (factory as any).reqTestQueryResults = undefined;
      (factory as any).testReqQueryResults = undefined;

      const result = await (factory as any).jsonSkinDataAdpater('query-results', false, 'both');

      expect(result.reqTestAdoptedData).toBeDefined();
      expect(result.reqTestAdoptedData.adoptedData).toBeNull();

      expect(result.testReqAdoptedData).toBeDefined();
      expect(result.testReqAdoptedData.adoptedData).toBeNull();
    });

    test('jsonSkinDataAdpater default branch should honor flatSuiteTestCases and skip parent header', async () => {
      const factory = createTestDataFactory({ ...defaultParams, flatSuiteTestCases: true } as any);

      (factory as any).testDataRaw = {
        suites: [
          {
            temp: { id: 1, name: 'Parent Suite', level: 1, url: 'url-1' },
            testCases: [
              {
                id: 10,
                title: 'TC 10',
                url: 'tc-url',
                description: 'desc',
                steps: [],
                attachmentsData: [],
                relations: [],
              },
            ],
          },
        ],
      };

      // Keep rich text factories simple
      const result = await (factory as any).jsonSkinDataAdpater(null, false);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].suiteSkinData).toBeNull();
      expect(result[0].testCases).toHaveLength(1);
    });

    test('jsonSkinDataAdpater default branch should flatten child suites and keep child headers', async () => {
      const factory = createTestDataFactory({ ...defaultParams, flatSuiteTestCases: true } as any);

      (factory as any).testDataRaw = {
        suites: [
          {
            temp: { id: 1, name: 'Parent Suite', level: 1, url: 'url-1' },
            testCases: [
              {
                id: 10,
                title: 'TC 10',
                url: 'tc-url',
                description: 'parent-desc',
                steps: [],
                attachmentsData: [],
                relations: [],
              },
            ],
          },
          {
            temp: { id: 2, name: 'Child Suite', level: 2, url: 'url-2' },
            testCases: [
              {
                id: 20,
                title: 'TC 20',
                url: 'tc20-url',
                description: 'child-desc',
                steps: [],
                attachmentsData: [],
                relations: [],
              },
            ],
          },
        ],
      };

      const result = await (factory as any).jsonSkinDataAdpater(null, false);

      expect(result).toHaveLength(2);

      // Parent suite header is skipped but its test case is present
      expect(result[0].suiteSkinData).toBeNull();
      expect(result[0].testCases).toHaveLength(1);

      // Child suite header is kept, and its level was promoted to 1
      expect(result[1].suiteSkinData).toBeDefined();
      expect(result[1].suiteSkinData.level).toBe(1);
      expect(result[1].testCases).toHaveLength(1);
    });

    test('AdaptTestCaseRequirements should dispatch to query-based implementation when isByQuery=true', () => {
      const factory = createTestDataFactory(defaultParams);

      const requirement = {
        id: 1,
        fields: {
          'System.Title': 'Req1',
          'Custom.CustomerId': 'C123',
        },
        _links: { html: { href: 'req-url' } },
      };

      (factory as any).includeCustomerId = true;
      (factory as any).testCaseToRequirementsLookup = new Map([[789, new Set([requirement])]]);

      const testCase = { id: 789 };
      const items = (factory as any).AdaptTestCaseRequirements(testCase, true);

      expect(items).toHaveLength(1);
      const fields = items[0].fields;
      expect(fields[1].name).toBe('Req ID');
      expect(fields[2].name).toBe('Customer ID');
      expect(fields[2].value).toBe('C123');
      expect(fields[3].name).toBe('Req Title');
    });

    test('AdaptTestCaseRequirements should dispatch to relation-based implementation when isByQuery=false', () => {
      const factory = createTestDataFactory(defaultParams);
      (factory as any).includeCustomerId = true;

      const testCase = {
        relations: [
          { type: 'requirement', id: 1, title: 'Req1', customerId: 'C999' },
          { type: 'other', id: 2, title: 'Other' },
        ],
      };

      const items = (factory as any).AdaptTestCaseRequirements(testCase, false);

      expect(items).toHaveLength(1);
      const fields = items[0].fields;
      expect(fields[1].name).toBe('Req ID');
      expect(fields[2].name).toBe('Customer ID');
      expect(fields[2].value).toBe('C999');
    });

    test('adaptTestCaseMomRelation should filter and map supported relation types', () => {
      const factory = createTestDataFactory(defaultParams);

      const testCase = {
        relations: [
          { type: 'Task', id: 1, title: 'Task1', url: 'u1', status: 'Active' },
          { type: 'Bug', id: 2, title: 'Bug1', url: 'u2', status: 'New' },
          { type: 'Unknown', id: 3, title: 'X', url: 'u3', status: 'Closed' },
        ],
      };

      const items = (factory as any).adaptTestCaseMomRelation(testCase);

      expect(items).toHaveLength(2);
      expect(items[0].fields[2].value).toBe('Task');
      expect(items[1].fields[2].value).toBe('Bug');
    });

    test('jsonSkinDataAdpater default branch should include MOM relations and test-level attachments with content', async () => {
      const factory = createTestDataFactory({
        ...defaultParams,
        includeAttachmentContent: true,
        linkedMomRequest: { linkedMomMode: 'relation' },
      } as any);

      (factory as any).testDataRaw = {
        suites: [
          {
            temp: { id: 1, name: 'Suite with MOM', level: 2, url: 'url-1' },
            testCases: [
              {
                id: 10,
                title: 'TC with MOM and attachments',
                url: 'tc-url',
                description: 'desc',
                steps: [],
                attachmentsData: [
                  {
                    attachmentStepNo: '',
                    attachmentComment: 'general',
                    attachmentFileName: 'Spec.docx',
                    attachmentLink: 'doc-link',
                  },
                  {
                    attachmentStepNo: '',
                    attachmentComment: '',
                    attachmentFileName: 'Image.png',
                    attachmentLink: 'img-link',
                  },
                ],
                relations: [{ type: 'Task', id: 1, title: 'Task1', url: 'u1', status: 'Active' }],
              },
            ],
          },
        ],
      };

      const result = await (factory as any).jsonSkinDataAdpater(null, false);

      expect(Array.isArray(result)).toBe(true);
      const testCaseData = result[0].testCases[0];

      // Only non-doc attachments should appear in testCaseAttachments
      expect(testCaseData.testCaseAttachments).toHaveLength(1);
      expect(testCaseData.testCaseAttachments[0].fields[1]).toEqual(
        expect.objectContaining({
          name: 'Attachments',
          attachmentType: defaultParams.attachmentType,
        })
      );

      // Docx attachment content should be adapted at test-case level
      expect(testCaseData.testCaseDocAttachmentsAdoptedData.testCaseLevel.length).toBeGreaterThan(0);

      // MOM relations should be present via adaptTestCaseMomRelation
      expect(testCaseData.testCaseLinkedMom).toBeDefined();
      expect(testCaseData.testCaseLinkedMom.length).toBe(1);
      expect(testCaseData.testCaseLinkedMom[0].fields[2].value).toBe('Task');
    });

    test('jsonSkinDataAdpater default branch should log and rethrow when per-test-case mapping fails', async () => {
      const factory = createTestDataFactory(defaultParams) as any;

      // Single suite and test case; force htmlUtils.cleanHtml to throw inside mapping
      factory.testDataRaw = {
        suites: [
          {
            temp: { id: 1, name: 'Suite', level: 2, url: 'url-1' },
            testCases: [
              {
                id: 10,
                title: 'TC 10',
                url: 'tc-url',
                description: 'desc',
                steps: [],
                attachmentsData: [],
                relations: [],
              },
            ],
          },
        ],
      };

      // Override htmlUtils on this factory instance to throw
      factory.htmlUtils = {
        cleanHtml: jest.fn().mockRejectedValue(new Error('boom-clean')),
      } as any;

      await expect(factory.jsonSkinDataAdpater(null, false)).rejects.toBeDefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred while mapping test suite 1 test case 10 - boom-clean')
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error stack '));
    });

    test('jsonSkinDataAdpater should handle test-result-group-summary case as no-op', async () => {
      const factory = createTestDataFactory(defaultParams) as any;

      const result = await (factory as any).jsonSkinDataAdpater('test-result-group-summary');

      expect(result).toEqual({});
    });

    test('findCustomerValue should locate customer field case-insensitively', () => {
      const factory = createTestDataFactory(defaultParams) as any;

      const fieldsObj = {
        'System.Title': 'Req1',
        'Custom.CUSTOMER_ID': 'C777',
      };

      const value = factory.findCustomerValue(fieldsObj);
      expect(value).toBe('C777');
    });

    test('insertCustomerField should insert Customer ID before Req Title', () => {
      const factory = createTestDataFactory(defaultParams) as any;

      const fields = factory.buildRequirementFields({
        index: 0,
        requirementId: 1,
        requirementTitle: 'Req1',
        requirementUrl: 'url',
      });

      factory.insertCustomerField(fields, 'C555');

      expect(fields[2]).toEqual({ name: 'Customer ID', value: 'C555', width: '18%' });
      expect(fields[3].name).toBe('Req Title');
    });

    test('generateAttachmentData should log error and return undefined on failure', async () => {
      const factory = createTestDataFactory(defaultParams) as any;

      (AttachmentsDataFactory as jest.Mock).mockImplementationOnce(() => ({
        fetchWiAttachments: jest.fn().mockRejectedValue(new Error('fail')),
      }));

      const result = await factory.generateAttachmentData(123);

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('error fetching attachments data for test case 123');
    });

    test('generateAttachmentData should return attachments when fetchWiAttachments succeeds', async () => {
      const factory = createTestDataFactory(defaultParams) as any;

      (AttachmentsDataFactory as jest.Mock).mockImplementationOnce(() => ({
        fetchWiAttachments: jest.fn().mockResolvedValue(['att1']),
      }));

      const result = await factory.generateAttachmentData(123, [{ id: 'run-att' }]);

      expect(result).toEqual(['att1']);
    });

    test('jsonSkinDataAdpater default branch should log and rethrow when adaptation fails', async () => {
      const factory = createTestDataFactory(defaultParams) as any;

      await expect(factory.jsonSkinDataAdpater(null, false)).rejects.toBeDefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Cannot adapt data of Test Data -'));
    });

    test('adaptTestCaseAttachmentContent should append subheader and file items for each doc attachment', () => {
      const factory = createTestDataFactory(defaultParams) as any;

      const docAttachments = [
        {
          attachmentFileName: 'Spec One.DOCX',
          attachmentLink: 'link1',
        },
        {
          attachmentFileName: 'Design.doc',
          attachmentLink: 'link2',
        },
      ];

      const items: any[] = [];

      (factory as any).adaptTestCaseAttachmentContent(docAttachments, items);

      expect(items).toHaveLength(4);

      expect(items[0]).toEqual(
        expect.objectContaining({
          type: 'SubHeader',
          field: expect.objectContaining({
            name: 'Title',
            type: 'SubHeader',
            value: expect.stringContaining('Attachment #1 Content - Spec One'),
          }),
        })
      );

      expect(items[1]).toEqual(
        expect.objectContaining({
          type: 'File',
          attachmentLink: 'link1',
          attachmentFileName: 'Spec One.DOCX',
          attachmentType: defaultParams.attachmentType,
        })
      );

      expect(items[2]).toEqual(
        expect.objectContaining({
          type: 'SubHeader',
          field: expect.objectContaining({
            value: expect.stringContaining('Attachment #2 Content - Design'),
          }),
        })
      );

      expect(items[3]).toEqual(
        expect.objectContaining({
          type: 'File',
          attachmentLink: 'link2',
          attachmentFileName: 'Design.doc',
        })
      );
    });

    test('adaptStepAttachmentContent should append step subheader and file items for each doc attachment', () => {
      const factory = createTestDataFactory(defaultParams) as any;

      const step = { stepPosition: 3 };
      const docAttachments = [
        {
          attachmentFileName: 'StepDoc.docx',
          attachmentLink: 'step-link',
        },
      ];

      const items: any[] = [];

      (factory as any).adaptStepAttachmentContent(items, step, docAttachments);

      expect(items).toHaveLength(3);

      expect(items[0]).toEqual(
        expect.objectContaining({
          type: 'SubHeader',
          field: expect.objectContaining({
            value: 'Step #3 Attachments:',
          }),
        })
      );

      // Subheader for the specific attachment name
      expect(items[1]).toEqual(
        expect.objectContaining({
          type: 'SubHeader',
          field: expect.objectContaining({
            name: 'Title',
            type: 'SubHeader',
            value: 'StepDoc',
          }),
        })
      );

      // File entry for the attachment content
      expect(items[2]).toEqual(
        expect.objectContaining({
          type: 'File',
          attachmentLink: 'step-link',
          attachmentFileName: 'StepDoc.docx',
          attachmentType: defaultParams.attachmentType,
        })
      );
    });

    test('fetchAttachmentData should use generateAttachmentData results to populate attachmentMinioData', async () => {
      const factory = createTestDataFactory(defaultParams) as any;

      const attachments = [
        {
          attachmentMinioPath: 'minio/path1',
          minioFileName: 'file1.png',
          ThumbMinioPath: 'thumb/path1',
          minioThumbName: 'thumb1.png',
        },
      ];

      factory.generateAttachmentData = jest.fn().mockResolvedValue(attachments);

      const testCase = { id: 123 };
      const result = await factory.fetchAttachmentData(testCase, []);

      expect(result).toEqual(attachments);
      expect(factory.attachmentMinioData).toEqual([
        {
          attachmentMinioPath: 'minio/path1',
          minioFileName: 'file1.png',
        },
        {
          attachmentMinioPath: 'thumb/path1',
          minioFileName: 'thumb1.png',
        },
      ]);
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
      // Setup common mock responses for data fetching tests
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
          true,
          [456] // testSuiteArray is passed as 4th parameter
        );
        expect(mockProviders.testDataProvider.GetTestCasesBySuites).toHaveBeenCalledWith(
          'test-project',
          '123',
          '124',
          true,
          true,
          false,
          false, // linkedMomMode === 'relation' (which is false since mode is 'none')
          defaultParams.stepResultDetailsMap,
          expect.any(Map), // testCaseToLinkedMomLookup
          expect.arrayContaining([expect.objectContaining({ id: 456 })]) // testSuites
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

        // The API should return only the filtered suite (456) because testSuiteArray is passed as filter
        // In real implementation, GetTestSuitesByPlan filters server-side
        mockProviders.testDataProvider.GetTestSuitesByPlan.mockResolvedValue([
          { id: 456, name: 'Test Suite 456' }, // Only this suite is returned after filtering
        ]);

        await testDataFactory.fetchTestData();

        // Only the suite with id 456 should be processed
        expect(testDataFactory.generateSuiteObject).toHaveBeenCalledTimes(1);
        expect(testDataFactory.generateSuiteObject).toHaveBeenCalledWith(
          expect.objectContaining({ id: 456 }),
          expect.any(Array)
        );
      });

      test('should handle suites where generateSuiteObject returns undefined by pushing empty testCases', async () => {
        // Arrange: generateSuiteObject resolves to undefined for a suite
        const factory = createTestDataFactory(defaultParams) as any;

        // Basic plan/suite mocks
        mockProviders.testDataProvider.GetTestPlans.mockResolvedValue({
          count: 1,
          value: [fixtures.testPlan],
        });

        mockProviders.testDataProvider.GetTestSuitesByPlan.mockResolvedValue([
          { id: 456, name: 'Suite 456' },
        ]);

        mockProviders.testDataProvider.GetTestCasesBySuites.mockResolvedValue({
          testCasesList: [fixtures.testCase],
          requirementToTestCaseTraceMap: null,
          testCaseToRequirementsTraceMap: null,
        });

        factory.generateSuiteObject = jest.fn().mockResolvedValue(undefined);

        // Act
        await factory.fetchTestData();

        // Assert: suite entry exists but with empty testCases array
        expect(factory.testDataRaw).toBeDefined();
        expect(factory.testDataRaw.suites).toHaveLength(1);
        expect(factory.testDataRaw.suites[0].testCases).toEqual([]);
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

      test('should fetch run-level attachments when caseEvidenceAttachments are present', async () => {
        const factory = createTestDataFactory(defaultParams) as any;

        // Stub fetchAttachmentData so we can observe how it's called
        factory.fetchAttachmentData = jest.fn().mockResolvedValue([{ name: 'att' }]);

        const suite = { id: 456, name: 'Suite 456' };
        const testCases = [
          {
            id: 789,
            suit: 456,
            title: 'TC with run attachments',
            caseEvidenceAttachments: [{ id: 'ra1' }],
          },
        ];

        const result = await factory.generateSuiteObject(suite, testCases);

        expect(result).toHaveLength(1);
        expect(result[0].attachmentsData).toHaveLength(2); // plan + run attachments

        // We only really care that run-level attachments are requested once with the right args
        expect(factory.fetchAttachmentData).toHaveBeenCalledTimes(2);
        expect(factory.fetchAttachmentData).toHaveBeenCalledWith(
          testCases[0],
          testCases[0].caseEvidenceAttachments
        );
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

    describe('fetchLinkedMomResults', () => {
      test('should fetch linked MOM results and populate lookup map', async () => {
        // Configure linkedMomRequest to include a linkedMomQuery
        testDataFactory.linkedMomRequest = {
          linkedMomQuery: { wiql: { href: 'linked-mom-query-url' } },
        } as any;

        mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockImplementation(
          async (_url, _includeLinks, map: Map<number, Set<any>>) => {
            map.set(789, new Set([{ id: 1 }]));
          }
        );

        await testDataFactory.fetchLinkedMomResults();

        expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledWith(
          'linked-mom-query-url',
          true,
          expect.any(Map)
        );
        expect(testDataFactory.testCaseToLinkedMomLookup).toBeInstanceOf(Map);
        expect(testDataFactory.testCaseToLinkedMomLookup.size).toBe(1);
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
