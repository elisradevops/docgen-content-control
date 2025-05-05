// First, mock all required modules before any imports
jest.mock('../../services/logger');
jest.mock('../../services/htmlUtils', () => ({
    __esModule: true,
    default: class MockHtmlUtils {
        cleanHtml = jest.fn().mockResolvedValue('cleaned html');
    }
}));

// Mock the adapters
jest.mock('../../adapters/ChangesTableDataSkinAdapter', () => {
    return jest.fn().mockImplementation(() => ({
        adoptSkinData: jest.fn().mockResolvedValue(undefined),
        getAdoptedData: jest.fn().mockReturnValue([]),
        attachmentMinioData: []
    }));
});

jest.mock('../../adapters/ReleaseComponentsDataSkinAdapter', () => {
    return jest.fn().mockImplementation(() => ({
        jsonSkinAdapter: jest.fn().mockReturnValue([])
    }));
});

jest.mock('../../adapters/SystemOverviewDataSkinAdapter', () => {
    return jest.fn().mockImplementation(() => ({
        jsonSkinAdapter: jest.fn().mockResolvedValue([]),
        getAttachmentMinioData: jest.fn().mockReturnValue([])
    }));
});

jest.mock('../../adapters/BugsTableSkinAdpater', () => {
    return jest.fn().mockImplementation(() => ({
        adoptSkinData: jest.fn(),
        getAdoptedData: jest.fn().mockReturnValue([])
    }));
});

// Now it's safe to import the modules
import ChangeDataFactory from '../../factories/ChangeDataFactory';
import logger from '../../services/logger';

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
            knownBugsQuery: { wiql: { href: 'bugs-query-url' } }
        },
        includedWorkItemByIdSet: new Set<number>([1, 2, 3])
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock ticket data provider
        mockTicketsDataProvider = {
            GetQueryResultsFromWiql: jest.fn().mockResolvedValue([]),
            GetWorkitemAttachments: jest.fn().mockResolvedValue([])
        };

        // Mock Git data provider
        mockGitDataProvider = {
            GetGitRepoFromRepoId: jest.fn().mockResolvedValue({
                name: 'test-repo',
                url: 'https://example.com/repo',
                project: { id: 'project-1' }
            }),
            GetCommitsInCommitRange: jest.fn().mockResolvedValue([]),
            GetItemsInCommitRange: jest.fn().mockResolvedValue([]),
            GetCommitsInDateRange: jest.fn().mockResolvedValue({ count: 0, value: [] }),
            GetPullRequestsInCommitRangeWithoutLinkedItems: jest.fn().mockResolvedValue([]),
            GetCommitBatch: jest.fn().mockResolvedValue([]),
            getItemsForPipelineRange: jest.fn().mockResolvedValue([]),
            getSubmodulesData: jest.fn().mockResolvedValue([]),
            GetFileFromGitRepo: jest.fn().mockResolvedValue('{"services":[]}'),
            CheckIfItemExist: jest.fn().mockResolvedValue(true)
        };

        // Mock JFrog data provider
        mockJfrogDataProvider = {
            getServiceConnectionUrlByConnectionId: jest.fn().mockResolvedValue('https://jfrog.example.com'),
            getCiDataFromJfrog: jest.fn().mockResolvedValue('https://example.com/_build?buildId=123')
        };

        // Mock Pipelines data provider
        mockPipelinesDataProvider = {
            GetRecentReleaseArtifactInfo: jest.fn().mockResolvedValue([]),
            getPipelineBuildByBuildId: jest.fn().mockResolvedValue({
                id: 123,
                result: 'succeeded',
                definition: { id: 456 }
            }),
            findPreviousPipeline: jest.fn().mockResolvedValue({
                id: 122,
                definition: { id: 456 }
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
                    servicesJsonTagPrefix: { value: 'release-' }
                },
                name: '1.0.0'
            })
        };

        // Main data provider mock
        mockDgDataProvider = {
            getTicketsDataProvider: jest.fn().mockResolvedValue(mockTicketsDataProvider),
            getGitDataProvider: jest.fn().mockResolvedValue(mockGitDataProvider),
            getJfrogDataProvider: jest.fn().mockResolvedValue(mockJfrogDataProvider),
            getPipelinesDataProvider: jest.fn().mockResolvedValue(mockPipelinesDataProvider)
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
            mockTicketsDataProvider.GetQueryResultsFromWiql
                .mockResolvedValueOnce([]) // First call for system overview
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
            mockTicketsDataProvider.GetQueryResultsFromWiql.mockRejectedValue(
                new Error('Query failed')
            );

            const result = await changeDataFactory.fetchQueryResults();

            expect(result).toEqual([]);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not fetch query results'));
        });
    });

    describe('fetchChangesData', () => {
        it('should fetch changes for commitSha range type', async () => {
            const mockCommits = [{ commitId: 'commit-123' }];
            const mockChanges = [{ id: 1, title: 'Change 1' }];

            mockGitDataProvider.GetCommitsInCommitRange.mockResolvedValue(mockCommits);
            mockGitDataProvider.GetItemsInCommitRange.mockResolvedValue(mockChanges);

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
                mockCommits
            );
            expect(changeDataFactory.getRawData()).toEqual([
                {
                    artifact: expect.any(Object),
                    changes: mockChanges
                }
            ]);
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
                count: 2, value: [
                    { commitId: 'commit-123', date: '2023-01-15T00:00:00Z' },
                    { commitId: 'commit-456', date: '2023-01-10T00:00:00Z' }
                ]
            };
            const mockItems = [{ id: 1, title: 'Change in date range' }];

            mockGitDataProvider.GetCommitsInDateRange.mockResolvedValue(mockCommits);
            mockGitDataProvider.GetItemsInCommitRange.mockResolvedValue(mockItems);

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
                mockCommits
            );
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
                    repoName: 'repo1'
                }
            ];

            const mockPreviousResourceRepositories = [
                {
                    url: 'https://example.com/repo1',
                    repoSha1: 'sha1-old',
                    repoName: 'repo1'
                }
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
                            'version': { id: 'commit-old', name: 'v1.0' },
                            'definition': { id: 'repo-id-1', name: 'repo1' }
                        }
                    }
                ],
                variables: {
                    servicesJson: { value: 'https://repo/_git/services?path=services.json' },
                    servicesJsonVersion: { value: 'master' },
                    servicesJsonVersionType: { value: 'branch' },
                    servicesJsonTagPrefix: { value: 'release-' }
                },
                name: '1.0.0'
            };

            const mockToRelease = {
                artifacts: [
                    {
                        type: 'Git',
                        alias: 'repo1',
                        definitionReference: {
                            'version': { id: 'commit-new', name: 'v2.0' },
                            'definition': { id: 'repo-id-1', name: 'repo1' }
                        }
                    }
                ],
                variables: {
                    servicesJson: { value: 'https://repo/_git/services?path=services.json' },
                    servicesJsonVersion: { value: 'master' },
                    servicesJsonVersionType: { value: 'branch' },
                    servicesJsonTagPrefix: { value: 'release-' }
                },
                name: '2.0.0'
            };

            mockPipelinesDataProvider.GetReleaseByReleaseId
                .mockResolvedValueOnce(mockFromRelease)
                .mockResolvedValueOnce(mockToRelease);

            // Mock Git repo lookup for the artifact
            mockGitDataProvider.GetGitRepoFromRepoId.mockResolvedValue({
                name: 'repo1',
                url: 'https://example.com/repo1'
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
            mockGitDataProvider.GetCommitsInCommitRange.mockRejectedValue(
                new Error('Failed to fetch commits')
            );

            await changeDataFactory.fetchChangesData();

            expect(logger.error).toHaveBeenCalledWith('Failed to fetch commits');
            expect(changeDataFactory.getRawData()).toEqual([]);
        });
    });

    describe('fetchSvdData', () => {
        it('should fetch all SVD data components when available', async () => {
            // Mock the release component data
            const mockReleaseData = [{ id: 1, name: 'Component 1' }];
            mockPipelinesDataProvider.GetRecentReleaseArtifactInfo.mockResolvedValue(mockReleaseData);

            // Mock the system overview query results
            const mockSystemOverviewData = [{ id: 1, title: 'System Item 1' }];
            mockTicketsDataProvider.GetQueryResultsFromWiql
                .mockResolvedValueOnce(mockSystemOverviewData)
                .mockResolvedValueOnce([{ id: 2, title: 'Bug 1' }]);

            // Mock changes data
            const mockChangesArray = [
                { artifact: { name: 'Repo 1' }, changes: [{ id: 1 }] }
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
            expect(adoptedData).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    contentControl: 'release-components-content-control',
                    skin: 'release-components-skin'
                }),
                expect.objectContaining({
                    contentControl: 'system-overview-content-control',
                    skin: 'system-overview-skin'
                }),
                expect.objectContaining({
                    contentControl: 'required-states-and-modes',
                    skin: 'required-states-and-modes-skin'
                }),
                expect.objectContaining({
                    contentControl: 'system-installation-content-control',
                    skin: 'installation-instructions-skin'
                }),
                expect.objectContaining({
                    contentControl: 'possible-problems-known-errors-content-control',
                    skin: 'possible-problems-known-errors-skin'
                })
            ]));
        });

        it('should handle errors during SVD fetch', async () => {
            jest.spyOn(changeDataFactory, 'fetchChangesData').mockRejectedValue(
                new Error('Failed to fetch changes')
            );

            await expect(changeDataFactory.fetchSvdData()).rejects.toThrow('Failed to fetch changes');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('could not fetch svd data'));
        });
    });

    describe('jsonSkinDataAdapter', () => {
        it('should adapt release-components data', async () => {
            const mockRawData = [{ id: 1, name: 'Component 1' }];
            const mockAdaptedData = [{ title: 'Adapted Component 1' }];

            const mockAdapter = {
                jsonSkinAdapter: jest.fn().mockReturnValue(mockAdaptedData)
            };

            require('../../adapters/ReleaseComponentsDataSkinAdapter').mockImplementation(() => mockAdapter);

            const result = await changeDataFactory.jsonSkinDataAdapter('release-components', mockRawData);

            expect(mockAdapter.jsonSkinAdapter).toHaveBeenCalledWith(mockRawData);
            expect(result).toEqual(mockAdaptedData);
        });

        it('should adapt system-overview data', async () => {
            const mockRawData = [{ id: 1, name: 'System Item 1' }];
            const mockAdaptedData = [{ title: 'Adapted System Item 1' }];
            const mockAttachmentData = [{ attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }];

            const mockAdapter = {
                jsonSkinAdapter: jest.fn().mockResolvedValue(mockAdaptedData),
                getAttachmentMinioData: jest.fn().mockReturnValue(mockAttachmentData)
            };

            require('../../adapters/SystemOverviewDataSkinAdapter').mockImplementation(() => mockAdapter);

            const result = await changeDataFactory.jsonSkinDataAdapter('system-overview', mockRawData);

            expect(mockAdapter.jsonSkinAdapter).toHaveBeenCalledWith(mockRawData);
            expect(mockAdapter.getAttachmentMinioData).toHaveBeenCalled();
            expect(result).toEqual(mockAdaptedData);
            expect(changeDataFactory.getAttachmentMinioData()).toEqual(mockAttachmentData);
        });

        it('should adapt changes data', async () => {
            const mockRawData = [
                { artifact: { name: 'Repo 1' }, changes: [{ id: 1 }] }
            ];
            const mockAdaptedData = [{ title: 'Change 1' }];
            const mockAttachmentData = [{ attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }];

            const mockAdapter = {
                adoptSkinData: jest.fn().mockResolvedValue(undefined),
                getAdoptedData: jest.fn().mockReturnValue(mockAdaptedData),
                attachmentMinioData: mockAttachmentData
            };

            require('../../adapters/ChangesTableDataSkinAdapter').mockImplementation(() => mockAdapter);

            changeDataFactory['rawChangesArray'] = mockRawData;
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
                        attachmentMinioPath: mockUrl
                    })
                })
            ]);

            expect(changeDataFactory.getAttachmentMinioData()).toEqual([
                expect.objectContaining({
                    attachmentMinioPath: mockUrl,
                    minioFileName: mockFileName
                })
            ]);
        });

        it('should adapt possible-problems-known-errors data', async () => {
            const mockRawData = [{ id: 1, title: 'Known Bug 1' }];
            const mockAdaptedData = [{ bugTitle: 'Known Bug 1', severity: 'High' }];

            const mockAdapter = {
                adoptSkinData: jest.fn(),
                getAdoptedData: jest.fn().mockReturnValue(mockAdaptedData)
            };

            require('../../adapters/BugsTableSkinAdpater').mockImplementation(() => mockAdapter);

            const result = await changeDataFactory.jsonSkinDataAdapter('possible-problems-known-errors', mockRawData);

            expect(mockAdapter.adoptSkinData).toHaveBeenCalled();
            expect(mockAdapter.getAdoptedData).toHaveBeenCalled();
            expect(result).toEqual(mockAdaptedData);
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
                    })
                };
            });

            await expect(
                changeDataFactory.jsonSkinDataAdapter('release-components', [])
            ).rejects.toThrow('Adaptation failed');

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed adapting data for type release-components')
            );
        });
    });

    describe('data retrieval methods', () => {
        beforeEach(() => {
            // Setup some test data
            changeDataFactory['rawChangesArray'] = [
                { artifact: { name: 'test-artifact' }, changes: [{ id: 1 }] }
            ];
            changeDataFactory['adoptedChangeData'] = [
                { contentControl: 'test-control', data: [{ title: 'Test' }], skin: 'test-skin' }
            ];
            changeDataFactory['attachmentMinioData'] = [
                { attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }
            ];
        });

        it('getRawData should return raw changes array', () => {
            const result = changeDataFactory.getRawData();
            expect(result).toEqual([
                { artifact: { name: 'test-artifact' }, changes: [{ id: 1 }] }
            ]);
        });

        it('getAdoptedData should return adopted change data', () => {
            const result = changeDataFactory.getAdoptedData();
            expect(result).toEqual([
                { contentControl: 'test-control', data: [{ title: 'Test' }], skin: 'test-skin' }
            ]);
        });

        it('getAttachmentMinioData should return attachment minio data', () => {
            const result = changeDataFactory.getAttachmentMinioData();
            expect(result).toEqual([
                { attachmentMinioPath: 'path/to/file', minioFileName: 'file.txt' }
            ]);
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
    });
});