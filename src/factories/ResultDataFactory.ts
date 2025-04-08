import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import TestResultsSummaryDataSkinAdapter from '../adapters/TestResultsSummaryDataSkinAdapter';
import DetailedResultsSummaryDataSkinAdapter from '../adapters/DetailedResultsSummaryDataSkinAdapter';
import TestResultsAttachmentDataFactory from './TestResultsAttachmentDataFactory';
import OpenPCRsDataSkinAdapter from '../adapters/OpenPCRsDataSkinAdapter';
import TestLogDataSkinAdapter from '../adapters/TestLogDataSkinAdapter';
import StepAnalysisSkinAdapter from '../adapters/StepAnalysisSkinAdapter';
import TestReporterDataSkinAdapter from '../adapters/TestReporterDataSkinAdapter';

export default class ResultDataFactory {
  isSuiteSpecific = false;
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;
  testPlanId: number;
  testSuiteArray: number[];
  adoptedResultDataArray: any[];
  templatePath: string;
  stepExecution: any;
  stepAnalysis: any;
  includeConfigurations: boolean;
  includeHierarchy: boolean;
  includeOpenPCRs: boolean;
  includeTestLog: boolean;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  attachmentsBucketName: string;
  attachmentMinioData: any[];
  includeHardCopyRun: boolean;

  constructor(
    attachmentBucketName: string = '',
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    stepExecution: any,
    stepAnalysis: any,
    includeConfigurations: boolean = false,
    includeHierarchy: boolean = false,
    includeOpenPCRs: boolean = false,
    includeTestLog: boolean = false,
    dgDataProvider: any,
    templatePath = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    includeHardCopyRun: boolean = false
  ) {
    this.attachmentsBucketName = attachmentBucketName;
    this.teamProject = teamProject;
    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.stepExecution = stepExecution;
    this.stepAnalysis = stepAnalysis;
    this.includeConfigurations = includeConfigurations;
    this.includeHierarchy = includeHierarchy;
    this.includeOpenPCRs = includeOpenPCRs;
    this.includeTestLog = includeTestLog;
    this.dgDataProvider = dgDataProvider;
    this.templatePath = templatePath;
    if (testSuiteArray !== null) {
      this.isSuiteSpecific = true;
    }
    this.attachmentMinioData = [];
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.includeHardCopyRun = includeHardCopyRun;
  }

  public async fetchGetCombinedResultsSummary() {
    try {
      const resultDataProvider = await this.dgDataProvider.getResultDataProvider();
      const combinedResultsItems = await resultDataProvider.getCombinedResultsSummary(
        this.testPlanId.toString(),
        this.teamProject,
        this.testSuiteArray,
        this.includeConfigurations,
        this.includeHierarchy,
        this.includeOpenPCRs,
        this.includeTestLog,
        this.stepExecution,
        this.stepAnalysis,
        this.includeHardCopyRun
      );

      if (combinedResultsItems.length === 0) {
        throw `No test data found for the specified plan ${this.testPlanId}`;
      }

      this.adoptedResultDataArray = await Promise.all(
        combinedResultsItems.map(async (item) => {
          const adoptedData = await this.jsonSkinDataAdapter(item.skin, item.data);
          return { ...item, data: adoptedData };
        })
      );
    } catch (error) {
      logger.error(`Error occurred while trying the fetch Test Group Result Summary Data ${error.message}`);
    }
  }

  public async fetchTestReporterResults(selectedFields: string[], enableRunStepStatusFilter: boolean) {
    try {
      const resultDataProvider = await this.dgDataProvider.getResultDataProvider();
      const testResultsItems = await resultDataProvider.getTestReporterResults(
        this.testPlanId.toString(),
        this.teamProject,
        this.testSuiteArray,
        selectedFields,
        enableRunStepStatusFilter
      );

      if (testResultsItems.length === 0) {
        throw `No test data found for the specified plan ${this.testPlanId}`;
      }

      this.adoptedResultDataArray = await Promise.all(
        testResultsItems.map(async (item) => {
          const adoptedData = await this.jsonSkinDataAdapter(item.skin, item.data);
          return { ...item, data: adoptedData };
        })
      );
    } catch (error) {
      logger.error(`Error occurred while trying the fetch Test Group Result Summary Data ${error.message}`);
    }
  }

  public async jsonSkinDataAdapter(adapterType: string = null, rawData: any[]): Promise<any> {
    try {
      let adoptedTestResultData;
      switch (adapterType) {
        case 'test-result-test-group-summary-table':
          const testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          adoptedTestResultData = testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdapter(rawData);
          break;

        case 'test-result-table':
          const testResultsSummaryDataSkinAdapter = new TestResultsSummaryDataSkinAdapter();
          adoptedTestResultData = testResultsSummaryDataSkinAdapter.jsonSkinDataAdapter(
            rawData,
            this.includeConfigurations
          );
          break;

        case 'detailed-test-result-table':
          const detailedTestResultsSkinAdapter = new DetailedResultsSummaryDataSkinAdapter(
            this.templatePath,
            this.teamProject,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT
          );
          adoptedTestResultData = await detailedTestResultsSkinAdapter.jsonSkinDataAdapter(rawData);
          break;
        case 'test-reporter-table':
          const testReporterSkinAdapter = new TestReporterDataSkinAdapter(
            this.templatePath,
            this.teamProject
          );
          const adopted = await testReporterSkinAdapter.jsonSkinDataAdapter(rawData);
          adoptedTestResultData = adopted;
          break;
        case 'open-pcr-table':
          const openPCRSkinAdapter = new OpenPCRsDataSkinAdapter();
          adoptedTestResultData = openPCRSkinAdapter.jsonSkinDataAdapter(rawData);
          break;

        case 'test-log-table':
          const testLogSkinAdapter = new TestLogDataSkinAdapter();
          adoptedTestResultData = testLogSkinAdapter.jsonSkinDataAdapter(rawData);
          break;

        case 'step-analysis-appendix-skin':
          const stepAnalysisSkinAdapter = new StepAnalysisSkinAdapter(
            this.dgDataProvider,
            this.templatePath,
            this.teamProject,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT
          );
          adoptedTestResultData = await stepAnalysisSkinAdapter.jsonSkinDataAdapter(
            rawData,
            this.stepAnalysis
          );
          this.attachmentMinioData = this.attachmentMinioData.concat(
            stepAnalysisSkinAdapter.getAttachmentMinioData()
          );

          break;
        case 'step-execution-appendix-skin':
          adoptedTestResultData = rawData;
        default:
          break;
      }
      return adoptedTestResultData;
    } catch (error) {
      logger.error(
        `Error occurred during build json Skin data adapter for adapter type: ${adapterType}, ${error.message}`
      );
      throw error;
    }
  }

  public getAdoptedResultData(): any[] {
    return this.adoptedResultDataArray;
  }

  public getAttachmentsMinioData() {
    return this.attachmentMinioData;
  }
}
