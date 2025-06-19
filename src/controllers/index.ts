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
    jfrogToken = undefined
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
    console.log('^^^^^^^^^^this.skins^^^^^^^^^^^^^^^^', this.skins);
    this.skins = new Skins('json', this.templatePath);
    console.log('^^^^^^^^^^this.skins2^^^^^^^^^^^^^^^', this.skins);
    console.log('^^^^^^^^^^templatePath^^^^^^^^^^^^^^^', this.templatePath);

    logger.debug(`Initilized`);
    return true;
  } //init

  async generateDocTemplate() {
    try {
      console.log('this.skins.getDocumentSkin()', this.skins.getDocumentSkin());
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
            contentControlOptions.data.includeLinkedMom,
            contentControlOptions.data.traceAnalysisRequest
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
            contentControlOptions.data.errorFilterMode
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
            contentControlOptions.data.includeChangeDescription,
            contentControlOptions.data.includeCommittedBy,
            contentControlOptions.data.systemOverviewQuery,
            contentControlOptions.data.attachmentWikiUrl,
            contentControlOptions.data.linkedWiOptions,
            contentControlOptions.data.requestedByBuild
          );
          break;
        case 'pr-change-description-table':
          contentControlData = await this.addPullRequestDescriptionTable(
            contentControlOptions.data.repoId,
            contentControlOptions.data.prIds,
            contentControlOptions.data.linkTypeFilterArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel
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
          console.log('index field', field);
          const i = res.indexOf(wi);
          const t = wi.fields.indexOf(field);
          console.log('index t', wi.fields.indexOf(field));
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
          console.log('index richTextFactory', richTextFactory);
          const richText = await richTextFactory.factorizeRichTextData();
          // this.minioAttachmentData = this.minioAttachmentData.concat(richTextFactory.attachmentMinioData);
          res[i].fields[t].value = richText;
        }
        console.log('this.minioAttachmentData inedex', this.minioAttachmentData);
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
    includeLinkedMom?: boolean,
    traceAnalysisRequest?: any
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
        includeLinkedMom,
        traceAnalysisRequest,
        false,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );

      if (traceAnalysisRequest?.traceAnalysisMode === 'query') {
        await testDataFactory.fetchQueryResults();
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
        includeHardCopyRun
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
            stepExecutionObject.data
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
    errorFilterMode?: string
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
        this.PAT
      );

      await resultDataFactory.fetchTestReporterResults(
        selectedFields,
        allowCrossTestPlan,
        enableRunTestCaseFilter,
        enableRunStepStatusFilter,
        linkedQueryRequest,
        errorFilterMode
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

      return contentControls;
    } catch (error) {
      logger.error(`Error adding Test Reporter content ${error}`);
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
    includeChangeDescription: boolean = false,
    includeCommittedBy: boolean = false,
    systemOverviewQuery: any = null,
    attachmentWikiUrl: string = '',
    linkedWiOptions: any = null,
    requestedByBuild: boolean = false
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
        requestedByBuild
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
        this.PAT
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
        console.log(`${jsonName} file was created`);
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
