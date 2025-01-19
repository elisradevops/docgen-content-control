import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';
import GitDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/GitDataProvider';
import PipelinesDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/PipelinesDataProvider';
import { Artifact, contentControl } from '../models/contentControl';
import { version } from 'os';
import ReleaseComponentDataSkinAdapter from '../adapters/ReleaseComponentsDataSkinAdapter';
import SystemOverviewDataSkinAdapter from '../adapters/SystemOverviewDataSkinAdapter';
import BugsTableSkinAdapter from '../adapters/BugsTableSkinAdpater';
import { log } from 'console';
const styles = {
  isBold: false,
  IsItalic: false,
  IsUnderline: false,
  Size: 12,
  Uri: null,
  Font: 'Arial',
  InsertLineBreak: false,
  InsertSpace: false,
};

export default class ChangeDataFactory {
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  teamProject: string;
  templatePath: string;

  repoId: string;
  from: string | number;
  to: string | number;
  rangeType: string;
  linkTypeFilterArray: string[];
  contentControlTitle: string;
  headingLevel?: number;

  rawChangesArray: any = [];
  adoptedChangeData: any[] = [];
  branchName: string;
  includePullRequests: boolean;
  includeChangeDescription: boolean;
  includeCommittedBy: boolean;
  tocTitle?: string;
  queriesRequest: any;
  includedWorkItemByIdSet: Set<number>;
  private attachmentMinioData: any[]; //attachment data
  private attachmentsBucketName: string;
  private minioEndPoint: string;
  private minioAccessKey: string;
  private minioSecretKey: string;
  private PAT: string;
  constructor(
    teamProjectName,
    repoId: string,
    from: string | number,
    to: string | number,
    rangeType: string,
    linkTypeFilterArray: string[],
    branchName: string,
    includePullRequests: boolean,
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
    includedWorkItemByIdSet: Set<number> = undefined
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
  } //constructor

  async fetchSvdData() {
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
    if (this.rawChangesArray.length > 0) {
      this.adoptedChangeData.push({
        contentControl: 'required-states-and-modes',
        data: await this.jsonSkinDataAdapter('changes', this.rawChangesArray),
        skin: 'required-states-and-modes-skin',
      });
    }
    //4.get installation data (via file) installation-instructions-content-control
    const installationInstruction = [];
    if (installationInstruction.length > 0) {
      this.adoptedChangeData.push({
        contentControl: 'installation-instructions-content-control',
        data: await this.jsonSkinDataAdapter('installation-instructions', installationInstruction), //TBD need to add a check box to either include new file or not
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
        logger.info('starting to fetch system overview query results');

        logger.info('fetching results');
        let systemOverviewQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.sysOverviewQuery.wiql.href,
          false,
          null
        );
        logger.info(`system overview are ${systemOverviewQueryData ? 'ready' : 'not found'}`);
        queryResults['systemOverviewQueryData'] = systemOverviewQueryData;
      }

      if (this.queriesRequest.knownBugsQuery) {
        logger.info('starting to fetch known bugs query results');

        logger.info('fetching results');
        let knownBugsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.knownBugsQuery.wiql.href,
          true,
          null
        );
        logger.info(`known bugs query results are ${knownBugsQueryData ? 'ready' : 'not found'}`);
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
          let commitsInCommitRange = await gitDataProvider.GetCommitsInCommitRange(
            this.teamProject,
            this.repoId,
            String(this.to),
            String(this.from)
          );
          artifactChanges = await gitDataProvider.GetItemsInCommitRange(
            this.teamProject,
            this.repoId,
            commitsInCommitRange
          );
          this.rawChangesArray.push({
            artifact: focusedArtifact,
            changes: artifactChanges,
          });
          break;
        case 'date':
          // Adjust 'from' to the start of the day
          const fromDate = new Date(this.from);
          fromDate.setHours(0, 0, 0, 0);
          this.from = fromDate.toISOString();

          // Adjust 'to' to the end of the day
          const toDate = new Date(this.to);
          toDate.setHours(23, 59, 59, 999);
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
            console.log(this.includePullRequests);
            artifactChanges = await gitDataProvider.GetPullRequestsInCommitRangeWithoutLinkedItems(
              this.teamProject,
              this.repoId,
              commitsInDateRange
            );
          } else {
            console.log(this.includePullRequests);
            artifactChanges = await gitDataProvider.GetItemsInCommitRange(
              this.teamProject,
              this.repoId,
              commitsInDateRange
            );

            let repoName = repo.name;

            if (commitsInDateRange.count > 0) {
              const { value: commits } = commitsInDateRange;
              let firstCommitObject = commits[commits.length - 1]; // last commit is the oldest
              let lastCommitObject = commits[0]; // first commit is the latest
              let fromCommit = firstCommitObject.commitId;
              let toCommit = lastCommitObject.commitId;
              const submoduleItems = await this.parseSubModules(
                gitDataProvider,
                this.teamProject,
                repoName,
                toCommit,
                fromCommit,
                commits
              );

              //add targetRepo property for each item
              if (artifactChanges.length > 0 && submoduleItems.length > 0) {
                for (const item of artifactChanges) {
                  item.targetRepo = {
                    repoName: repoName,
                    url: repo.url,
                    projectId: repo.project.id,
                  };
                }
                artifactChanges.push(...submoduleItems);
              }
            }
          }

          this.rawChangesArray.push({
            artifact: { name: '' },
            changes: artifactChanges,
          });
          break;

        case 'pipeline':
          artifactChanges = await this.GetPipelineChanges(
            pipelinesDataProvider,
            gitDataProvider,
            this.teamProject,
            this.to,
            this.from
          );
          this.rawChangesArray.push({
            artifact: { name: this.tocTitle || '' },
            changes: artifactChanges,
          });
          break;
        case 'release':
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
                    await handler(fromReleaseArtifact, toReleaseArtifact, this.teamProject, gitDataProvider);
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

        default:
          break;
      }

      logger.info(`fetch ${this.rawChangesArray.length} changes for range`);
      //Clear the set after finishing
    } catch (error: any) {
      logger.error(error.message);
    }
  } //fetchChangesData

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
  ): Promise<any[]> {
    const artifactChanges = [];
    try {
      let targetBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, Number(to));

      if (targetBuild.result !== 'succeeded') {
        throw new Error(`The selected ${to} build has not been succeeded`);
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
          return artifactChanges;
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
          const pipelineRangeItems = await this.getCommitRangeChanges(
            gitDataProvider,
            teamProject,
            fromCommit,
            toCommit,
            gitRepoName,
            gitRepoUrl,
            this.includedWorkItemByIdSet
          );

          artifactChanges.push(...pipelineRangeItems);
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
          const reportPartsForRepo = await this.GetPipelineChanges(
            pipelinesDataProvider,
            gitDataProvider,
            targetResourcePipelineTeamProject,
            targetResourcePipelineRunId,
            sourceResourcePipelineRunId
          );

          if (reportPartsForRepo) {
            artifactChanges.push(...reportPartsForRepo);
          }
        }
      }
    } catch (error: any) {
      logger.error(`could not handle pipeline ${error.message}`);
    }
    return artifactChanges;
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
    fromCommit: any,
    toCommit: any,
    gitRepoName: any,
    gitRepoUrl: any,
    includedWorkItemByIdSet: Set<number> = undefined
  ) {
    const pipelineRangeItems: any[] = [];
    try {
      let gitApisUrl = gitRepoUrl.includes('_git')
        ? gitRepoUrl.replace('_git', '_apis/git/repositories')
        : gitRepoUrl;

      let extendedCommits = await gitDataProvider.GetCommitBatch(
        gitApisUrl,
        { version: fromCommit, versionType: 'commit' },
        { version: toCommit, versionType: 'commit' }
      );

      if (extendedCommits?.length > 0) {
        const foundItems = await gitDataProvider.getItemsForPipelineRange(
          teamProject,
          extendedCommits,
          {
            repoName: gitRepoName,
            url: gitApisUrl,
          },
          includedWorkItemByIdSet
        );
        pipelineRangeItems.push(...foundItems);
        const submoduleItems = await this.parseSubModules(
          gitDataProvider,
          teamProject,
          gitRepoName,
          toCommit,
          fromCommit,
          extendedCommits,
          includedWorkItemByIdSet
        );
        pipelineRangeItems.push(...submoduleItems);
      }
    } catch (error: any) {
      logger.error(`could not handle ${gitRepoName} ${error.message}`);
      logger.error(`Error stack: `, error.stack);
    }
    return pipelineRangeItems;
  }

  private async parseSubModules(
    gitDataProvider: GitDataProvider,
    teamProject: string,
    gitRepoName: any,
    toCommit: any,
    fromCommit: any,
    allCommitsExtended: any[],
    includedWorkItemByIdSet: Set<number> = undefined
  ) {
    const itemsToReturn: any[] = [];
    try {
      const submodules = await gitDataProvider.getSubmodulesData(
        teamProject,
        gitRepoName,
        { version: toCommit, versionType: 'commit' },
        { version: fromCommit, versionType: 'commit' },
        allCommitsExtended
      );

      for (const subModule of submodules) {
        let gitSubRepoUrl = subModule.gitSubRepoUrl;
        let gitSubRepoName = subModule.gitSubRepoName;
        let sourceSha1 = subModule.sourceSha1;
        let targetSha1 = subModule.targetSha1;

        const items = await this.getCommitRangeChanges(
          gitDataProvider,
          teamProject,
          sourceSha1,
          targetSha1,
          gitSubRepoName,
          gitSubRepoUrl,
          includedWorkItemByIdSet
        );

        itemsToReturn.push(...items);
      }
    } catch (error: any) {
      logger.error(`could not handle submodules ${error.message}`);
    }
    return itemsToReturn;
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
      this.includedWorkItemByIdSet
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

    const pipelineRangeItems = await this.getCommitRangeChanges(
      provider,
      teamProject,
      fromArtifact.definitionReference['version'].id,
      toArtifact.definitionReference['version'].id,
      toArtifact.definitionReference['definition'].name,
      gitRepo.url,
      this.includedWorkItemByIdSet
    );
    this.rawChangesArray.push({
      artifact: { name: gitTitle || '' },
      changes: [...pipelineRangeItems],
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
    let jfrogUploader = '';
    if (toUrlSuffix.startsWith('_release?releaseId=')) {
      jfrogUploader = 'release';
    } else if (toUrlSuffix.startsWith('_build?buildId=')) {
      jfrogUploader = 'pipeline';
    } else {
      return; // Unsupported suffix
    }

    const toBuildId = toUrlSuffix.split('=').pop();
    logger.debug(`to build ${toBuildId}`);
    const fromBuildId = fromUrlSuffix.split('=').pop();
    logger.debug(`from build ${fromBuildId}`);
    const tocTitle = `Artifactory ${toBuildName} ${toBuildVersion}`;

    try {
      // Extract project info if needed
      const toTeamProject = toUrlParts.pop(); //Ejecting the project name
      logger.debug(`toTeamProject ${toTeamProject}`);
      const buildChangeFactory = new ChangeDataFactory(
        toTeamProject,
        '',
        fromBuildId,
        toBuildId,
        jfrogUploader,
        null,
        '',
        true,
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
        this.includedWorkItemByIdSet
      );

      await buildChangeFactory.fetchChangesData();
      const rawData = buildChangeFactory.getRawData();
      logger.debug(`raw data for ${jfrogUploader} ${JSON.stringify(rawData)}`);
      this.rawChangesArray.push(...rawData);
    } catch (error: any) {
      logger.error(`could not handle ${tocTitle} ${error.message}`);
      logger.error(`Error stack: `, error.stack);
    }
  }

  /*arranging the test data for json skins package*/
  async jsonSkinDataAdapter(adapterType: string, rawData: any) {
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
            this.PAT
          );
          adoptedData = await systemOverviewDataAdapter.jsonSkinAdapter(rawData);
          logger.debug(
            `attachment data ${JSON.stringify(systemOverviewDataAdapter.getAttachmentMinioData())}`
          );
          this.attachmentMinioData.push(...systemOverviewDataAdapter.getAttachmentMinioData());
          break;
        case 'changes':
          let changesTableDataSkinAdapter = new ChangesTableDataSkinAdapter(
            this.rawChangesArray,
            this.includeChangeDescription,
            this.includeCommittedBy
          );
          changesTableDataSkinAdapter.adoptSkinData();
          adoptedData = changesTableDataSkinAdapter.getAdoptedData();
          break;
        case 'installation-instructions':
          //TBD
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
