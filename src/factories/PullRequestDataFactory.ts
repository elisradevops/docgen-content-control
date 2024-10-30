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

export default class PullRequestDataFactory {
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  teamProject: string;
  templatePath: string;
  repoId: string;
  prIds: any[];
  linkTypeFilterArray: string[];
  contentControlTitle: string;
  headingLevel?: number;
  rawChangesArray: any = [];
  adoptedChangeData: any;

  constructor(
    teamProjectName,
    repoId: string,
    prIds: any[],
    linkTypeFilterArray: string[],
    dgDataProvider: any
  ) {
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.teamProject = teamProjectName;
    this.repoId = repoId;
    this.prIds = prIds;
    this.linkTypeFilterArray = linkTypeFilterArray;
  } //constructor

  /*fetches Change table data and adopts it to json skin format */
  async fetchData() {
    let focusedArtifact;
    let artifactChanges;
    let gitDataProvider = await this.dgDataProviderAzureDevOps.getGitDataProvider();
    if (this.repoId) {
      focusedArtifact = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
    }
    artifactChanges = await gitDataProvider.GetItemsInPullRequestRange(
      this.teamProject,
      this.repoId,
      this.prIds
    );
    this.rawChangesArray.push({
      artifact: focusedArtifact,
      changes: artifactChanges,
    });
    logger.info(`fetch ${this.rawChangesArray.length} changes for range`);
  } //fetchData

  /*arranging the test data for json skins package*/
  async jsonSkinDataAdpater() {
    let changesTableDataSkinAdapter = new ChangesTableDataSkinAdapter(this.rawChangesArray, true, true);
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
