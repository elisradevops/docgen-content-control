import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';
import GitDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/GitDataProvider';
import PipelinesDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/PipelinesDataProvider';
import { Artifact, contentControl } from '../models/contentControl';
import { version } from 'os';
import ReleaseComponentDataSkinAdapter from '../adapters/ReleaseComponentsDataSkinAdapter';
import SystemOverviewDataSkinAdapter from '../adapters/SystemOverviewDataSkinAdapter';
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
  systemOverviewRequest: any;
  includedWorkItemByIdSet: Set<number>;
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
    tocTitle?: string,
    systemOverviewRequest: any = undefined,
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
    this.systemOverviewRequest = systemOverviewRequest;
    this.includedWorkItemByIdSet = includedWorkItemByIdSet ?? new Set();
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
    const systemOverViewData = await this.fetchQueryResults();
    if (systemOverViewData.length > 0) {
      this.adoptedChangeData.push({
        contentControl: 'system-overview-content-control',
        data: await this.jsonSkinDataAdapter('system-overview', systemOverViewData),
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
    const knownBugs = [];
    //5. get possible errors or change quest by query possible-problems-known-errors-content-control
    if (knownBugs.length > 0) {
      this.adoptedChangeData.push({
        contentControl: 'possible-problems-known-errors-content-control',
        data: await this.jsonSkinDataAdapter('possible-problems-known-errors', knownBugs), //TBD need to fetch relevant bug queries
        skin: 'possible-problems-known-errors-skin',
      });
    }
  }

  async fetchQueryResults(): Promise<any[]> {
    try {
      const ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      if (this.systemOverviewRequest.selectedQuery) {
        logger.info('starting to fetch query results');

        logger.info('fetching results');
        let systemOverviewQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.systemOverviewRequest.selectedQuery.wiql.href
        );
        logger.info(`system overview are ${systemOverviewQueryData ? 'ready' : 'not found'}`);
        return systemOverviewQueryData;
      }
    } catch (err) {
      logger.error(`Could not fetch query results: ${err.message}`);
    }
    return [];
  }

  /*fetches Change table data and adopts it to json skin format */
  async fetchChangesData() {
    try {
      let focusedArtifact;
      let artifactChanges;
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
          let commitsInDateRange = await gitDataProvider.GetCommitsInDateRange(
            this.teamProject,
            this.repoId,
            String(this.from),
            String(this.to),
            this.branchName
          );

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
          }
          this.rawChangesArray.push({
            artifact: focusedArtifact,
            changes: artifactChanges,
          });
          break;

        case 'pipeline':
          artifactChanges = await this.GetPipelineChanges(
            artifactChanges,
            pipelinesDataProvider,
            gitDataProvider
          );
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
                    await handler(fromReleaseArtifact, toReleaseArtifact, gitDataProvider);
                    break;
                  case 'Artifactory':
                  case 'JFrogArtifactory':
                    await handler(fromReleaseArtifact, toReleaseArtifact, jfrogDataProvider);
                    break;
                  default:
                    await handler(fromReleaseArtifact, toReleaseArtifact);
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

  private async GetPipelineChanges(
    artifactChanges: any,
    pipelinesDataProvider: PipelinesDataProvider,
    gitDataProvider: GitDataProvider
  ) {
    artifactChanges = [];
    let targetBuild = await pipelinesDataProvider.getPipelineFromPipelineId(
      this.teamProject,
      Number(this.to)
    );

    if (targetBuild.result !== 'succeeded') {
      throw new Error(`The selected ${this.to} build has not been succeeded`);
    }

    let targetPipelineId = targetBuild.definition.id;
    let sourceBuild = await pipelinesDataProvider.getPipelineFromPipelineId(
      this.teamProject,
      Number(this.from)
    );
    //Currently not needed
    // if (sourceBuild.result !== 'succeeded') {
    //   //Finding previous successful build
    //   let foundSourcePipelineId = await pipelinesDataProvider.findPreviousPipeline(
    //     this.teamProject,
    //     targetBuild.id,
    //     Number(this.to),
    //     targetBuild,
    //     true
    //   );
    //   if (!foundSourcePipelineId) {
    //     throw new Error(`Could not find a valid pipeline before build #${this.to}`);
    //   }
    //   this.from = Number(foundSourcePipelineId);
    //   sourceBuild = await pipelinesDataProvider.getPipelineFromPipelineId(
    //     this.teamProject,
    //     foundSourcePipelineId
    //   );
    // }
    let sourcePipelineId = sourceBuild.definition.id;

    let sourcePipelineRun = await pipelinesDataProvider.getPipelineRunBuildById(
      this.teamProject,
      sourcePipelineId,
      Number(this.from)
    );

    let targetPipelineRun = await pipelinesDataProvider.getPipelineRunBuildById(
      this.teamProject,
      targetPipelineId,
      Number(this.to)
    );

    const sourceResourceRepositories = await pipelinesDataProvider.getPipelineResourceRepositoriesFromObject(
      sourcePipelineRun,
      gitDataProvider
    );
    const targetResourceRepositories = await pipelinesDataProvider.getPipelineResourceRepositoriesFromObject(
      targetPipelineRun,
      gitDataProvider
    );

    for (const targetPipelineRepo of targetResourceRepositories) {
      let fromPipelineRepoFound = false;
      let gitRepoUrl = targetPipelineRepo.url;
      let gitRepoVersion = targetPipelineRepo.repoSha1;
      let gitRepoName = targetPipelineRepo.repoName;
      let toCommit = gitRepoVersion;
      logger.debug(`Repository ${gitRepoUrl} version ${gitRepoVersion.slice(0, 7)}`);
      for (const sourcePipeline of sourceResourceRepositories) {
        let fromGitRepoUrl = sourcePipeline.url;
        let fromGitRepoVersion = sourcePipeline.repoSha1;
        let fromGitRepoName = sourcePipeline.repoName;

        if (fromGitRepoName !== gitRepoName) {
          continue;
        }

        logger.debug(`Previous repository ${fromGitRepoUrl} version ${fromGitRepoVersion.slice(0, 7)}`);
        fromPipelineRepoFound = true;
        if (fromGitRepoVersion === gitRepoVersion) {
          logger.debug(`Same repository version ${fromGitRepoVersion} nothing to compare`);
        }

        let fromCommit = fromGitRepoVersion;
        let repoId = fromGitRepoUrl.split('/').pop();
        const pipelineRangeItems = await this.getCommitRangeChanges(
          gitDataProvider,
          repoId,
          fromCommit,
          toCommit,
          gitRepoName,
          gitRepoUrl
        );

        artifactChanges.push(...pipelineRangeItems);
      }
    }
    this.rawChangesArray.push({
      artifact: { name: this.tocTitle || '' },
      changes: artifactChanges,
    });
    return artifactChanges;
  }

  private async getCommitRangeChanges(
    gitDataProvider: GitDataProvider,
    repoId: any,
    fromCommit: any,
    toCommit: any,
    gitRepoName: any,
    gitRepoUrl: any
  ) {
    const pipelineRangeItems: any[] = [];
    let extendedCommits = await gitDataProvider.GetCommitBatch(
      this.teamProject,
      repoId,
      { version: fromCommit, versionType: 'commit' },
      { version: toCommit, versionType: 'commit' }
    );
    if (extendedCommits?.length > 0) {
      const foundItems = await gitDataProvider.getItemsForPipelineRange(
        this.teamProject,
        extendedCommits,
        {
          repoName: gitRepoName,
          url: gitRepoUrl,
        },
        this.includedWorkItemByIdSet
      );
      pipelineRangeItems.push(...foundItems);
    }
    return pipelineRangeItems;
  }

  private async handleBuildArtifact(fromArtifact: Artifact, toArtifact: Artifact, provider?: any) {
    const pipelineTitle = `Pipeline ${fromArtifact.definitionReference['definition'].name}`;
    const buildChangeFactory = new ChangeDataFactory(
      this.teamProject,
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
      pipelineTitle,
      this.includedWorkItemByIdSet
    );
    await buildChangeFactory.fetchChangesData();
    const rawData = buildChangeFactory.getRawData();
    this.rawChangesArray.push(...rawData);
  }
  private async handleGitArtifact(fromArtifact: Artifact, toArtifact: Artifact, provider?: any) {
    let gitTitle = `Repository ${toArtifact.definitionReference['definition'].name}`;
    let gitRepo = await provider.GetGitRepoFromRepoId(toArtifact.definitionReference['definition'].id);
    const pipelineRangeItems = await this.getCommitRangeChanges(
      provider,
      toArtifact.definitionReference['definition'].id,
      fromArtifact.definitionReference['version'].id,
      toArtifact.definitionReference['version'].id,
      toArtifact.definitionReference['definition'].name,
      gitRepo.url
    );
    this.rawChangesArray.push({
      artifact: { name: gitTitle || '' },
      changes: [...pipelineRangeItems],
    });
  }
  private async handleArtifactoryArtifact(fromArtifact: Artifact, toArtifact: Artifact, provider?: any) {
    // Extract common logic for JFrog/Artifactory here
    let jFrogUrl = await provider.getServiceConnectionUrlByConnectionId(
      this.teamProject,
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
  async jsonSkinDataAdapter(adapterType: string, rawData: any[]) {
    let adoptedData = undefined;
    try {
      switch (adapterType) {
        case 'release-components':
          const releaseComponentDataRawAdapter = new ReleaseComponentDataSkinAdapter();
          adoptedData = releaseComponentDataRawAdapter.jsonSkinAdapter(rawData);
          break;
        case 'system-overview':
          const systemOverviewDataAdapter = new SystemOverviewDataSkinAdapter(
            this.teamProject,
            this.templatePath
          );
          adoptedData = await systemOverviewDataAdapter.jsonSkinAdapter(rawData);
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
          //TBD
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
}
