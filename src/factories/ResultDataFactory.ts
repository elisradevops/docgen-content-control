import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import TestResultsSummaryDataSkinAdapter from '../adapters/TestResultsSummaryDataSkinAdapter';
import DetailedResultsSummaryDataSkinAdapter from '../adapters/DetailedResultsSummaryDataSkinAdapter';
import OpenPCRsDataSkinAdapter from '../adapters/OpenPCRsDataSkinAdapter';
import TestLogDataSkinAdapter from '../adapters/TestLogDataSkinAdapter';
import StepAnalysisSkinAdapter from '../adapters/StepAnalysisSkinAdapter';
import TestReporterDataSkinAdapter from '../adapters/TestReporterDataSkinAdapter';
import OpenPcrQueryResultsSkinAdapter from '../adapters/OpenPcrQueryResultsSkinAdapter';
import TraceByLinkedPCRAdapter from '../adapters/TraceByLinkedPCRAdapter';

export default class ResultDataFactory {
  isSuiteSpecific = false;
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;
  testPlanId: number;
  testSuiteArray: number[];
  adoptedResultDataArray: any[];
  adoptedQueryResults: any;
  templatePath: string;
  stepExecution: any;
  stepAnalysis: any;
  includeConfigurations: boolean;
  includeHierarchy: boolean;
  openPCRsSelectionRequest: any;
  includeTestLog: boolean;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  attachmentsBucketName: string;
  attachmentMinioData: any[];
  includeHardCopyRun: boolean;
  testToOpenPcrQuery: Map<any, any[]>;
  OpenPcrToTestQuery: Map<any, any[]>;
  openPcrToTestCaseTraceMap: Map<any, any[]>;
  testCaseToOpenPcrTraceMap: Map<any, any[]>;
  testCaseToOpenPcrLookup: Map<number, Set<any>>;

  constructor(
    attachmentBucketName: string = '',
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    stepExecution: any,
    stepAnalysis: any,
    includeConfigurations: boolean = false,
    includeHierarchy: boolean = false,
    openPCRsSelectionRequest: any = undefined,
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
    this.openPCRsSelectionRequest = openPCRsSelectionRequest;
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
    this.openPcrToTestCaseTraceMap = new Map<any, any[]>();
    this.testCaseToOpenPcrTraceMap = new Map<any, any[]>();
    this.testCaseToOpenPcrLookup = new Map<number, Set<any>>();
  }

  public async fetchGetCombinedResultsSummary() {
    try {
      const resultDataProvider = await this.dgDataProvider.getResultDataProvider();
      const {
        combinedResults: combinedResultsItems,
        openPcrToTestCaseTraceMap,
        testCaseToOpenPcrTraceMap,
      } = await resultDataProvider.getCombinedResultsSummary(
        this.testPlanId.toString(),
        this.teamProject,
        this.testSuiteArray,
        this.includeConfigurations,
        this.includeHierarchy,
        this.openPCRsSelectionRequest,
        this.includeTestLog,
        this.stepExecution,
        this.stepAnalysis,
        this.includeHardCopyRun
      );

      if (combinedResultsItems.length === 0) {
        throw `No test data found for the specified plan ${this.testPlanId}`;
      }

      if (openPcrToTestCaseTraceMap) {
        this.openPcrToTestCaseTraceMap = openPcrToTestCaseTraceMap;
      }

      if (testCaseToOpenPcrTraceMap) {
        this.testCaseToOpenPcrTraceMap = testCaseToOpenPcrTraceMap;
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

  public async fetchTestReporterResults(
    selectedFields: string[],
    enableRunTestCaseFilter: boolean,
    enableRunStepStatusFilter: boolean
  ) {
    try {
      const resultDataProvider = await this.dgDataProvider.getResultDataProvider();
      const testResultsItems = await resultDataProvider.getTestReporterResults(
        this.testPlanId.toString(),
        this.teamProject,
        this.testSuiteArray,
        selectedFields,
        enableRunTestCaseFilter,
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

  public async fetchQueryResultsForOpenPCR() {
    const ticketsDataProvider = await this.dgDataProvider.getTicketsDataProvider();
    const testCaseToOpenPcrsMap = new Map<number, Set<any>>();
    if (this.openPCRsSelectionRequest.testToOpenPcrQuery) {
      logger.info('starting to fetch query results');
      logger.info('fetching test - Open PCR results');
      logger.info(`reading query ${this.openPCRsSelectionRequest.testToOpenPcrQuery.title}`);
      let testToOpenPcrQuery: any = await ticketsDataProvider.GetQueryResultsFromWiql(
        this.openPCRsSelectionRequest.testToOpenPcrQuery.wiql.href,
        true,
        testCaseToOpenPcrsMap
      );
      logger.info(`test to open pcr results are ${testToOpenPcrQuery ? 'ready' : 'not found'}`);
      this.testToOpenPcrQuery = testToOpenPcrQuery;
    }
    if (this.openPCRsSelectionRequest.OpenPcrToTestQuery) {
      logger.info('fetching Open PCR - test results');
      logger.info(`reading query ${this.openPCRsSelectionRequest.OpenPcrToTestQuery.title}`);
      let openPcrToTestQuery: any = await ticketsDataProvider.GetQueryResultsFromWiql(
        this.openPCRsSelectionRequest.OpenPcrToTestQuery.wiql.href,
        true,
        testCaseToOpenPcrsMap
      );
      logger.info(`open pcr to test results are ${openPcrToTestQuery ? 'ready' : 'not found'}`);
      this.OpenPcrToTestQuery = openPcrToTestQuery;
    }

    const includeCommonColumnsMode = this.openPCRsSelectionRequest.includeCommonColumnsMode;
    this.adoptedQueryResults = await this.jsonSkinDataAdapter(
      `query-results`,
      null,
      includeCommonColumnsMode
    );
    this.testCaseToOpenPcrLookup = testCaseToOpenPcrsMap;
  }

  async fetchLinkedOpenPcrTrace() {
    try {
      this.adoptedQueryResults = await this.jsonSkinDataAdapter('linked-pcr-trace', []);
    } catch (err) {
      logger.error(`Could not fetch linked open pcr trace: ${err.message}`);
    }
  }

  public async jsonSkinDataAdapter(
    adapterType: string = null,
    rawData: any[],
    includeCommonColumnsMode: string = 'both'
  ): Promise<any> {
    try {
      let adoptedTestResultData: any = {};
      switch (adapterType) {
        case 'test-result-test-group-summary-table':
          const testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          adoptedTestResultData = testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdapter(rawData);
          break;

        case 'linked-pcr-trace':
          const linkedRequirementConfigs = [
            {
              mapData: this.testCaseToOpenPcrTraceMap,
              type: 'test-to-open-pcr',
              adoptedDataKey: 'testToOpenPcrAdoptedData',
            },
            {
              mapData: this.openPcrToTestCaseTraceMap,
              type: 'open-pcr-to-test',
              adoptedDataKey: 'OpenPcrToTestAdoptedData',
            },
          ];

          for (const { mapData, type, adoptedDataKey } of linkedRequirementConfigs) {
            const title = {
              fields: [
                {
                  name: 'Title',
                  value: `${
                    type === 'test-to-open-pcr' ? 'Test Case to Open PCR Table' : 'Open PCR To Test Case'
                  }`,
                },
              ],
              level: 2,
            };
            if (mapData) {
              const linkedPcrSkinAdapter = new TraceByLinkedPCRAdapter(mapData, type);

              linkedPcrSkinAdapter.adoptSkinData();
              const adoptedData = linkedPcrSkinAdapter.getAdoptedData();
              adoptedTestResultData[adoptedDataKey] = { title, adoptedData };
            } else {
              adoptedTestResultData[adoptedDataKey] = { title, adoptedData: null };
            }
          }

          break;

        case 'query-results':
          const queryConfigs = [
            {
              queryResults: this.testToOpenPcrQuery,
              type: 'test-to-open-pcr',
              adoptedDataKey: 'testToOpenPcrAdoptedData',
            },
            {
              queryResults: this.OpenPcrToTestQuery,
              type: 'open-pcr-to-test',
              adoptedDataKey: 'OpenPcrToTestAdoptedData',
            },
          ];
          for (const { queryResults, type, adoptedDataKey } of queryConfigs) {
            const title = {
              fields: [
                {
                  name: 'Title',
                  value: `${
                    type === 'test-to-open-pcr' ? 'Test Case to Open PCR Table' : 'Open PCR To Test Case'
                  }`,
                },
              ],
              level: 2,
            };
            if (queryResults) {
              const queryResultSkinAdapter = new OpenPcrQueryResultsSkinAdapter(
                queryResults,
                type,
                includeCommonColumnsMode
              );

              queryResultSkinAdapter.adoptSkinData();
              const adoptedData = queryResultSkinAdapter.getAdoptedData();
              adoptedTestResultData[adoptedDataKey] = { title, adoptedData };
            } else {
              adoptedTestResultData[adoptedDataKey] = { title, adoptedData: null };
            }
          }
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
