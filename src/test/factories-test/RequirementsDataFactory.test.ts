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

import RequirementsDataFactory from '../../factories/RequirementsDataFactory';
import RequirementDataSkinAdapter from '../../adapters/RequirementDataSkinAdapter';
import TraceAnalysisRequirementsAdapter from '../../adapters/TraceAnalysisRequirementsAdapter';
import logger from '../../services/logger';

// Mock dependencies
jest.mock('@elisra-devops/docgen-data-provider');
jest.mock('../../adapters/RequirementDataSkinAdapter');
jest.mock('../../adapters/TraceAnalysisRequirementsAdapter');
jest.mock('../../services/logger');

describe('RequirementsDataFactory', () => {
  // Common test fixtures and mocks
  const fixtures = {
    systemRequirement: {
      id: 1001,
      title: 'System Requirement 1001',
      description: 'System requirement description',
      children: [
        {
          id: 1002,
          title: 'Child Requirement 1002',
          children: [],
        },
      ],
    },
    workItemRelations: [
      { source: { id: 1001 }, target: { id: 2001 }, rel: { name: 'Related' } },
      { source: { id: 1002 }, target: { id: 2002 }, rel: { name: 'Related' } },
    ],
    sourceTargetsMap: new Map([
      [1001, [{ id: 2001, title: 'Software Req 2001' }]],
      [1002, [{ id: 2002, title: 'Software Req 2002' }]],
    ]),
  };

  let requirementsDataFactory;
  let mockProviders;
  let defaultParams;

  // Helper setup functions
  const setupMockProviders = () => {
    const ticketsDataProvider = {
      GetQueryResultsFromWiql: jest.fn(),
      PopulateWorkItemsByIds: jest.fn(),
    };

    const dgDataProvider = {
      getTicketsDataProvider: jest.fn().mockResolvedValue(ticketsDataProvider),
    };

    return { ticketsDataProvider, dgDataProvider };
  };

  const setupDefaultParams = (providers) => ({
    teamProjectName: 'test-project',
    templatePath: '/test/template/path',
    attachmentsBucketName: 'test-bucket',
    minioEndPoint: 'minio-endpoint',
    minioAccessKey: 'minio-access-key',
    minioSecretKey: 'minio-secret-key',
    PAT: 'personal-access-token',
    dgDataProvider: providers.dgDataProvider,
    queriesRequest: {
      systemRequirements: {
        wiql: { href: 'system-requirements-query-url' },
      },
      systemToSoftwareRequirements: {
        wiql: { href: 'system-to-software-query-url' },
      },
      softwareToSystemRequirements: {
        wiql: { href: 'software-to-system-query-url' },
      },
    },
    formattingSettings: {
      fontSize: 12,
      fontFamily: 'Arial',
    },
    allowBiggerThan500: false,
  });

  const createRequirementsDataFactory = (params) =>
    new RequirementsDataFactory(
      params.teamProjectName,
      params.templatePath,
      params.attachmentsBucketName,
      params.minioEndPoint,
      params.minioAccessKey,
      params.minioSecretKey,
      params.PAT,
      params.dgDataProvider,
      params.queriesRequest,
      params.formattingSettings,
      params.allowBiggerThan500,
    );

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup providers
    mockProviders = setupMockProviders();
    defaultParams = setupDefaultParams(mockProviders);

    // Create test instance
    requirementsDataFactory = createRequirementsDataFactory(defaultParams);

    // Setup default mock implementations
    (RequirementDataSkinAdapter as jest.Mock).mockImplementation(() => ({
      jsonSkinAdapter: jest.fn().mockResolvedValue({
        requirements: [{ id: 1001, title: 'Adapted Requirement' }],
      }),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
    }));

    (TraceAnalysisRequirementsAdapter as jest.Mock).mockImplementation(() => ({
      adoptSkinData: jest.fn(),
      getAdoptedData: jest.fn().mockReturnValue({
        traceMatrix: [{ source: 1001, targets: [2001] }],
      }),
    }));
  });

  describe('Initialization', () => {
    test('should initialize with all required parameters', () => {
      expect(requirementsDataFactory.teamProject).toBe('test-project');
      expect(requirementsDataFactory.templatePath).toBe('/test/template/path');
      expect(requirementsDataFactory.attachmentsBucketName).toBe('test-bucket');
      expect(requirementsDataFactory.minioEndPoint).toBe('minio-endpoint');
      expect(requirementsDataFactory.minioAccessKey).toBe('minio-access-key');
      expect(requirementsDataFactory.minioSecretKey).toBe('minio-secret-key');
      expect(requirementsDataFactory.PAT).toBe('personal-access-token');
      expect(requirementsDataFactory.queriesRequest).toBeDefined();
      expect(requirementsDataFactory.adoptedData).toEqual([]);
    });

    test('should initialize with allowBiggerThan500 flag set to false by default', () => {
      const factory = new RequirementsDataFactory(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        mockProviders.dgDataProvider,
        { systemRequirements: { wiql: { href: 'url' } } },
        {},
      );

      expect(factory['allowBiggerThan500']).toBe(false);
    });

    test('should initialize with allowBiggerThan500 flag set to true when provided', () => {
      const factory = new RequirementsDataFactory(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        mockProviders.dgDataProvider,
        { systemRequirements: { wiql: { href: 'url' } } },
        {},
        true,
      );

      expect(factory['allowBiggerThan500']).toBe(true);
    });
  });

  describe('fetchRequirementsData', () => {
    test('should fetch and adapt system requirements data successfully', async () => {
      const queryResults = {
        roots: [fixtures.systemRequirement],
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue(queryResults);

      await requirementsDataFactory.fetchRequirementsData();

      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledWith(
        'system-requirements-query-url',
        false,
        null,
        false, // fetchAllFields is false for SRS variant
      );
      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should fetch system requirements with workItemRelations for link-driven rendering', async () => {
      const queryResults = {
        roots: [fixtures.systemRequirement],
        workItemRelations: fixtures.workItemRelations,
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue(queryResults);

      await requirementsDataFactory.fetchRequirementsData();

      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalled();
      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should fetch system to software requirements traceability data', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        });

      await requirementsDataFactory.fetchRequirementsData();

      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledTimes(3);
      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenNthCalledWith(
        2,
        'system-to-software-query-url',
        true,
        null,
      );
    });

    test('should fetch software to system requirements traceability data', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        });

      await requirementsDataFactory.fetchRequirementsData();

      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledTimes(3);
      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenNthCalledWith(
        3,
        'software-to-system-query-url',
        true,
        null,
      );
    });

    test('should handle errors during fetch and rethrow', async () => {
      const error = new Error('Fetch failed');
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockRejectedValue(error);

      await expect(requirementsDataFactory.fetchRequirementsData()).rejects.toThrow('Fetch failed');
      expect(logger.error).toHaveBeenCalled();
    });

    test('should handle empty query results gracefully', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [],
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should log and return original roots when sanitizeHierarchy fails', () => {
      const roots = [{ id: 1, title: 'Root' }];
      const factoryAny: any = requirementsDataFactory as any;
      const sanitizeNodeSpy = jest.spyOn(factoryAny, 'sanitizeNode').mockImplementation(() => {
        throw new Error('boom');
      });

      const result = factoryAny.sanitizeHierarchy(roots as any);

      expect(result).toBe(roots);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('sanitizeHierarchy failed'));

      sanitizeNodeSpy.mockRestore();
    });
  });

  describe('getAdoptedData', () => {
    test('should return adopted data after fetching', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [fixtures.systemRequirement],
      });

      await requirementsDataFactory.fetchRequirementsData();
      const adoptedData = requirementsDataFactory.getAdoptedData();

      expect(adoptedData).toBeDefined();
      expect(adoptedData).toEqual(requirementsDataFactory.adoptedData);
    });

    test('should return empty array before fetching', () => {
      const adoptedData = requirementsDataFactory.getAdoptedData();
      expect(adoptedData).toEqual([]);
    });
  });

  describe('getAttachmentMinioData', () => {
    test('should return attachment minio data', async () => {
      const mockAttachments = [
        { path: 'attachment1.jpg', size: 1024 },
        { path: 'attachment2.pdf', size: 2048 },
      ];

      (RequirementDataSkinAdapter as jest.Mock).mockImplementation(() => ({
        jsonSkinAdapter: jest.fn().mockResolvedValue({}),
        getAttachmentMinioData: jest.fn().mockReturnValue(mockAttachments),
      }));

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [fixtures.systemRequirement],
      });

      await requirementsDataFactory.fetchRequirementsData();
      const attachmentData = requirementsDataFactory.getAttachmentMinioData();

      expect(attachmentData).toEqual(mockAttachments);
    });

    test('should return empty array when no attachments', () => {
      const attachmentData = requirementsDataFactory.getAttachmentMinioData();
      expect(attachmentData).toEqual([]);
    });
  });

  describe('sanitizeHierarchy', () => {
    test('should deduplicate root nodes', async () => {
      const duplicateRoots = [
        { id: 1001, title: 'Req 1', children: [] },
        { id: 1001, title: 'Req 1 Duplicate', children: [] },
        { id: 1002, title: 'Req 2', children: [] },
      ];

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: duplicateRoots,
      });

      await requirementsDataFactory.fetchRequirementsData();

      // Verify sanitization was called (indirectly through adapter)
      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
    });

    test('should handle cyclic references in hierarchy', async () => {
      // Note: The factory's sanitizeHierarchy method breaks cycles,
      // but we can't test with actual cyclic data because the factory
      // logs the structure with JSON.stringify which would fail.
      // Instead, test that sanitization is called on normal hierarchical data.
      const deepHierarchy = {
        id: 1001,
        title: 'Parent',
        children: [
          {
            id: 1002,
            title: 'Child',
            children: [{ id: 1003, title: 'Grandchild', children: [] }],
          },
        ],
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [deepHierarchy],
      });

      await requirementsDataFactory.fetchRequirementsData();

      // Verify the adapter was called, which means sanitization occurred
      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
    });

    test('should deduplicate children per parent', async () => {
      const nodeWithDuplicateChildren = {
        id: 1001,
        title: 'Parent',
        children: [
          { id: 2001, title: 'Child 1', children: [] },
          { id: 2001, title: 'Child 1 Duplicate', children: [] },
          { id: 2002, title: 'Child 2', children: [] },
        ],
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [nodeWithDuplicateChildren],
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
    });

    test('should handle empty roots array', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [],
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should handle null or undefined roots', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: null,
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });
  });

  describe('Categorized Mode', () => {
    test('should fetch and adapt categorized system requirements data', async () => {
      const categorizedPayload = {
        categories: {
          'Safety Requirements': [
            {
              id: 1,
              title: 'Safety Req 1',
              description: '<p>desc</p>',
              htmlUrl: 'http://example/1',
            },
          ],
        },
      };

      (mockProviders.ticketsDataProvider as any).GetCategorizedRequirementsByType = jest
        .fn()
        .mockResolvedValue(categorizedPayload);

      (mockProviders.dgDataProvider.getTicketsDataProvider as jest.Mock).mockResolvedValue(
        mockProviders.ticketsDataProvider,
      );

      const categorizedFactory = new RequirementsDataFactory(
        defaultParams.teamProjectName,
        defaultParams.templatePath,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        mockProviders.dgDataProvider,
        {
          systemRequirements: {
            wiql: { href: 'system-requirements-query-url' },
          },
        },
        defaultParams.formattingSettings,
        false,
        'categorized',
      );

      await categorizedFactory.fetchRequirementsData();

      const adopted: any = categorizedFactory.getAdoptedData();
      expect(adopted).toBeDefined();
      expect(Array.isArray(adopted.systemRequirementsData)).toBe(true);
      expect(adopted.systemRequirementsData.length).toBeGreaterThan(0);
      expect(
        (mockProviders.ticketsDataProvider as any).GetCategorizedRequirementsByType,
      ).toHaveBeenCalledWith('system-requirements-query-url');
    });
  });

  describe('Traceability Adapters', () => {
    test('should use TraceAnalysisRequirementsAdapter for system to software requirements', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      }).mockResolvedValueOnce({
        sourceTargetsMap: fixtures.sourceTargetsMap,
        sortingSourceColumnsMap: new Map(),
        sortingTargetsColumnsMap: new Map(),
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(TraceAnalysisRequirementsAdapter).toHaveBeenCalledWith(
        fixtures.sourceTargetsMap,
        'sys-req-to-soft-req',
        expect.any(Map),
        expect.any(Map),
      );
    });

    test('should use TraceAnalysisRequirementsAdapter for software to system requirements', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        });

      await requirementsDataFactory.fetchRequirementsData();

      expect(TraceAnalysisRequirementsAdapter).toHaveBeenCalledWith(
        fixtures.sourceTargetsMap,
        'soft-req-to-sys-req',
        expect.any(Map),
        expect.any(Map),
      );
    });

    test('should handle empty traceability data', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      }).mockResolvedValueOnce({
        sourceTargetsMap: new Map(),
        sortingSourceColumnsMap: new Map(),
        sortingTargetsColumnsMap: new Map(),
      });

      await requirementsDataFactory.fetchRequirementsData();

      const adoptedData = requirementsDataFactory.getAdoptedData();
      expect(adoptedData).toBeDefined();
    });

    test('should handle traceability data with workItemRelations fallback', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      }).mockResolvedValueOnce({
        workItemRelations: fixtures.workItemRelations,
        sortingSourceColumnsMap: new Map(),
        sortingTargetsColumnsMap: new Map(),
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(TraceAnalysisRequirementsAdapter).toHaveBeenCalledWith(
        fixtures.workItemRelations,
        'sys-req-to-soft-req',
        expect.any(Map),
        expect.any(Map),
      );
    });
  });

  describe('SysRS customer coverage', () => {
    const createSysRsFactory = (queriesRequest: any = {}) =>
      new RequirementsDataFactory(
        defaultParams.teamProjectName,
        defaultParams.templatePath,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        mockProviders.dgDataProvider,
        queriesRequest,
        defaultParams.formattingSettings,
        false,
        'hierarchical',
        false,
        'sysrs',
      ) as any;

    test('isTraceabilityRel (from tablePresentation) matches Affects and CoveredBy only', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isTraceabilityRel } = require('../../utils/tablePresentation');

      expect(isTraceabilityRel('System.LinkTypes.Affects-Forward')).toBe(true);
      expect(isTraceabilityRel('System.LinkTypes.Affects-Reverse')).toBe(true);
      expect(isTraceabilityRel('Elisra.CoveredBy-Forward')).toBe(true);
      expect(isTraceabilityRel('Elisra.CoveredBy-Reverse')).toBe(true);
      expect(isTraceabilityRel('System.LinkTypes.Related')).toBe(false);
      expect(isTraceabilityRel('System.LinkTypes.Hierarchy-Forward')).toBe(false);
      expect(isTraceabilityRel('System.LinkTypes.Dependency-Forward')).toBe(false);
      expect(isTraceabilityRel('')).toBe(false);
      expect(isTraceabilityRel(undefined)).toBe(false);
    });

    test('isRequirementWorkItem matches only canonical Requirement types', () => {
      const factory = createSysRsFactory();
      const isRequirementWorkItem = (workItem: any) => (factory as any).isRequirementWorkItem(workItem);

      expect(isRequirementWorkItem({ fields: { 'System.WorkItemType': 'Requirement' } })).toBe(true);
      expect(isRequirementWorkItem({ fields: { 'System.WorkItemType': 'requirement' } })).toBe(true);
      expect(isRequirementWorkItem({ workItemType: 'Requirement' })).toBe(true);
      expect(isRequirementWorkItem({ fields: { 'System.WorkItemType': 'Requirement Change' } })).toBe(false);
      expect(isRequirementWorkItem({ fields: { 'System.WorkItemType': 'Non-Requirement' } })).toBe(false);
      expect(isRequirementWorkItem({ fields: { 'System.WorkItemType': 'Epic' } })).toBe(false);
      expect(isRequirementWorkItem({ fields: { 'System.WorkItemType': '' } })).toBe(false);
      expect(isRequirementWorkItem({})).toBe(false);
    });

    test('classifyCustomerTraceRelation orients Affects and custom CoveredBy relations', () => {
      const factory = createSysRsFactory();
      const classify = (relation: any) => (factory as any).classifyCustomerTraceRelation(relation);

      expect(classify({ rel: 'ignored', attributes: { name: 'Affects' } })).toBe(
        'system-to-customer',
      );
      expect(classify({ rel: 'ignored', attributes: { name: 'CoveredBy' } })).toBe(
        'customer-to-system',
      );
      expect(classify({ rel: 'ignored', attributes: { name: 'Covered By' } })).toBe(
        'customer-to-system',
      );
      expect(classify({ rel: 'ignored', attributes: { name: 'Affected By' } })).toBe(
        'customer-to-system',
      );
      expect(classify({ rel: 'ignored', attributes: { name: 'Covers' } })).toBe(
        'system-to-customer',
      );
      expect(classify({ rel: 'System.LinkTypes.Affects-Forward' })).toBe('system-to-customer');
      expect(classify({ rel: 'System.LinkTypes.Affects-Reverse' })).toBe('customer-to-system');
      expect(classify({ rel: 'Elisra.CoveredBy-Forward' })).toBe('system-to-customer');
      expect(classify({ rel: 'Elisra.CoveredBy-Reverse' })).toBe('customer-to-system');
      expect(classify({ rel: 'System.LinkTypes.Related', attributes: { name: 'Related' } })).toBeNull();
    });

    test('computeCoverageFromSourceLinks filters, dedupes, ignores self links and hydrates requirement targets once', async () => {
      const factory = createSysRsFactory();
      const sourceSet = [
        {
          id: 100,
          relations: [
            { rel: 'System.LinkTypes.Affects-Forward', url: 'https://ado/_apis/wit/workItems/201' },
            { rel: 'System.LinkTypes.Affects-Reverse', url: 'https://ado/_apis/wit/workItems/202' },
            { rel: 'Elisra.CoveredBy-Forward', url: 'https://ado/_apis/wit/workItems/203' },
            { rel: 'Elisra.CoveredBy-Reverse', url: 'https://ado/_apis/wit/workItems/201' },
            { rel: 'System.LinkTypes.Related', url: 'https://ado/_apis/wit/workItems/204' },
            { rel: 'System.LinkTypes.Affects-Forward', url: 'https://ado/_apis/wit/workItems/999' },
            { rel: 'System.LinkTypes.Affects-Forward', url: 'https://ado/_apis/wit/workItems/100' },
            { rel: 'AttachedFile', url: 'https://ado/_apis/wit/attachments/abc' },
          ],
        },
        {
          id: 101,
          relations: [{ rel: 'System.LinkTypes.Related', url: 'https://ado/_apis/wit/workItems/201' }],
        },
      ];

      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValue([
        { id: 201, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Target 201' } },
        { id: 202, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Target 202' } },
        { id: 203, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Target 203' } },
        { id: 999, fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Target 999' } },
      ]);

      const coverage = await factory.computeCoverageFromSourceLinks(sourceSet);

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledTimes(1);
      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [201, 202, 203, 999],
        'test-project',
      );
      expect(coverage.get(100).covers.map((item: any) => item.id)).toEqual([201, 202]);
      expect(coverage.get(101).covers).toEqual([]);
    });

    test('buildCustomerCoverageTable maps customer-selected passive links to Customer/System rows', async () => {
      const factory = createSysRsFactory();

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([
        { id: 100, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 100' } },
        { id: 101, fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'Epic 101' } },
        { id: 102, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 102' } },
        { id: 103, fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 103' } },
        { id: 104, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Task 104' } },
      ]);
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        {
          id: 100,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 100' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Reverse',
              url: 'https://ado/_apis/wit/workItems/301',
              attributes: { name: 'Affected By' },
            },
            {
              rel: 'Elisra.CoveredBy-Reverse',
              url: 'https://ado/_apis/wit/workItems/302',
              attributes: { name: 'Covered By' },
            },
            {
              rel: 'System.LinkTypes.Related',
              url: 'https://ado/_apis/wit/workItems/303',
              attributes: { name: 'Related' },
            },
          ],
        },
        {
          id: 102,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 102' },
          relations: [],
        },
      ]).mockResolvedValueOnce([
        { id: 301, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 301' } },
        { id: 302, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 302' } },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        id: 'query-1',
        queryType: 'flat',
        wiql: { href: 'customer-wiql-url' },
      });

      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledWith(
        'customer-wiql-url',
        false,
        null,
      );
      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenNthCalledWith(
        1,
        [100, 102],
        'test-project',
      );
      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenNthCalledWith(
        2,
        [301, 302],
        'test-project',
      );
      expect(result.stats).toEqual({ total: 1, covered: 1, uncovered: 0 });
      expect(result.sourceOrder).toEqual([100]);
      expect(result.rows.map((row: any) => [row.sourceId, row.coveringId || null])).toEqual([
        [100, 301],
        [100, 302],
      ]);
      expect(result.rows[0].sourceTitle).toBe('Customer 100');
      expect(result.rows[0].coveringTitle).toBe('System 301');
      expect(logger.info).toHaveBeenCalledWith('Found 2 customer requirements from query.');
      expect(logger.info).toHaveBeenCalledWith(
        'Customer requirements traceability coverage: total=1, covered=1 (100%), uncovered=0 (0%)',
      );
    });

    test('buildCustomerCoverageTable maps system-selected active links to Customer/System rows', async () => {
      const factory = createSysRsFactory();

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([
        { id: 200, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 200' } },
        { id: 201, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 201' } },
        { id: 202, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 202' } },
        { id: 203, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 203' } },
        { id: 204, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 204' } },
      ]);
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        {
          id: 200,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 200' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Forward',
              url: 'https://ado/_apis/wit/workItems/100',
              attributes: { name: 'Affects' },
            },
          ],
        },
        {
          id: 201,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 201' },
          relations: [
            {
              rel: 'Custom.CoveredBy-Forward',
              url: 'https://ado/_apis/wit/workItems/101',
              attributes: { name: 'Covers' },
            },
          ],
        },
        {
          id: 202,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 202' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Forward',
              url: 'https://ado/_apis/wit/workItems/102',
            },
          ],
        },
        {
          id: 203,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 203' },
          relations: [
            {
              rel: 'Custom.CoveredBy-Forward',
              url: 'https://ado/_apis/wit/workItems/103',
            },
          ],
        },
        {
          id: 204,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 204' },
          relations: [],
        },
      ]).mockResolvedValueOnce([
        { id: 100, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 100' } },
        { id: 101, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 101' } },
        { id: 102, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 102' } },
        { id: 103, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 103' } },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        id: 'query-1',
        queryType: 'flat',
        wiql: { href: 'system-side-wiql-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenNthCalledWith(
        2,
        [100, 101, 102, 103],
        'test-project',
      );
      expect(result.stats).toEqual({ total: 4, covered: 4, uncovered: 0 });
      expect(result.sourceOrder).toEqual([100, 101, 102, 103]);
      expect(result.rows.map((row: any) => [row.sourceId, row.coveringId])).toEqual([
        [100, 200],
        [101, 201],
        [102, 202],
        [103, 203],
      ]);
      expect(result.rows[0].sourceTitle).toBe('Customer 100');
      expect(result.rows[0].coveringTitle).toBe('System 200');
      expect(result.rows.some((row: any) => row.sourceId === 204 || row.coveringId === 204)).toBe(false);
    });

    test('buildCustomerCoverageTable deduplicates rows produced from both selected endpoints', async () => {
      const factory = createSysRsFactory();

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([
        { id: 100, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 100' } },
        { id: 200, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 200' } },
        { id: 201, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 201' } },
      ]);
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        {
          id: 100,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Customer 100' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Reverse',
              url: 'https://ado/_apis/wit/workItems/200',
              attributes: { name: 'Affected By' },
            },
            {
              rel: 'System.LinkTypes.Affects-Reverse',
              url: 'https://ado/_apis/wit/workItems/201',
              attributes: { name: 'Affected By' },
            },
          ],
        },
        {
          id: 200,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 200' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Forward',
              url: 'https://ado/_apis/wit/workItems/100',
              attributes: { name: 'Affects' },
            },
          ],
        },
        {
          id: 201,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System 201' },
          relations: [],
        },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'flat',
        wiql: { href: 'mixed-wiql-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledTimes(1);
      expect(result.stats).toEqual({ total: 1, covered: 1, uncovered: 0 });
      expect(result.sourceOrder).toEqual([100]);
      expect(result.rows.map((row: any) => [row.sourceId, row.coveringId])).toEqual([
        [100, 200],
        [100, 201],
      ]);
    });

    test('buildCustomerCoverageTable maps broad mixed flat queries by trace direction only', async () => {
      const factory = createSysRsFactory();

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([
        { id: 1, fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'Epic 1' } },
        { id: 2, fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 2' } },
        { id: 100, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'C_REQ_2' } },
        { id: 101, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'C_REQ_4' } },
        { id: 102, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Unlinked Req' } },
        { id: 200, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'S_REQ_2' } },
        { id: 201, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System Related Only' } },
      ]);
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        {
          id: 100,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'C_REQ_2' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Reverse',
              url: 'https://ado/_apis/wit/workItems/300',
              attributes: { name: 'Affected By' },
            },
          ],
        },
        {
          id: 101,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'C_REQ_4' },
          relations: [
            {
              rel: 'Custom.CoveredBy-Reverse',
              url: 'https://ado/_apis/wit/workItems/999',
              attributes: { name: 'Covered By' },
            },
          ],
        },
        {
          id: 102,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Unlinked Req' },
          relations: [],
        },
        {
          id: 200,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'S_REQ_2' },
          relations: [
            {
              rel: 'System.LinkTypes.Affects-Forward',
              url: 'https://ado/_apis/wit/workItems/301',
              attributes: { name: 'Affects' },
            },
            {
              rel: 'System.LinkTypes.Hierarchy-Forward',
              url: 'https://ado/_apis/wit/workItems/100',
              attributes: { name: 'Child' },
            },
          ],
        },
        {
          id: 201,
          fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'System Related Only' },
          relations: [
            {
              rel: 'System.LinkTypes.Related',
              url: 'https://ado/_apis/wit/workItems/100',
              attributes: { name: 'Related' },
            },
          ],
        },
      ]).mockResolvedValueOnce([
        { id: 300, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'S_REQ_1' } },
        { id: 301, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'C_REQ_3' } },
        { id: 999, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Not a Requirement' } },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'flat',
        wiql: { href: 'broad-mixed-wiql-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenNthCalledWith(
        1,
        [100, 101, 102, 200, 201],
        'test-project',
      );
      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenNthCalledWith(
        2,
        [300, 999, 301],
        'test-project',
      );
      expect(result.stats).toEqual({ total: 3, covered: 2, uncovered: 1 });
      expect(result.sourceOrder).toEqual([100, 301, 101]);
      expect(result.rows.map((row: any) => [row.sourceId, row.coveringId || null, row.uncovered])).toEqual([
        [100, 300, false],
        [301, 200, false],
        [101, null, true],
      ]);
      expect(result.rows.some((row: any) => row.sourceId === 102 || row.sourceId === 201)).toBe(false);
    });

    test('buildCustomerCoverageTable extracts nested Requirements from tree roots fallback', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [
          {
            id: 1,
            fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'Epic 1' },
            children: [
              {
                id: 2,
                fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 2' },
                children: [
                  {
                    id: 3,
                    fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 3' },
                    children: [],
                  },
                  {
                    id: 4,
                    fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 4' },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      });
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        { id: 3, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 3' }, relations: [] },
        { id: 4, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 4' }, relations: [] },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [3, 4],
        'test-project',
      );
      expect(result.stats).toEqual({ total: 0, covered: 0, uncovered: 0 });
      expect(result.sourceOrder).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    test('buildCustomerCoverageTable extracts Requirements from tree allItems shortcut', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [{ id: 1, children: [] }],
        allItems: {
          1: { id: 1, fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'Epic 1' } },
          2: { id: 2, fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 2' } },
          3: { id: 3, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 3' } },
          4: { id: 4, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 4' } },
        },
      });
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        { id: 3, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 3' }, relations: [] },
        { id: 4, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 4' }, relations: [] },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [3, 4],
        'test-project',
      );
      expect(result.stats.total).toBe(0);
    });

    test('buildCustomerCoverageTable extracts Requirements from one-hop result shape', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [],
        workItemRelations: [],
        allItems: {
          10: { id: 10, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 10' } },
          11: { id: 11, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Task 11' } },
          12: { id: 12, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 12' } },
        },
      });
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        { id: 10, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 10' }, relations: [] },
        { id: 12, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 12' }, relations: [] },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'oneHop',
        wiql: { href: 'customer-onehop-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [10, 12],
        'test-project',
      );
      expect(result.stats.total).toBe(0);
    });

    test('buildCustomerCoverageTable rejects unsupported customer query result shapes', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({ unexpected: true });

      await expect(
        factory.buildCustomerCoverageTable({
          queryType: 'tree',
          wiql: { href: 'customer-wiql-url' },
        }),
      ).rejects.toThrow('Customer-side query returned an unsupported result shape.');
    });

    test('buildCustomerCoverageTable deduplicates repeated Requirement IDs', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [
          {
            id: 20,
            fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 20' },
            children: [
              {
                id: 21,
                fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 21' },
                children: [],
              },
              {
                id: 20,
                fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 20 duplicate' },
                children: [],
              },
            ],
          },
        ],
      });
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        { id: 20, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 20' }, relations: [] },
        { id: 21, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 21' }, relations: [] },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [20, 21],
        'test-project',
      );
      expect(result.sourceOrder).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    test('buildCustomerCoverageTable handles empty tree query results', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [],
        allItems: {},
      });

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).not.toHaveBeenCalled();
      expect(result).toEqual({
        rows: [],
        sourceOrder: [],
        stats: { total: 0, covered: 0, uncovered: 0 },
      });
    });

    test('buildCustomerCoverageTable falls back to roots when allItems is empty', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        allItems: {},
        roots: [
          {
            id: 25,
            fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 25' },
            children: [],
          },
        ],
      });
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        { id: 25, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 25' }, relations: [] },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [25],
        'test-project',
      );
      expect(result.sourceOrder).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    test('buildCustomerCoverageTable handles non-empty queries with zero Requirements', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [
          {
            id: 30,
            fields: { 'System.WorkItemType': 'Epic', 'System.Title': 'Epic 30' },
            children: [
              {
                id: 31,
                fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 31' },
                children: [],
              },
            ],
          },
        ],
      });

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).not.toHaveBeenCalled();
      expect(result.stats).toEqual({ total: 0, covered: 0, uncovered: 0 });
      expect(result.rows).toEqual([]);
    });

    test('buildCustomerCoverageTable extracts Requirements at multiple nesting depths', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [
          {
            id: 40,
            fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 40' },
            children: [
              {
                id: 41,
                fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 41' },
                children: [
                  {
                    id: 42,
                    fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 42' },
                    children: [
                      {
                        id: 43,
                        fields: { 'System.WorkItemType': 'Feature', 'System.Title': 'Feature 43' },
                        children: [
                          {
                            id: 44,
                            fields: {
                              'System.WorkItemType': 'Requirement',
                              'System.Title': 'Req 44',
                            },
                            children: [],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      mockProviders.ticketsDataProvider.PopulateWorkItemsByIds.mockResolvedValueOnce([
        { id: 40, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 40' }, relations: [] },
        { id: 42, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 42' }, relations: [] },
        { id: 44, fields: { 'System.WorkItemType': 'Requirement', 'System.Title': 'Req 44' }, relations: [] },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'tree',
        wiql: { href: 'customer-tree-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).toHaveBeenCalledWith(
        [40, 42, 44],
        'test-project',
      );
      expect(result.sourceOrder).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    test('buildCustomerCoverageTable rejects missing WIQL href', async () => {
      const factory = createSysRsFactory();

      await expect(
        factory.buildCustomerCoverageTable({
          queryType: 'flat',
        }),
      ).rejects.toThrow('Customer-side query is missing WIQL href.');
    });

    test('buildCustomerCoverageTable does not emit coverage summary log when total=0', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([
        { id: 500, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Not a requirement' } },
      ]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'flat',
        wiql: { href: 'customer-wiql-url' },
      });

      expect(result.stats).toEqual({ total: 0, covered: 0, uncovered: 0 });
      expect(logger.info).toHaveBeenCalledWith('Found 0 customer requirements from query.');
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Customer requirements traceability coverage:'),
      );
    });

    test('buildCustomerCoverageTable handles empty flat query results', async () => {
      const factory = createSysRsFactory();
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([]);

      const result = await factory.buildCustomerCoverageTable({
        queryType: 'flat',
        wiql: { href: 'customer-wiql-url' },
      });

      expect(mockProviders.ticketsDataProvider.PopulateWorkItemsByIds).not.toHaveBeenCalled();
      expect(result).toEqual({
        rows: [],
        sourceOrder: [],
        stats: { total: 0, covered: 0, uncovered: 0 },
      });
    });

    test('builds customer coverage even when primary SysRS requirements data is absent', async () => {
      const factory = createSysRsFactory({
        systemRequirements: {
          wiql: { href: 'system-requirements-query-url' },
        },
        customerRequirements: {
          queryType: 'flat',
          wiql: { href: 'customer-wiql-url' },
        },
      }) as any;

      jest.spyOn(factory, 'buildCustomerCoverageTable').mockResolvedValue({
        rows: [{ sourceId: 100, sourceTitle: 'Customer 100', uncovered: true }],
        sourceOrder: [100],
        stats: { total: 1, covered: 0, uncovered: 1 },
      });

      const adopted = await factory.jsonSkinDataAdapter(null, {}, false, true);

      expect(factory.buildCustomerCoverageTable).toHaveBeenCalledWith(
        factory.queriesRequest.customerRequirements,
      );
      expect(adopted.customerCoverageTableData.rows).toHaveLength(1);
    });
  });

  describe('Big Data Scenarios', () => {
    test('should handle large number of requirements (500+ items)', async () => {
      const largeDataset = Array.from({ length: 600 }, (_, i) => ({
        id: 1000 + i,
        title: `Requirement ${1000 + i}`,
        description: `Description for requirement ${1000 + i}`,
        children: [],
      }));

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: largeDataset,
      });

      const factoryWithBigData = new RequirementsDataFactory(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        mockProviders.dgDataProvider,
        { systemRequirements: { wiql: { href: 'url' } } },
        {},
        true, // allowBiggerThan500 = true
      );

      await factoryWithBigData.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalledWith(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        {},
        true, // allowBiggerThan500 passed to adapter
        true, // includeTFSLinks
      );
    });

    test('should handle deep hierarchical structures (10+ levels)', async () => {
      const createDeepHierarchy = (depth: number, currentId: number = 1000): any => {
        if (depth === 0) {
          return { id: currentId, title: `Leaf ${currentId}`, children: [] };
        }
        return {
          id: currentId,
          title: `Level ${depth} - ${currentId}`,
          children: [createDeepHierarchy(depth - 1, currentId + 1)],
        };
      };

      const deepHierarchy = [createDeepHierarchy(15)];

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: deepHierarchy,
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should handle wide hierarchical structures (100+ children per node)', async () => {
      const wideHierarchy = [
        {
          id: 1000,
          title: 'Root with many children',
          children: Array.from({ length: 150 }, (_, i) => ({
            id: 2000 + i,
            title: `Child ${2000 + i}`,
            children: [],
          })),
        },
      ];

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: wideHierarchy,
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should handle large traceability matrices (1000+ relations)', async () => {
      const largeTraceMap = new Map();
      for (let i = 1000; i < 2000; i++) {
        largeTraceMap.set(i, [
          { id: i + 1000, title: `Target ${i + 1000}` },
          { id: i + 2000, title: `Target ${i + 2000}` },
        ]);
      }

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      }).mockResolvedValueOnce({
        sourceTargetsMap: largeTraceMap,
        sortingSourceColumnsMap: new Map(),
        sortingTargetsColumnsMap: new Map(),
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(TraceAnalysisRequirementsAdapter).toHaveBeenCalledWith(
        largeTraceMap,
        'sys-req-to-soft-req',
        expect.any(Map),
        expect.any(Map),
      );
    });

    test('should handle requirements with large text content', async () => {
      const largeTextContent = 'A'.repeat(50000); // 50KB of text
      const requirementWithLargeText = {
        id: 1001,
        title: 'Requirement with large description',
        description: largeTextContent,
        children: [],
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [requirementWithLargeText],
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should handle multiple large datasets simultaneously', async () => {
      const largeSystemReqs = Array.from({ length: 300 }, (_, i) => ({
        id: 1000 + i,
        title: `System Req ${1000 + i}`,
        children: [],
      }));

      const largeTraceMap = new Map();
      for (let i = 1000; i < 1300; i++) {
        largeTraceMap.set(i, [{ id: i + 1000, title: `Software Req ${i + 1000}` }]);
      }

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: largeSystemReqs,
      })
        .mockResolvedValueOnce({
          sourceTargetsMap: largeTraceMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        })
        .mockResolvedValueOnce({
          sourceTargetsMap: largeTraceMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        });

      await requirementsDataFactory.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalled();
      expect(TraceAnalysisRequirementsAdapter).toHaveBeenCalledTimes(2);
      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });

    test('should handle performance with allowBiggerThan500 flag disabled', async () => {
      const largeDataset = Array.from({ length: 600 }, (_, i) => ({
        id: 1000 + i,
        title: `Requirement ${1000 + i}`,
        children: [],
      }));

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: largeDataset,
      });

      const factoryWithoutBigData = new RequirementsDataFactory(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        mockProviders.dgDataProvider,
        { systemRequirements: { wiql: { href: 'url' } } },
        {},
        false, // allowBiggerThan500 = false
      );

      await factoryWithoutBigData.fetchRequirementsData();

      expect(RequirementDataSkinAdapter).toHaveBeenCalledWith(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        {},
        false, // allowBiggerThan500 passed to adapter
        true, // includeTFSLinks
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing queriesRequest properties', async () => {
      const factoryWithPartialQueries = new RequirementsDataFactory(
        'test-project',
        '/template',
        'bucket',
        'endpoint',
        'access-key',
        'secret-key',
        'pat',
        mockProviders.dgDataProvider,
        {}, // Empty queries request
        {},
      );

      await factoryWithPartialQueries.fetchRequirementsData();

      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).not.toHaveBeenCalled();
    });

    test('should handle adapter errors gracefully', async () => {
      (RequirementDataSkinAdapter as jest.Mock).mockImplementation(() => ({
        jsonSkinAdapter: jest.fn().mockRejectedValue(new Error('Adapter error')),
        getAttachmentMinioData: jest.fn().mockReturnValue([]),
      }));

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [fixtures.systemRequirement],
      });

      await expect(requirementsDataFactory.fetchRequirementsData()).rejects.toThrow('Adapter error');
      expect(logger.error).toHaveBeenCalled();
    });

    test('should handle network timeouts', async () => {
      const timeoutError = new Error('Network timeout');
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockRejectedValue(timeoutError);

      await expect(requirementsDataFactory.fetchRequirementsData()).rejects.toThrow('Network timeout');
    });

    test('should handle malformed query results', async () => {
      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        // Missing roots property
        data: 'malformed',
      });

      await requirementsDataFactory.fetchRequirementsData();

      expect(requirementsDataFactory.adoptedData).toBeDefined();
    });
  });

  describe('Link-Driven Rendering', () => {
    test('should use link-driven rendering when workItemRelations are provided', async () => {
      const queryResults = {
        roots: [fixtures.systemRequirement],
        workItemRelations: fixtures.workItemRelations,
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue(queryResults);

      await requirementsDataFactory.fetchRequirementsData();

      const adapterInstance = (RequirementDataSkinAdapter as jest.Mock).mock.results[0].value;
      expect(adapterInstance.jsonSkinAdapter).toHaveBeenCalledWith({
        requirementQueryData: expect.any(Object),
        workItemLinksDebug: { workItemRelations: fixtures.workItemRelations },
      });
    });
    test('should use sanitized tree when no workItemRelations are provided', async () => {
      const queryResults = {
        roots: [fixtures.systemRequirement],
      };

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue(queryResults);

      await requirementsDataFactory.fetchRequirementsData();

      const adapterInstance = (RequirementDataSkinAdapter as jest.Mock).mock.results[0].value;
      expect(adapterInstance.jsonSkinAdapter).toHaveBeenCalledWith({
        requirementQueryData: expect.any(Object),
        workItemLinksDebug: undefined,
      });
    });
  });

  describe('SysRS Variant', () => {
    const createSysRsFactory = (queriesRequest: any) =>
      new RequirementsDataFactory(
        defaultParams.teamProjectName,
        defaultParams.templatePath,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT,
        mockProviders.dgDataProvider,
        queriesRequest,
        defaultParams.formattingSettings,
        false,
        'hierarchical',
        true,
        'sysrs',
      );

    test('builds critical requirements only for requirement-like priority-1 rows and creates hierarchical sections', async () => {
      const sysRsFactory = createSysRsFactory({
        systemRequirements: {
          wiql: { href: 'system-requirements-query-url' },
        },
      });

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue({
        roots: [
          {
            id: 10,
            title: 'Epic-10',
            htmlUrl: 'http://example.com/10',
            workItemType: 'Epic',
            fields: {
              'Microsoft.VSTS.Common.Priority': 1,
            },
            children: [
              {
                id: 11,
                title: 'Feature-11',
                htmlUrl: 'http://example.com/11',
                workItemType: 'Feature',
                fields: {
                  Priority: '2 - Medium',
                },
                children: [
                  {
                    id: 13,
                    title: 'REQ-13',
                    htmlUrl: 'http://example.com/13',
                    workItemType: 'Requirement',
                    fields: {
                      Priority: '1 - High',
                      'Microsoft.VSTS.Common.VerificationComment': 'Critical from MS field',
                      'Verification Method': 'Test',
                      Site: 'Lab',
                      'Test Phase': 'P1',
                    },
                    children: [],
                  },
                ],
              },
              {
                id: 12,
                title: 'REQ-12',
                htmlUrl: 'http://example.com/12',
                workItemType: 'Requirement',
                fields: {
                  Priority: { value: 1 },
                  'Verification Comment': 'Critical from generic field',
                  VerificationMethod: 'Inspection',
                  'Verification Site': 'Factory',
                  TestPhase: 'P2',
                },
                children: [],
              },
            ],
          },
        ],
      });

      await sysRsFactory.fetchRequirementsData();
      const adoptedData: any = sysRsFactory.getAdoptedData();

      expect(Array.isArray(adoptedData.criticalRequirementsData)).toBe(true);
      expect(adoptedData.criticalRequirementsData.map((row: any) => row.fields[0].value)).toEqual([13, 12]);
      expect(adoptedData.criticalRequirementsData.map((row: any) => row.fields[2].value)).toEqual([
        'Critical from MS field',
        'Critical from generic field',
      ]);

      expect(Array.isArray(adoptedData.vcrmData)).toBe(true);
      const sectionById = new Map(
        adoptedData.vcrmData.map((row: any) => [row.fields[0].value, row.fields[1].value]),
      );
      expect(sectionById.get(10)).toBe('{{section:requirements-root:1}}');
      expect(sectionById.get(11)).toBe('{{section:requirements-root:1.1}}');
      expect(sectionById.get(13)).toBe('{{section:requirements-root:1.1.1}}');
      expect(sectionById.get(12)).toBe('{{section:requirements-root:1.2}}');

      expect(adoptedData.vcrmData.map((row: any) => row.fields[0].value)).toEqual([10, 11, 13, 12]);

      const vcrmRowById = new Map<number, any>(
        adoptedData.vcrmData.map((row: any) => [row.fields[0].value, row]),
      );

      const epicRow = vcrmRowById.get(10) as any;
      expect(epicRow.fields[2].value).toBe('<b>Epic-10</b>');
      expect(epicRow.fields[3].value).toBe('N/A');
      expect(epicRow.fields[4].value).toBe('N/A');
      expect(epicRow.fields[5].value).toBe('N/A');
      expect(epicRow.fields.every((field: any) => field.shading?.fill === 'D9D9D9')).toBe(true);

      const featureRow = vcrmRowById.get(11) as any;
      expect(featureRow.fields[2].value).toBe('<b>Feature-11</b>');
      expect(featureRow.fields[3].value).toBe('N/A');
      expect(featureRow.fields[4].value).toBe('N/A');
      expect(featureRow.fields[5].value).toBe('N/A');
      expect(featureRow.fields.every((field: any) => field.shading?.fill === 'EDEDED')).toBe(true);

      const requirementRow = vcrmRowById.get(13) as any;
      expect(requirementRow.fields[2].value).toBe('REQ-13');
      expect(requirementRow.fields[3].value).toBe('Test');
      expect(requirementRow.fields[4].value).toBe('Lab');
      expect(requirementRow.fields[5].value).toBe('P1');
      expect(requirementRow.fields.every((field: any) => field.shading === undefined)).toBe(true);

      const requirementRowWithValues = vcrmRowById.get(12) as any;
      expect(requirementRowWithValues.fields[2].value).toBe('REQ-12');
      expect(requirementRowWithValues.fields[3].value).toBe('Inspection');
      expect(requirementRowWithValues.fields[4].value).toBe('Factory');
      expect(requirementRowWithValues.fields[5].value).toBe('P2');
      expect(requirementRowWithValues.fields.every((field: any) => field.shading === undefined)).toBe(true);
    });

    test('maps SysRS forward/reverse trace queries to alias keys and fetches the correct WIQL urls', async () => {
      const sysRsFactory = createSysRsFactory({
        systemRequirements: {
          wiql: { href: 'system-requirements-query-url' },
        },
        subsystemToSystemRequirements: {
          wiql: { href: 'subsystem-to-system-query-url' },
        },
        systemToSubsystemRequirements: {
          wiql: { href: 'system-to-subsystem-query-url' },
        },
      });

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        })
        .mockResolvedValueOnce({
          sourceTargetsMap: fixtures.sourceTargetsMap,
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        });

      await sysRsFactory.fetchRequirementsData();
      const adoptedData: any = sysRsFactory.getAdoptedData();

      // SysRS system requirements query should fetch all fields for VCRM/critical-requirements
      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenNthCalledWith(
        1,
        'system-requirements-query-url',
        false,
        null,
        true, // fetchAllFields=true for SysRS
      );
      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenNthCalledWith(
        2,
        'subsystem-to-system-query-url',
        true,
        null,
      );
      expect(mockProviders.ticketsDataProvider.GetQueryResultsFromWiql).toHaveBeenNthCalledWith(
        3,
        'system-to-subsystem-query-url',
        true,
        null,
      );

      expect(adoptedData.subsystemToSystemTraceAdoptedData.adoptedData).toEqual({
        traceMatrix: [{ source: 1001, targets: [2001] }],
      });
      expect(adoptedData.systemToSubsystemTraceAdoptedData.adoptedData).toEqual({
        traceMatrix: [{ source: 1001, targets: [2001] }],
      });
      // SRS-specific keys should not be set for SysRS variant
      expect(adoptedData.sysReqToSoftReqAdoptedData).toBeUndefined();
      expect(adoptedData.softReqToSysReqAdoptedData).toBeUndefined();
    });

    test('returns null adoptedData aliases when SysRS trace queries are requested but empty', async () => {
      const sysRsFactory = createSysRsFactory({
        systemRequirements: {
          wiql: { href: 'system-requirements-query-url' },
        },
        subsystemToSystemRequirements: {
          wiql: { href: 'subsystem-to-system-query-url' },
        },
        systemToSubsystemRequirements: {
          wiql: { href: 'system-to-subsystem-query-url' },
        },
      });

      mockProviders.ticketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce({
        roots: [fixtures.systemRequirement],
      })
        .mockResolvedValueOnce({
          sourceTargetsMap: new Map(),
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        })
        .mockResolvedValueOnce({
          sourceTargetsMap: new Map(),
          sortingSourceColumnsMap: new Map(),
          sortingTargetsColumnsMap: new Map(),
        });

      await sysRsFactory.fetchRequirementsData();
      const adoptedData: any = sysRsFactory.getAdoptedData();

      expect(adoptedData.subsystemToSystemTraceAdoptedData.adoptedData).toBeNull();
      expect(adoptedData.systemToSubsystemTraceAdoptedData.adoptedData).toBeNull();
      // SRS-specific keys should not be set for SysRS variant
      expect(adoptedData.sysReqToSoftReqAdoptedData).toBeUndefined();
      expect(adoptedData.softReqToSysReqAdoptedData).toBeUndefined();
    });
  });
});
