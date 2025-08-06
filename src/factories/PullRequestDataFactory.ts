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
  attachmentsBucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  attachmentMinioData: any[];
  PAT: string;
  formattingSettings: any;

  constructor(
    teamProjectName,
    repoId: string,
    prIds: any[],
    linkTypeFilterArray: string[],
    dgDataProvider: any,
    templatePath: string,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string,
    formattingSettings: any = {}
  ) {
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.teamProject = teamProjectName;
    this.repoId = repoId;
    this.prIds = prIds;
    this.linkTypeFilterArray = linkTypeFilterArray;
    this.templatePath = templatePath;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentMinioData = [];
    this.formattingSettings = formattingSettings;
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
    let changesTableDataSkinAdapter = new ChangesTableDataSkinAdapter(
      this.rawChangesArray,
      true,
      true,
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
    this.adoptedChangeData = changesTableDataSkinAdapter.getAdoptedData();
  } //jsonSkinDataAdpater

  getRawData() {
    return this.rawChangesArray;
  } //getRawData

  getAdoptedData() {
    return this.adoptedChangeData;
  } //getAdoptedData
}
