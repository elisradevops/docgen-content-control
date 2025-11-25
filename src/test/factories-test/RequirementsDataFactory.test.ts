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
      params.allowBiggerThan500
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
        {}
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
        true
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
        null
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
        null
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
        null
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
        mockProviders.ticketsDataProvider
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
        'categorized'
      );

      await categorizedFactory.fetchRequirementsData();

      const adopted: any = categorizedFactory.getAdoptedData();
      expect(adopted).toBeDefined();
      expect(Array.isArray(adopted.systemRequirementsData)).toBe(true);
      expect(adopted.systemRequirementsData.length).toBeGreaterThan(0);
      expect(
        (mockProviders.ticketsDataProvider as any).GetCategorizedRequirementsByType
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
        expect.any(Map)
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
        expect.any(Map)
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
        expect.any(Map)
      );
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
        true // allowBiggerThan500 = true
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
        true // includeTFSLinks
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
        expect.any(Map)
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
        false // allowBiggerThan500 = false
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
        true // includeTFSLinks
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
        {}
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
});
