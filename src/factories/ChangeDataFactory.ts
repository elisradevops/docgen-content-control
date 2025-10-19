import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';
import GitDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/GitDataProvider';
import PipelinesDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/PipelinesDataProvider';
import { Artifact, GitObject } from '../models/contentControl';
import ReleaseComponentDataSkinAdapter from '../adapters/ReleaseComponentsDataSkinAdapter';
import SystemOverviewDataSkinAdapter from '../adapters/SystemOverviewDataSkinAdapter';
import BugsTableSkinAdapter from '../adapters/BugsTableSkinAdpater';
import NonAssociatedCommitsDataSkinAdapter from '../adapters/NonAssociatedCommitsDataSkinAdapter';

export default class ChangeDataFactory {
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  teamProject: string;
  templatePath: string;
  repoId: string;
  from: any;
  to: any;
  rangeType: string;
  linkTypeFilterArray: string[];
  contentControlTitle: string;
  headingLevel?: number;
  rawChangesArray: any = [];
  linkedWiItems: any[] = [];
  adoptedChangeData: any[] = [];
  branchName: string;
  includePullRequests: boolean;
  attachmentWikiUrl: string = '';
  includeChangeDescription: boolean;
  includeCommittedBy: boolean;
  tocTitle?: string;
  queriesRequest: any;
  includedWorkItemByIdSet: Set<number>;
  linkedWiOptions: any;
  requestedByBuild: boolean;
  private attachmentMinioData: any[]; //attachment data
  private attachmentsBucketName: string;
  private minioEndPoint: string;
  private minioAccessKey: string;
  private minioSecretKey: string;
  private PAT: string;
  private includeUnlinkedCommits: boolean;
  private formattingSettings: any;
  private workItemFilterOptions: any;
  constructor(
    teamProjectName,
    repoId: string,
    from: string | number,
    to: string | number,
    rangeType: string,
    linkTypeFilterArray: string[],
    branchName: string,
    includePullRequests: boolean,
    attachmentWikiUrl: string,
    includeChangeDescription: boolean,
    includeCommittedBy: boolean,
    dgDataProvider: any,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string,
    tocTitle?: string,
    queriesRequest: any = undefined,
    includedWorkItemByIdSet: Set<number> = undefined,
    linkedWiOptions: any = undefined,
    requestedByBuild: boolean = false,
    includeUnlinkedCommits: boolean = false,
    formattingSettings: any = {},
    workItemFilterOptions: any = undefined
  ) {
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.teamProject = teamProjectName;
    this.from = from;
    this.to = to;
    this.repoId = repoId;
    this.rangeType = rangeType;
    this.linkTypeFilterArray = linkTypeFilterArray;
    this.branchName = branchName;
    this.includePullRequests = includePullRequests;
    this.attachmentWikiUrl = attachmentWikiUrl;
    this.includeChangeDescription = includeChangeDescription;
    this.includeCommittedBy = includeCommittedBy;
    this.tocTitle = tocTitle;
    this.queriesRequest = queriesRequest;
    this.includedWorkItemByIdSet = includedWorkItemByIdSet ?? new Set();
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentMinioData = [];
    this.linkedWiOptions = linkedWiOptions;
    this.requestedByBuild = requestedByBuild;
    this.includeUnlinkedCommits = includeUnlinkedCommits;
    this.formattingSettings = formattingSettings;
    this.workItemFilterOptions = workItemFilterOptions;
  } //constructor

  async fetchSvdData() {
    try {
      //1. get release component adoptedData release-components-content-control
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();
      let recentReleaseArtifactInfo = await pipelinesDataProvider.GetRecentReleaseArtifactInfo(
        this.teamProject
      );
      if (recentReleaseArtifactInfo?.length > 0) {
        this.adoptedChangeData.push({
          contentControl: 'release-components-content-control',
          data: await this.jsonSkinDataAdapter('release-components', recentReleaseArtifactInfo),
          skin: 'release-components-skin',
        });
      }

      //2. Get system-overview (by query) need to be displayed in hierarchy system-overview-content-control
      const queryResultData = await this.fetchQueryResults();
      if (queryResultData.systemOverviewQueryData?.length > 0) {
        this.adoptedChangeData.push({
          contentControl: 'system-overview-content-control',
          data: await this.jsonSkinDataAdapter('system-overview', queryResultData),
          skin: 'system-overview-skin',
        });
      }

      //3. get fetch changes data required-states-and-modes
      await this.fetchChangesData();
      this.includedWorkItemByIdSet.clear();
      logger.info(`fetchSvdData: After fetchChangesData, rawChangesArray has ${this.rawChangesArray.length} artifacts`);
      if (this.rawChangesArray.length > 0) {
        logger.info(`fetchSvdData: Calling jsonSkinDataAdapter for 'changes'`);
        this.adoptedChangeData.push({
          contentControl: 'required-states-and-modes',
          data: await this.jsonSkinDataAdapter('changes', this.rawChangesArray),
          skin: 'required-states-and-modes-skin',
        });
      } else {
        logger.warn(`fetchSvdData: rawChangesArray is empty, skipping changes adaptation`);
      }
      //4.get installation data (via file) installation-instructions-content-control
      if (this.attachmentWikiUrl) {
        this.adoptedChangeData.push({
          contentControl: 'system-installation-content-control',
          data: await this.jsonSkinDataAdapter('installation-instructions', []), //TBD need to add a check box to either include new file or not
          skin: 'installation-instructions-skin',
        });
      }
      //5. get possible errors or change quest by query possible-problems-known-errors-content-control
      if (queryResultData.knownBugsQueryData) {
        this.adoptedChangeData.push({
          contentControl: 'possible-problems-known-errors-content-control',
          data: await this.jsonSkinDataAdapter(
            'possible-problems-known-errors',
            queryResultData.knownBugsQueryData
          ),
          skin: 'possible-problems-known-errors-skin',
        });
      }

      //6. get non associated commits data non-associated-commits-content-control (as appendix)
      if (this.rawChangesArray.length > 0) {
        const adoptedData = await this.jsonSkinDataAdapter('non-associated-commits', this.rawChangesArray);
        if (adoptedData.length > 0) {
          this.adoptedChangeData.push({
            contentControl: 'non-associated-commits-content-control',
            data: adoptedData,
            skin: 'non-associated-commits-skin',
          });
        }
      }
    } catch (error: any) {
      logger.error(`could not fetch svd data:
        ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch query results for both system overview and known bug query
   * @returns
   */
  async fetchQueryResults(): Promise<any> {
    try {
      const ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      let queryResults = {};
      if (this.queriesRequest.sysOverviewQuery) {
        logger.debug('starting to fetch system overview query results');

        logger.debug('fetching results');
        let systemOverviewQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.sysOverviewQuery.wiql.href,
          false,
          null
        );
        logger.debug(`system overview are ${systemOverviewQueryData ? 'ready' : 'not found'}`);
        // Pass roots array when present; also expose workItemRelations for link-driven rendering
        queryResults['systemOverviewQueryData'] = systemOverviewQueryData?.roots ?? systemOverviewQueryData;
        if (systemOverviewQueryData?.workItemRelations) {
          queryResults['systemOverviewLinksDebug'] = {
            workItemRelations: systemOverviewQueryData.workItemRelations,
          };
        }
      }

      if (this.queriesRequest.knownBugsQuery) {
        logger.debug('starting to fetch known bugs query results');

        logger.debug('fetching results');
        let knownBugsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.knownBugsQuery.wiql.href,
          true,
          null
        );
        logger.debug(`known bugs query results are ${knownBugsQueryData ? 'ready' : 'not found'}`);
        queryResults['knownBugsQueryData'] = knownBugsQueryData;
      }
      return queryResults;
    } catch (err) {
      logger.error(`Could not fetch query results: ${err.message}`);
    }
    return [];
  }

  /*fetches Change table data and adopts it to json skin format */
  async fetchChangesData() {
    try {
      let focusedArtifact;
      let artifactChanges: any[] = [];
      let artifactChangesNoLink: any[] = [];
      let origin;
      let gitDataProvider = await this.dgDataProviderAzureDevOps.getGitDataProvider();
      let jfrogDataProvider = await this.dgDataProviderAzureDevOps.getJfrogDataProvider();
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();

      const handlers: { [key: string]: Function } = {
        Build: this.handleBuildArtifact.bind(this),
        Git: this.handleGitArtifact.bind(this),
        Artifactory: this.handleArtifactoryArtifact.bind(this),
        JFrogArtifactory: this.handleArtifactoryArtifact.bind(this),
      };
      if (this.repoId) {
        focusedArtifact = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
      }
      switch (this.rangeType) {
        case 'commitSha':
          {
            let commitsInCommitRange = await gitDataProvider.GetCommitsInCommitRange(
              this.teamProject,
              this.repoId,
              String(this.to),
              String(this.from)
            );
            const { commitChangesArray, commitsWithNoRelations } =
              await gitDataProvider.GetItemsInCommitRange(
                this.teamProject,
                this.repoId,
                commitsInCommitRange,
                this.linkedWiOptions,
                this.includeUnlinkedCommits
              );

            this.isChangesReachedMaxSize(this.rangeType, commitChangesArray?.length);
            this.rawChangesArray.push({
              artifact: focusedArtifact,
              changes: commitChangesArray,
              nonLinkedCommits: commitsWithNoRelations,
            });
          }
          break;
        case 'range':
          {
            const fromGitObject: GitObject = this.from;
            const toGitObject: GitObject = this.to;
            // Check if fromGitObject and toGitObject are valid GitObjects
            if (fromGitObject.ref) {
              fromGitObject.ref = fromGitObject.ref.split('/').pop();
            }
            if (toGitObject.ref) {
              toGitObject.ref = toGitObject.ref.split('/').pop();
            }
            let gitRepo = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
            const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
              gitDataProvider,
              this.teamProject,
              fromGitObject.ref,
              fromGitObject.type,
              toGitObject.ref,
              toGitObject.type,
              gitRepo.name,
              gitRepo.url,
              this.includedWorkItemByIdSet,
              undefined,
              undefined,
              this.linkedWiOptions
            );
            artifactChanges.push(...allExtendedCommits);
            artifactChangesNoLink.push(...commitsWithNoRelations);
            this.isChangesReachedMaxSize(this.rangeType, artifactChanges?.length);
            this.rawChangesArray.push({
              artifact: focusedArtifact,
              changes: artifactChanges,
              nonLinkedCommits: artifactChangesNoLink,
            });
          }
          break;
        case 'date':
          {
            // Adjust 'from' to the start of the day
            const fromDate = new Date(this.from);
            fromDate.setSeconds(0); // set to the start of the minute
            this.from = fromDate.toISOString();

            // Adjust 'to' to the end of the day
            const toDate = new Date(this.to);
            toDate.setSeconds(59);
            this.to = toDate.toISOString();

            let commitsInDateRange = await gitDataProvider.GetCommitsInDateRange(
              this.teamProject,
              this.repoId,
              String(this.from),
              String(this.to),
              this.branchName
            );
            let repo = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
            if (!repo) {
              throw new Error(`Could not find repository with id ${this.repoId}`);
            }
            if (this.includePullRequests) {
              artifactChanges = await gitDataProvider.GetPullRequestsInCommitRangeWithoutLinkedItems(
                this.teamProject,
                this.repoId,
                commitsInDateRange
              );
            } else {
              const { commitChangesArray, commitsWithNoRelations } =
                await gitDataProvider.GetItemsInCommitRange(
                  this.teamProject,
                  this.repoId,
                  commitsInDateRange,
                  this.linkedWiOptions,
                  this.includeUnlinkedCommits
                );
              artifactChanges = [...commitChangesArray];
              artifactChangesNoLink = [...commitsWithNoRelations];

              let repoName = repo.name;

              if (commitsInDateRange.count > 0) {
                const { value: commits } = commitsInDateRange;
                let firstCommitObject = commits[commits.length - 1]; // last commit is the oldest
                let lastCommitObject = commits[0]; // first commit is the latest
                let fromCommit = firstCommitObject.commitId;
                let toCommit = lastCommitObject.commitId;
                const { commitsWithRelatedWi, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
                  await this.parseSubModules(
                    gitDataProvider,
                    this.teamProject,
                    repoName,
                    toCommit,
                    fromCommit,
                    'commit',
                    'commit',
                    commits,
                    this.includedWorkItemByIdSet
                  );

                //add targetRepo property for each item
                if (artifactChanges.length > 0 && commitsWithRelatedWi.length > 0) {
                  for (const item of artifactChanges) {
                    item.targetRepo = {
                      repoName: repoName,
                      gitSubModuleName: item.gitSubModuleName || '',
                      url: repo.url,
                      projectId: repo.project.id,
                    };
                  }
                  artifactChanges.push(...commitsWithRelatedWi);
                  artifactChangesNoLink.push(...commitsWithNoRelationsSubmodule);
                }
              }
            }

            this.isChangesReachedMaxSize(this.rangeType, artifactChanges?.length);
            this.rawChangesArray.push({
              artifact: { name: '' },
              changes: artifactChanges,
              nonLinkedCommits: artifactChangesNoLink,
            });
          }
          break;

        case 'pipeline':
          {
            const { artifactChanges, artifactChangesNoLink } = await this.GetPipelineChanges(
              pipelinesDataProvider,
              gitDataProvider,
              this.teamProject,
              this.to,
              this.from
            );

            this.isChangesReachedMaxSize(this.rangeType, artifactChanges?.length);

            this.rawChangesArray.push({
              artifact: { name: this.tocTitle || '' },
              changes: [...artifactChanges],
              nonLinkedCommits: [...artifactChangesNoLink],
            });
          }
          break;
        case 'release':
          {
            const fromRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
              this.teamProject,
              Number(this.from)
            );
            const toRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
              this.teamProject,
              Number(this.to)
            );

            logger.info(`retrieved release artifacts for releases: ${this.from} - ${this.to}`);
            // Precompute a map for quick lookups
            const fromArtifactMap = new Map<string, Artifact>();
            for (const fa of fromRelease.artifacts) {
              const key = `${fa.type}-${fa.alias}`;
              fromArtifactMap.set(key, fa);
            }

            await Promise.all(
              toRelease.artifacts.map(async (toReleaseArtifact: Artifact) => {
                const artifactType = toReleaseArtifact.type;
                const artifactAlias = toReleaseArtifact.alias;
                logger.info(`Processing artifact: ${artifactAlias} (${artifactType})`);

                // Skip unsupported artifact types
                if (!['Build', 'Git', 'Artifactory', 'JFrogArtifactory'].includes(artifactType)) {
                  logger.info(`Artifact ${artifactAlias} type ${artifactType} is not supported, skipping`);
                  return;
                }

                // Additional check for Build artifact repository provider
                if (
                  artifactType === 'Build' &&
                  !['TfsGit', 'TfsVersionControl'].includes(
                    toReleaseArtifact.definitionReference['repository.provider']?.id
                  )
                ) {
                  logger.info(`Artifact ${artifactAlias} repository provider is unknown, skipping`);
                  return;
                }

                const key = `${artifactType}-${artifactAlias}`;
                const fromReleaseArtifact = fromArtifactMap.get(key);
                if (!fromReleaseArtifact) {
                  // Artifact didn't exist in previous release
                  logger.info(`Artifact ${artifactAlias} not found in previous release`);
                  return;
                }

                // If same version, nothing to compare
                if (
                  fromReleaseArtifact.definitionReference['version'].name ===
                  toReleaseArtifact.definitionReference['version'].name
                ) {
                  logger.info(
                    `Same artifact ${fromReleaseArtifact.definitionReference['version'].name} nothing to compare`
                  );
                  return;
                }

                // Dispatch to the appropriate handler
                const handler = handlers[artifactType];
                if (handler) {
                  switch (artifactType) {
                    case 'Git':
                      await handler(
                        fromReleaseArtifact,
                        toReleaseArtifact,
                        this.teamProject,
                        gitDataProvider
                      );
                      break;
                    case 'Artifactory':
                    case 'JFrogArtifactory':
                      await handler(
                        fromReleaseArtifact,
                        toReleaseArtifact,
                        this.teamProject,
                        jfrogDataProvider
                      );
                      break;
                    default:
                      await handler(fromReleaseArtifact, toReleaseArtifact, this.teamProject);
                  }
                } else {
                  logger.info(`No handler defined for artifact type ${artifactType}, skipping`);
                }
              })
            );

            //handle services.json from variables of the release
            await this.handleServiceJsonFile(fromRelease, toRelease, this.teamProject, gitDataProvider);
          }
          break;
        default:
          break;
      }

      logger.info(`fetch ${this.rawChangesArray.length} changes for range`);
      //Clear the set after finishing
    } catch (error: any) {
      if (error.message?.includes('The number of changes is too large')) {
        throw error;
      }
      logger.error(error.message);
    }
  } //fetchChangesData

  /**
   * Checks if the number of artifact changes exceeds the maximum allowed limit.
   *
   * @param artifactChanges - An array of artifact changes to validate
   * @throws {Error} When the number of changes exceeds 500
   */
  private isChangesReachedMaxSize(rangeType: string = '', artifactsChangesLength?: number) {
    if (artifactsChangesLength && artifactsChangesLength > 500) {
      throw new Error(
        `Range type ${rangeType} error:
         The number of changes is too large (${artifactsChangesLength}) but the maximum is 500. Consider narrowing the range.`
      );
    }
  }

  /**
   * Retrieves the changes between two pipeline builds.
   *
   * @param pipelinesDataProvider - The provider for pipeline data.
   * @param gitDataProvider - The provider for git data.
   * @param teamProject - The team project name.
   * @param to - The target build ID or version.
   * @param from - The source build ID or version.
   * @returns A promise that resolves to an array of changes between the specified builds.
   * @throws Will throw an error if the target build has not succeeded.
   */
  private async GetPipelineChanges(
    pipelinesDataProvider: PipelinesDataProvider,
    gitDataProvider: GitDataProvider,
    teamProject: string,
    to: string | number,
    from: string | number
  ): Promise<{ artifactChanges: any[]; artifactChangesNoLink: any[] }> {
    const artifactChanges = [];
    const artifactChangesNoLink = [];
    try {
      let targetBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, Number(to));

      //if requested by user and target build is not succeeded throw error
      if (!this.requestedByBuild && targetBuild.result !== 'succeeded') {
        throw new Error(`The selected ${to} build has not been succeeded`);
      }
      //if requested by build and target build is not succeeded throw error
      else {
        if (
          targetBuild.result === 'canceled' ||
          targetBuild.result === 'failed' ||
          targetBuild.result === 'none'
        ) {
          throw new Error(`The selected ${to} build has ${targetBuild.result}`);
        }
      }

      let targetPipelineId = targetBuild.definition.id;
      let sourceBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, Number(from));

      if (!sourceBuild) {
        sourceBuild = await pipelinesDataProvider.findPreviousPipeline(
          teamProject,
          targetBuild.id,
          Number(to),
          targetBuild,
          true
        );
        if (!sourceBuild) {
          logger.warn(`Could not find a valid pipeline before build #${to}`);
          return { artifactChanges: [], artifactChangesNoLink: [] };
        }
      }

      let sourcePipelineId = sourceBuild.definition.id;

      let sourcePipelineRun = await pipelinesDataProvider.getPipelineRunDetails(
        teamProject,
        sourcePipelineId,
        Number(from)
      );

      let targetPipelineRun = await pipelinesDataProvider.getPipelineRunDetails(
        teamProject,
        targetPipelineId,
        Number(to)
      );
      const sourcePipelineResourcePipelines =
        await pipelinesDataProvider.getPipelineResourcePipelinesFromObject(sourcePipelineRun);
      const targetPipelineResourcePipelines =
        await pipelinesDataProvider.getPipelineResourcePipelinesFromObject(targetPipelineRun);

      const sourceResourceRepositories =
        await pipelinesDataProvider.getPipelineResourceRepositoriesFromObject(
          sourcePipelineRun,
          gitDataProvider
        );
      const targetResourceRepositories =
        await pipelinesDataProvider.getPipelineResourceRepositoriesFromObject(
          targetPipelineRun,
          gitDataProvider
        );

      for (const targetPipelineRepo of targetResourceRepositories) {
        let gitRepoUrl = this.removeUserFromGitRepoUrl(targetPipelineRepo.url);
        let gitRepoVersion = targetPipelineRepo.repoSha1;
        let gitRepoName = targetPipelineRepo.repoName;
        let toCommit = gitRepoVersion;
        logger.debug(`Repository ${gitRepoUrl} version ${gitRepoVersion.slice(0, 7)}`);
        for (const sourcePipeline of sourceResourceRepositories) {
          let fromGitRepoUrl = this.removeUserFromGitRepoUrl(sourcePipeline.url);
          let fromGitRepoVersion = sourcePipeline.repoSha1;
          let fromGitRepoName = sourcePipeline.repoName;

          if (fromGitRepoName !== gitRepoName) {
            continue;
          }

          logger.debug(`Previous repository ${fromGitRepoUrl} version ${fromGitRepoVersion.slice(0, 7)}`);
          if (fromGitRepoVersion === gitRepoVersion) {
            logger.debug(`Same repository version ${fromGitRepoVersion} nothing to compare`);
            break;
          }

          let fromCommit = fromGitRepoVersion;
          logger.info(`fromCommit ${fromCommit} toCommit ${toCommit}`);
          const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
            gitDataProvider,
            teamProject,
            fromCommit,
            'commit',
            toCommit,
            'commit',
            gitRepoName,
            gitRepoUrl,
            this.includedWorkItemByIdSet,
            undefined,
            undefined,
            this.linkedWiOptions
          );

          artifactChanges.push(...allExtendedCommits);
          artifactChangesNoLink.push(...commitsWithNoRelations);
        }
      }

      for (const targetPipeline_pipeline of targetPipelineResourcePipelines) {
        let targetResourcePipelineRunId = targetPipeline_pipeline.buildId;
        let targetResourcePipelineDefinitionId = targetPipeline_pipeline.definitionId;
        let targetResourcePipelineTeamProject = targetPipeline_pipeline.teamProject;
        let targetResourceBuildNumber = targetPipeline_pipeline.buildNumber;
        let targetResourcePipelineName = targetPipeline_pipeline.name;
        let targetResourcePipelineProvider = targetPipeline_pipeline.provider;
        if (targetResourcePipelineProvider !== 'TfsGit') {
          logger.info(
            `resource pipeline ${targetResourcePipelineProvider} is not based on azure devops git, skipping`
          );
          continue;
        }

        logger.info(`Processing resource pipeline ${targetResourceBuildNumber}`);

        logger.info(`Locate the pipeline ${targetResourcePipelineName} ${targetResourceBuildNumber}`);

        const targetResourcePipeline = await pipelinesDataProvider.getPipelineRunDetails(
          targetResourcePipelineTeamProject,
          targetResourcePipelineDefinitionId,
          targetResourcePipelineRunId
        );

        if (!targetResourcePipeline) {
          logger.info(
            `Could not find pipeline ${targetResourcePipelineName} ${targetResourceBuildNumber}, skipping`
          );
          continue;
        }

        for (const sourcePipeline_pipeline of sourcePipelineResourcePipelines) {
          let sourceResourcePipelineRunId = sourcePipeline_pipeline.buildId;
          let sourceResourcePipelineDefinitionId = sourcePipeline_pipeline.definitionId;
          let sourceResourcePipelineTeamProject = sourcePipeline_pipeline.teamProject;
          let sourceResourceBuildNumber = sourcePipeline_pipeline.buildNumber;
          let sourceResourcePipelineName = sourcePipeline_pipeline.name;
          let sourceResourcePipelineProvider = sourcePipeline_pipeline.provider;

          if (sourceResourcePipelineProvider !== 'TfsGit') {
            logger.info(
              `resource pipeline ${sourceResourcePipelineProvider} is not based on azure devops git, skipping`
            );
            continue;
          }

          if (sourceResourcePipelineName !== targetResourcePipelineName) {
            logger.info(
              `resource pipeline ${sourceResourcePipelineName} is not the same as ${targetResourcePipelineName}, skipping`
            );
            continue;
          }

          if (sourceResourcePipelineRunId === targetResourcePipelineRunId) {
            logger.info(
              `resource pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber} is the same as ${targetResourcePipelineName} ${targetResourceBuildNumber}, skipping`
            );
            break;
          }

          logger.info(
            `Locate the previous pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber}`
          );

          const sourceResourcePipeline = await pipelinesDataProvider.getPipelineRunDetails(
            sourceResourcePipelineTeamProject,
            sourceResourcePipelineDefinitionId,
            sourceResourcePipelineRunId
          );

          if (!sourceResourcePipeline) {
            logger.info(
              `Could not find pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber}, skipping`
            );
            break;
          }
          //Recursive call
          const { artifactChanges: reportPartsForRepo, artifactChangesNoLink: reportPartsForRepoNoLink } =
            await this.GetPipelineChanges(
              pipelinesDataProvider,
              gitDataProvider,
              targetResourcePipelineTeamProject,
              targetResourcePipelineRunId,
              sourceResourcePipelineRunId
            );

          if (reportPartsForRepo) {
            logger.debug(`reportPartsForRepo: ${JSON.stringify(reportPartsForRepo)}`);
            logger.debug(`reportPartsForRepoNoLink: ${JSON.stringify(reportPartsForRepoNoLink)}`);
            artifactChanges.push(...reportPartsForRepo);
            artifactChangesNoLink.push(...reportPartsForRepoNoLink);
          }
        }
      }
    } catch (error: any) {
      logger.error(`could not handle pipeline ${error.message}`);
    }
    return { artifactChanges, artifactChangesNoLink };
  }

  private removeUserFromGitRepoUrl(gitRepoUrl: string) {
    if (!gitRepoUrl.startsWith('https://')) {
      return gitRepoUrl;
    }
    if (!gitRepoUrl.includes('@')) {
      return gitRepoUrl;
    }
    return 'https://' + gitRepoUrl.split('@').pop();
  }

  private async getCommitRangeChanges(
    gitDataProvider: GitDataProvider,
    teamProject: string,
    fromVersion: any,
    fromVersionType: any,
    toVersion: any,
    toVersionType: any,
    gitRepoName: any,
    gitRepoUrl: any,
    includedWorkItemByIdSet: Set<number> = undefined,
    gitSubModuleName: string = '',
    specificItemPath: string = '',
    linkedWiOptions: any = undefined
  ) {
    const allExtendedCommits: any[] = [];
    const commitsWithNoRelations: any[] = [];
    try {
      let gitApisUrl = gitRepoUrl.includes('/_git/')
        ? gitRepoUrl.replace('/_git/', '/_apis/git/repositories/')
        : gitRepoUrl;

      logger.debug(`fetching commits for ${gitRepoName} from ${fromVersion} to ${toVersion}`);
      let extendedCommits = await gitDataProvider.GetCommitBatch(
        gitApisUrl,
        { version: fromVersion, versionType: fromVersionType },
        { version: toVersion, versionType: toVersionType },
        specificItemPath
      );

      if (extendedCommits?.length > 0) {
        const { commitChangesArray, commitsWithNoRelations: unrelatedCommits } =
          await gitDataProvider.getItemsForPipelineRange(
            teamProject,
            extendedCommits,
            {
              repoName: gitRepoName,
              gitSubModuleName: gitSubModuleName,
              url: gitApisUrl,
            },
            includedWorkItemByIdSet,
            linkedWiOptions,
            this.includeUnlinkedCommits
          );
        allExtendedCommits.push(...commitChangesArray);
        commitsWithNoRelations.push(...unrelatedCommits);

        const { commitsWithRelatedWi, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
          await this.parseSubModules(
            gitDataProvider,
            teamProject,
            gitRepoName,
            toVersion,
            fromVersion,
            toVersionType,
            fromVersionType,
            extendedCommits,
            includedWorkItemByIdSet,
            linkedWiOptions
          );
        allExtendedCommits.push(...commitsWithRelatedWi);
        commitsWithNoRelations.push(...commitsWithNoRelationsSubmodule);
      }

      return { allExtendedCommits, commitsWithNoRelations };
    } catch (error: any) {
      logger.error(`Cannot get commits for commit range ${gitRepoName} - ${error.message}`);
      throw error;
    }
  }

  private async parseSubModules(
    gitDataProvider: GitDataProvider,
    teamProject: string,
    gitRepoName: any,
    toCommit: any,
    fromCommit: any,
    toVersionType: string,
    fromVersionType: string,
    allCommitsExtended: any[],
    includedWorkItemByIdSet: Set<number>,
    subModuleName: string = '',
    linkedWiOptions: any = undefined
  ) {
    const commitsWithRelatedWi: any[] = [];
    const commitsWithNoRelations: any[] = [];
    try {
      const submodules = await gitDataProvider.getSubmodulesData(
        teamProject,
        gitRepoName,
        { version: toCommit, versionType: toVersionType },
        { version: fromCommit, versionType: fromVersionType },
        allCommitsExtended
      );

      for (const subModule of submodules) {
        let gitSubRepoUrl = subModule.gitSubRepoUrl;
        let gitSubRepoName = subModule.gitSubRepoName;
        let gitSubModuleName = subModule.gitSubModuleName;
        let sourceSha1 = subModule.sourceSha1;
        let targetSha1 = subModule.targetSha1;
        const { allExtendedCommits, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
          await this.getCommitRangeChanges(
            gitDataProvider,
            teamProject,
            sourceSha1,
            'commit',
            targetSha1,
            'commit',
            gitSubRepoName,
            gitSubRepoUrl,
            includedWorkItemByIdSet,
            gitSubModuleName,
            undefined,
            linkedWiOptions
          );

        commitsWithRelatedWi.push(...allExtendedCommits);
        commitsWithNoRelations.push(...commitsWithNoRelationsSubmodule);
      }
    } catch (error: any) {
      logger.error(`could not handle submodules ${error.message}`);
    }
    return { commitsWithRelatedWi, commitsWithNoRelations };
  }

  private filterChangesByWorkItemOptions(changes: any[] = []): any[] {
    if (!this.workItemFilterOptions?.isEnabled) {
      return changes;
    }

    const filteredChanges = changes.filter((change) => {
      const workItem = change?.workItem;
      if (!workItem) {
        return false;
      }

      const workItemType = String(workItem.fields?.['System.WorkItemType'] ?? '').toLowerCase();
      const workItemState = String(workItem.fields?.['System.State'] ?? '').toLowerCase();

      // if no filters are set, return all changes
      const isValidType =
        this.workItemFilterOptions.workItemTypes.length === 0 ||
        this.workItemFilterOptions.workItemTypes.includes(workItemType);
      const isValidState =
        this.workItemFilterOptions.workItemStates.length === 0 ||
        this.workItemFilterOptions.workItemStates.includes(workItemState);

      return isValidType && isValidState;
    });

    return filteredChanges;
  }

  private async handleBuildArtifact(
    fromArtifact: Artifact,
    toArtifact: Artifact,
    teamProject: string,
    provider?: any
  ) {
    const pipelineTitle = `Pipeline ${fromArtifact.definitionReference['definition'].name}`;
    const buildChangeFactory = new ChangeDataFactory(
      teamProject,
      '',
      fromArtifact.definitionReference['version'].id,
      toArtifact.definitionReference['version'].id,
      'pipeline',
      null,
      '',
      true,
      '',
      false,
      false,
      this.dgDataProviderAzureDevOps,
      this.attachmentsBucketName,
      this.minioEndPoint,
      this.minioAccessKey,
      this.minioSecretKey,
      this.PAT,
      pipelineTitle,
      undefined,
      this.includedWorkItemByIdSet,
      this.linkedWiOptions,
      this.requestedByBuild,
      this.includeUnlinkedCommits,
      this.formattingSettings,
      this.workItemFilterOptions
    );
    await buildChangeFactory.fetchChangesData();
    const rawData = buildChangeFactory.getRawData();
    this.rawChangesArray.push(...rawData);
  }
  private async handleGitArtifact(
    fromArtifact: Artifact,
    toArtifact: Artifact,
    teamProject: string,
    provider?: any
  ) {
    let gitTitle = `Repository ${toArtifact.definitionReference['definition'].name}`;
    let gitRepo = await provider.GetGitRepoFromRepoId(toArtifact.definitionReference['definition'].id);

    const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
      provider,
      teamProject,
      fromArtifact.definitionReference['version'].id,
      'commit',
      toArtifact.definitionReference['version'].id,
      'commit',
      toArtifact.definitionReference['definition'].name,
      gitRepo.url,
      this.includedWorkItemByIdSet,
      undefined,
      undefined,
      this.linkedWiOptions
    );
    this.isChangesReachedMaxSize(this.rangeType, allExtendedCommits?.length);
    this.rawChangesArray.push({
      artifact: { name: gitTitle || '' },
      changes: [...allExtendedCommits],
      nonLinkedCommits: [...commitsWithNoRelations],
    });
  }

  private async handleArtifactoryArtifact(
    fromArtifact: Artifact,
    toArtifact: Artifact,
    teamProject: string,
    provider?: any
  ) {
    // Extract common logic for JFrog/Artifactory here
    let jFrogUrl = await provider.getServiceConnectionUrlByConnectionId(
      teamProject,
      fromArtifact.definitionReference.connection.id
    );

    // Extract build names/versions
    const fromBuildName = fromArtifact.definitionReference['definition'].name;
    const fromBuildVersion = fromArtifact.definitionReference['version'].name;
    const toBuildName = toArtifact.definitionReference['definition'].name;
    const toBuildVersion = toArtifact.definitionReference['version'].name;

    logger.info(`Fetch CI data from JFrog: ${jFrogUrl}`);
    const toCiUrl = await provider.getCiDataFromJfrog(jFrogUrl, toBuildName, toBuildVersion);
    if (toCiUrl === '') {
      logger.warn(`cannot find source url for ${toBuildName}`);
      return;
    }

    const fromCiUrl = await provider.getCiDataFromJfrog(jFrogUrl, fromBuildName, fromBuildVersion);
    if (fromCiUrl === '') {
      logger.warn(`cannot find source url for ${fromBuildName}`);
      return;
    }

    // Determine if CI or Release
    const toUrlParts = toCiUrl.split('/');
    const fromUrlParts = fromCiUrl.split('/');
    const toUrlSuffix = toUrlParts.pop(); // gets either _release?releaseId={id} or _build?buildId={id}
    const fromUrlSuffix = fromUrlParts.pop(); // gets either _release?releaseId={id} or _build?buildId={id}
    
    // Extract project info first (needed for both scenarios)
    const toTeamProject = toUrlParts.pop();
    
    let jfrogUploader = 'pipeline'; // Always use pipeline mode
    let toBuildId: string;
    let fromBuildId: string;
    
    if (toUrlSuffix.startsWith('_release?releaseId=')) {
      // When JFrog points to a release, we need to extract the actual build from that release
      logger.info(`Artifactory artifact points to releases, extracting build information`);
      const toReleaseId = toUrlSuffix.split('=').pop();
      const fromReleaseId = fromUrlSuffix.split('=').pop();
      
      logger.debug(`Fetching release ${fromReleaseId} and ${toReleaseId} from project ${toTeamProject}`);
      const pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();
      
      try {
        const fromRelease = await pipelinesDataProvider.GetReleaseByReleaseId(toTeamProject, Number(fromReleaseId));
        const toRelease = await pipelinesDataProvider.GetReleaseByReleaseId(toTeamProject, Number(toReleaseId));
        
        // Find the Build artifact in the releases that corresponds to this JFrog artifact
        // Typically the first Build artifact or the one with matching name
        const fromBuildArtifact = fromRelease.artifacts?.find((a: any) => a.type === 'Build');
        const toBuildArtifact = toRelease.artifacts?.find((a: any) => a.type === 'Build');
        
        if (!fromBuildArtifact || !toBuildArtifact) {
          logger.warn(`Could not find Build artifacts in releases ${fromReleaseId} and ${toReleaseId}`);
          return;
        }
        
        fromBuildId = fromBuildArtifact.definitionReference['version'].id;
        toBuildId = toBuildArtifact.definitionReference['version'].id;
        
        logger.info(`Extracted builds from releases: ${fromBuildId} → ${toBuildId}`);
      } catch (error: any) {
        logger.error(`Failed to fetch releases: ${error.message}`);
        return;
      }
    } else if (toUrlSuffix.startsWith('_build?buildId=')) {
      toBuildId = toUrlSuffix.split('=').pop();
      fromBuildId = fromUrlSuffix.split('=').pop();
      logger.debug(`Artifactory artifact points to builds: ${fromBuildId} → ${toBuildId}`);
    } else {
      logger.warn(`Unsupported URL suffix: ${toUrlSuffix}`);
      return; // Unsupported suffix
    }

    const tocTitle = `Artifactory ${toBuildName} ${toBuildVersion}`;

    try {
      const buildChangeFactory = new ChangeDataFactory(
        toTeamProject,
        '',
        fromBuildId,
        toBuildId,
        jfrogUploader, // Now always 'pipeline'
        null,
        '',
        true,
        '',
        false,
        false,
        this.dgDataProviderAzureDevOps,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        tocTitle,
        undefined,
        this.includedWorkItemByIdSet,
        this.linkedWiOptions,
        this.requestedByBuild,
        this.includeUnlinkedCommits,
        this.formattingSettings,
        this.workItemFilterOptions
      );

      await buildChangeFactory.fetchChangesData();
      const rawData = buildChangeFactory.getRawData();
      
      // Log artifact names and work item IDs
      logger.info(`handleArtifactoryArtifact: Received ${rawData.length} artifacts from nested factory`);
      rawData.forEach((item) => {
        const workItemIds = item.changes
          ?.map((change: any) => change.workItem?.id)
          .filter((id: any) => id !== undefined) || [];
        logger.debug(
          `  Artifact: "${item.artifact?.name || 'N/A'}" | Changes: ${item.changes?.length || 0} | Work Item IDs: [${workItemIds.join(', ')}]`
        );
      });
      
      this.rawChangesArray.push(...rawData);
      logger.info(`handleArtifactoryArtifact: After push, parent rawChangesArray has ${this.rawChangesArray.length} total artifacts`);
    } catch (error: any) {
      logger.error(`could not handle ${tocTitle} ${error.message}`);
      throw error;
    }
  }

  private async handleServiceJsonFile(fromRelease, toRelease, projectId, provider) {
    logger.debug('---------------Handling service json file-----------------');
    if (
      !toRelease ||
      !toRelease.variables ||
      !toRelease.variables.servicesJson ||
      !toRelease.variables.servicesJsonVersion ||
      !toRelease.variables.servicesJsonVersionType ||
      (!toRelease.variables.servicesJsonTagPrefix &&
        (!toRelease.environments[0].variables.branch || !fromRelease.environments[0].variables.branch))
    ) {
      logger.warn(`missing variables in release`);
      logger.warn(
        `required: servicesJson, servicesJsonVersion, servicesJsonVersionType, servicesJsonTagPrefix/branchto-from`
      );
      return;
    }

    let servicesJsonFileGitPath = toRelease.variables.servicesJson.value;
    let servicesJsonFileName = servicesJsonFileGitPath.split(`?`).pop();
    servicesJsonFileName = servicesJsonFileName.replace('path=', '');
    let servicesJsonFileGitRepo = servicesJsonFileGitPath.split(`?`)[0];
    let servicesJsonFileGitRepoName = servicesJsonFileGitRepo.split('/').pop();
    let servicesJsonFileGitRepoApiUrl = servicesJsonFileGitRepo.replace('/_git/', '/_apis/git/repositories/');

    let servicesJsonVersion = toRelease.variables.servicesJsonVersion.value;
    let servicesJsonVersionType = toRelease.variables.servicesJsonVersionType.value;
    let fromBranch = '';
    let toBranch = '';
    // ARGOS releases

    /* We search for servicesJsonTagPrefix in variables. it will be "ARGOS-"
    Then we build tag name, from tag prefix + ARGOS release number. it will be ARGOS-1.0.64 for example
    we use tag name for current release and for previous release we run this from tag to tag

    MEWP Releases
    We search for branch in variables.
    We use branch name for current release and for previous release we run this from branch to branch
    */

    let servicesJsonTagPrefix = '';

    if (toRelease.variables.servicesJsonTagPrefix) {
      servicesJsonTagPrefix = toRelease.variables.servicesJsonTagPrefix.value;
    }
    let releaseBranchName = '';
    if (toRelease.environments[0].variables.branch) {
      releaseBranchName = toRelease.environments[0].variables?.branch?.value;
      fromBranch = fromRelease?.environments[0].variables?.branch?.value?.trim();
      toBranch = toRelease?.environments[0].variables?.branch?.value?.trim();
    }

    // fetch the serviceJson file
    let serviceJsonFile: any = await provider.GetFileFromGitRepo(
      projectId,
      servicesJsonFileGitRepoName,
      servicesJsonFileName,
      { version: servicesJsonVersion, versionType: servicesJsonVersionType },
      servicesJsonFileGitRepoApiUrl
    );

    if (!serviceJsonFile) {
      logger.warn(`file ${servicesJsonFileGitPath} could not be fetched`);
      return;
    }

    serviceJsonFile = JSON.parse(serviceJsonFile);

    const services = serviceJsonFile.services;
    logger.debug(`Found ${services.length} services in ${servicesJsonFileName}`);
    for (const service of services) {
      logger.debug('---------------Iterating service-----------------');
      logger.debug(`Processing service: ${service.serviceName}`);
      let fromVersion = '';
      let toVersion = '';
      let fromVersionType = '';
      let toVersionType = '';
      let fromTag = '';
      let toTag = '';

      let repoName = service.serviceLocation.gitRepoUrl.split('/').pop();
      repoName = repoName?.replace(/%20/g, ' ');
      let serviceGitRepoApiUrl = service.serviceLocation.gitRepoUrl.replace(
        '/_git/',
        '/_apis/git/repositories/'
      );
      logger.info(
        `Processing service: ${service.serviceName} | Repo: ${repoName} | API URL: ${serviceGitRepoApiUrl}`
      );
      if (servicesJsonTagPrefix !== '') {
        fromTag = `${servicesJsonTagPrefix}${fromRelease.name}`;
        toTag = `${servicesJsonTagPrefix}${toRelease.name}`;
        logger.info(`Using TAG mode: ${fromTag} → ${toTag}`);

        let fromTagData = await provider.GetTag(serviceGitRepoApiUrl, fromTag);

        if (!fromTagData || !fromTagData.value || fromTagData?.count == 0) {
          logger.warn(
            `Service ${service.serviceName}: Source tag '${fromTag}' does not exist in repository ${repoName}`
          );
          continue;
        }

        let toTagData = await provider.GetTag(serviceGitRepoApiUrl, toTag);
        if (!toTagData || !toTagData.value || toTagData?.count == 0) {
          logger.warn(
            `Service ${service.serviceName}: Target tag '${toTag}' does not exist in repository ${repoName}`
          );
          continue;
        }

        fromVersion = fromTag;
        toVersion = toTag;
        fromVersionType = 'Tag';
        toVersionType = 'Tag';
      } else if (releaseBranchName !== '') {
        logger.info(`Using BRANCH mode: ${fromBranch} → ${toBranch}`);
        let fromBranchData = await provider.GetBranch(serviceGitRepoApiUrl, fromBranch);

        if (!fromBranchData || !fromBranchData.value || fromBranchData?.count == 0) {
          logger.warn(
            `Service ${service.serviceName}: Source branch '${fromBranch}' does not exist in repository ${repoName}`
          );
          continue;
        }

        let toBranchData = await provider.GetBranch(serviceGitRepoApiUrl, toBranch);
        if (!toBranchData || !toBranchData.value || toBranchData?.count == 0) {
          logger.warn(
            `Service ${service.serviceName}: Target branch '${toBranch}' does not exist in repository ${repoName}`
          );
          continue;
        }

        fromVersion = fromBranch;
        toVersion = toBranch;
        fromVersionType = 'Branch';
        toVersionType = 'Branch';
      }

      let itemPaths = service.serviceLocation.pathInGit.split(',');
      for (const itemPath of itemPaths) {
        // check if item exists in from tag
        let itemExistingInVersion = await provider.CheckIfItemExist(serviceGitRepoApiUrl, itemPath, {
          version: fromVersion,
          versionType: fromVersionType,
        });
        if (!itemExistingInVersion) {
          logger.warn(
            `Service ${
              service.serviceName
            }: Path '${itemPath}' does not exist in source ${fromVersionType.toLowerCase()} '${fromVersion}'`
          );
          continue;
        }

        itemExistingInVersion = await provider.CheckIfItemExist(serviceGitRepoApiUrl, itemPath, {
          version: toVersion,
          versionType: toVersionType,
        });
        if (!itemExistingInVersion) {
          logger.warn(
            `Service ${
              service.serviceName
            }: Path '${itemPath}' does not exist in target ${toVersionType.toLowerCase()} '${toVersion}'`
          );
          continue;
        }

        logger.info(
          `Service ${
            service.serviceName
          }: Getting commit changes for path '${itemPath}' from ${fromVersionType.toLowerCase()} '${fromVersion}' to ${toVersionType.toLowerCase()} '${toVersion}'`
        );

        const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
          provider,
          projectId,
          fromVersion,
          fromVersionType,
          toVersion,
          toVersionType,
          repoName,
          serviceGitRepoApiUrl,
          this.includedWorkItemByIdSet,
          undefined,
          itemPath,
          this.linkedWiOptions
        );

        this.isChangesReachedMaxSize(this.rangeType, allExtendedCommits?.length);
        logger.info(
          `Service ${service.serviceName}: Found ${
            allExtendedCommits?.length || 0
          } commits with work items and ${commitsWithNoRelations?.length || 0} commits without work items`
        );
        this.rawChangesArray.push({
          artifact: { name: `Service: ${service.serviceName}` },
          changes: [...allExtendedCommits],
          nonLinkedCommits: [...commitsWithNoRelations],
        });
      }
    }
  }

  /*arranging the test data for json skins package*/
  async jsonSkinDataAdapter(adapterType: string, rawData: any, allowBiggerThan500: boolean = false) {
    logger.info(`adapting ${adapterType} data`);
    let adoptedData = undefined;
    try {
      switch (adapterType) {
        case 'release-components':
          const releaseComponentDataRawAdapter = new ReleaseComponentDataSkinAdapter();
          adoptedData = releaseComponentDataRawAdapter.jsonSkinAdapter(rawData);
          break;
        case 'system-overview':
          logger.info('adapting system overview data');
          const systemOverviewDataAdapter = new SystemOverviewDataSkinAdapter(
            this.teamProject,
            this.templatePath,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT,
            this.formattingSettings,
            allowBiggerThan500
          );
          adoptedData = await systemOverviewDataAdapter.jsonSkinAdapter(rawData);
          logger.debug(
            `attachment data ${JSON.stringify(systemOverviewDataAdapter.getAttachmentMinioData())}`
          );
          this.attachmentMinioData.push(...systemOverviewDataAdapter.getAttachmentMinioData());
          break;
        case 'changes':
          logger.info(`jsonSkinDataAdapter: Processing 'changes' - rawChangesArray has ${this.rawChangesArray.length} artifacts`);
          this.rawChangesArray.forEach((item: any, index: number) => {
            logger.debug(`  Artifact #${index + 1}: "${item.artifact?.name || 'N/A'}" with ${item.changes?.length || 0} changes`);
          });
          
          const filteredChangesArray = this.rawChangesArray.map((item: any) => {
            const originalCount = item?.changes?.length || 0;
            const filteredChanges = this.filterChangesByWorkItemOptions(item?.changes || []);
            const filteredCount = filteredChanges.length;
            if (originalCount !== filteredCount) {
              logger.info(`  Filtered artifact "${item.artifact?.name}": ${originalCount} → ${filteredCount} changes`);
            }
            return {
              ...item,
              changes: filteredChanges,
            };
          });
          
          logger.info(`jsonSkinDataAdapter: After filtering, passing ${filteredChangesArray.length} artifacts to adapter`);
          let changesTableDataSkinAdapter = new ChangesTableDataSkinAdapter(
            filteredChangesArray,
            this.includeChangeDescription,
            this.includeCommittedBy,
            this.teamProject,
            this.templatePath,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT,
            this.formattingSettings
          );
          await changesTableDataSkinAdapter.adoptSkinData();
          this.attachmentMinioData.push(...changesTableDataSkinAdapter.attachmentMinioData);
          adoptedData = changesTableDataSkinAdapter.getAdoptedData();
          break;
        case 'non-associated-commits':
          let notAssociatedCommits = this.rawChangesArray.filter(
            (change) => change.nonLinkedCommits?.length > 0
          );
          let nonAssociatedCommitsSkinAdapter = new NonAssociatedCommitsDataSkinAdapter(
            notAssociatedCommits,
            this.includeCommittedBy
          );
          await nonAssociatedCommitsSkinAdapter.adoptSkinData();
          adoptedData = nonAssociatedCommitsSkinAdapter.getAdoptedData();
          break;
        case 'installation-instructions':
          try {
            logger.debug(`Processing installation instructions from ${this.attachmentWikiUrl}`);

            if (!this.attachmentWikiUrl) {
              logger.warn('No attachment wiki URL provided for installation instructions');
              break;
            }
            logger.debug(`Attachment wiki URL: ${this.attachmentWikiUrl}`);
            // Extract file name from URL
            const encodedFileName = this.attachmentWikiUrl.substring(
              this.attachmentWikiUrl.lastIndexOf('/') + 1,
              this.attachmentWikiUrl.length
            );
            const fileName = decodeURIComponent(encodedFileName);
            logger.debug(`File name extracted: ${fileName}`);

            // Add to attachment tracking
            this.attachmentMinioData.push({
              attachmentMinioPath: this.attachmentWikiUrl,
              minioFileName: fileName,
            });

            // Format data for the skin adapter
            const localPath = `TempFiles/${fileName}`;

            adoptedData = [
              {
                title: 'Installation Instructions',
                attachment: {
                  attachmentFileName: fileName,
                  attachmentLink: localPath,
                  relativeAttachmentLink: localPath,
                  attachmentMinioPath: this.attachmentWikiUrl,
                  minioFileName: fileName,
                },
              },
            ];

            logger.debug(`Installation instructions processed successfully`);
          } catch (error) {
            logger.error(`Error processing installation instructions: ${error.message}`);
            logger.error(error.stack);
          }
          break;
        case 'possible-problems-known-errors':
          let bugsDataSkinAdapter = new BugsTableSkinAdapter(rawData);
          bugsDataSkinAdapter.adoptSkinData();
          adoptedData = bugsDataSkinAdapter.getAdoptedData();
          break;
        default:
          break;
      }
    } catch (err: any) {
      logger.error(`Failed adapting data for type ${adapterType}: ${err.message}`);
      throw err;
    }
    return adoptedData;
  } //jsonSkinDataAdpater

  getRawData() {
    return this.rawChangesArray;
  } //getRawData

  getAdoptedData() {
    return this.adoptedChangeData;
  } //getAdoptedData

  getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }
}
