import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';
import GitDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/GitDataProvider';
import PipelinesDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/PipelinesDataProvider';
import { Artifact } from '../models/contentControl';
import { version } from 'os';
import JfrogDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/JfrogDataProvider';
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
  adoptedChangeData: any;
  branchName: string;
  includePullRequests: boolean;
  includeChangeDescription: boolean;
  includeCommittedBy: boolean;
  tocTitle?: string;

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
    tocTitle?: string
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
  } //constructor

  /*fetches Change table data and adopts it to json skin format */
  async fetchData() {
    try {
      let focusedArtifact;
      let artifactChanges;
      let origin;
      let gitDataProvider = await this.dgDataProviderAzureDevOps.getGitDataProvider();
      let jfrogDataProvider = await this.dgDataProviderAzureDevOps.getJfrogDateProvider();
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
    } catch (error: any) {
      logger.error(error.message);
    }
  } //fetchData

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
      const foundItems = await gitDataProvider.getItemsForPipelineRange(this.teamProject, extendedCommits, {
        repoName: gitRepoName,
        url: gitRepoUrl,
      });
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
      pipelineTitle
    );
    await buildChangeFactory.fetchData();
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
    const fromBuildVersion = fromArtifact.definitionReference['definition'].version;
    const toBuildName = toArtifact.definitionReference['definition'].name;
    const toBuildVersion = toArtifact.definitionReference['definition'].version;

    logger.info(`Fetch CI data from JFrog: ${jFrogUrl}`);
    const toCiUrl = await provider.getCiDataFromJfrog(jFrogUrl, toBuildName, toBuildVersion);
    if (!toCiUrl) {
      return;
    }

    const fromCiUrl = await provider.getCiDataFromJfrog(jFrogUrl, fromBuildName, fromBuildVersion);
    if (!fromCiUrl) {
      return;
    }

    // Determine if CI or Release
    const toUrlSuffix = toCiUrl.split('/').pop();
    let jfrogUploader = '';
    if (toUrlSuffix.startsWith('_release?releaseId=')) {
      jfrogUploader = 'release';
    } else if (toUrlSuffix.startsWith('_build?buildId=')) {
      jfrogUploader = 'ci';
    } else {
      return; // Unsupported suffix
    }

    const toBuildId = toCiUrl.split('=').pop();
    const fromBuildId = fromCiUrl.split('=').pop();

    // Extract project info if needed
    const toTfsAndProject = toCiUrl.replace(toCiUrl.split('/').pop(), '');
    const toTeamProject = toTfsAndProject.split('/')[toTfsAndProject.split('/').length - 2];

    const tocTitle = `Artifactory ${toBuildName} ${toBuildVersion}`;
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
      tocTitle
    );

    await buildChangeFactory.fetchData();
    const rawData = buildChangeFactory.getRawData();
    logger.debug(`raw data for ${jfrogUploader} ${JSON.stringify(rawData)}`);
    this.rawChangesArray.push(...rawData);
  }

  /*arranging the test data for json skins package*/
  async jsonSkinDataAdpater() {
    let changesTableDataSkinAdapter = new ChangesTableDataSkinAdapter(
      this.rawChangesArray,
      this.includeChangeDescription,
      this.includeCommittedBy
    );
    changesTableDataSkinAdapter.adoptSkinData();
    this.adoptedChangeData = changesTableDataSkinAdapter.getAdoptedData();
  } //jsonSkinDataAdpater

  getRawData() {
    return this.rawChangesArray;
  } //getRawData

  getAdoptedData() {
    return this.adoptedChangeData;
  } //getAdoptedData
}
