import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';

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
    dgDataProvider: any
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
  } //constructor

  /*fetches Change table data and adopts it to json skin format */
  async fetchData() {
    try {
      let focusedArtifact;
      let artifactChanges;
      let origin;
      let gitDataProvider = await this.dgDataProviderAzureDevOps.getGitDataProvider();
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();
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
              let extendedCommits = await gitDataProvider.GetCommitBatch(
                this.teamProject,
                repoId,
                { version: fromCommit, versionType: 'commit' },
                { version: toCommit, versionType: 'commit' }
              );
              if (extendedCommits?.length > 0) {
                const pipelineRangeItems = await gitDataProvider.getItemsForPipelineRange(
                  this.teamProject,
                  extendedCommits,
                  { repoName: gitRepoName, url: gitRepoUrl }
                );
                artifactChanges.push(...pipelineRangeItems);
              }
            }
          }
          this.rawChangesArray.push({
            artifact: { name: '' },
            changes: artifactChanges,
          });
          break;
        case 'release':
          //get list of artifacts for each release
          let fromRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
            this.teamProject,
            Number(this.from)
          );
          let toRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
            this.teamProject,
            Number(this.to)
          );
          logger.info(`retrived release artifacts for releases : ${fromRelease} - ${toRelease}`);
          //create factory for each aritfact
          await Promise.all(
            toRelease.artifacts.map(async (toArtifact) => {
              let fromArtifact = fromRelease.artifacts.filter(
                (artifact) => artifact.sourceId === toArtifact.sourceId
              );
              //checks if artifacts did not exist in previos release
              fromArtifact = fromArtifact[0] || null;
              if (fromArtifact == null) {
                fromArtifact = toArtifact;
              }
              switch (toArtifact.type) {
                case 'Build':
                  logger.debug(
                    `fetching links between ${fromArtifact.definitionReference.version.id}-${toArtifact.definitionReference.version.id}`
                  );
                  let buildChangeFactory = new ChangeDataFactory(
                    this.teamProject,
                    fromArtifact.definitionReference.repository.name,
                    fromArtifact.definitionReference.version.id,
                    toArtifact.definitionReference.version.id,
                    'pipeline',
                    null,
                    '', // You can provide the appropriate branch name here or an empty string if not applicable
                    true,
                    false,
                    false,
                    this.dgDataProviderAzureDevOps
                  );

                  await buildChangeFactory.fetchData();
                  let rawData = buildChangeFactory.getRawData();
                  this.rawChangesArray = [...this.rawChangesArray, ...rawData];
                  break;
                case 'Git':
                  break;
              }
            })
          );
          break;
        default:
          break;
      }
      logger.info(`fetch ${this.rawChangesArray.length} changes for range`);
    } catch (error: any) {
      logger.error(error.message);
    }
  } //fetchData

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
