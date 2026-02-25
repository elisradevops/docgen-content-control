import Skins from '@elisra-devops/docgen-skins';
import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import TestDataFactory from '../factories/TestDataFactory';
import TraceDataFactory from '../factories/TraceDataFactory';
import RichTextDataFactory from '../factories/RichTextDataFactory';
import ChangeDataFactory from '../factories/ChangeDataFactory';
import ResultDataFactory from '../factories/ResultDataFactory';
import PullRequestDataFactory from '../factories/PullRequestDataFactory';
import logger from '../services/logger';
import { contentControl } from '../models/contentControl';
import * as fs from 'fs';
import * as Minio from 'minio';
import RequirementsDataFactory from '../factories/RequirementsDataFactory';
import { formatLocalILShort } from '../services/adapterUtils';

let defaultStyles = {
  isBold: false,
  IsItalic: false,
  IsUnderline: false,
  Size: 12,
  Uri: null,
  Font: 'Arial',
  InsertLineBreak: false,
  InsertSpace: false,
};

const normalizeKey = (value: any) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normalizeOutcome = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Not Run';
  const normalized = raw.toLowerCase();
  if (normalized === 'unspecified') return 'Not Run';
  if (normalized === 'notapplicable' || normalized === 'not applicable') return 'Not Applicable';
  if (normalized === 'passed') return 'Passed';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'notrun' || normalized === 'not run') return 'Not Run';
  return raw;
};

const toCustomFieldKey = (referenceName: any) => {
  const parts = String(referenceName || '').split('.');
  const last = parts[parts.length - 1] || '';
  if (!last) return '';
  return last.charAt(0).toLowerCase() + last.slice(1);
};

const valueToString = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.displayName) return String(value.displayName);
    if (value.name) return String(value.name);
  }
  return String(value);
};

const readCustomField = (
  customFields: any,
  referenceName: string | undefined,
  fallbackLabels: string[] = []
) => {
  if (!customFields || typeof customFields !== 'object') return '';
  if (referenceName) {
    const key = toCustomFieldKey(referenceName);
    if (key && Object.prototype.hasOwnProperty.call(customFields, key)) {
      const direct = customFields[key];
      if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
        return valueToString(direct);
      }
    }
  }
  if (fallbackLabels.length === 0) return '';
  const fallbackSet = new Set(fallbackLabels.map(normalizeKey));
  for (const [key, value] of Object.entries(customFields)) {
    if (fallbackSet.has(normalizeKey(key))) {
      return valueToString(value);
    }
  }
  return '';
};

const extractRelNumber = (...suiteNames: any[]) => {
  const pattern = /(?:^|[^a-z0-9])rel\s*([0-9]+)/i;
  for (const name of suiteNames) {
    const match = pattern.exec(String(name || ''));
    if (match) return match[1];
  }
  return '';
};

const isMewpProject = (projectName: string | undefined) =>
  String(projectName || '')
    .trim()
    .toLowerCase() === 'mewp';

type MewpExternalFileRef = {
  url?: string;
  text?: string;
  name?: string;
  bucketName?: string;
  objectName?: string;
  sourceType?: 'mewpExternalIngestion' | 'generic';
};

type MewpStandaloneCoverageOptions = {
  externalBugsFile?: MewpExternalFileRef | null;
  externalL3L4File?: MewpExternalFileRef | null;
  mergeDuplicateRequirementCells?: boolean;
};

type MewpCoverageFlatPayload = {
  sheetName?: string;
  columnOrder?: string[];
  rows?: Array<Record<string, any>>;
};

type MewpInternalValidationFlatPayload = {
  sheetName?: string;
  columnOrder?: string[];
  rows?: Array<Record<string, any>>;
};

type MewpResultDataProvider = {
  getMewpL2CoverageFlatResults: (
    testPlanId: string,
    projectName: string,
    selectedSuiteIds?: number[],
    linkedQueryRequest?: any,
    options?: {
      externalBugsFile?: MewpExternalFileRef | null;
      externalL3L4File?: MewpExternalFileRef | null;
    }
  ) => Promise<MewpCoverageFlatPayload>;
  getMewpInternalValidationFlatResults: (
    testPlanId: string,
    projectName: string,
    selectedSuiteIds?: number[],
    linkedQueryRequest?: any,
    options?: {
      debugMode?: boolean;
    }
  ) => Promise<MewpInternalValidationFlatPayload>;
  validateMewpExternalFiles: (options?: {
    externalBugsFile?: MewpExternalFileRef | null;
    externalL3L4File?: MewpExternalFileRef | null;
  }) => Promise<any>;
};

//!ADD HANDLING OF DEFUALT STYLES
export default class DgContentControls {
  uri: string;
  PAT: string;
  jfrogToken?: string;
  teamProjectName: string;
  outputType;
  templatePath;
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  skins: Skins;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioAttachmentData: any[];
  attachmentsBucketName: string;
  jsonFileBucketName: string;
  formattingSettings: any;

  constructor(
    uri,
    PAT,
    attachmentsBucketName,
    teamProjectName,
    outputType,
    templatePath,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    jfrogToken = undefined,
    formattingSettings = undefined
  ) {
    this.uri = uri;
    this.PAT = PAT;
    this.attachmentsBucketName = attachmentsBucketName;
    this.teamProjectName = teamProjectName;
    this.outputType = outputType;
    this.templatePath = templatePath;
    this.minioEndPoint = minioEndPoint.replace(/^https?:\/\//, '');
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.minioAttachmentData = [];
    this.jsonFileBucketName = 'content-controls';
    this.jfrogToken = jfrogToken;
    this.formattingSettings = formattingSettings;
  }

  async init() {
    logger.debug(`Initilizing DGContentControls`);
    //initilizing azureDevops connection
    this.dgDataProviderAzureDevOps = new DgDataProviderAzureDevOps(
      this.uri,
      this.PAT,
      undefined,
      this.jfrogToken
    );
    if (!this.templatePath) {
      this.templatePath = 'template path';
    }
    this.skins = new Skins('json', this.templatePath);

    logger.debug(`Initilized`);
    return true;
  } //init

  async generateDocTemplate() {
    try {
      return this.skins.getDocumentSkin();
    } catch (error) {
      logger.error(`Error initlizing Skins:
      ${error.message})}`);
      throw error;
    }
  }

  async generateContentControl(contentControlOptions) {
    try {
      let contentControlData;
      switch (contentControlOptions.type) {
        case 'query':
          contentControlData = await this.addQueryBasedContent(
            contentControlOptions.data.queryId,
            contentControlOptions.title,
            contentControlOptions.data.skinType,
            contentControlOptions.headingLevel
          );
          break;
        case 'test-description':
          contentControlData = await this.addTestDescriptionContent(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel,
            contentControlOptions.data.includeAttachments,
            contentControlOptions.data.attachmentType,
            contentControlOptions.data.includeHardCopyRun,
            contentControlOptions.data.includeAttachmentContent,
            contentControlOptions.data.includeRequirements,
            contentControlOptions.data.includeCustomerId,
            contentControlOptions.data.linkedMomRequest,
            contentControlOptions.data.traceAnalysisRequest,
            contentControlOptions.data.flatSuiteTestCases
          );

          break;
        case 'trace-table':
          contentControlData = await this.addTraceTableContent(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.data.queryId,
            contentControlOptions.data.linkTypeFilterArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel
          );
          break;
        case 'test-result-test-group-summary-table':
          contentControlData = await this.addCombinedTestResults(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.headingLevel,
            contentControlOptions.data.stepExecution,
            contentControlOptions.data.stepAnalysis,
            contentControlOptions.data.includeConfigurations,
            contentControlOptions.data.includeHierarchy,
            contentControlOptions.data.openPCRsSelectionRequest,
            contentControlOptions.data.includeTestLog,
            contentControlOptions.data.includeHardCopyRun
          );
          break;
        case 'testReporter':
          contentControlData = await this.addTestReporterContent(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.data.selectedFields,
            contentControlOptions.data.allowCrossTestPlan,
            contentControlOptions.data.enableRunTestCaseFilter,
            contentControlOptions.data.enableRunStepStatusFilter,
            contentControlOptions.data.allowGrouping,
            contentControlOptions.data.linkedQueryRequest,
            contentControlOptions.data.errorFilterMode,
            contentControlOptions.data.includeAllHistory,
            contentControlOptions.data.includeMewpL2Coverage,
            contentControlOptions.data.includeInternalValidationReport
          );
          break;
        case 'internalValidationReporter':
            contentControlData = await this.addMewpInternalValidationContent(
              contentControlOptions.data.testPlanId,
              contentControlOptions.data.testSuiteArray,
              contentControlOptions.data.linkedQueryRequest,
              !!contentControlOptions.data.debugMode
            );
            break;
        case 'mewpStandaloneReporter':
          contentControlData = await this.addMewpStandaloneCoverageContent(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.data.linkedQueryRequest,
            {
              externalBugsFile: contentControlOptions.data.externalBugsFile,
              externalL3L4File: contentControlOptions.data.externalL3L4File,
              mergeDuplicateRequirementCells: !!contentControlOptions.data.mergeDuplicateRequirementCells,
            }
          );
          break;
        case 'change-description-table':
          contentControlData = await this.addChangeDescriptionTable(
            contentControlOptions.data.repoId,
            contentControlOptions.data.from,
            contentControlOptions.data.to,
            contentControlOptions.data.rangeType,
            contentControlOptions.data.linkTypeFilterArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel,
            contentControlOptions.data.branchName,
            contentControlOptions.data.includePullRequests,
            contentControlOptions.data.includePullRequestWorkItems,
            contentControlOptions.data.includeChangeDescription,
            contentControlOptions.data.includeCommittedBy,
            contentControlOptions.data.systemOverviewQuery,
            contentControlOptions.data.attachmentWikiUrl,
            contentControlOptions.data.linkedWiOptions,
            contentControlOptions.data.workItemFilterOptions,
            contentControlOptions.data.requestedByBuild,
            contentControlOptions.data.includeUnlinkedCommits,
            contentControlOptions.data.replaceTaskWithParent,
            contentControlOptions.data.compareMode
          );
          break;
        case 'pr-change-description-table':
          contentControlData = await this.addPullRequestDescriptionTable(
            contentControlOptions.data.repoId,
            contentControlOptions.data.prIds,
            contentControlOptions.data.linkTypeFilterArray,
            contentControlOptions.data.workItemFilterOptions,
            contentControlOptions.title,
            contentControlOptions.headingLevel
          );
          break;
        case 'srs-document':
          contentControlData = await this.addSRSContent(
            contentControlOptions.data.queriesRequest,
            contentControlOptions.title,
            contentControlOptions.headingLevel,
            contentControlOptions.data.displayMode
          );
          break;
      }
      let jsonLocalData = await this.writeToJson(contentControlData);
      let jsonData = await this.uploadToMinio(jsonLocalData, this.minioEndPoint, this.jsonFileBucketName);
      this.deleteFile(jsonLocalData);
      return jsonData;
    } catch (error) {
      logger.error(
        `Error initializing Skins: ${error.message} ${
          contentControlOptions.title ? `for ${contentControlOptions.title}` : ''
        } `
      );
      logger.error(`Error stack: ${error.stack}`);
      throw error;
    }
  }

  async addQueryBasedContent(
    queryId: string,
    contentControlTitle: string,
    skinType: string,
    headingLevel?: number,
    contentControl?: contentControl
  ) {
    logger.debug(`running GetQueryResultById with params:
      queryId:${queryId}
      teamProjectName:${this.teamProjectName}`);
    let res: any;
    let ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
    try {
      res = await ticketsDataProvider.GetQueryResultById(queryId, this.teamProjectName);
    } catch (error) {
      logger.error(`Error Quering Azure with query id :${queryId}`);
    }

    for (const wi of res) {
      for (const field of wi.fields) {
        if (field.name === 'Description' || field.name === 'Test Description:') {
          const i = res.indexOf(wi);
          const t = wi.fields.indexOf(field);
          let richTextFactory = new RichTextDataFactory(
            field.value || 'No description',
            this.templatePath,
            this.teamProjectName,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT
          );
          const richText = await richTextFactory.factorizeRichTextData();
          // this.minioAttachmentData = this.minioAttachmentData.concat(richTextFactory.attachmentMinioData);
          res[i].fields[t].value = richText;
        }
      }
    }
    try {
      if (!contentControl) {
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(skinType));
      logger.debug(JSON.stringify(defaultStyles));
      logger.debug(JSON.stringify(headingLevel));
      let skins = await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        skinType,
        res,
        undefined,
        defaultStyles,
        headingLevel
      );
      skins.forEach((skin) => {
        contentControl.wordObjects.push(skin);
      });
      return contentControl;
    } catch (error) {
      logger.error(`Error adding content control: ${error}`);
      throw new Error(`Error adding content control: ${error.message}`);
    }
  }

  async addTestDescriptionContent(
    testPlanId: number,
    testSuiteArray: number[],
    contentControlTitle: string,
    headingLevel?: number,
    includeAttachments: boolean = true,
    attachmentType: string = 'asEmbedded',
    includeHardCopyRun: boolean = false,
    includeAttachmentContent: boolean = false,
    includeRequirements?: boolean,
    includeCustomerId?: boolean,
    linkedMomRequest?: any,
    traceAnalysisRequest?: any,
    flatSuiteTestCases?: boolean
  ) {
    logger.debug(`fetching test data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}`);

    if (!testPlanId) {
      throw new Error('No plan has been selected');
    }

    if (testSuiteArray?.length === 0) {
      throw new Error('No test suites have been selected');
    }
    let testDataFactory: TestDataFactory;
    try {
      testDataFactory = new TestDataFactory(
        this.attachmentsBucketName,
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        includeAttachments,
        attachmentType,
        includeHardCopyRun,
        includeAttachmentContent,
        'planOnly',
        includeRequirements,
        includeCustomerId,
        linkedMomRequest,
        traceAnalysisRequest,
        false,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        undefined,
        this.formattingSettings,
        flatSuiteTestCases
      );

      if (traceAnalysisRequest?.traceAnalysisMode === 'query') {
        await testDataFactory.fetchQueryResults();
      }

      if (linkedMomRequest?.linkedMomMode === 'query') {
        logger.debug(`fetching linked mom results with params:
          linkedMomRequest:${JSON.stringify(linkedMomRequest)}`);
        await testDataFactory.fetchLinkedMomResults();
      }

      //init the adopted data
      await testDataFactory.fetchTestData(traceAnalysisRequest.traceAnalysisMode === 'query');

      if (traceAnalysisRequest?.traceAnalysisMode === 'linkedRequirement') {
        await testDataFactory.fetchLinkedRequirementsTrace();
      }
    } catch (error) {
      logger.error(`Error initializing test data factory ${error.message}`);
      if (!error.message.includes('Warning:')) {
        throw error;
      }
    }
    try {
      const contentControls: contentControl[] = [];

      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TEST_PLAN));
      logger.debug(JSON.stringify(defaultStyles));
      logger.debug(JSON.stringify(headingLevel));

      const baseStyles = {
        IsItalic: false,
        IsUnderline: false,
        Size: 10,
        Uri: null,
        Font: 'Arial',
        InsertLineBreak: false,
        InsertSpace: false,
      };

      const headerStyles = {
        ...baseStyles,
        isBold: true, // Specific to header
      };

      const styles = {
        ...baseStyles,
        isBold: false, // Specific to regular styles
      };

      let attachmentData = testDataFactory.getAttachmentMinioData();
      this.minioAttachmentData = this.minioAttachmentData.concat(attachmentData);
      let skins = await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        this.skins.SKIN_TYPE_TEST_PLAN,
        testDataFactory.adoptedTestData,
        headerStyles,
        styles,
        headingLevel,
        includeAttachments
      );
      const testDescCC = { title: contentControlTitle, wordObjects: [] };
      skins.forEach((skin) => {
        // Check if skin is of type 'paragraph' and contains the text 'Test Description:'
        if (skin.type === 'paragraph' && skin.runs.some((run) => run.text === 'Test Description:')) {
          return; // Skip this skin
        }
        testDescCC.wordObjects.push(skin);
      });
      contentControls.push(testDescCC);

      if (traceAnalysisRequest?.traceAnalysisMode !== 'none') {
        await this.structureTraceSkins(testDataFactory, headerStyles, styles, headingLevel, contentControls);
      }

      return contentControls;
    } catch (error: any) {
      logger.error(`Error adding Test Description content ${error}`);
      throw error;
    }
  }

  private async structureOpenPcrSkins(
    resultDataFactory: ResultDataFactory,
    headerStyles: {
      isBold: boolean;
      IsItalic: boolean;
      IsUnderline: boolean;
      Size: number;
      Uri: any;
      Font: string;
      InsertLineBreak: boolean;
      InsertSpace: boolean;
    },
    styles: {
      isBold: boolean;
      IsItalic: boolean;
      IsUnderline: boolean;
      Size: number;
      Uri: any;
      Font: string;
      InsertLineBreak: boolean;
      InsertSpace: boolean;
    },
    headingLevel: number,
    contentControls: contentControl[]
  ) {
    try {
      const queryResultsConfig = [
        {
          data: resultDataFactory.adoptedQueryResults?.testToOpenPcrAdoptedData || {},
          title: 'test-cases-to-open-pcr-content-control',
          noDataMessage: 'No Test Case to Open PCR query result data',
        },
        {
          data: resultDataFactory.adoptedQueryResults?.OpenPcrToTestAdoptedData || undefined,
          title: 'open-pcr-to-test-cases-content-control',
          noDataMessage: 'No Open PCR to Test Case query result data',
        },
      ];

      for (const { data, title, noDataMessage } of queryResultsConfig) {
        data['errorMessage'] =
          !data['adoptedData'] || data['adoptedData'].length === 0 ? noDataMessage : null;

        const contentControlResults: contentControl = {
          title,
          wordObjects: [],
        };
        const queryResultSkins = await this.skins.addNewContentToDocumentSkin(
          title,
          this.skins.SKIN_TYPE_TRACE,
          data,
          headerStyles,
          styles,
          headingLevel
        );

        queryResultSkins.forEach((skin) => {
          contentControlResults.wordObjects.push(skin);
        });

        contentControls.push(contentControlResults);
      }
    } catch (error) {
      logger.debug(`Error structuring trace skins: ${error.message}`);
      throw error;
    }
  }

  private async structureTraceSkins(
    testDataFactory: TestDataFactory,
    headerStyles: {
      isBold: boolean;
      IsItalic: boolean;
      IsUnderline: boolean;
      Size: number;
      Uri: any;
      Font: string;
      InsertLineBreak: boolean;
      InsertSpace: boolean;
    },
    styles: {
      isBold: boolean;
      IsItalic: boolean;
      IsUnderline: boolean;
      Size: number;
      Uri: any;
      Font: string;
      InsertLineBreak: boolean;
      InsertSpace: boolean;
    },
    headingLevel: number,
    contentControls: contentControl[]
  ) {
    try {
      const queryResultsConfig = [
        {
          data: testDataFactory.adoptedQueryResults?.reqTestAdoptedData || {},
          title: 'requirements-to-test-cases-content-control',
          noDataMessage: 'No Requirement - Test Case query result data',
        },
        {
          data: testDataFactory.adoptedQueryResults?.testReqAdoptedData || undefined,
          title: 'test-cases-to-requirements-content-control',
          noDataMessage: 'No Test Case - Requirement query result data',
        },
      ];

      for (const { data, title, noDataMessage } of queryResultsConfig) {
        data['errorMessage'] =
          !data['adoptedData'] || data['adoptedData'].length === 0 ? noDataMessage : null;

        const contentControlResults: contentControl = {
          title,
          wordObjects: [],
        };
        const queryResultSkins = await this.skins.addNewContentToDocumentSkin(
          title,
          this.skins.SKIN_TYPE_TRACE,
          data,
          headerStyles,
          styles,
          headingLevel
        );

        queryResultSkins.forEach((skin) => {
          contentControlResults.wordObjects.push(skin);
        });

        contentControls.push(contentControlResults);
      }
    } catch (error) {
      logger.debug(`Error structuring trace skins: ${error.message}`);
      throw error;
    }
  }

  async addTraceTableContent(
    testPlanId: number,
    testSuiteArray: number[],
    queryId: string,
    linkTypeFilterArray: string[],
    contentControlTitle: string,
    headingLevel?: number,
    contentControl?: contentControl
  ) {
    let traceFactory;
    logger.debug(`fetching data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      queryId:${queryId}
      filterArray: ${JSON.stringify(linkTypeFilterArray)}
      teamProjectName:${this.teamProjectName}`);
    try {
      traceFactory = new TraceDataFactory(
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        queryId,
        linkTypeFilterArray,
        this.dgDataProviderAzureDevOps
      );
      await traceFactory.fetchData();
    } catch (error) {
      logger.error(`Error initializing trace data factory: ${error.message}`);
      throw error;
    }
    try {
      if (!contentControl) {
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TEST_PLAN));
      logger.debug(JSON.stringify(defaultStyles));
      logger.debug(JSON.stringify(headingLevel));
      let skins = await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        this.skins.SKIN_TYPE_TABLE,
        traceFactory.adoptedData,
        undefined,
        defaultStyles,
        headingLevel
      );
      skins.forEach((skin) => {
        contentControl.wordObjects.push(skin);
      });
      return contentControl;
    } catch (error) {
      logger.error(`Error adding Trace Table: ${error.message}`);
      throw new Error(`Error adding content control: ${error}`);
    }
  }

  async addCombinedTestResults(
    testPlanId: number,
    testSuiteArray: number[],
    headingLevel?: number,
    stepExecution?: any,
    stepAnalysis?: any,
    includeConfigurations: boolean = false,
    includeHierarchy: boolean = false,
    openPCRsSelectionRequest: any = undefined,
    includeTestLog: boolean = false,
    includeHardCopyRun: boolean = false
  ) {
    let resultDataFactory: ResultDataFactory;
    let testDataFactory: TestDataFactory;
    try {
      if (!testPlanId) {
        throw new Error('No plan has been selected');
      }

      if (testSuiteArray?.length === 0) {
        throw new Error('No test suites have been selected');
      }

      if (!this.teamProjectName) {
        throw new Error('Project name is not defined');
      }
      logger.debug(`fetching data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}
      openPCRsSelectionRequest:${JSON.stringify(openPCRsSelectionRequest)}`);

      //Run the result data factory
      resultDataFactory = new ResultDataFactory(
        this.attachmentsBucketName,
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        stepExecution,
        stepAnalysis,
        includeConfigurations,
        includeHierarchy,
        openPCRsSelectionRequest,
        includeTestLog,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        includeHardCopyRun,
        this.formattingSettings
      );

      if (openPCRsSelectionRequest?.openPcrMode === 'query') {
        await resultDataFactory.fetchQueryResultsForOpenPCR();
      }

      await resultDataFactory.fetchGetCombinedResultsSummary();

      if (openPCRsSelectionRequest?.openPcrMode === 'linked') {
        await resultDataFactory.fetchLinkedOpenPcrTrace();
      }

      //TODO: add support for the linked openPCR
    } catch (error) {
      logger.error(`Error initializing result data factory: ${error.message}`);
      throw error;
    }
    try {
      const contentControls: contentControl[] = [];
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      logger.debug(JSON.stringify(defaultStyles));
      logger.debug(JSON.stringify(headingLevel));

      let adoptedDataArray = resultDataFactory.getAdoptedResultData();
      let stepExecutionObject = adoptedDataArray.find(
        (item) => item.contentControl === 'appendix-b-content-control'
      );

      const filteredAdoptedDataArray = adoptedDataArray.filter(
        (item) => item.contentControl !== 'appendix-b-content-control'
      );
      const baseStyles = {
        IsItalic: false,
        IsUnderline: false,
        Size: 10,
        Uri: null,
        Font: 'Arial',
        InsertLineBreak: false,
        InsertSpace: false,
      };

      const headerStyles = {
        ...baseStyles,
        isBold: true, // Specific to header
      };

      const styles = {
        ...baseStyles,
        isBold: false, // Specific to regular styles
      };
      this.minioAttachmentData = this.minioAttachmentData.concat(resultDataFactory.getAttachmentsMinioData());
      let skins = await Promise.all(
        filteredAdoptedDataArray.map(async (element) => {
          const skin = await this.skins.addNewContentToDocumentSkin(
            element.contentControl,
            this.skins.SKIN_TYPE_TABLE_STR,
            element.data,
            headerStyles,
            styles,
            headingLevel,
            //Attachments
            undefined,
            element.insertPageBreak
          );

          return { contentControlTitle: element.contentControl, skin };
        })
      );

      const flatSkins = skins.flat();

      flatSkins.forEach((skinItem) => {
        const { contentControlTitle: title, skin } = skinItem;
        const contentControl = { title, wordObjects: skin };
        contentControls.push(contentControl);
      });

      if (openPCRsSelectionRequest.openPcrMode !== 'none') {
        await this.structureOpenPcrSkins(
          resultDataFactory,
          headerStyles,
          styles,
          headingLevel,
          contentControls
        );
      }

      if (stepExecution?.isEnabled) {
        try {
          //test data factory
          testDataFactory = new TestDataFactory(
            this.attachmentsBucketName,
            this.teamProjectName,
            testPlanId,
            testSuiteArray,
            stepExecution?.generateAttachments.isEnabled,
            stepExecution?.generateAttachments.attachmentType,
            includeHardCopyRun,
            stepExecution?.generateAttachments.includeAttachmentContent,
            stepExecution?.generateAttachments.runAttachmentMode,
            stepExecution?.generateRequirements.isEnabled,
            false,
            stepExecution?.generateRequirements.includeCustomerId,
            stepExecution?.generateRequirements,
            false,
            this.dgDataProviderAzureDevOps,
            this.templatePath,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT,
            stepExecutionObject.data,
            this.formattingSettings,
            stepExecution?.flatSuiteTestCases
          );

          if (stepExecution?.generateRequirements?.requirementInclusionMode === 'query') {
            await testDataFactory.fetchQueryResults();
          }

          await testDataFactory.fetchTestData(
            stepExecution?.generateRequirements?.requirementInclusionMode === 'query'
          );

          if (stepExecution?.generateRequirements?.requirementInclusionMode === 'linkedRequirement') {
            await testDataFactory.fetchLinkedRequirementsTrace();
          }

          let attachmentTestData = testDataFactory.getAttachmentMinioData();
          this.minioAttachmentData = this.minioAttachmentData.concat(attachmentTestData);
          let skins = await this.skins.addNewContentToDocumentSkin(
            stepExecutionObject.contentControl,
            this.skins.SKIN_TYPE_TEST_PLAN,
            testDataFactory.adoptedTestData,
            headerStyles,
            styles,
            headingLevel,
            stepExecution?.generateAttachments.isEnabled,
            undefined,
            true
          );

          const wordObjects: any[] = [];

          skins.forEach((skin) => {
            // Check if skin is of type 'paragraph' and contains the text 'Test Description:'
            if (skin.type === 'paragraph' && skin.runs.some((run) => run.text === 'Test Description:')) {
              return; // Skip this skin
            }
            wordObjects.push(skin);
          });
          contentControls.push({ title: stepExecutionObject.contentControl, wordObjects });
        } catch (error) {
          logger.error(`Error fetching STR Data: ${error.message}`);
          throw error;
        }
      }
      return contentControls;
    } catch (error) {
      logger.error(`Error adding Combined Test results skins for STR ${error.message}`);
      throw error;
    }
  }

  async addTestReporterContent(
    testPlanId: number,
    testSuiteArray: number[],
    selectedFields: string[],
    allowCrossTestPlan: boolean,
    enableRunTestCaseFilter: boolean,
    enableRunStepStatusFilter: boolean,
    allowGrouping?: boolean,
    linkedQueryRequest?: any,
    errorFilterMode?: string,
    includeAllHistory?: boolean,
    includeMewpL2Coverage?: boolean,
    includeInternalValidationReport?: boolean
  ) {
    let resultDataFactory: ResultDataFactory;

    try {
      if (!testPlanId) {
        throw new Error('No plan has been selected');
      }

      if (testSuiteArray?.length === 0) {
        throw new Error('No test suites have been selected');
      }

      if (!this.teamProjectName) {
        throw new Error('Project name is not defined');
      }

      logger.debug(`fetching data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}
      selectedFields:${JSON.stringify(selectedFields)}
      linkedQueryRequest:${JSON.stringify(linkedQueryRequest)}`);

      //Run the result data factory
      resultDataFactory = new ResultDataFactory(
        this.attachmentsBucketName,
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        undefined,
        undefined,
        false,
        false,
        false,
        false,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        false,
        this.formattingSettings
      );

      await resultDataFactory.fetchTestReporterResults(
        selectedFields,
        allowCrossTestPlan,
        enableRunTestCaseFilter,
        enableRunStepStatusFilter,
        linkedQueryRequest,
        errorFilterMode,
        includeAllHistory
      );
    } catch (error) {
      logger.error(`Error initializing result data factory: ${error.message}`);
      throw error;
    }

    try {
      const contentControls: contentControl[] = [];
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      let adoptedDataArray = resultDataFactory.getAdoptedResultData();
      const baseStyles = {
        IsItalic: false,
        IsUnderline: false,
        Size: 10,
        Uri: null,
        Font: 'Arial',
        InsertLineBreak: false,
        InsertSpace: false,
      };

      const headerStyles = {
        ...baseStyles,
        isBold: true, // Specific to header
      };

      const styles = {
        ...baseStyles,
        isBold: false, // Specific to regular styles
      };
      //this.minioAttachmentData = this.minioAttachmentData.concat(resultDataFactory.getAttachmentsMinioData());
      let skins = await Promise.all(
        adoptedDataArray.map(async (element) => {
          const skin = await this.skins.addNewContentToDocumentSkin(
            element.customName,
            this.skins.SKIN_TYPE_TEST_REPORTER,
            element.data,
            headerStyles,
            styles
          );

          return { contentControlTitle: element.contentControl, skin };
        })
      );

      skins.forEach((skinItem) => {
        const { contentControlTitle: title, skin } = skinItem;
        const contentControl = { title, wordObjects: skin, allowGrouping: allowGrouping };
        contentControls.push(contentControl);
      });

      await this.addMewpL2CoverageSheetIfNeeded(
        contentControls,
        testPlanId,
        testSuiteArray,
        includeMewpL2Coverage,
        linkedQueryRequest
      );

      return contentControls;
    } catch (error) {
      logger.error(`Error adding Test Reporter content ${error}`);
      throw error;
    }
  }

  async addTestReporterFlatContent(
    testPlanId: number,
    testSuiteArray: number[] | undefined,
    selectedFields: string[] = [],
    flatFieldMap: Record<string, string> | undefined,
    includeAllHistory: boolean = false
  ) {
    try {
      if (!testPlanId) {
        throw new Error('No plan has been selected');
      }

      if (!this.teamProjectName) {
        throw new Error('Project name is not defined');
      }

      const resultDataProvider = await this.dgDataProviderAzureDevOps.getResultDataProvider();
      const suiteIds =
        Array.isArray(testSuiteArray) && testSuiteArray.length > 0 ? testSuiteArray : undefined;

      const flatResults = await (resultDataProvider as any).getTestReporterFlatResults(
        String(testPlanId),
        this.teamProjectName,
        suiteIds,
        selectedFields,
        includeAllHistory
      );

      const loadingData = formatLocalILShort(new Date());
      const planName = flatResults?.planName || `Test Plan ${testPlanId}`;
      const rows = Array.isArray(flatResults?.rows) ? flatResults.rows : [];

      const mappedRows = rows.map((row: any) => {
        const customFields = row?.customFields || {};
        const suiteName = row?.suiteName || '';
        const numberRel = extractRelNumber(suiteName, row?.parentSuiteName, row?.suitePath);

        const subSystem = readCustomField(customFields, flatFieldMap?.SubSystem, [
          'subsystem',
          'sub system',
          'sub_system',
        ]);
        const assignedTo = readCustomField(customFields, flatFieldMap?.['Assigned To Test'], [
          'assigned to test',
          'assigned to',
        ]);
        const testCaseState = readCustomField(customFields, flatFieldMap?.['testCase.State'], [
          'state',
          'testcase state',
        ]);

        const resultsOutcome = normalizeOutcome(row?.pointOutcome);
        const runStatsOutcome = normalizeOutcome(row?.runStatsOutcome ?? row?.pointOutcome);
        const hasStepData =
          String(row?.stepStepIdentifier ?? '').trim() !== '' ||
          String(row?.stepOutcome ?? '').trim() !== '';
        const stepOutcome = hasStepData ? normalizeOutcome(row?.stepOutcome) : '';
        const rawRunDate = row?.runDateCompleted || row?.executionDate;
        const isZeroDate =
          typeof rawRunDate === 'string' &&
          (/^0000-00-00/i.test(rawRunDate) || /^0001-01-01/i.test(rawRunDate));
        const runDateCompleted = isZeroDate ? '' : formatLocalILShort(rawRunDate);

        return {
          PlanID: row?.planId ?? flatResults?.planId ?? '',
          PlanName: row?.planName ?? planName,
          'Suites.parentSuite.name': row?.parentSuiteName ?? '',
          'Suites.parentSuite.ID': row?.parentSuiteId ?? '',
          'Suites.name': suiteName,
          'Suites.id': row?.suiteId ?? '',
          'Steps.Steps.outcome': stepOutcome,
          'Steps.Steps.stepIdentifier': row?.stepStepIdentifier ?? '',
          SubSystem: subSystem,
          'TestCase.id': row?.testCaseId ?? '',
          'TestCase.name': row?.testCaseName ?? '',
          'testCase.State': testCaseState,
          ResultsOutcome: resultsOutcome,
          'TestCaseResults.RunDateCompleted': runDateCompleted,
          'TestCaseResults.RunStats.outcome': runStatsOutcome,
          'TestCaseResults.testRunId': row?.testRunId ?? '',
          'TestCaseResults.testPointId': row?.testPointId ?? '',
          'Assigned To Test': assignedTo,
          tester: row?.tester ?? '',
          'Number Rel': numberRel,
          'Loading Data': loadingData,
        };
      });

      return {
        title: 'test-reporter-flat-content-control',
        wordObjects: [
          {
            type: 'FlatTestReporter',
            testPlanName: planName,
            rows: mappedRows,
          },
        ],
        allowGrouping: false,
      };
    } catch (error) {
      logger.error(`Error adding flat Test Reporter content ${error.message}`);
      throw error;
    }
  }

  private async getMewpResultDataProvider(): Promise<MewpResultDataProvider> {
    const resultDataProvider = await this.dgDataProviderAzureDevOps.getResultDataProvider();
    return resultDataProvider as unknown as MewpResultDataProvider;
  }

  private async addMewpL2CoverageSheetIfNeeded(
    contentControls: contentControl[],
    testPlanId: number,
    testSuiteArray: number[],
    includeMewpL2Coverage: boolean = true,
    linkedQueryRequest?: any
  ) {
    if (!isMewpProject(this.teamProjectName) || !includeMewpL2Coverage) return;

    try {
      const resultDataProvider = await this.getMewpResultDataProvider();
      const mewpCoverage = await resultDataProvider.getMewpL2CoverageFlatResults(
        String(testPlanId),
        this.teamProjectName,
        testSuiteArray,
        linkedQueryRequest
      );

      const rows = Array.isArray(mewpCoverage?.rows) ? mewpCoverage.rows : [];
      const columnOrder = Array.isArray(mewpCoverage?.columnOrder) ? mewpCoverage.columnOrder : [];
      const sheetName =
        String(mewpCoverage?.sheetName || '').trim() || `MEWP L2 Coverage - Plan ${String(testPlanId)}`;

      contentControls.push({
        title: 'mewp-l2-coverage-content-control',
        wordObjects: [
          {
            type: 'MewpCoverageReporter',
            testPlanName: sheetName,
            columnOrder,
            rows,
          },
        ],
        allowGrouping: false,
      } as any);
    } catch (error) {
      logger.error(`Error adding MEWP L2 coverage sheet ${(error as any)?.message || error}`);
    }
  }

  async addMewpInternalValidationContent(
    testPlanId: number,
    testSuiteArray: number[],
    linkedQueryRequest?: any,
    debugMode: boolean = false
  ) {
    try {
      if (!testPlanId) {
        throw new Error('No plan has been selected');
      }
      if (!testSuiteArray?.length) {
        throw new Error('No test suites have been selected');
      }
      if (!isMewpProject(this.teamProjectName)) {
        throw new Error('Internal Validation report is supported only for MEWP project');
      }

      const resultDataProvider = await this.getMewpResultDataProvider();
      const validationData = await resultDataProvider.getMewpInternalValidationFlatResults(
        String(testPlanId),
        this.teamProjectName,
        testSuiteArray,
        linkedQueryRequest,
        {
          debugMode,
        }
      );
      const rows = Array.isArray(validationData?.rows) ? validationData.rows : [];
      const columnOrder = Array.isArray(validationData?.columnOrder) ? validationData.columnOrder : [];
      const sheetName =
        String(validationData?.sheetName || '').trim() ||
        `MEWP Internal Validation - Plan ${String(testPlanId)}`;

      return {
        title: 'mewp-internal-validation-content-control',
        wordObjects: [
          {
            type: 'InternalValidationReporter',
            testPlanName: sheetName,
            columnOrder,
            rows,
          },
        ],
        allowGrouping: false,
      };
    } catch (error) {
      logger.error(`Error adding MEWP Internal Validation content ${(error as any)?.message || error}`);
      throw error;
    }
  }

  async addMewpStandaloneCoverageContent(
    testPlanId: number,
    testSuiteArray: number[],
    linkedQueryRequest?: any,
    options?: MewpStandaloneCoverageOptions
  ) {
    try {
      if (!testPlanId) {
        throw new Error('No plan has been selected');
      }
      if (!testSuiteArray?.length) {
        throw new Error('No test suites have been selected');
      }
      if (!isMewpProject(this.teamProjectName)) {
        throw new Error('MEWP standalone coverage is supported only for MEWP project');
      }

      const resultDataProvider = await this.getMewpResultDataProvider();
      const mewpCoverage = await resultDataProvider.getMewpL2CoverageFlatResults(
        String(testPlanId),
        this.teamProjectName,
        testSuiteArray,
        linkedQueryRequest,
        {
          externalBugsFile: options?.externalBugsFile,
          externalL3L4File: options?.externalL3L4File,
        }
      );

      const rows = Array.isArray(mewpCoverage?.rows) ? mewpCoverage.rows : [];
      const columnOrder = Array.isArray(mewpCoverage?.columnOrder) ? mewpCoverage.columnOrder : [];
      const sheetName =
        String(mewpCoverage?.sheetName || '').trim() || `MEWP L2 Coverage - Plan ${String(testPlanId)}`;

      return {
        title: 'mewp-l2-implementation-content-control',
        wordObjects: [
          {
            type: 'MewpCoverageReporter',
            testPlanName: sheetName,
            columnOrder,
            rows,
            mergeDuplicateRequirementCells: !!options?.mergeDuplicateRequirementCells,
          },
        ],
        allowGrouping: false,
      };
    } catch (error) {
      logger.error(`Error adding MEWP standalone coverage content ${(error as any)?.message || error}`);
      throw error;
    }
  }

  async validateMewpExternalFiles(options?: {
    externalBugsFile?: MewpExternalFileRef | null;
    externalL3L4File?: MewpExternalFileRef | null;
  }) {
    try {
      if (!isMewpProject(this.teamProjectName)) {
        throw new Error('MEWP external ingestion validation is supported only for MEWP project');
      }
      const resultDataProvider = await this.getMewpResultDataProvider();
      return await resultDataProvider.validateMewpExternalFiles({
        externalBugsFile: options?.externalBugsFile,
        externalL3L4File: options?.externalL3L4File,
      });
    } catch (error) {
      logger.error(`Error validating MEWP external files ${(error as any)?.message || error}`);
      throw error;
    }
  }

  async generateTestReporterFlatContent(contentControlOptions: any) {
    try {
      const data = contentControlOptions?.data || {};
      const contentControlData = await this.addTestReporterFlatContent(
        data.testPlanId,
        data.testSuiteArray,
        data.selectedFields,
        data.flatFieldMap,
        data.includeAllHistory
      );
      let jsonLocalData = await this.writeToJson(contentControlData);
      let jsonData = await this.uploadToMinio(jsonLocalData, this.minioEndPoint, this.jsonFileBucketName);
      this.deleteFile(jsonLocalData);
      return jsonData;
    } catch (error) {
      logger.error(`Error generating flat Test Reporter content ${error.message}`);
      throw error;
    }
  }

  //Test Group Summary

  async addChangeDescriptionTable(
    repoId: string,
    // Can be a string or a number or a GitObject
    from: any,
    // Can be a string or a number or a GitObject
    to: any,
    rangeType: string,
    linkTypeFilterArray: string[],
    contentControlTitle: string,
    headingLevel?: number,
    branchName?: string,
    includePullRequests?: boolean,
    includePullRequestWorkItems?: boolean,
    includeChangeDescription: boolean = false,
    includeCommittedBy: boolean = false,
    systemOverviewQuery: any = null,
    attachmentWikiUrl: string = '',
    linkedWiOptions: any = null,
    workItemFilterOptions: any = null,
    requestedByBuild: boolean = false,
    includeUnlinkedCommits: boolean = false,
    replaceTaskWithParent: boolean = false,
    compareMode: 'consecutive' | 'allPairs' = 'consecutive'
  ) {
    let adoptedChangesData;
    logger.debug(`fetching data with params:
      repoId:${repoId}
      from:${JSON.stringify(from)}
      to:${JSON.stringify(to)}
      rangeType: ${rangeType}
      linkTypeFilterArray:${linkTypeFilterArray}
      teamProjectName:${this.teamProjectName}
      branchName:${branchName}
      includePullRequests:${includePullRequests}
      includePullRequestWorkItems:${includePullRequestWorkItems}
      attachmentsWikiUrl:${attachmentWikiUrl}
      linkedWiOptions:${JSON.stringify(linkedWiOptions)}`);
    try {
      let changeDataFactory = new ChangeDataFactory(
        this.teamProjectName,
        repoId,
        from,
        to,
        rangeType,
        linkTypeFilterArray,
        branchName,
        includePullRequests,
        includePullRequestWorkItems,
        attachmentWikiUrl,
        includeChangeDescription,
        includeCommittedBy,
        this.dgDataProviderAzureDevOps,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        undefined,
        systemOverviewQuery,
        undefined,
        linkedWiOptions,
        requestedByBuild,
        includeUnlinkedCommits,
        this.formattingSettings,
        workItemFilterOptions,
        compareMode,
        replaceTaskWithParent
      );
      await changeDataFactory.fetchSvdData();
      adoptedChangesData = changeDataFactory.getAdoptedData();
      this.minioAttachmentData.push(...changeDataFactory.getAttachmentMinioData());
    } catch (error) {
      logger.error(`Error initializing change table factory: ${error}`);
      throw error;
    }
    try {
      const contentControls: contentControl[] = [];
      const baseStyles = {
        IsItalic: false,
        IsUnderline: false,
        Size: 10,
        Uri: null,
        Font: 'Arial',
        InsertLineBreak: false,
        InsertSpace: false,
      };

      const headerStyles = {
        ...baseStyles,
        isBold: true, // Specific to header
      };

      const styles = {
        ...baseStyles,
        isBold: false, // Specific to regular styles
      };
      for (const element of adoptedChangesData) {
        switch (element.contentControl) {
          case 'required-states-and-modes':
            const contentControl: contentControl = await this.generateChangesSkin(
              element.data,
              contentControlTitle,
              headerStyles,
              styles,
              headingLevel
            );
            contentControls.push(contentControl);
            break;
          case 'non-associated-commits-content-control':
            const nonAssociatedCommitsSkin = await this.skins.addNewContentToDocumentSkin(
              element.contentControl,
              this.skins.SKIN_TYPE_TABLE,
              element.data,
              headerStyles,
              styles,
              headingLevel
            );
            contentControls.push({ title: element.contentControl, wordObjects: nonAssociatedCommitsSkin });
            break;
          case 'system-overview-content-control':
            const overviewSkin = await this.skins.addNewContentToDocumentSkin(
              element.contentControl,
              this.skins.SKIN_TYPE_SYSTEM_OVERVIEW,
              element.data,
              headerStyles,
              styles,
              headingLevel,
              true
            );
            contentControls.push({ title: element.contentControl, wordObjects: overviewSkin });
            break;
          case 'system-installation-content-control':
            const installationSkin = await this.skins.addNewContentToDocumentSkin(
              element.contentControl,
              this.skins.SKIN_TYPE_INSTALLATION,
              element.data,
              headerStyles,
              styles,
              headingLevel,
              true
            );
            contentControls.push({ title: element.contentControl, wordObjects: installationSkin });
            break;
          case 'release-range-content-control': {
            const wiData = [
              {
                fields: element.data,
                Source: 0,
                level: 0,
              },
            ];
            const inheritedStyles = {
              ...styles,
              Font: null,
              Size: 0,
            };
            const rangeSkins = await this.skins.addNewContentToDocumentSkin(
              element.contentControl,
              this.skins.SKIN_TYPE_COVER_PAGE,
              wiData,
              headerStyles,
              inheritedStyles,
              headingLevel
            );
            const flatRangeSkins = ([] as any[]).concat(...rangeSkins);
            contentControls.push({ title: element.contentControl, wordObjects: flatRangeSkins });
            break;
          }
          default:
            const skin = await this.skins.addNewContentToDocumentSkin(
              element.contentControl,
              this.skins.SKIN_TYPE_TABLE, //add another types too to support system-overview as well
              element.data,
              headerStyles,
              styles,
              headingLevel
            );
            contentControls.push({ title: element.contentControl, wordObjects: skin });
        }
      }

      return contentControls;
    } catch (error) {
      logger.error(`Error adding change description table: ${error.message}`);
      throw error;
    }
  }

  private async generateChangesSkin(
    adoptedChangesData: any,
    contentControlTitle: string,
    headerStyles: {
      isBold: boolean;
      IsItalic: boolean;
      IsUnderline: boolean;
      Size: number;
      Uri: any;
      Font: string;
      InsertLineBreak: boolean;
      InsertSpace: boolean;
    },
    styles: {
      isBold: boolean;
      IsItalic: boolean;
      IsUnderline: boolean;
      Size: number;
      Uri: any;
      Font: string;
      InsertLineBreak: boolean;
      InsertSpace: boolean;
    },
    headingLevel: number
  ) {
    try {
      const contentControl = { title: contentControlTitle, wordObjects: [] };

      for (const artifactChangesData of adoptedChangesData) {
        if (artifactChangesData.artifact) {
          let paragraphSkins = await this.skins.addNewContentToDocumentSkin(
            contentControlTitle,
            this.skins.SKIN_TYPE_PARAGRAPH,
            artifactChangesData.artifact,
            headerStyles,
            styles,
            headingLevel
          );
          paragraphSkins.forEach((skin) => {
            contentControl.wordObjects.push(skin);
          });
        }

        let tableSkins =
          artifactChangesData.artifactChanges?.length > 0
            ? await this.skins.addNewContentToDocumentSkin(
                contentControlTitle,
                this.skins.SKIN_TYPE_TABLE,
                artifactChangesData.artifactChanges,
                headerStyles,
                styles,
                headingLevel
              )
            : artifactChangesData.errorMessage
            ? await this.skins.addNewContentToDocumentSkin(
                contentControlTitle,
                this.skins.SKIN_TYPE_PARAGRAPH,
                artifactChangesData.errorMessage,
                headerStyles,
                styles,
                0
              )
            : null;

        tableSkins.forEach((skin) => {
          contentControl.wordObjects.push(skin);
        });
      }
      return contentControl;
    } catch (error) {
      logger.error(`Error generating changes skins: ${error.message}`);
      throw error;
    }
  }

  async addPullRequestDescriptionTable(
    repoId: string,
    prIds: any[],
    linkTypeFilterArray: string[],
    workItemFilterOptions: any,
    contentControlTitle: string,
    headingLevel?: number,
    contentControl?: contentControl
  ) {
    let adoptedChangesData;
    logger.debug(`fetching data with params:
      repoId:${repoId}
      prIds:${prIds}
      linkTypeFilterArray:${linkTypeFilterArray}
      teamProjectName:${this.teamProjectName}`);

    try {
      let pullRequestDataFactory = new PullRequestDataFactory(
        this.teamProjectName,
        repoId,
        prIds,
        linkTypeFilterArray,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        this.formattingSettings,
        workItemFilterOptions
      );
      await pullRequestDataFactory.fetchData();
      await pullRequestDataFactory.jsonSkinDataAdpater();
      this.minioAttachmentData.push(...pullRequestDataFactory.attachmentMinioData);
      adoptedChangesData = pullRequestDataFactory.getAdoptedData();
    } catch (error) {
      logger.error(`Error initializing pull request data factory: ${error}`);
      throw error;
    }
    try {
      if (!contentControl) {
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      logger.debug(JSON.stringify(defaultStyles));
      logger.debug(JSON.stringify(headingLevel));

      for (const artifactChangesData of adoptedChangesData) {
        let paragraphSkins = await this.skins.addNewContentToDocumentSkin(
          contentControlTitle,
          this.skins.SKIN_TYPE_PARAGRAPH,
          artifactChangesData.artifact,
          undefined,
          defaultStyles,
          headingLevel
        );

        let tableSkins = await this.skins.addNewContentToDocumentSkin(
          contentControlTitle,
          this.skins.SKIN_TYPE_TABLE,
          artifactChangesData.artifactChanges,
          undefined,
          defaultStyles,
          headingLevel
        );
        paragraphSkins.forEach((skin) => {
          contentControl.wordObjects.push(skin);
        });
        tableSkins.forEach((skin) => {
          contentControl.wordObjects.push(skin);
        });
        return contentControl;
      }
    } catch (error) {
      logger.error(`Error adding pull request description table: ${error.message}`);
      throw error;
    }
  }

  async addSRSContent(
    queriesRequest: any,
    contentControlTitle: string,
    headingLevel?: number,
    displayMode?: string
  ) {
    let adoptedRequirementsData;
    try {
      logger.debug(`adding SRS content with params:
        queriesRequest:${JSON.stringify(queriesRequest)}`);

      let srsDataFactory = new RequirementsDataFactory(
        this.teamProjectName,
        this.templatePath,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        this.dgDataProviderAzureDevOps,
        queriesRequest,
        this.formattingSettings,
        true,
        displayMode || 'hierarchical',
        false
      );
      await srsDataFactory.fetchRequirementsData();
      adoptedRequirementsData = srsDataFactory.getAdoptedData();
      this.minioAttachmentData.push(...srsDataFactory.getAttachmentMinioData());
    } catch (error) {
      logger.error(`Error initializing requirements data factory: ${error}`);
      throw error;
    }

    try {
      const contentControls: contentControl[] = [];
      const baseStyles = {
        IsItalic: false,
        IsUnderline: false,
        Size: 10,
        Uri: null,
        Font: 'Arial',
        InsertLineBreak: false,
        InsertSpace: false,
      };

      const headerStyles = {
        ...baseStyles,
        isBold: true, // Specific to header
      };

      const styles = {
        ...baseStyles,
        isBold: false, // Specific to regular styles
      };

      // Handle system requirements
      if (adoptedRequirementsData.systemRequirementsData) {
        const systemReqSkin = await this.skins.addNewContentToDocumentSkin(
          'system-requirements',
          this.skins.SKIN_TYPE_SYSTEM_OVERVIEW,
          adoptedRequirementsData.systemRequirementsData,
          headerStyles,
          styles,
          headingLevel,
          true
        );
        contentControls.push({ title: 'system-requirements', wordObjects: systemReqSkin });
      }

      // Handle traceability data
      const traceabilityConfig = [
        {
          data: adoptedRequirementsData.sysReqToSoftReqAdoptedData || {},
          title: 'requirements-traceability',
          noDataMessage: 'No System to Software Requirements traceability data',
        },
        {
          data: adoptedRequirementsData.softReqToSysReqAdoptedData || {},
          title: 'reverse-requirements-traceability',
          noDataMessage: 'No Software to System Requirements traceability data',
        },
      ];

      for (const { data, title, noDataMessage } of traceabilityConfig) {
        if (data && (data.adoptedData || data.title)) {
          data['errorMessage'] =
            !data['adoptedData'] || data['adoptedData'].length === 0 ? noDataMessage : null;

          const contentControlResults: contentControl = {
            title,
            wordObjects: [],
          };

          const traceabilitySkins = await this.skins.addNewContentToDocumentSkin(
            title,
            this.skins.SKIN_TYPE_TRACE,
            data,
            headerStyles,
            styles,
            headingLevel
          );

          traceabilitySkins.forEach((skin) => {
            contentControlResults.wordObjects.push(skin);
          });

          contentControls.push(contentControlResults);
        }
      }

      return contentControls;
    } catch (error) {
      logger.error(`Error adding SRS content: ${error.message}`);
      throw error;
    }
  }

  getDocument() {
    return this.skins.getDocumentSkin();
  }

  async writeToJson(contentControlData) {
    return new Promise((resolve, reject) => {
      const timeNow = Date.now();
      let jsonObj = JSON.stringify(contentControlData);
      let jsonName = this.teamProjectName + timeNow.toString() + '.json';
      let localJsonPath = `./${this.jsonFileBucketName}/${jsonName}`;
      if (!fs.existsSync(`./${this.jsonFileBucketName}`)) {
        fs.mkdirSync(`./${this.jsonFileBucketName}`);
      }
      fs.writeFile(localJsonPath, jsonObj, function (error) {
        if (error) {
          logger.error('issue writing to json due to : ' + error);
          reject('issue writing to json due to: ' + error);
        }
        resolve({
          localJsonPath,
          jsonName,
        });
      });
    });
  }
  async uploadToMinio(jsonLocalData, minioEndPoint, jsonFileBucketName) {
    return new Promise((resolve, reject) => {
      try {
        const minioClient = new Minio.Client({
          endPoint: minioEndPoint.split(':')[0],
          port: 9000,
          useSSL: false,
          accessKey: this.minioAccessKey,
          secretKey: this.minioSecretKey,
        });
        const metaData = {
          'Content-Type': 'application/json', // or any other metadata if required
        };
        minioClient
          .fPutObject(
            jsonFileBucketName,
            jsonLocalData.jsonName,
            jsonLocalData.localJsonPath,
            metaData // this is optional, you can remove it if no metadata is needed
          )
          .then(() => {
            logger.info('File uploaded successfully.');
            resolve({
              jsonPath: `http://${minioEndPoint}/${jsonFileBucketName}/${jsonLocalData.jsonName}`,
              jsonName: jsonLocalData.jsonName,
            });
          })
          .catch((error) => {
            logger.error('issue uploading to minio due to : ' + error);
            reject('issue uploading to minio due to : ' + error);
          });
      } catch (error) {
        logger.error('issue uploading to minio due to : ' + error);
        reject('issue uploading to minio due to : ' + error);
      }
    });
  }
  deleteFile(jsonLocalData) {
    try {
      fs.unlinkSync(jsonLocalData.localJsonPath);
      logger.info(`File removed at :${jsonLocalData.localJsonPath}`);
    } catch (err) {
      logger.error(err);
    }
  }
} //class
