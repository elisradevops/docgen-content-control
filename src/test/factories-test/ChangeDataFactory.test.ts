// First, mock all required modules before any imports
jest.mock('../../services/logger');
jest.mock('../../services/htmlUtils', () => ({
  __esModule: true,
  default: class MockHtmlUtils {
    cleanHtml = jest.fn().mockResolvedValue('cleaned html');
  },
}));

// Mock the adapters
jest.mock('../../adapters/ChangesTableDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    adoptSkinData: jest.fn().mockResolvedValue(undefined),
    getAdoptedData: jest.fn().mockReturnValue([]),
    attachmentMinioData: [],
  }));
});

jest.mock('../../adapters/ReleaseComponentsDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinAdapter: jest.fn().mockReturnValue([]),
  }));
});

jest.mock('../../adapters/SystemOverviewDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    jsonSkinAdapter: jest.fn().mockResolvedValue([]),
    getAttachmentMinioData: jest.fn().mockReturnValue([]),
  }));
});

jest.mock('../../adapters/BugsTableSkinAdpater', () => {
  return jest.fn().mockImplementation(() => ({
    adoptSkinData: jest.fn(),
    getAdoptedData: jest.fn().mockReturnValue([]),
  }));
});

jest.mock('../../adapters/NonAssociatedCommitsDataSkinAdapter', () => {
  return jest.fn().mockImplementation(() => ({
    adoptSkinData: jest.fn().mockResolvedValue(undefined),
    getAdoptedData: jest.fn().mockReturnValue([{ rows: [] }]),
  }));
});

// Now it's safe to import the modules
import ChangeDataFactory from '../../factories/ChangeDataFactory';
import logger from '../../services/logger';
import { TagCommitMeta } from '../../models/changeModels';

describe('ChangeDataFactory', () => {
  let changeDataFactory: ChangeDataFactory;
  let mockDgDataProvider;
  let mockTicketsDataProvider;
  let mockGitDataProvider;
  let mockJfrogDataProvider;
  let mockPipelinesDataProvider;

  const defaultParams = {
    teamProject: 'TestProject',
    repoId: 'repo-123',
    from: 'commit-1',
    to: 'commit-2',
    rangeType: 'commitSha',
    linkTypeFilterArray: ['Related'],
    branchName: 'main',
    includePullRequests: false,
    attachmentWikiUrl: 'https://wiki.example.com/file.md',
    includeChangeDescription: true,
    includeCommittedBy: true,
    attachmentsBucketName: 'bucket-name',
    minioEndPoint: 'minio.example.com',
    minioAccessKey: 'access-key',
    minioSecretKey: 'secret-key',
    PAT: 'personal-access-token',
    tocTitle: 'Table of Contents',
    queriesRequest: {
      sysOverviewQuery: { wiql: { href: 'system-query-url' } },
      knownBugsQuery: { wiql: { href: 'bugs-query-url' } },
    },
    includedWorkItemByIdSet: new Set<number>([1, 2, 3]),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ticket data provider
    mockTicketsDataProvider = {
      GetQueryResultsFromWiql: jest.fn().mockResolvedValue([]),
      GetWorkitemAttachments: jest.fn().mockResolvedValue([]),
    };

    // Mock Git data provider
    mockGitDataProvider = {
      GetGitRepoFromRepoId: jest.fn().mockResolvedValue({
        name: 'test-repo',
        url: 'https://example.com/repo',
        project: { id: 'project-1' },
      }),
      GetCommitsInCommitRange: jest.fn().mockResolvedValue([]),
      GetItemsInCommitRange: jest.fn().mockResolvedValue([]),
      GetCommitsInDateRange: jest.fn().mockResolvedValue({ count: 0, value: [] }),
      GetPullRequestsInCommitRangeWithoutLinkedItems: jest.fn().mockResolvedValue([]),
      GetCommitBatch: jest.fn().mockResolvedValue([]),
      getItemsForPipelineRange: jest.fn().mockResolvedValue([]),
      getSubmodulesData: jest.fn().mockResolvedValue([]),
      GetFileFromGitRepo: jest.fn().mockResolvedValue('{"services":[]}'),
      CheckIfItemExist: jest.fn().mockResolvedValue(true),
    };

    // Mock JFrog data provider
    mockJfrogDataProvider = {
      getServiceConnectionUrlByConnectionId: jest.fn().mockResolvedValue('https://jfrog.example.com'),
      getCiDataFromJfrog: jest.fn().mockResolvedValue('https://example.com/_build?buildId=123'),
    };

    // Mock Pipelines data provider
    mockPipelinesDataProvider = {
      GetRecentReleaseArtifactInfo: jest.fn().mockResolvedValue([]),
      getPipelineBuildByBuildId: jest.fn().mockResolvedValue({
        id: 123,
        result: 'succeeded',
        definition: { id: 456 },
      }),
      findPreviousPipeline: jest.fn().mockResolvedValue({
        id: 122,
        definition: { id: 456 },
      }),
      getPipelineRunDetails: jest.fn().mockResolvedValue({}),
      getPipelineResourcePipelinesFromObject: jest.fn().mockResolvedValue([]),
      getPipelineResourceRepositoriesFromObject: jest.fn().mockResolvedValue([]),
      GetReleaseByReleaseId: jest.fn().mockResolvedValue({
        artifacts: [],
        variables: {
          servicesJson: { value: 'https://repo/_git/services?path=services.json' },
          servicesJsonVersion: { value: 'master' },
          servicesJsonVersionType: { value: 'branch' },
          servicesJsonTagPrefix: { value: 'release-' },
        },
        name: '1.0.0',
      }),
    };

    // Main data provider mock
    mockDgDataProvider = {
      getTicketsDataProvider: jest.fn().mockResolvedValue(mockTicketsDataProvider),
      getGitDataProvider: jest.fn().mockResolvedValue(mockGitDataProvider),
      getJfrogDataProvider: jest.fn().mockResolvedValue(mockJfrogDataProvider),
      getPipelinesDataProvider: jest.fn().mockResolvedValue(mockPipelinesDataProvider),
    };

    // Create instance of ChangeDataFactory with mocked dependencies
    changeDataFactory = new ChangeDataFactory(
      defaultParams.teamProject,
      defaultParams.repoId,
      defaultParams.from,
      defaultParams.to,
      defaultParams.rangeType,
      defaultParams.linkTypeFilterArray,
      defaultParams.branchName,
      defaultParams.includePullRequests,
      defaultParams.attachmentWikiUrl,
      defaultParams.includeChangeDescription,
      defaultParams.includeCommittedBy,
      mockDgDataProvider,
      defaultParams.attachmentsBucketName,
      defaultParams.minioEndPoint,
      defaultParams.minioAccessKey,
      defaultParams.minioSecretKey,
      defaultParams.PAT,
      defaultParams.tocTitle,
      defaultParams.queriesRequest,
      defaultParams.includedWorkItemByIdSet
    );
  });

  describe('ChangesTableDataSkinAdapter behavior (no nonLinkedCommits rendering)', () => {
    it('should not render nonLinkedCommits in the main changes table', async () => {
      const realAdapterModule = jest.requireActual('../../adapters/ChangesTableDataSkinAdapter');
      const RealChangesTableDataSkinAdapter = realAdapterModule.default;

      const rawChangesArray = [
        {
          artifact: { name: 'Repo A' },
          changes: [
            { workItem: { id: 101, fields: { 'System.Title': 'A' }, _links: { html: { href: 'u' } } } },
            { workItem: { id: 102, fields: { 'System.Title': 'B' }, _links: { html: { href: 'u' } } } },
          ],
          nonLinkedCommits: [
            {
              commitId: 'abcdef0',
              commitDate: '2025-01-01T00:00:00Z',
              committer: 'Someone',
              comment: 'unlinked',
              url: 'http://example/abcdef0',
            },
          ],
        },
      ];

      const adapter = new RealChangesTableDataSkinAdapter(
        rawChangesArray as any,
        false,
        false,
        'TestProject',
        '',
        '',
        '',
        '',
        '',
        '',
        { trimAdditionalSpacingInDescriptions: false, trimAdditionalSpacingInTables: false }
      );
      await adapter.adoptSkinData();
      const adopted = adapter.getAdoptedData();
      expect(adopted).toHaveLength(1);
      // Should have exactly 2 rows for 2 changes, and ignore the 1 nonLinkedCommit
      expect(adopted[0].artifactChanges).toHaveLength(2);
    });
  });

  describe('constructor', () => {
    it('should initialize properly with all parameters', () => {
      expect(changeDataFactory.dgDataProviderAzureDevOps).toBe(mockDgDataProvider);
      expect(changeDataFactory.teamProject).toBe(defaultParams.teamProject);
      expect(changeDataFactory.repoId).toBe(defaultParams.repoId);
      expect(changeDataFactory.from).toBe(defaultParams.from);
      expect(changeDataFactory.to).toBe(defaultParams.to);
      expect(changeDataFactory.rangeType).toBe(defaultParams.rangeType);
      expect(changeDataFactory.linkTypeFilterArray).toBe(defaultParams.linkTypeFilterArray);
      expect(changeDataFactory.branchName).toBe(defaultParams.branchName);
      expect(changeDataFactory.includePullRequests).toBe(defaultParams.includePullRequests);
      expect(changeDataFactory.attachmentWikiUrl).toBe(defaultParams.attachmentWikiUrl);
      expect(changeDataFactory.includeChangeDescription).toBe(defaultParams.includeChangeDescription);
      expect(changeDataFactory.includeCommittedBy).toBe(defaultParams.includeCommittedBy);
    });

    it('should adapt non-associated-commits data using the dedicated adapter', async () => {
      const mockRawData = [
        {
          artifact: { name: 'Repo 1' },
          changes: [{ workItem: { id: 1, fields: {}, _links: {} } }],
          nonLinkedCommits: [
            {
              commitId: 'deadbeef',
              commitDate: '2025-10-28T10:00:00Z',
              committer: 'Bob',
              comment: 'no WI',
              url: 'http://example/deadbeef',
            },
          ],
        },
        {
          artifact: { name: 'Repo 2' },
          changes: [],
          nonLinkedCommits: [],
        },
      ];

      const mockAdapter = {
        adoptSkinData: jest.fn().mockResolvedValue(undefined),
        getAdoptedData: jest.fn().mockReturnValue([{ rows: [{ col: 'val' }] }]),
      };
      require('../../adapters/NonAssociatedCommitsDataSkinAdapter').mockImplementation(() => mockAdapter);

      const result = await changeDataFactory.jsonSkinDataAdapter('non-associated-commits', mockRawData);

      expect(mockAdapter.adoptSkinData).toHaveBeenCalled();
      expect(mockAdapter.getAdoptedData).toHaveBeenCalled();
      expect(result).toEqual([{ rows: [{ col: 'val' }] }]);
    });

    it('should initialize with default includedWorkItemByIdSet if not provided', () => {
      const factory = new ChangeDataFactory(
        defaultParams.teamProject,
        defaultParams.repoId,
        defaultParams.from,
        defaultParams.to,
        defaultParams.rangeType,
        defaultParams.linkTypeFilterArray,
        defaultParams.branchName,
        defaultParams.includePullRequests,
        defaultParams.attachmentWikiUrl,
        defaultParams.includeChangeDescription,
        defaultParams.includeCommittedBy,
        mockDgDataProvider,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT
      );

      expect(factory.includedWorkItemByIdSet).toBeInstanceOf(Set);
      expect(factory.includedWorkItemByIdSet.size).toBe(0);
    });
  });

  describe('fetchQueryResults', () => {
    it('should fetch system overview query results', async () => {
      const mockSystemOverviewData = [{ id: 1, title: 'Item 1' }];
      mockTicketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce(mockSystemOverviewData);

      const result = await changeDataFactory.fetchQueryResults();

      expect(mockTicketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledWith(
        'system-query-url',
        false,
        null
      );
      expect(result.systemOverviewQueryData).toEqual(mockSystemOverviewData);
    });

    it('should fetch known bugs query results', async () => {
      const mockKnownBugsData = [{ id: 2, title: 'Bug 1' }];
      mockTicketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce([]) // First call for system overview
        .mockResolvedValueOnce(mockKnownBugsData); // Second call for known bugs

      const result = await changeDataFactory.fetchQueryResults();

      expect(mockTicketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledWith(
        'bugs-query-url',
        true,
        null
      );
      expect(result.knownBugsQueryData).toEqual(mockKnownBugsData);
    });

    it('should handle errors and return empty array', async () => {
      mockTicketsDataProvider.GetQueryResultsFromWiql.mockRejectedValue(new Error('Query failed'));

      const result = await changeDataFactory.fetchQueryResults();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not fetch query results'));
    });
  });

  describe('fetchChangesData', () => {
    it('should fetch changes for commitSha range type', async () => {
      const mockCommits = [{ commitId: 'commit-123' }];
      const mockChanges = [{ workItem: { id: 42, fields: {}, _links: {} } }];

      mockGitDataProvider.GetCommitsInCommitRange.mockResolvedValue(mockCommits);
      mockGitDataProvider.GetItemsInCommitRange.mockResolvedValue({
        commitChangesArray: mockChanges,
        commitsWithNoRelations: [],
      });

      await changeDataFactory.fetchChangesData();

      expect(mockGitDataProvider.GetCommitsInCommitRange).toHaveBeenCalledWith(
        defaultParams.teamProject,
        defaultParams.repoId,
        defaultParams.to,
        defaultParams.from
      );
      expect(mockGitDataProvider.GetItemsInCommitRange).toHaveBeenCalledWith(
        defaultParams.teamProject,
        defaultParams.repoId,
        mockCommits,
        undefined,
        false
      );
      expect(changeDataFactory.getRawData()).toEqual([
        {
          artifact: expect.any(Object),
          changes: mockChanges,
          nonLinkedCommits: [],
        },
      ]);
    });

    it('should include non-linked commits when includeUnlinkedCommits is true', async () => {
      const mockCommits = [{ commitId: 'commit-abc' }];
      const unlinked = [
        {
          commitId: 'commit-abc',
          commitDate: '2025-10-28T10:00:00Z',
          committer: 'Alice',
          comment: 'no WI',
          url: 'http://example/commit-abc',
        },
      ];

      mockGitDataProvider.GetCommitsInCommitRange.mockResolvedValue(mockCommits);
      mockGitDataProvider.GetItemsInCommitRange.mockResolvedValue({
        commitChangesArray: [],
        commitsWithNoRelations: unlinked,
      });

      // Enable includeUnlinkedCommits on the factory
      (changeDataFactory as any)['includeUnlinkedCommits'] = true;

      await changeDataFactory.fetchChangesData();

      const rd = changeDataFactory.getRawData();
      expect(rd).toHaveLength(1);
      expect(rd[0].nonLinkedCommits).toEqual(unlinked);
    });

    it('should fetch changes for date range type', async () => {
      // Create a new factory with date range type
      const dateFrom = new Date('2023-01-01T00:00:00Z').toISOString();
      const dateTo = new Date('2023-02-01T00:00:00Z').toISOString();

      const dateFactory = new ChangeDataFactory(
        defaultParams.teamProject,
        defaultParams.repoId,
        dateFrom,
        dateTo,
        'date', // set range type to date
        defaultParams.linkTypeFilterArray,
        defaultParams.branchName,
        defaultParams.includePullRequests,
        defaultParams.attachmentWikiUrl,
        defaultParams.includeChangeDescription,
        defaultParams.includeCommittedBy,
        mockDgDataProvider,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT
      );

      const mockCommits = {
        count: 2,
        value: [
          { commitId: 'commit-123', date: '2023-01-15T00:00:00Z' },
          { commitId: 'commit-456', date: '2023-01-10T00:00:00Z' },
        ],
      };
      const mockItems = [{ id: 1, title: 'Change in date range' }];

      mockGitDataProvider.GetCommitsInDateRange.mockResolvedValue(mockCommits);
      mockGitDataProvider.GetItemsInCommitRange.mockResolvedValue({
        commitChangesArray: mockItems,
        commitsWithNoRelations: [],
      });

      await dateFactory.fetchChangesData();

      // Verify the date was adjusted to start/end of day
      const expectedFromDateStart = new Date(dateFrom);
      expectedFromDateStart.setSeconds(0);

      const expectedToDateEnd = new Date(dateTo);
      expectedToDateEnd.setSeconds(59);

      expect(mockGitDataProvider.GetCommitsInDateRange).toHaveBeenCalledWith(
        defaultParams.teamProject,
        defaultParams.repoId,
        expect.any(String), // from date adjusted
        expect.any(String), // to date adjusted
        defaultParams.branchName
      );
      expect(mockGitDataProvider.GetItemsInCommitRange).toHaveBeenCalledWith(
        defaultParams.teamProject,
        defaultParams.repoId,
        mockCommits,
        undefined,
        false
      );
    });

    it('should fetch pull request changes for date range type when includePullRequests is true', async () => {
      const dateFrom = new Date('2023-03-01T00:00:00Z').toISOString();
      const dateTo = new Date('2023-03-02T00:00:00Z').toISOString();

      const dateFactory = new ChangeDataFactory(
        defaultParams.teamProject,
        defaultParams.repoId,
        dateFrom,
        dateTo,
        'date',
        defaultParams.linkTypeFilterArray,
        defaultParams.branchName,
        true, // includePullRequests
        defaultParams.attachmentWikiUrl,
        defaultParams.includeChangeDescription,
        defaultParams.includeCommittedBy,
        mockDgDataProvider,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT
      );

      const mockCommits = {
        count: 1,
        value: [{ commitId: 'pr-base' }],
      };

      const prChanges = [{ id: 10, title: 'PR change' }];

      mockGitDataProvider.GetCommitsInDateRange.mockResolvedValue(mockCommits);
      mockGitDataProvider.GetPullRequestsInCommitRangeWithoutLinkedItems.mockResolvedValue(prChanges);

      await dateFactory.fetchChangesData();

      expect(mockGitDataProvider.GetCommitsInDateRange).toHaveBeenCalled();
      expect(mockGitDataProvider.GetPullRequestsInCommitRangeWithoutLinkedItems).toHaveBeenCalledWith(
        defaultParams.teamProject,
        defaultParams.repoId,
        mockCommits
      );

      const raw = dateFactory.getRawData();
      expect(raw).toHaveLength(1);
      expect(raw[0].changes).toEqual(prChanges);
      expect(raw[0].nonLinkedCommits).toEqual([]);
    });

    it('should handle pipeline range type', async () => {
      // Create a new factory with pipeline range type
      const pipelineFactory = new ChangeDataFactory(
        defaultParams.teamProject,
        defaultParams.repoId,
        '100', // from build ID
        '200', // to build ID
        'pipeline',
        defaultParams.linkTypeFilterArray,
        defaultParams.branchName,
        defaultParams.includePullRequests,
        defaultParams.attachmentWikiUrl,
        defaultParams.includeChangeDescription,
        defaultParams.includeCommittedBy,
        mockDgDataProvider,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT
      );

      // Setup mocks for the pipeline processing path
      const mockResourceRepositories = [
        {
          url: 'https://example.com/repo1',
          repoSha1: 'sha1-new',
          repoName: 'repo1',
        },
      ];

      const mockPreviousResourceRepositories = [
        {
          url: 'https://example.com/repo1',
          repoSha1: 'sha1-old',
          repoName: 'repo1',
        },
      ];

      const mockCommitItems = [{ id: 1, title: 'Pipeline change' }];

      mockPipelinesDataProvider.getPipelineResourceRepositoriesFromObject
        .mockResolvedValueOnce(mockPreviousResourceRepositories) // source
        .mockResolvedValueOnce(mockResourceRepositories); // target

      mockGitDataProvider.GetCommitBatch.mockResolvedValue(['commit1']);
      mockGitDataProvider.getItemsForPipelineRange.mockResolvedValue(mockCommitItems);

      await pipelineFactory.fetchChangesData();

      expect(mockPipelinesDataProvider.getPipelineBuildByBuildId).toHaveBeenCalledWith(
        defaultParams.teamProject,
        200 // to build ID
      );
      expect(mockPipelinesDataProvider.getPipelineBuildByBuildId).toHaveBeenCalledWith(
        defaultParams.teamProject,
        100 // from build ID
      );
    });

    it('should handle release range type', async () => {
      // Create a new factory with release range type
      const releaseFactory = new ChangeDataFactory(
        defaultParams.teamProject,
        defaultParams.repoId,
        '10', // from release ID
        '20', // to release ID
        'release',
        defaultParams.linkTypeFilterArray,
        defaultParams.branchName,
        defaultParams.includePullRequests,
        defaultParams.attachmentWikiUrl,
        defaultParams.includeChangeDescription,
        defaultParams.includeCommittedBy,
        mockDgDataProvider,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT
      );

      // Setup the release artifacts
      const mockFromRelease = {
        artifacts: [
          {
            type: 'Git',
            alias: 'repo1',
            definitionReference: {
              version: { id: 'commit-old', name: 'v1.0' },
              definition: { id: 'repo-id-1', name: 'repo1' },
            },
          },
        ],
        variables: {
          servicesJson: { value: 'https://repo/_git/services?path=services.json' },
          servicesJsonVersion: { value: 'master' },
          servicesJsonVersionType: { value: 'branch' },
          servicesJsonTagPrefix: { value: 'release-' },
        },
        name: '1.0.0',
      };

      const mockToRelease = {
        artifacts: [
          {
            type: 'Git',
            alias: 'repo1',
            definitionReference: {
              version: { id: 'commit-new', name: 'v2.0' },
              definition: { id: 'repo-id-1', name: 'repo1' },
            },
          },
        ],
        variables: {
          servicesJson: { value: 'https://repo/_git/services?path=services.json' },
          servicesJsonVersion: { value: 'master' },
          servicesJsonVersionType: { value: 'branch' },
          servicesJsonTagPrefix: { value: 'release-' },
        },
        name: '2.0.0',
      };

      mockPipelinesDataProvider.GetReleaseByReleaseId.mockResolvedValueOnce(
        mockFromRelease
      ).mockResolvedValueOnce(mockToRelease);

      // Mock Git repo lookup for the artifact
      mockGitDataProvider.GetGitRepoFromRepoId.mockResolvedValue({
        name: 'repo1',
        url: 'https://example.com/repo1',
      });

      // Mock commit changes for Git artifact
      const mockCommitItems = [{ id: 1, title: 'Release change' }];
      mockGitDataProvider.GetCommitBatch.mockResolvedValue(['commit1']);
      mockGitDataProvider.getItemsForPipelineRange.mockResolvedValue(mockCommitItems);

      await releaseFactory.fetchChangesData();

      expect(mockPipelinesDataProvider.GetReleaseByReleaseId).toHaveBeenCalledWith(
        defaultParams.teamProject,
        10 // from release ID
      );
      expect(mockPipelinesDataProvider.GetReleaseByReleaseId).toHaveBeenCalledWith(
        defaultParams.teamProject,
        20 // to release ID
      );
    });

    it('should handle errors during changes fetch', async () => {
      mockGitDataProvider.GetCommitsInCommitRange.mockRejectedValue(new Error('Failed to fetch commits'));

      await changeDataFactory.fetchChangesData();

      expect(logger.error).toHaveBeenCalledWith('Failed to fetch commits');
      expect(changeDataFactory.getRawData()).toEqual([]);
    });

    it('should rethrow errors when number of changes is too large', async () => {
      const factory = changeDataFactory as any;
      jest
        .spyOn(factory, 'fetchCommitShaChanges')
        .mockRejectedValue(new Error('The number of changes is too large (600)'));

      await expect(factory.fetchChangesData()).rejects.toThrow('The number of changes is too large');
    });

    it('should fetch changes for range type using getCommitRangeChanges', async () => {
      const fromObj = { ref: 'refs/heads/feature/foo', type: 'branch' } as any;
      const toObj = { ref: 'refs/tags/v1.0.0', type: 'tag' } as any;

      const rangeFactory = new ChangeDataFactory(
        defaultParams.teamProject,
        defaultParams.repoId,
        fromObj,
        toObj,
        'range',
        defaultParams.linkTypeFilterArray,
        defaultParams.branchName,
        defaultParams.includePullRequests,
        defaultParams.attachmentWikiUrl,
        defaultParams.includeChangeDescription,
        defaultParams.includeCommittedBy,
        mockDgDataProvider,
        defaultParams.attachmentsBucketName,
        defaultParams.minioEndPoint,
        defaultParams.minioAccessKey,
        defaultParams.minioSecretKey,
        defaultParams.PAT
      );

      const getRangeSpy = jest.spyOn(rangeFactory as any, 'getCommitRangeChanges').mockResolvedValue({
        allExtendedCommits: [{ id: 'c1' }],
        commitsWithNoRelations: [{ id: 'u1' }],
      });

      await rangeFactory.fetchChangesData();

      expect(getRangeSpy).toHaveBeenCalledTimes(1);
      const raw = rangeFactory.getRawData();
      expect(raw).toHaveLength(1);
      expect(raw[0].changes).toEqual([{ id: 'c1' }]);
      expect(raw[0].nonLinkedCommits).toEqual([{ id: 'u1' }]);
    });

    describe('fetchSvdData', () => {
      it('should fetch all SVD data components when available', async () => {
        // Mock the release component data
        const mockReleaseData = [{ id: 1, name: 'Component 1' }];
        mockPipelinesDataProvider.GetRecentReleaseArtifactInfo.mockResolvedValue(mockReleaseData);

        // Mock the system overview query results
        const mockSystemOverviewData = [{ id: 1, title: 'System Item 1' }];
        mockTicketsDataProvider.GetQueryResultsFromWiql.mockResolvedValueOnce(
          mockSystemOverviewData
        ).mockResolvedValueOnce([{ id: 2, title: 'Bug 1' }]);

        // Mock changes data
        const mockChangesArray = [
          {
            artifact: { name: 'Repo 1' },
            changes: [{ workItem: { id: 1, fields: {}, _links: {} } }],
            nonLinkedCommits: [],
          },
        ];
        jest.spyOn(changeDataFactory, 'fetchChangesData').mockImplementation(async () => {
          changeDataFactory['rawChangesArray'] = mockChangesArray;
        });

        await changeDataFactory.fetchSvdData();

        // Should have called all the necessary data fetch methods
        expect(mockPipelinesDataProvider.GetRecentReleaseArtifactInfo).toHaveBeenCalled();
        expect(mockTicketsDataProvider.GetQueryResultsFromWiql).toHaveBeenCalledTimes(2);
        expect(changeDataFactory.fetchChangesData).toHaveBeenCalled();

        // Should have added all the content controls
        const adoptedData = changeDataFactory.getAdoptedData();
        expect(adoptedData).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              contentControl: 'release-components-content-control',
              skin: 'release-components-skin',
            }),
            expect.objectContaining({
              contentControl: 'system-overview-content-control',
              skin: 'system-overview-skin',
            }),
            expect.objectContaining({
              contentControl: 'required-states-and-modes',
              skin: 'required-states-and-modes-skin',
            }),
            expect.objectContaining({
              contentControl: 'system-installation-content-control',
              skin: 'installation-instructions-skin',
            }),
            expect.objectContaining({
              contentControl: 'possible-problems-known-errors-content-control',
              skin: 'possible-problems-known-errors-skin',
            }),
          ])
        );
      });

      it('should handle errors during SVD fetch', async () => {
        jest
          .spyOn(changeDataFactory, 'fetchChangesData')
          .mockRejectedValue(new Error('Failed to fetch changes'));

        await expect(changeDataFactory.fetchSvdData()).rejects.toThrow('Failed to fetch changes');
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('could not fetch svd data'));
      });

      it('should skip changes and non-associated-commits when there are no raw changes', async () => {
        // No recent release artifacts
        mockPipelinesDataProvider.GetRecentReleaseArtifactInfo.mockResolvedValue([]);
        // No query results
        mockTicketsDataProvider.GetQueryResultsFromWiql.mockResolvedValue([]);

        // Do not populate rawChangesArray
        jest.spyOn(changeDataFactory, 'fetchChangesData').mockResolvedValue(undefined as any);

        await changeDataFactory.fetchSvdData();

        expect((logger as any).warn).toHaveBeenCalledWith(
          'fetchSvdData: rawChangesArray is empty, skipping changes adaptation'
        );

        const adopted = changeDataFactory.getAdoptedData();
        const hasChangesControl = adopted.some((c: any) => c.contentControl === 'required-states-and-modes');
        const hasNonAssociated = adopted.some(
          (c: any) => c.contentControl === 'non-associated-commits-content-control'
        );

        expect(hasChangesControl).toBe(false);
        expect(hasNonAssociated).toBe(false);
      });
    });

    describe('services.json helpers', () => {
      it('applyServiceReleaseGrouping should group commits by release according to reverse-tag rules', () => {
        const factory = changeDataFactory as any;

        // Simulate releases R1..R6
        factory.releasesSeq = [
          { name: 'R1', id: 1 },
          { name: 'R2', id: 2 },
          { name: 'R3', id: 3 },
          { name: 'R4', id: 4 },
          { name: 'R5', id: 5 },
          { name: 'R6', id: 6 },
        ];
        factory.releaseIndexByName.clear();
        factory.releasesBySuffix.clear();
        factory.releasesSeq.forEach((r: any, idx: number) => {
          factory.releaseIndexByName.set(r.name, idx);
          factory.releasesBySuffix.set(r.name, { name: r.name, date: undefined });
        });

        const makeCommit = (id: string, date: string) => ({
          commitId: id,
          commitDate: date,
        });

        const linked: any[] = [
          makeCommit('C2', '2025-01-01T00:00:00Z'),
          makeCommit('C4', '2025-01-02T00:00:00Z'),
          makeCommit('C6', '2025-01-03T00:00:00Z'),
          makeCommit('C7', '2025-01-04T00:00:00Z'),
          makeCommit('C8', '2025-01-05T00:00:00Z'),
          makeCommit('C11', '2025-01-06T00:00:00Z'),
        ];
        const unlinked: any[] = [
          makeCommit('C1', '2024-12-31T23:59:00Z'),
          makeCommit('C3', '2025-01-01T12:00:00Z'),
          makeCommit('C5', '2025-01-02T12:00:00Z'),
          makeCommit('C9', '2025-01-05T12:00:00Z'),
          makeCommit('C10', '2025-01-05T18:00:00Z'),
        ];

        const tagPrefix = 'test-';
        const tagMap = new Map<string, TagCommitMeta>();
        // C2->R1, C4->R2, C6->R3, C7->R6, C8->R4, C11->R5
        tagMap.set('C2', { name: 'test-R1' });
        tagMap.set('C4', { name: 'test-R2' });
        tagMap.set('C6', { name: 'test-R3' });
        tagMap.set('C7', { name: 'test-R6' });
        tagMap.set('C8', { name: 'test-R4' });
        tagMap.set('C11', { name: 'test-R5' });

        const fromRelease = { name: 'R1' };
        const toRelease = { name: 'R5' };

        factory.applyServiceReleaseGrouping(
          linked,
          unlinked,
          tagPrefix,
          fromRelease,
          toRelease,
          fromRelease,
          toRelease,
          tagMap
        );

        const find = (id: string) => [...linked, ...unlinked].find((c) => c.commitId === id);

        expect(find('C11')!.releaseVersion).toBe('R5');
        expect(find('C8')!.releaseVersion).toBe('R4');
        expect(find('C7')!.releaseVersion).toBe('R4');
        expect(find('C6')!.releaseVersion).toBe('R3');
        expect(find('C4')!.releaseVersion).toBe('R2');
        expect(find('C2')!.releaseVersion).toBe('R1');
      });

      it('filterServiceCommitsAcrossServices should drop duplicates across services for same repo+commit', () => {
        const factory = changeDataFactory as any;
        const seen = new Set<string>();
        const repo = 'repo1';

        const commits = [{ commit: { commitId: 'A' } }, { commit: { commitId: 'B' } }];

        const first = factory.filterServiceCommitsAcrossServices(commits, repo, seen);
        expect(first.map((c: any) => c.commit.commitId)).toEqual(['A', 'B']);

        const secondInput = [{ commit: { commitId: 'A' } }, { commit: { commitId: 'C' } }];
        const second = factory.filterServiceCommitsAcrossServices(secondInput, repo, seen);
        expect(second.map((c: any) => c.commit.commitId)).toEqual(['C']);
      });

      it('filterServiceCommitsAcrossServices should preserve multiple work items on the same commit', () => {
        const factory = changeDataFactory as any;
        const seen = new Set<string>();
        const repo = 'repo1';

        // Same commit with 3 different work items - should all be preserved
        const commits = [
          { commit: { commitId: 'A' }, workItem: { id: 100 } },
          { commit: { commitId: 'A' }, workItem: { id: 101 } },
          { commit: { commitId: 'A' }, workItem: { id: 102 } },
          { commit: { commitId: 'B' }, workItem: { id: 200 } },
        ];

        const result = factory.filterServiceCommitsAcrossServices(commits, repo, seen);

        // All 4 entries should be preserved because they have different work item IDs
        expect(result.length).toBe(4);
        expect(result.map((c: any) => ({ commitId: c.commit.commitId, wiId: c.workItem.id }))).toEqual([
          { commitId: 'A', wiId: 100 },
          { commitId: 'A', wiId: 101 },
          { commitId: 'A', wiId: 102 },
          { commitId: 'B', wiId: 200 },
        ]);
      });

      it('filterServiceCommitsAcrossServices should drop duplicate commit+workItem combinations across services', () => {
        const factory = changeDataFactory as any;
        const seen = new Set<string>();
        const repo = 'repo1';

        // First service has commit A with work items 100 and 101
        const firstServiceCommits = [
          { commit: { commitId: 'A' }, workItem: { id: 100 } },
          { commit: { commitId: 'A' }, workItem: { id: 101 } },
        ];

        const first = factory.filterServiceCommitsAcrossServices(firstServiceCommits, repo, seen);
        expect(first.length).toBe(2);

        // Second service has commit A with work item 100 (duplicate) and 102 (new)
        const secondServiceCommits = [
          { commit: { commitId: 'A' }, workItem: { id: 100 } }, // duplicate - should be dropped
          { commit: { commitId: 'A' }, workItem: { id: 102 } }, // new - should be kept
        ];

        const second = factory.filterServiceCommitsAcrossServices(secondServiceCommits, repo, seen);
        expect(second.length).toBe(1);
        expect(second[0].workItem.id).toBe(102);
      });
    });

    describe('jsonSkinDataAdapter', () => {
      it('should adapt release-components data', async () => {
        const mockRawData = [{ id: 1, name: 'Component 1' }];
        const mockAdaptedData = [{ title: 'Adapted Component 1' }];

        const mockAdapter = {
          jsonSkinAdapter: jest.fn().mockReturnValue(mockAdaptedData),
        };

        require('../../adapters/ReleaseComponentsDataSkinAdapter').mockImplementation(() => mockAdapter);

        const result = await changeDataFactory.jsonSkinDataAdapter('release-components', mockRawData);

        expect(mockAdapter.jsonSkinAdapter).toHaveBeenCalledWith(mockRawData);
        expect(result).toEqual(mockAdaptedData);
      });

      it("'release-range' should resolve release names and emit Version range paragraph when rangeType is release", async () => {
        const releaseFactory = new ChangeDataFactory(
          defaultParams.teamProject,
          defaultParams.repoId,
          '10',
          '20',
          'release',
          defaultParams.linkTypeFilterArray,
          defaultParams.branchName,
          defaultParams.includePullRequests,
          defaultParams.attachmentWikiUrl,
          defaultParams.includeChangeDescription,
          defaultParams.includeCommittedBy,
          mockDgDataProvider,
          defaultParams.attachmentsBucketName,
          defaultParams.minioEndPoint,
          defaultParams.minioAccessKey,
          defaultParams.minioSecretKey,
          defaultParams.PAT
        );

        const pipelines = {
          GetReleaseByReleaseId: jest
            .fn()
            .mockResolvedValueOnce({ name: '1.0.0' })
            .mockResolvedValueOnce({ name: '2.0.0' }),
        } as any;

        const result = await (releaseFactory as any).jsonSkinDataAdapter('release-range', {
          pipelinesDataProvider: pipelines,
        });

        expect(pipelines.GetReleaseByReleaseId).toHaveBeenCalledTimes(2);
        expect(result).toEqual([
          {
            name: '',
            value: 'Version\nv1.0.0 to v2.0.0',
          },
        ]);
      });

      it("'release-range' should log warning and fall back to empty value when release lookup fails", async () => {
        const releaseFactory = new ChangeDataFactory(
          defaultParams.teamProject,
          defaultParams.repoId,
          '10',
          '20',
          'release',
          defaultParams.linkTypeFilterArray,
          defaultParams.branchName,
          defaultParams.includePullRequests,
          defaultParams.attachmentWikiUrl,
          defaultParams.includeChangeDescription,
          defaultParams.includeCommittedBy,
          mockDgDataProvider,
          defaultParams.attachmentsBucketName,
          defaultParams.minioEndPoint,
          defaultParams.minioAccessKey,
          defaultParams.minioSecretKey,
          defaultParams.PAT
        );

        const pipelines = {
          GetReleaseByReleaseId: jest.fn().mockRejectedValue(new Error('boom')),
        } as any;

        const result = await (releaseFactory as any).jsonSkinDataAdapter('release-range', {
          pipelinesDataProvider: pipelines,
        });

        expect((logger as any).warn).toHaveBeenCalledWith(
          expect.stringContaining("jsonSkinDataAdapter: 'release-range' failed to resolve release names")
        );
        expect(result).toEqual([
          {
            name: '',
            value: '',
          },
        ]);
      });

      it('should adapt system-overview data', async () => {
        const mockRawData = [{ id: 1, name: 'System Item 1' }];
        const mockAdaptedData = [{ title: 'Adapted System Item 1' }];
        const mockAttachmentData = [{ attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }];

        const mockAdapter = {
          jsonSkinAdapter: jest.fn().mockResolvedValue(mockAdaptedData),
          getAttachmentMinioData: jest.fn().mockReturnValue(mockAttachmentData),
        };

        require('../../adapters/SystemOverviewDataSkinAdapter').mockImplementation(() => mockAdapter);

        const result = await changeDataFactory.jsonSkinDataAdapter('system-overview', mockRawData);

        expect(mockAdapter.jsonSkinAdapter).toHaveBeenCalledWith(mockRawData);
        expect(mockAdapter.getAttachmentMinioData).toHaveBeenCalled();
        expect(result).toEqual(mockAdaptedData);
        expect(changeDataFactory.getAttachmentMinioData()).toEqual(mockAttachmentData);
      });

      it('changes adapter should apply task parent replacement and work item filters', async () => {
        const factory = changeDataFactory as any;
        factory.replaceTaskWithParent = true;
        factory.workItemFilterOptions = {
          isEnabled: true,
          workItemTypes: ['user story'],
          workItemStates: ['active'],
        };

        const baseGroups = [
          {
            artifact: { name: 'Repo 1' },
            changes: [
              {
                workItem: {
                  fields: {
                    'System.WorkItemType': 'User Story',
                    'System.State': 'Active',
                  },
                },
              },
              {
                workItem: {
                  fields: {
                    'System.WorkItemType': 'Bug',
                    'System.State': 'Closed',
                  },
                },
              },
            ],
            nonLinkedCommits: [],
          },
        ];

        factory.rawChangesArray = baseGroups;
        const replacementSpy = jest
          .spyOn(factory, 'applyTaskParentReplacement')
          .mockResolvedValue(baseGroups);

        const result = await factory.jsonSkinDataAdapter('changes', baseGroups);

        expect(replacementSpy).toHaveBeenCalled();
        // Adapter is mocked, so we only assert that it returned whatever the mock provides
        expect(result).toBeDefined();
      });

      it('jsonSkinDataAdapter changes should adapt changes data', async () => {
        const mockRawData = [
          {
            artifact: { name: 'Repo 1' },
            changes: [{ workItem: { id: 1, fields: {}, _links: {} } }],
            nonLinkedCommits: [],
          },
        ];
        const mockAdaptedData = [{ title: 'Change 1' }];
        const mockAttachmentData = [{ attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }];

        const mockAdapter = {
          adoptSkinData: jest.fn().mockResolvedValue(undefined),
          getAdoptedData: jest.fn().mockReturnValue(mockAdaptedData),
          attachmentMinioData: mockAttachmentData,
        };

        require('../../adapters/ChangesTableDataSkinAdapter').mockImplementation(() => mockAdapter);

        changeDataFactory['rawChangesArray'] = mockRawData as any;
        const result = await changeDataFactory.jsonSkinDataAdapter('changes', mockRawData);

        expect(mockAdapter.adoptSkinData).toHaveBeenCalled();
        expect(mockAdapter.getAdoptedData).toHaveBeenCalled();
        expect(result).toEqual(mockAdaptedData);
        expect(changeDataFactory.getAttachmentMinioData()).toEqual(mockAttachmentData);
      });

      it('should handle installation-instructions data', async () => {
        const mockFileName = 'installation.md';
        const mockUrl = `https://wiki.example.com/${mockFileName}`;

        // Set up the factory with a wiki URL
        changeDataFactory.attachmentWikiUrl = mockUrl;

        const result = await changeDataFactory.jsonSkinDataAdapter('installation-instructions', []);

        expect(result).toEqual([
          expect.objectContaining({
            title: 'Installation Instructions',
            attachment: expect.objectContaining({
              attachmentFileName: mockFileName,
              attachmentMinioPath: mockUrl,
            }),
          }),
        ]);

        expect(changeDataFactory.getAttachmentMinioData()).toEqual([
          expect.objectContaining({
            attachmentMinioPath: mockUrl,
            minioFileName: mockFileName,
          }),
        ]);
      });

      it('should log a warning and skip installation-instructions when attachmentWikiUrl is missing', async () => {
        const factory = changeDataFactory as any;
        factory.attachmentWikiUrl = '';

        const result = await factory.jsonSkinDataAdapter('installation-instructions', []);

        expect(result).toBeUndefined();
        expect((logger as any).warn).toHaveBeenCalledWith(
          'No attachment wiki URL provided for installation instructions'
        );
      });

      it('should adapt possible-problems-known-errors data', async () => {
        const mockRawData = [{ id: 1, title: 'Known Bug 1' }];
        const mockAdaptedData = [{ bugTitle: 'Known Bug 1', severity: 'High' }];

        const mockAdapter = {
          adoptSkinData: jest.fn(),
          getAdoptedData: jest.fn().mockReturnValue(mockAdaptedData),
        };

        require('../../adapters/BugsTableSkinAdpater').mockImplementation(() => mockAdapter);

        const result = await changeDataFactory.jsonSkinDataAdapter(
          'possible-problems-known-errors',
          mockRawData
        );

        expect(mockAdapter.adoptSkinData).toHaveBeenCalled();
        expect(mockAdapter.getAdoptedData).toHaveBeenCalled();
        expect(result).toEqual(mockAdaptedData);
      });

      it('installation-instructions should log and swallow errors when decoding file name fails', async () => {
        const factory = changeDataFactory as any;
        // Invalid URI sequence will cause decodeURIComponent to throw
        factory.attachmentWikiUrl = 'https://wiki.example.com/%E0';

        const result = await factory.jsonSkinDataAdapter('installation-instructions', []);

        expect(result).toBeUndefined();
        expect((logger as any).error).toHaveBeenCalledWith(
          expect.stringContaining('Error processing installation instructions:')
        );
      });

      it('should handle unknown adapter type', async () => {
        const result = await changeDataFactory.jsonSkinDataAdapter('unknown-type', []);
        expect(result).toBeUndefined();
      });

      it('should handle errors in adaptation', async () => {
        const mockError = new Error('Adaptation failed');

        require('../../adapters/ReleaseComponentsDataSkinAdapter').mockImplementation(() => {
          return {
            jsonSkinAdapter: jest.fn().mockImplementation(() => {
              throw mockError;
            }),
          };
        });

        await expect(changeDataFactory.jsonSkinDataAdapter('release-components', [])).rejects.toThrow(
          'Adaptation failed'
        );

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed adapting data for type release-components')
        );
      });
    });

    describe('data retrieval methods', () => {
      beforeEach(() => {
        // Setup some test data
        changeDataFactory['rawChangesArray'] = [
          {
            artifact: { name: 'test-artifact' },
            changes: [{ workItem: { id: 1, fields: {}, _links: {} } }],
            nonLinkedCommits: [],
          },
        ];
        changeDataFactory['adoptedChangeData'] = [
          { contentControl: 'test-control', data: [{ title: 'Test' }], skin: 'test-skin' },
        ];
        changeDataFactory['attachmentMinioData'] = [
          { attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' },
        ];
      });

      it('getRawData should return raw changes array', () => {
        const result = changeDataFactory.getRawData();
        expect(result).toEqual([
          {
            artifact: { name: 'test-artifact' },
            changes: [{ workItem: { id: 1, fields: {}, _links: {} } }],
            nonLinkedCommits: [],
          },
        ]);
      });

      it('getAdoptedData should return adopted change data', () => {
        const result = changeDataFactory.getAdoptedData();
        expect(result).toEqual([
          { contentControl: 'test-control', data: [{ title: 'Test' }], skin: 'test-skin' },
        ]);
      });

      it('getAttachmentMinioData should return attachment minio data', () => {
        const result = changeDataFactory.getAttachmentMinioData();
        expect(result).toEqual([{ attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }]);
      });
    });

    describe('helper methods', () => {
      it('should remove user from Git repo URL', () => {
        const urlWithUser = 'https://user@example.com/repo';
        const urlWithoutUser = 'https://example.com/repo';
        const urlWithoutHttps = 'git@example.com:repo.git';

        // Access the private method using type assertion
        const removeUserMethod = (changeDataFactory as any).removeUserFromGitRepoUrl;

        expect(removeUserMethod(urlWithUser)).toBe(urlWithoutUser);
        expect(removeUserMethod(urlWithoutUser)).toBe(urlWithoutUser);
        expect(removeUserMethod(urlWithoutHttps)).toBe(urlWithoutHttps);
      });

      it('getReleasesBetween should return history slice when both ids are found', async () => {
        const factory = changeDataFactory as any;

        const mockHistory = {
          value: [
            { id: '5', createdOn: '2024-01-01T00:00:00Z' },
            { id: '10', createdOn: '2024-01-02T00:00:00Z' },
            { id: '20', createdOn: '2024-01-03T00:00:00Z' },
          ],
        };

        const mockPipelines = {
          GetReleaseHistory: jest.fn().mockResolvedValue(mockHistory),
        } as any;

        const fromRelease = { id: '10' };
        const toRelease = { id: '20' };

        const result = await factory.getReleasesBetween(mockPipelines, 10, 20, 123, fromRelease, toRelease);

        expect(mockPipelines.GetReleaseHistory).toHaveBeenCalledWith('TestProject', '123');
        expect(result.map((r: any) => Number(r.id))).toEqual([10, 20]);
      });

      it('getReleasesBetween should fall back to direct from/to when no definition id', async () => {
        const factory = changeDataFactory as any;

        const mockPipelines = {} as any;
        const fromRelease = { id: '30' };
        const toRelease = { id: '10' };

        const result = await factory.getReleasesBetween(mockPipelines, 30, 10, null, fromRelease, toRelease);

        expect(result.map((r: any) => Number(r.id))).toEqual([10, 30]);
      });

      it('compareConsecutiveReleases should only process adjacent pairs in consecutive mode', async () => {
        const factory = changeDataFactory as any;

        // three releases, no artifacts so inner artifact loop is skipped
        const releasesList = [
          { id: 1, artifacts: [] },
          { id: 2, artifacts: [] },
          { id: 3, artifacts: [] },
        ];

        factory.compareMode = 'consecutive';

        const debugMock = (logger as any).debug as jest.Mock;

        await factory.compareConsecutiveReleases(
          releasesList,
          mockGitDataProvider,
          mockJfrogDataProvider,
          new Map(),
          new Map()
        );

        const compareCalls = debugMock.mock.calls
          .map((args) => String(args[0]))
          .filter((msg) => msg.startsWith('Comparing releases:'));

        expect(compareCalls).toHaveLength(2);
        expect(compareCalls).toEqual(['Comparing releases: 1 -> 2', 'Comparing releases: 2 -> 3']);
      });

      it('compareConsecutiveReleases should process all i<j pairs in allPairs mode', async () => {
        const factory = changeDataFactory as any;

        const releasesList = [
          { id: 1, artifacts: [] },
          { id: 2, artifacts: [] },
          { id: 3, artifacts: [] },
        ];

        factory.compareMode = 'allPairs';

        const debugMock = (logger as any).debug as jest.Mock;

        await factory.compareConsecutiveReleases(
          releasesList,
          mockGitDataProvider,
          mockJfrogDataProvider,
          new Map(),
          new Map()
        );

        const pairSet = new Set(
          debugMock.mock.calls
            .map((args) => String(args[0]))
            .filter((msg) => msg.startsWith('Comparing releases:'))
            .map((msg) => msg.replace('Comparing releases: ', ''))
        );

        expect(pairSet).toEqual(new Set(['1 -> 2', '1 -> 3', '2 -> 3']));
      });

      it('compareConsecutiveReleases should aggregate Git artifacts into a single group with annotated commits', async () => {
        const factory = changeDataFactory as any;
        factory.compareMode = 'consecutive';

        const releasesList = [
          {
            id: 10,
            name: '1.0.0',
            createdOn: '2024-01-01T00:00:00Z',
            artifacts: [
              {
                type: 'Git',
                alias: 'repo1',
                definitionReference: {
                  definition: { id: 'repo-id-1', name: 'repo1' },
                  version: { id: 'fromCommit', name: 'v1.0.0' },
                },
              },
            ],
          },
          {
            id: 20,
            name: '2.0.0',
            createdOn: '2024-01-02T00:00:00Z',
            artifacts: [
              {
                type: 'Git',
                alias: 'repo1',
                definitionReference: {
                  definition: { id: 'repo-id-1', name: 'repo1' },
                  version: { id: 'toCommit', name: 'v2.0.0' },
                },
              },
            ],
          },
        ];

        jest.spyOn(factory, 'getCommitRangeChanges').mockResolvedValue({
          allExtendedCommits: [{ commitId: 'c1' }],
          commitsWithNoRelations: [],
        });

        jest.spyOn(factory, 'takeNewCommits').mockImplementation((_key: string, arr: any[]) => arr);

        jest.spyOn(factory, 'handleServiceJsonFile').mockResolvedValue(undefined as any);

        const artifactGroupsByKey = new Map<string, any>();
        const artifactWiSets = new Map<string, Set<number>>();

        await factory.compareConsecutiveReleases(
          releasesList,
          mockGitDataProvider,
          mockJfrogDataProvider,
          artifactGroupsByKey,
          artifactWiSets
        );

        const groups = Array.from(artifactGroupsByKey.values());
        expect(groups).toHaveLength(1);
        expect(groups[0].changes).toHaveLength(1);
        expect(groups[0].changes[0].commitId).toBe('c1');
        expect(groups[0].changes[0].releaseVersion).toBe('2.0.0');
      });

      it('buildReleasesList should hydrate missing releases using pipelinesDataProvider', async () => {
        const factory = changeDataFactory as any;

        const partialRelease = { id: '20' };
        const fullRelease = { id: '20', artifacts: [{ type: 'Git' }] };

        const releasesBetween = [{ id: '10', artifacts: [{ type: 'Git' }] }, partialRelease];

        mockPipelinesDataProvider.GetReleaseByReleaseId.mockResolvedValueOnce(fullRelease);

        const result = await factory.buildReleasesList(releasesBetween, mockPipelinesDataProvider);

        expect(result).toHaveLength(2);
        expect(result[0]).toBe(releasesBetween[0]);
        expect(result[1]).toEqual(fullRelease);
        expect(mockPipelinesDataProvider.GetReleaseByReleaseId).toHaveBeenCalledWith('TestProject', 20);
      });

      it('buildArtifactPresence should track only allowed artifact types with valid build providers', () => {
        const factory = changeDataFactory as any;

        const releasesList = [
          {
            id: 1,
            artifacts: [
              {
                type: 'Git',
                alias: 'repo1',
                definitionReference: { definition: { id: '1', name: 'repo1' } },
              },
              {
                type: 'Build',
                alias: 'build1',
                definitionReference: {
                  'repository.provider': { id: 'TfsGit' },
                  definition: { id: '2', name: 'build1' },
                },
              },
              {
                type: 'Build',
                alias: 'ignoredBuild',
                definitionReference: {
                  'repository.provider': { id: 'GitHub' },
                  definition: { id: '3', name: 'ignored' },
                },
              },
              {
                type: 'Other',
                alias: 'other',
              },
            ],
          },
          {
            id: 2,
            artifacts: [
              {
                type: 'Git',
                alias: 'repo1',
                definitionReference: { definition: { id: '1', name: 'repo1' } },
              },
            ],
          },
        ];

        const gitKey = (factory as any).buildArtifactKey(releasesList[0].artifacts[0]);
        const buildKey = (factory as any).buildArtifactKey(releasesList[0].artifacts[1]);

        const presence = factory.buildArtifactPresence(releasesList);

        expect(Array.from(presence.keys()).sort()).toEqual([buildKey, gitKey].sort());
        expect(presence.get(gitKey)!.map((e: any) => e.idx)).toEqual([0, 1]);
        expect(presence.get(buildKey)!.map((e: any) => e.idx)).toEqual([0]);
      });

      it('getServicesEligibleIndices should return indices with valid servicesJson variables', () => {
        const factory = changeDataFactory as any;

        const releasesList = [
          { id: 1, variables: {} },
          {
            id: 2,
            variables: {
              servicesJson: { value: ' url ' },
              servicesJsonVersion: { value: ' master ' },
              servicesJsonVersionType: { value: ' branch ' },
            },
          },
          {
            id: 3,
            variables: {
              servicesJson: { value: '' },
              servicesJsonVersion: { value: 'v' },
              servicesJsonVersionType: { value: 'branch' },
            },
          },
        ];

        const indices = factory.getServicesEligibleIndices(releasesList);
        expect(indices).toEqual([1]);
      });

      it('processServicesGaps should invoke handleServiceJsonFile for non-adjacent eligible releases', async () => {
        const factory = changeDataFactory as any;

        const releasesList = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const spy = jest.spyOn(factory, 'handleServiceJsonFile').mockResolvedValue(undefined as any);

        await factory.processServicesGaps([0, 2], releasesList, mockGitDataProvider);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(
          releasesList[0],
          releasesList[2],
          'TestProject',
          mockGitDataProvider
        );
      });

      it('processGap should delegate to processGitArtifactPair / processBuildArtifactPair / processArtifactoryArtifactPair', async () => {
        const factory = changeDataFactory as any;

        const gitArtifact = {
          type: 'Git',
          alias: 'repo1',
          definitionReference: {
            definition: { id: '1', name: 'repo1' },
            version: { name: 'v1' },
          },
        };
        const gitArtifactNew = {
          type: 'Git',
          alias: 'repo1',
          definitionReference: {
            definition: { id: '1', name: 'repo1' },
            version: { name: 'v2' },
          },
        };

        const buildArtifact = {
          type: 'Build',
          alias: 'build1',
          definitionReference: {
            'repository.provider': { id: 'TfsGit' },
            definition: { id: '2', name: 'build1' },
            version: { name: 'b1' },
          },
        };
        const buildArtifactNew = {
          type: 'Build',
          alias: 'build1',
          definitionReference: {
            'repository.provider': { id: 'TfsGit' },
            definition: { id: '2', name: 'build1' },
            version: { name: 'b2' },
          },
        };

        const artArtifact = {
          type: 'Artifactory',
          alias: 'art1',
          definitionReference: {
            connection: { id: 'conn1' },
            definition: { name: 'build-art', id: '3' },
            version: { name: '1.0.0' },
          },
        };
        const artArtifactNew = {
          type: 'Artifactory',
          alias: 'art1',
          definitionReference: {
            connection: { id: 'conn1' },
            definition: { name: 'build-art', id: '3' },
            version: { name: '2.0.0' },
          },
        };

        const releasesList = [
          { id: 1, name: 'r1', artifacts: [gitArtifact, buildArtifact, artArtifact] },
          { id: 2, name: 'r2', artifacts: [gitArtifactNew, buildArtifactNew, artArtifactNew] },
        ];

        const keyGit = (factory as any).buildArtifactKey(gitArtifactNew);
        const keyBuild = (factory as any).buildArtifactKey(buildArtifactNew);
        const keyArt = (factory as any).buildArtifactKey(artArtifactNew);

        const artifactGroupsByKey = new Map();
        const artifactWiSets = new Map();

        const gitSpy = jest.spyOn(factory, 'processGitArtifactPair').mockResolvedValue(undefined as any);
        const buildSpy = jest.spyOn(factory, 'processBuildArtifactPair').mockResolvedValue(undefined as any);
        const artSpy = jest
          .spyOn(factory, 'processArtifactoryArtifactPair')
          .mockResolvedValue(undefined as any);

        await factory.processGap(
          0,
          1,
          keyGit,
          releasesList,
          artifactGroupsByKey,
          artifactWiSets,
          mockGitDataProvider,
          mockJfrogDataProvider
        );
        await factory.processGap(
          0,
          1,
          keyBuild,
          releasesList,
          artifactGroupsByKey,
          artifactWiSets,
          mockGitDataProvider,
          mockJfrogDataProvider
        );
        await factory.processGap(
          0,
          1,
          keyArt,
          releasesList,
          artifactGroupsByKey,
          artifactWiSets,
          mockGitDataProvider,
          mockJfrogDataProvider
        );

        expect(gitSpy).toHaveBeenCalledTimes(1);
        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(artSpy).toHaveBeenCalledTimes(1);
      });

      it('getArtifactDisplayName should format names based on artifact type', () => {
        const factory = changeDataFactory as any;

        const gitArt = {
          type: 'Git',
          definitionReference: { definition: { name: 'repo1' } },
        };
        const buildArt = {
          type: 'Build',
          definitionReference: { definition: { name: 'pipe1' } },
        };
        const artifactoryArt = {
          type: 'Artifactory',
          definitionReference: { definition: { name: 'bundle1' } },
        };
        const otherArt = { type: 'Other', alias: 'x' };

        expect(factory.getArtifactDisplayName('Git', gitArt)).toBe('Repository repo1');
        expect(factory.getArtifactDisplayName('Build', buildArt)).toBe('Pipeline pipe1');
        expect(factory.getArtifactDisplayName('Artifactory', artifactoryArt)).toBe('Artifactory bundle1');
        expect(factory.getArtifactDisplayName('Other', otherArt)).toBe('x');
      });

      it('getCachedJfrogCiUrl should cache provider results by key', async () => {
        const factory = changeDataFactory as any;

        const provider = {
          getCiDataFromJfrog: jest.fn().mockResolvedValue('https://ci.example/_build?buildId=1'),
        };

        const url1 = await factory.getCachedJfrogCiUrl(provider, 'https://jfrog', 'build1', '1.0.0');
        const url2 = await factory.getCachedJfrogCiUrl(provider, 'https://jfrog', 'build1', '1.0.0');

        expect(url1).toBe('https://ci.example/_build?buildId=1');
        expect(url2).toBe('https://ci.example/_build?buildId=1');
        expect(provider.getCiDataFromJfrog).toHaveBeenCalledTimes(1);
      });

      it('getCachedJfrogCiUrl should cache empty URL results as empty string', async () => {
        const factory = changeDataFactory as any;

        const provider = {
          getCiDataFromJfrog: jest.fn().mockResolvedValue(''),
        };

        const url1 = await factory.getCachedJfrogCiUrl(provider, 'https://jfrog', 'build2', '2.0.0');
        const url2 = await factory.getCachedJfrogCiUrl(provider, 'https://jfrog', 'build2', '2.0.0');

        expect(url1).toBe('');
        expect(url2).toBe('');
        expect(provider.getCiDataFromJfrog).toHaveBeenCalledTimes(1);
      });

      it('fetchAndParseServicesJson should return parsed JSON when file exists', async () => {
        const factory = changeDataFactory as any;

        const provider = {
          GetFileFromGitRepo: jest.fn().mockResolvedValue('{"services":[]}'),
        };

        const result = await factory.fetchAndParseServicesJson(
          provider,
          'proj',
          'repo',
          'services.json',
          'master',
          'branch',
          'https://api',
          'originalPath'
        );

        expect(provider.GetFileFromGitRepo).toHaveBeenCalled();
        expect(result).toEqual({ services: [] });
      });

      it('fetchAndParseServicesJson should warn and return null when file is missing', async () => {
        const factory = changeDataFactory as any;

        const provider = {
          GetFileFromGitRepo: jest.fn().mockResolvedValue(null),
        };

        const result = await factory.fetchAndParseServicesJson(
          provider,
          'proj',
          'repo',
          'services.json',
          'master',
          'branch',
          'https://api',
          'originalPath'
        );

        expect(result).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith('file originalPath could not be fetched');
      });

      it('getCachedBranchExists should cache branch existence lookups', async () => {
        const factory = changeDataFactory as any;

        const provider = {
          GetBranch: jest.fn().mockResolvedValue({ value: [{}], count: 1 }),
        };

        const repoApiUrl = 'https://example.com/_apis/git/repositories/repo';
        const branch = 'refs/heads/main';

        const first = await factory.getCachedBranchExists(provider, repoApiUrl, branch);
        const second = await factory.getCachedBranchExists(provider, repoApiUrl, branch);

        expect(first).toBe(true);
        expect(second).toBe(true);
        expect(provider.GetBranch).toHaveBeenCalledTimes(1);
      });

      it('getCachedBranchExists should return false when branch is missing and cache the result', async () => {
        const factory = changeDataFactory as any;

        const provider = {
          GetBranch: jest.fn().mockResolvedValue({ value: [], count: 0 }),
        };

        const repoApiUrl = 'https://example.com/_apis/git/repositories/repo';
        const branch = 'refs/heads/feature';

        const first = await factory.getCachedBranchExists(provider, repoApiUrl, branch);
        const second = await factory.getCachedBranchExists(provider, repoApiUrl, branch);

        expect(first).toBe(false);
        expect(second).toBe(false);
        expect(provider.GetBranch).toHaveBeenCalledTimes(1);
      });

      it('takeNewCommits should deduplicate by commit id across calls', () => {
        const factory = changeDataFactory as any;

        const key = 'Git|1|alias';
        const commits = [{ commitId: 'c1' }, { commit: { commitId: 'c2' } }, { commitId: 'c1' }];

        const first = factory.takeNewCommits(key, commits);
        const second = factory.takeNewCommits(key, commits);

        const extractIds = (arr: any[]) => arr.map((c) => (c.commitId ? c.commitId : c.commit?.commitId));

        expect(extractIds(first)).toEqual(['c1', 'c2']);
        expect(extractIds(second)).toEqual([]);
      });

      it('parseServicesJsonLocation should extract repo, file name and API URL', () => {
        const factory = changeDataFactory as any;

        const url = 'https://server/org/project/_git/services?path=folder/services.json';
        const result = factory.parseServicesJsonLocation(url);

        expect(result.servicesJsonFileGitPath).toBe(url);
        expect(result.servicesJsonFileName).toBe('folder/services.json');
        expect(result.servicesJsonFileGitRepoName).toBe('services');
        expect(result.servicesJsonFileGitRepoApiUrl).toBe(
          'https://server/org/project/_apis/git/repositories/services'
        );
      });

      it('processGitArtifactPair should reuse cached comparison results on subsequent calls', async () => {
        const factory = changeDataFactory as any;

        const fromRelease = { id: 1 };
        const toRelease = { id: 2, name: '2.0.0', createdOn: '2024-01-02T00:00:00Z' };
        const fromRelArt = {
          definitionReference: {
            definition: { id: '1', name: 'repo1' },
            version: { id: 'fromCommit', name: 'v1' },
          },
        };
        const toRelArt = {
          definitionReference: {
            definition: { id: '1', name: 'repo1' },
            version: { id: 'toCommit', name: 'v2' },
          },
        };
        const artifact = {
          type: 'Git',
          alias: 'repo1',
          definitionReference: {
            definition: { id: '1', name: 'repo1' },
            version: { id: 'toCommit', name: 'v2' },
          },
        };

        const key = (factory as any).buildArtifactKey(artifact);
        const artifactDisplayName = factory.getArtifactDisplayName('Git', artifact);

        const artifactGroupsByKey = new Map();
        const artifactWiSets = new Map();

        // First call populates cache
        await factory.processGitArtifactPair(
          key,
          'repo1',
          artifactDisplayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          '2.0.0',
          toRelease.createdOn,
          mockGitDataProvider,
          artifactGroupsByKey,
          artifactWiSets
        );

        const getRangeSpy = jest.spyOn(factory, 'getCommitRangeChanges');

        // Second call should hit cached branch and not invoke getCommitRangeChanges
        await factory.processGitArtifactPair(
          key,
          'repo1',
          artifactDisplayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          '2.0.0',
          toRelease.createdOn,
          mockGitDataProvider,
          artifactGroupsByKey,
          artifactWiSets
        );

        expect(getRangeSpy).not.toHaveBeenCalled();
      });

      it('processBuildArtifactPair should aggregate build changes into groups', async () => {
        const factory = changeDataFactory as any;

        const fromRelease = { id: 1 };
        const toRelease = { id: 2, name: '2.0.0', createdOn: '2024-01-02T00:00:00Z' };
        const fromRelArt = {
          definitionReference: {
            definition: { id: '2', name: 'build1' },
            version: { id: 'b1', name: 'b1' },
          },
        };
        const toRelArt = {
          definitionReference: {
            definition: { id: '2', name: 'build1' },
            version: { id: 'b2', name: 'b2' },
          },
        };
        const artifact = {
          type: 'Build',
          alias: 'build1',
          definitionReference: fromRelArt.definitionReference,
        };

        const key = (factory as any).buildArtifactKey(artifact);
        const displayName = factory.getArtifactDisplayName('Build', artifact);
        const artifactGroupsByKey = new Map();

        await factory.processBuildArtifactPair(
          key,
          'build1',
          displayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          '2.0.0',
          toRelease.createdOn,
          mockGitDataProvider,
          artifactGroupsByKey
        );

        const groups = Array.from(artifactGroupsByKey.values());
        expect(groups.length).toBe(1);
        // We don't assert exact contents because they depend on underlying pipeline mocks,
        // but we do verify structure is present.
        expect(groups[0].artifact.name).toBe(displayName);
      });

      it('processBuildArtifactPair should reuse cached comparison results and annotate commits', async () => {
        const factory = changeDataFactory as any;

        const fromRelease = { id: 1 };
        const toRelease = { id: 2, name: '2.0.0', createdOn: '2024-01-02T00:00:00Z' };
        const fromRelArt = {
          definitionReference: {
            definition: { id: '2', name: 'build1' },
            version: { id: 'b1', name: 'b1' },
          },
        };
        const toRelArt = {
          definitionReference: {
            definition: { id: '2', name: 'build1' },
            version: { id: 'b2', name: 'b2' },
          },
        };
        const artifact = {
          type: 'Build',
          alias: 'build1',
          definitionReference: fromRelArt.definitionReference,
        };

        const key = (factory as any).buildArtifactKey(artifact);
        const displayName = factory.getArtifactDisplayName('Build', artifact);

        const buildCacheKey = `${key}|Build|${defaultParams.teamProject}|${fromRelArt.definitionReference['version'].id}->${toRelArt.definitionReference['version'].id}`;
        (factory as any).pairCompareCache.set(buildCacheKey, {
          linked: [{ commitId: 'c1' }],
          unlinked: [{ commitId: 'u1' }],
        });

        const artifactGroupsByKey = new Map();

        await factory.processBuildArtifactPair(
          key,
          'build1',
          displayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          '2.0.0',
          toRelease.createdOn,
          mockGitDataProvider,
          artifactGroupsByKey
        );

        const groups = Array.from(artifactGroupsByKey.values());
        expect(groups.length).toBe(1);
        const group = groups[0];
        expect(group.artifact.name).toBe(displayName);
        expect(group.changes[0].commitId).toBe('c1');
        expect(group.changes[0].releaseVersion).toBe('2.0.0');
        expect(group.nonLinkedCommits[0].commitId).toBe('u1');
        expect(group.nonLinkedCommits[0].releaseRunDate).toBe(toRelease.createdOn);
      });

      it('processArtifactoryArtifactPair should aggregate JFrog changes into groups', async () => {
        const factory = changeDataFactory as any;

        const fromRelease = { id: 1 };
        const toRelease = { id: 2, name: '2.0.0', createdOn: '2024-01-02T00:00:00Z' };
        const fromRelArt = {
          definitionReference: {
            connection: { id: 'conn1' },
            definition: { name: 'build-art', id: '3' },
            version: { name: '1.0.0' },
          },
        };
        const toRelArt = {
          definitionReference: {
            connection: { id: 'conn1' },
            definition: { name: 'build-art', id: '3' },
            version: { name: '2.0.0' },
          },
        };
        const artifact = {
          type: 'Artifactory',
          alias: 'art1',
          definitionReference: fromRelArt.definitionReference,
        };

        const key = (factory as any).buildArtifactKey(artifact);
        const displayName = factory.getArtifactDisplayName('Artifactory', artifact);
        const artifactGroupsByKey = new Map();

        await factory.processArtifactoryArtifactPair(
          key,
          'art1',
          displayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          '2.0.0',
          toRelease.createdOn,
          mockJfrogDataProvider,
          artifactGroupsByKey
        );

        const groups = Array.from(artifactGroupsByKey.values());
        expect(groups.length).toBe(1);
        expect(groups[0].artifact.name).toBe(displayName);
      });

      it('processArtifactoryArtifactPair should reuse cached comparison results and annotate commits', async () => {
        const factory = changeDataFactory as any;

        const fromRelease = { id: 1 };
        const toRelease = { id: 2, name: '2.0.0', createdOn: '2024-01-02T00:00:00Z' };
        const fromRelArt = {
          definitionReference: {
            connection: { id: 'conn1' },
            definition: { name: 'build-art', id: '3' },
            version: { name: '1.0.0' },
          },
        };
        const toRelArt = {
          definitionReference: {
            connection: { id: 'conn1' },
            definition: { name: 'build-art', id: '3' },
            version: { name: '2.0.0' },
          },
        };
        const artifact = {
          type: 'Artifactory',
          alias: 'art1',
          definitionReference: fromRelArt.definitionReference,
        };

        const key = (factory as any).buildArtifactKey(artifact);
        const displayName = factory.getArtifactDisplayName('Artifactory', artifact);

        // Force getCachedJfrogCiUrl to return pipeline-style URLs so the 'pipeline' uploader branch is exercised
        const toCiUrl = 'https://server/tp/_build?buildId=200';
        const fromCiUrl = 'https://server/tp/_build?buildId=100';
        jest
          .spyOn(factory, 'getCachedJfrogCiUrl')
          .mockImplementationOnce(async () => toCiUrl)
          .mockImplementationOnce(async () => fromCiUrl);

        // Pre-populate pairCompareCache so the cached branch is used
        const jfrogCacheKey = `${key}|JFrog|tp|100->200`;
        (factory as any).pairCompareCache.set(jfrogCacheKey, {
          linked: [{ commitId: 'c1' }],
          unlinked: [{ commitId: 'u1' }],
        });

        const artifactGroupsByKey = new Map();

        await factory.processArtifactoryArtifactPair(
          key,
          'art1',
          displayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          '2.0.0',
          toRelease.createdOn,
          mockJfrogDataProvider,
          artifactGroupsByKey
        );

        const groups = Array.from(artifactGroupsByKey.values());
        expect(groups.length).toBe(1);
        const group = groups[0];
        expect(group.artifact.name).toBe(displayName);
        expect(group.changes[0].commitId).toBe('c1');
        expect(group.changes[0].releaseVersion).toBe('2.0.0');
        expect(group.nonLinkedCommits[0].commitId).toBe('u1');
        expect(group.nonLinkedCommits[0].releaseRunDate).toBe(toRelease.createdOn);
      });

      it('GetPipelineChanges should log error when target build has not succeeded and requestedByBuild is false', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        const pipelines = {
          getPipelineBuildByBuildId: jest.fn().mockResolvedValue({
            id: 200,
            result: 'failed',
            definition: { id: 1 },
          }),
        } as any;

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
        expect((logger as any).error).toHaveBeenCalledWith(
          expect.stringContaining('could not handle pipeline The selected 200 build has not been succeeded')
        );
      });

      it('GetPipelineChanges should log error when target build is canceled and requestedByBuild is true', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = true;

        const pipelines = {
          getPipelineBuildByBuildId: jest.fn().mockResolvedValue({
            id: 200,
            result: 'canceled',
            definition: { id: 1 },
          }),
        } as any;

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
        expect((logger as any).error).toHaveBeenCalledWith(
          expect.stringContaining('could not handle pipeline The selected 200 build has canceled')
        );
      });

      it('GetPipelineChanges should recurse for matching TfsGit resource pipelines and then terminate', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        const pipelines: any = {
          getPipelineBuildByBuildId: jest.fn().mockImplementation((_tp: string, id: number) => ({
            id,
            result: 'succeeded',
            definition: { id: 10 },
          })),
          findPreviousPipeline: jest.fn(),
          getPipelineRunDetails: jest.fn().mockResolvedValue({}),
          getPipelineResourcePipelinesFromObject: jest
            .fn()
            // Top-level: source and target resource pipelines
            .mockResolvedValueOnce([
              {
                buildId: 250,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '250',
                name: 'ResPipe',
                provider: 'TfsGit',
              },
            ])
            .mockResolvedValueOnce([
              {
                buildId: 300,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '300',
                name: 'ResPipe',
                provider: 'TfsGit',
              },
            ])
            // Recursive call: no further resource pipelines
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
          getPipelineResourceRepositoriesFromObject: jest.fn().mockResolvedValue([]),
        };

        const spy = jest.spyOn(factory, 'GetPipelineChanges');

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        // One top-level call + one recursive call
        expect(spy).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
      });

      it('GetPipelineChanges should guard against cyclic self-referencing pipeline resources', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        const pipelines: any = {
          getPipelineBuildByBuildId: jest.fn().mockImplementation((_tp: string, id: number) => ({
            id,
            result: 'succeeded',
            // Always resolve to the same pipeline definition id so the cycle key is stable
            definition: { id: 10 },
          })),
          findPreviousPipeline: jest.fn(),
          getPipelineRunDetails: jest.fn().mockResolvedValue({}),
          getPipelineResourcePipelinesFromObject: jest
            .fn()
            // Source run resources: points to the same pipeline definition (self)
            .mockResolvedValueOnce([
              {
                buildId: 100,
                definitionId: 10,
                teamProject: defaultParams.teamProject,
                buildNumber: '100',
                name: 'Self',
                provider: 'TfsGit',
              },
            ])
            // Target run resources: also points to self (this would recurse back to the same target run)
            .mockResolvedValueOnce([
              {
                buildId: 200,
                definitionId: 10,
                teamProject: defaultParams.teamProject,
                buildNumber: '200',
                name: 'Self',
                provider: 'TfsGit',
              },
            ]),
          getPipelineResourceRepositoriesFromObject: jest.fn().mockResolvedValue([]),
        };

        const spy = jest.spyOn(factory, 'GetPipelineChanges');

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        // One top-level call + one recursive call that terminates early due to cycle guard
        expect(spy).toHaveBeenCalledTimes(2);
        // getPipelineRunDetails should be called only for the top-level target + source runs.
        expect(pipelines.getPipelineRunDetails).toHaveBeenCalledTimes(2);
        expect((logger as any).warn).toHaveBeenCalledWith(
          expect.stringContaining('Detected cyclic pipeline resource dependency')
        );
        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
      });

      it('GetPipelineChanges should skip resource pipelines that are not TfsGit', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        const pipelines: any = {
          getPipelineBuildByBuildId: jest.fn().mockImplementation((_tp: string, id: number) => ({
            id,
            result: 'succeeded',
            definition: { id: 10 },
          })),
          findPreviousPipeline: jest.fn(),
          getPipelineRunDetails: jest.fn().mockResolvedValue({}),
          getPipelineResourcePipelinesFromObject: jest
            .fn()
            // sourcePipelineResourcePipelines (unused by this branch)
            .mockResolvedValueOnce([])
            // targetPipelineResourcePipelines contains a non-TfsGit provider
            .mockResolvedValueOnce([
              {
                buildId: 250,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '250',
                name: 'ResPipe',
                provider: 'GitHub',
              },
            ]),
          getPipelineResourceRepositoriesFromObject: jest.fn().mockResolvedValue([]),
        };

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
        expect((logger as any).debug).toHaveBeenCalledWith(
          expect.stringContaining('resource pipeline GitHub is not based on azure devops git, skipping')
        );
      });

      it('GetPipelineChanges should recurse even when resource aliases differ (match by definitionId)', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        const pipelines: any = {
          getPipelineBuildByBuildId: jest.fn().mockImplementation((_tp: string, id: number) => {
            const definitionId = id === 250 || id === 300 ? 99 : 10;
            return {
              id,
              result: 'succeeded',
              definition: { id: definitionId },
            };
          }),
          findPreviousPipeline: jest.fn(),
          getPipelineRunDetails: jest.fn().mockResolvedValue({}),
          getPipelineResourcePipelinesFromObject: jest
            .fn()
            // sourcePipelineResourcePipelines (alias differs)
            .mockResolvedValueOnce([
              {
                buildId: 250,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '250',
                name: 'SourceRes',
                provider: 'TfsGit',
              },
            ])
            // targetPipelineResourcePipelines (alias differs)
            .mockResolvedValueOnce([
              {
                buildId: 300,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '300',
                name: 'TargetRes',
                provider: 'TfsGit',
              },
            ])
            // Recursive call: no further resource pipelines
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
          getPipelineResourceRepositoriesFromObject: jest.fn().mockResolvedValue([]),
        };

        const spy = jest.spyOn(factory, 'GetPipelineChanges');

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        // One top-level call + one recursive call
        expect(spy).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
      });

      it('GetPipelineChanges should include work items from nested pipeline repository resources', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        // Mock commit->work item resolution for the nested repo diff
        mockGitDataProvider.GetCommitBatch.mockResolvedValue([{ commitId: 'c1' }]);
        mockGitDataProvider.getItemsForPipelineRange.mockResolvedValue({
          commitChangesArray: [
            {
              commit: { commitId: 'c1' },
              workItem: { id: 123, fields: {}, _links: {} },
            },
          ],
          commitsWithNoRelations: [],
        });

        const pipelines: any = {
          getPipelineBuildByBuildId: jest.fn().mockImplementation((_tp: string, id: number) => {
            // Top-level pipeline builds (100/200) belong to definition 10.
            // Nested resource pipeline builds (250/300) belong to definition 99.
            const definitionId = id === 250 || id === 300 ? 99 : 10;
            return {
              id,
              result: 'succeeded',
              definition: { id: definitionId },
            };
          }),
          findPreviousPipeline: jest.fn(),
          getPipelineRunDetails: jest.fn().mockImplementation((tp: string, pid: number, rid: number) => ({
            id: rid,
            url: `https://dev.azure.com/org/${tp}/_apis/pipelines/${pid}/runs/${rid}`,
            resources: {},
          })),
          getPipelineResourcePipelinesFromObject: jest
            .fn()
            // Top-level: source run then target run include a nested resource pipeline (definition 99)
            .mockResolvedValueOnce([
              {
                buildId: 250,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '250',
                name: 'Test2',
                provider: 'TfsGit',
              },
            ])
            .mockResolvedValueOnce([
              {
                buildId: 300,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '300',
                name: 'Test2',
                provider: 'TfsGit',
              },
            ])
            // Recursive call (nested pipeline): no further nested pipelines
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
          getPipelineResourceRepositoriesFromObject: jest.fn().mockImplementation((run: any) => {
            // Only the nested pipeline runs (250/300) contain repository resources
            if (run?.id === 250) {
              return [
                {
                  repoName: 'NestedRepo',
                  repoSha1: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  url: 'https://dev.azure.com/org/project/_git/NestedRepo',
                },
              ];
            }
            if (run?.id === 300) {
              return [
                {
                  repoName: 'NestedRepo',
                  repoSha1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                  url: 'https://dev.azure.com/org/project/_git/NestedRepo',
                },
              ];
            }
            return [];
          }),
        };

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        expect(result.artifactChanges.length).toBe(1);
        expect(result.artifactChanges[0].workItem.id).toBe(123);
      });

      it('GetPipelineChanges should include newly-added resource pipelines by diffing against their previous run', async () => {
        const factory = changeDataFactory as any;
        factory.requestedByBuild = false;

        const pipelines: any = {
          getPipelineBuildByBuildId: jest.fn().mockImplementation((_tp: string, id: number) => {
            const definitionId = id === 250 || id === 300 ? 99 : 10;
            return {
              id,
              result: 'succeeded',
              definition: { id: definitionId },
            };
          }),
          findPreviousPipeline: jest.fn().mockResolvedValue(250),
          getPipelineRunDetails: jest.fn().mockResolvedValue({}),
          getPipelineResourcePipelinesFromObject: jest
            .fn()
            // deploy source run: no resource pipelines
            .mockResolvedValueOnce([])
            // deploy target run: one new resource pipeline
            .mockResolvedValueOnce([
              {
                buildId: 300,
                definitionId: 99,
                teamProject: defaultParams.teamProject,
                buildNumber: '1.0.56',
                name: 'SOME_PACKAGE',
                provider: 'TfsGit',
              },
            ])
            // recursive call: no further resource pipelines
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
          getPipelineResourceRepositoriesFromObject: jest.fn().mockResolvedValue([]),
        };

        const spy = jest.spyOn(factory, 'GetPipelineChanges');

        const result = await factory.GetPipelineChanges(
          pipelines,
          mockGitDataProvider,
          defaultParams.teamProject,
          200,
          100
        );

        expect(result).toEqual({ artifactChanges: [], artifactChangesNoLink: [] });
        // One top-level call + one recursive call for the added resource pipeline
        expect(spy).toHaveBeenCalledTimes(2);
        expect(pipelines.findPreviousPipeline).toHaveBeenCalledWith(
          defaultParams.teamProject,
          '99',
          300,
          expect.anything(),
          true
        );
      });

      it('parseSubModules should log errors and return empty arrays when getSubmodulesData fails', async () => {
        const factory = changeDataFactory as any;

        const failingGitProvider = {
          getSubmodulesData: jest.fn().mockRejectedValue(new Error('submodule boom')),
        } as any;

        const result = await factory.parseSubModules(
          failingGitProvider,
          defaultParams.teamProject,
          'repo',
          'toCommit',
          'fromCommit',
          'commit',
          'commit',
          [],
          new Set<number>(),
          '',
          undefined
        );

        expect(result).toEqual({ commitsWithRelatedWi: [], commitsWithNoRelations: [] });
        expect((logger as any).error).toHaveBeenCalledWith(
          expect.stringContaining('could not handle submodules submodule boom')
        );
      });

      it('getCommitRangeChanges should aggregate direct and submodule commits', async () => {
        const factory = changeDataFactory as any;

        const gitProvider: any = {
          GetCommitBatch: jest.fn().mockResolvedValue([{ id: 'ext1' }]),
          getItemsForPipelineRange: jest.fn().mockResolvedValue({
            commitChangesArray: [{ id: 'linked-main' }],
            commitsWithNoRelations: [{ id: 'unlinked-main' }],
          }),
        };

        jest.spyOn(factory, 'parseSubModules').mockResolvedValue({
          commitsWithRelatedWi: [{ id: 'linked-sub' }],
          commitsWithNoRelations: [{ id: 'unlinked-sub' }],
        });

        const result = await factory.getCommitRangeChanges(
          gitProvider,
          defaultParams.teamProject,
          'fromSha',
          'commit',
          'toSha',
          'commit',
          'repoName',
          'https://server/org/project/_git/repo',
          new Set<number>(),
          'subModule',
          '/path',
          factory.linkedWiOptions
        );

        expect(gitProvider.GetCommitBatch).toHaveBeenCalledWith(
          'https://server/org/project/_apis/git/repositories/repo',
          { version: 'fromSha', versionType: 'commit' },
          { version: 'toSha', versionType: 'commit' },
          '/path'
        );
        expect(gitProvider.getItemsForPipelineRange).toHaveBeenCalled();
        expect(result.allExtendedCommits.map((c: any) => c.id)).toEqual(['linked-main', 'linked-sub']);
        expect(result.commitsWithNoRelations.map((c: any) => c.id)).toEqual([
          'unlinked-main',
          'unlinked-sub',
        ]);
      });

      it('getCommitRangeChanges should log and rethrow when GetCommitBatch fails', async () => {
        const factory = changeDataFactory as any;

        const gitProvider: any = {
          GetCommitBatch: jest.fn().mockRejectedValue(new Error('batch failed')),
        };

        await expect(
          factory.getCommitRangeChanges(
            gitProvider,
            defaultParams.teamProject,
            'from',
            'commit',
            'to',
            'commit',
            'repo',
            'https://server/org/project/_git/repo',
            new Set<number>()
          )
        ).rejects.toThrow('batch failed');

        expect((logger as any).error).toHaveBeenCalledWith(
          expect.stringContaining('Cannot get commits for commit range repo')
        );
      });

      it('applyTaskParentReplacement should replace Task work items with Requirement parents and deduplicate by parent id', async () => {
        const factory = changeDataFactory as any;

        // Ensure tickets data provider has GetWorkItemByUrl
        mockTicketsDataProvider.GetWorkItemByUrl = jest.fn().mockResolvedValue({
          id: 201,
          fields: { 'System.WorkItemType': 'Requirement' },
        });

        const rawGroups = [
          {
            artifact: { name: 'Repo' },
            changes: [
              // Non-task change should be preserved as-is
              {
                workItem: {
                  id: 'USR1',
                  fields: { 'System.WorkItemType': 'User Story' },
                },
                commit: { committer: { date: '2024-01-01T00:00:00Z' } },
              },
              // Two Task changes pointing to same parent; later commit should win
              {
                workItem: {
                  id: 101,
                  fields: { 'System.WorkItemType': 'Task' },
                  relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'http://wi/parent1' }],
                },
                commit: { committer: { date: '2024-01-01T01:00:00Z' } },
              },
              {
                workItem: {
                  id: 102,
                  fields: { 'System.WorkItemType': 'Task' },
                  relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'http://wi/parent1' }],
                },
                commit: { committer: { date: '2024-01-01T02:00:00Z' } },
              },
            ],
          },
        ];

        const result = await factory.applyTaskParentReplacement(rawGroups);

        expect(result).toHaveLength(1);
        const changes = result[0].changes;
        // One original non-task + one Requirement parent entry
        expect(changes.length).toBe(2);

        const parentChange = changes.find((c: any) => c.workItem && c.workItem.id === 201);
        expect(parentChange).toBeDefined();
        // Should have been replaced from the Task with the later commit timestamp (id 102)
        expect(parentChange.replacedFromTaskId).toBe(102);
        // Ensure no remaining Task-type work items
        expect(
          changes.some(
            (c: any) =>
              c.workItem?.fields?.['System.WorkItemType'] &&
              c.workItem.fields['System.WorkItemType'] === 'Task'
          )
        ).toBe(false);
      });

      it('applyTaskParentReplacement should replace Task work items with Change Request parents and deduplicate by parent id', async () => {
        const factory = changeDataFactory as any;

        // Ensure tickets data provider has GetWorkItemByUrl returning a Change Request parent
        mockTicketsDataProvider.GetWorkItemByUrl = jest.fn().mockResolvedValue({
          id: 301,
          fields: { 'System.WorkItemType': 'Change Request' },
        });

        const rawGroups = [
          {
            artifact: { name: 'Repo' },
            changes: [
              // Non-task change should be preserved as-is
              {
                workItem: {
                  id: 'BUG1',
                  fields: { 'System.WorkItemType': 'Bug' },
                },
                commit: { committer: { date: '2024-02-01T00:00:00Z' } },
              },
              // Two Task changes pointing to same Change Request parent; later commit should win
              {
                workItem: {
                  id: 201,
                  fields: { 'System.WorkItemType': 'Task' },
                  relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'http://wi/cr-parent' }],
                },
                commit: { committer: { date: '2024-02-01T01:00:00Z' } },
              },
              {
                workItem: {
                  id: 202,
                  fields: { 'System.WorkItemType': 'Task' },
                  relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'http://wi/cr-parent' }],
                },
                commit: { committer: { date: '2024-02-01T02:00:00Z' } },
              },
            ],
          },
        ];

        const result = await factory.applyTaskParentReplacement(rawGroups);

        expect(result).toHaveLength(1);
        const changes = result[0].changes;
        // One original non-task + one Change Request parent entry
        expect(changes.length).toBe(2);

        const parentChange = changes.find((c: any) => c.workItem && c.workItem.id === 301);
        expect(parentChange).toBeDefined();
        // Should have been replaced from the Task with the later commit timestamp (id 202)
        expect(parentChange.replacedFromTaskId).toBe(202);
        // Ensure no remaining Task-type work items
        expect(
          changes.some(
            (c: any) =>
              c.workItem?.fields?.['System.WorkItemType'] &&
              c.workItem.fields['System.WorkItemType'] === 'Task'
          )
        ).toBe(false);
      });

      it('applyTaskParentReplacement should drop Task work items whose parent type is not Requirement or Change Request', async () => {
        const factory = changeDataFactory as any;

        mockTicketsDataProvider.GetWorkItemByUrl = jest.fn().mockResolvedValue({
          id: 401,
          fields: { 'System.WorkItemType': 'Bug' },
        });

        const rawGroups = [
          {
            artifact: { name: 'Repo' },
            changes: [
              {
                workItem: {
                  id: 'USR2',
                  fields: { 'System.WorkItemType': 'User Story' },
                },
                commit: { committer: { date: '2024-03-01T00:00:00Z' } },
              },
              {
                workItem: {
                  id: 301,
                  fields: { 'System.WorkItemType': 'Task' },
                  relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'http://wi/non-req-parent' }],
                },
                commit: { committer: { date: '2024-03-01T01:00:00Z' } },
              },
            ],
          },
        ];

        const result = await factory.applyTaskParentReplacement(rawGroups);

        expect(result).toHaveLength(1);
        const changes = result[0].changes;

        expect(changes).toHaveLength(1);
        expect(changes[0].workItem.id).toBe('USR2');
        expect(
          changes.some(
            (c: any) =>
              c.workItem?.fields?.['System.WorkItemType'] &&
              c.workItem.fields['System.WorkItemType'] === 'Task'
          )
        ).toBe(false);
      });

      it('handleServiceJsonFile should return false and log when required variables are missing', async () => {
        const factory = changeDataFactory as any;

        const fromRelease = { id: 1, variables: {} };
        const toRelease = { id: 2, variables: {} };

        const result = await factory.handleServiceJsonFile(
          fromRelease,
          toRelease,
          defaultParams.teamProject,
          mockGitDataProvider
        );

        expect(result).toBe(false);
        expect((logger as any).warn).toHaveBeenCalledWith('missing variables in release');
        expect((logger as any).warn).toHaveBeenCalledWith(
          'required: servicesJson.value, servicesJsonVersion.value, servicesJsonVersionType.value'
        );
      });

      it('resolveServiceRange should fall back from TAG to BRANCH mode when source tag is missing and branches exist', async () => {
        const factory = changeDataFactory as any;

        const provider: any = {
          GetTag: jest.fn().mockResolvedValueOnce({ value: [], count: 0 }),
          GetBranch: jest.fn().mockResolvedValue({ value: [{}], count: 1 }),
        };

        const service = {
          serviceName: 'Svc',
          serviceLocation: {
            gitRepoUrl: 'https://server/org/project/_git/repo',
            pathInGit: 'services.json',
          },
        };

        const fromRelease = { name: '1.0.0' };
        const toRelease = { name: '2.0.0' };

        const result = await factory.resolveServiceRange(
          provider,
          service,
          'ARG-',
          fromRelease,
          toRelease,
          'branches/source',
          'branches/target',
          true,
          'https://server/org/project/_apis/git/repositories/repo',
          'repo',
          true,
          false,
          'branches/source',
          'branches/target'
        );

        expect(result).toEqual({
          fromVersion: 'branches/source',
          toVersion: 'branches/target',
          fromVersionType: 'Branch',
          toVersionType: 'Branch',
        });
        expect(provider.GetBranch).toHaveBeenCalledTimes(2);
      });

      it('resolveServiceRange should resolve TAG mode when both tags exist', async () => {
        const factory = changeDataFactory as any;

        const provider: any = {
          // Simulate two existing tags; current implementation only checks truthiness
          GetTag: jest.fn().mockResolvedValue({ objectId: 'some-sha' }),
        };

        const service = {
          serviceName: 'Svc',
          serviceLocation: {
            gitRepoUrl: 'https://server/org/project/_git/repo',
            pathInGit: 'services.json',
          },
        };

        const fromRelease = { name: '1.0.0' };
        const toRelease = { name: '2.0.0' };

        const result = await factory.resolveServiceRange(
          provider,
          service,
          'ARG-',
          fromRelease,
          toRelease,
          'branches/source',
          'branches/target',
          true,
          'https://server/org/project/_apis/git/repositories/repo',
          'repo',
          true,
          false,
          'branches/source',
          'branches/target'
        );

        expect(result).toEqual({
          fromVersion: 'ARG-1.0.0',
          toVersion: 'ARG-2.0.0',
          fromVersionType: 'Tag',
          toVersionType: 'Tag',
        });
        expect(provider.GetTag).toHaveBeenCalledTimes(2);
      });

      it('resolveServiceRange should use BRANCH mode and return null when from-branch does not exist', async () => {
        const factory = changeDataFactory as any;

        const provider: any = {
          GetBranch: jest.fn().mockResolvedValue({ value: [], count: 0 }),
        };

        const service = {
          serviceName: 'Svc',
          serviceLocation: {
            gitRepoUrl: 'https://server/org/project/_git/repo',
            pathInGit: 'services.json',
          },
        };

        const fromRelease = { name: '1.0.0' };
        const toRelease = { name: '2.0.0' };

        const result = await factory.resolveServiceRange(
          provider,
          service,
          '',
          fromRelease,
          toRelease,
          'branches/source',
          'branches/target',
          true,
          'https://server/org/project/_apis/git/repositories/repo',
          'repo',
          false,
          true,
          'branches/source',
          'branches/target'
        );

        expect(result).toBeNull();
        expect(provider.GetBranch).toHaveBeenCalledTimes(1);
      });

      it('handleServiceJsonFile should skip service when tags and branches all fail (no fallback)', async () => {
        const factory = changeDataFactory as any;

        const servicesJsonUrl = 'https://server/org/project/_git/servicesRepo?path=folder/services.json';

        const fromRelease = {
          id: 1,
          name: '1.0.0',
          variables: {
            servicesJson: { value: servicesJsonUrl },
            servicesJsonVersion: { value: 'v-configured' },
            servicesJsonVersionType: { value: 'Tag' },
            servicesJsonTagPrefix: { value: 'ARG-' },
          },
        };
        const toRelease = {
          id: 2,
          name: '2.0.0',
          variables: fromRelease.variables,
        };

        const provider: any = {
          // services.json is present, so we reach resolveServiceRange
          GetFileFromGitRepo: jest.fn().mockResolvedValue(
            JSON.stringify({
              services: [
                {
                  serviceName: 'Svc',
                  serviceLocation: {
                    gitRepoUrl: 'https://server/org/project/_git/repo',
                    pathInGit: 'folder/services.json',
                  },
                },
              ],
            })
          ),
          // Tags missing for both from/to -> real GitDataProvider.GetTag returns null when not found
          GetTag: jest.fn().mockResolvedValue(null),
          // Branches will not be used for fallback because no branch variables are present
          GetBranch: jest.fn(),
        };

        const result = await factory.handleServiceJsonFile(
          fromRelease,
          toRelease,
          defaultParams.teamProject,
          provider
        );

        // Services are skipped because resolveServiceRange returns null; handler still returns true
        expect(result).toBe(true);
        // No service groups created
        expect((factory as any).serviceGroupsByKey.size).toBe(0);
        // Should log that there are no branches available for fallback
        expect((logger as any).debug).toHaveBeenCalledWith(
          expect.stringContaining('No branches available for fallback on Svc')
        );
      });

      it('collectPathChangesForService should cache path existence and return commit-range results', async () => {
        const factory = changeDataFactory as any;

        const provider: any = {
          CheckIfItemExist: jest.fn().mockResolvedValue(true),
        };

        jest.spyOn(factory, 'getCommitRangeChanges').mockResolvedValue({
          allExtendedCommits: [{ id: 'c1' }],
          commitsWithNoRelations: [{ id: 'u1' }],
        });

        const first = await factory.collectPathChangesForService(
          provider,
          defaultParams.teamProject,
          'Svc',
          'repo',
          'https://server/org/project/_apis/git/repositories/repo',
          '/path',
          'fromVer',
          'Branch',
          'toVer',
          'Branch'
        );

        expect(first).toEqual({
          allExtendedCommits: [{ id: 'c1' }],
          commitsWithNoRelations: [{ id: 'u1' }],
        });
        expect(provider.CheckIfItemExist).toHaveBeenCalledTimes(2);

        provider.CheckIfItemExist.mockClear();

        const second = await factory.collectPathChangesForService(
          provider,
          defaultParams.teamProject,
          'Svc',
          'repo',
          'https://server/org/project/_apis/git/repositories/repo',
          '/path',
          'fromVer',
          'Branch',
          'toVer',
          'Branch'
        );

        expect(second).toEqual(first);
        expect(provider.CheckIfItemExist).not.toHaveBeenCalled();
      });

      it('collectPathChangesForService should return null when source path does not exist', async () => {
        const factory = changeDataFactory as any;

        const provider: any = {
          CheckIfItemExist: jest.fn().mockResolvedValue(false),
        };

        const result = await factory.collectPathChangesForService(
          provider,
          defaultParams.teamProject,
          'Svc',
          'repo',
          'https://server/org/project/_apis/git/repositories/repo',
          '/missing',
          'fromVer',
          'Branch',
          'toVer',
          'Branch'
        );

        expect(result).toBeNull();
        // With the updated logic we always check both source and target; in this
        // test both are missing so we expect two existence checks (one for each
        // endpoint) before returning null.
        expect(provider.CheckIfItemExist).toHaveBeenCalledTimes(2);
      });

      it('resolveBranch should prefer env branch, then release.branch, then release.Branch', () => {
        const factory = changeDataFactory as any;

        const envRel = {
          environments: [{ variables: { branch: { value: 'env-branch' } } }],
          variables: {
            branch: { value: 'rel-branch' },
            Branch: { value: 'RelBranch' },
          },
        };

        const relLower = {
          variables: {
            branch: { value: 'rel-branch' },
          },
        };

        const relUpper = {
          variables: {
            Branch: { value: 'RelBranch' },
          },
        };

        expect(factory.resolveBranch(envRel)).toEqual({ v: 'env-branch', src: 'env' });
        expect(factory.resolveBranch(relLower)).toEqual({ v: 'rel-branch', src: 'release.branch' });
        expect(factory.resolveBranch(relUpper)).toEqual({ v: 'RelBranch', src: 'release.Branch' });
      });

      it('isChangesReachedMaxSize should throw when artifactsChangesLength exceeds 500', () => {
        const factory = changeDataFactory as any;

        expect(() => factory.isChangesReachedMaxSize('commitSha', 501)).toThrow(
          'The number of changes is too large (501)'
        );
      });
    });
  });
});
