import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import RichTextDataFactory from './RichTextDataFactory';
import logger from '../services/logger';
import * as cheerio from 'cheerio';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';

export default class ResultDataFactory {
  isSuiteSpecific = false;
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;
  testPlanId: number;
  testSuiteArray: number[];
  resultDataRaw: any[];
  adoptedResultData: any;
  templatePath: string;
  includeAttachments: boolean;
  includeConfigurations: boolean;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  attachmentsBucketName: string;
  attachmentMinioData: any[];

  //TODO: add attachments and hierarchy
  constructor(
    attachmentBucketName: string = '',
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    includeAttachments: boolean = false,
    includeConfigurations: boolean = true,
    dgDataProvider: any,
    templatePath = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    this.attachmentsBucketName = attachmentBucketName;
    this.teamProject = teamProject;
    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.includeAttachments = includeAttachments;
    this.includeConfigurations = includeConfigurations;
    this.dgDataProvider = dgDataProvider;
    this.templatePath = templatePath;
    if (testSuiteArray !== null) {
      this.isSuiteSpecific = true;
    }
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
  }

  public async fetchTestGroupResultSummaryData() {
    try {
      const resultDataProvider = await this.dgDataProvider.getResultDataProvider();
      const testGroupResultsSummaryItems: any[] = await resultDataProvider.getTestGroupResultSummary(
        this.testPlanId.toString(),
        this.teamProject,
        this.testSuiteArray
      );

      if (testGroupResultsSummaryItems.length === 0) {
        throw `No test group found for the specified plan ${this.testPlanId}`;
      }

      this.resultDataRaw = testGroupResultsSummaryItems;
      //TODO: In the future add here the content control types and also handle the attachments
      this.adoptedResultData = await this.jsonSkinDataAdapter();
    } catch (error) {
      logger.error(`Error occurred while trying the fetch Test Group Result Summary Data ${error.message}`);
    }
  }

  public async jsonSkinDataAdapter(adapterType: string = null) {
    //For now we will take only the TestGroupResultSummaryData
    try {
      let adoptedTestResultData;
      switch (adapterType) {
        default:
          let testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          adoptedTestResultData = testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdapter(
            this.resultDataRaw
          );
          break;
      }
      return adoptedTestResultData;
    } catch (error) {
      logger.error(
        `Error occurred during build json Skin data adapter for adapter type: ${adapterType}, ${error.message}`
      );
    }
  }

  public generateAttachmentsData() {
    //TODO: Implement this method with considering the test case attachments
    try {
    } catch (error) {
      //TODO: add error handling
    }
  }

  async getAdoptedResultData() {
    return this.adoptedResultData;
  }

  async getAttachmentsMinioData() {
    return this.attachmentMinioData;
  }
}
