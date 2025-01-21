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
            contentControlOptions.data.includeRequirements,
            contentControlOptions.data.includeCustomerId,
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
            contentControlOptions.data.includeOpenPCRs,
            contentControlOptions.data.includeTestLog
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
            contentControlOptions.data.systemOverviewQuery
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
      logger.error(`Error initlizing Skins: ${error.message}`);
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
    try {
      let ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      res = await ticketsDataProvider.GetQueryResultById(queryId, this.teamProjectName);
    } catch (error) {
      logger.error(`Error Quering Azure with query id :${queryId}`);
      console.log(error);
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
          await richTextFactory.createRichTextContent();
          this.minioAttachmentData = this.minioAttachmentData.concat(richTextFactory.attachmentMinioData);
          res[i].fields[t].richText = richTextFactory.skinDataContentControls;
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
      console.log(error.data);
      throw new Error(`Error adding content control: ${error}`);
    }
  }

  async addTestDescriptionContent(
    testPlanId: number,
    testSuiteArray: number[],
    contentControlTitle: string,
    headingLevel?: number,
    includeAttachments: boolean = true,
    attachmentType: string = 'asEmbedded',
    includeRequirements?: boolean,
    includeCustomerId?: boolean,
    traceAnalysisRequest?: any
  ) {
    logger.debug(`fetching test data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}`);
    let testDataFactory: TestDataFactory;
    try {
      testDataFactory = new TestDataFactory(
        this.attachmentsBucketName,
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        includeAttachments,
        attachmentType,
        includeRequirements,
        includeCustomerId,
        traceAnalysisRequest,
        false,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );

      //if selectedMode by query
      switch (traceAnalysisRequest.traceAnalysisMode) {
        case 'query':
          await testDataFactory.fetchQueryResults();
          break;
        case 'linkedRequirement':
          await testDataFactory.fetchLinkedRequirementsTrace();
          break;
        default:
          break;
      }
      //init the adopted data
      await testDataFactory.fetchTestData(traceAnalysisRequest.traceAnalysisMode === 'query');
    } catch (error) {
      throw new Error(`Error initializing test data factory ${error}`);
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
      logger.error(`Error adding content control: ${error}`);
      logger.error(`Error stack:\n`, error.stack);
      throw new Error(`Error adding content control: ${error}`);
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
      data['errorMessage'] = !data['adoptedData'] || data['adoptedData'].length === 0 ? noDataMessage : null;

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
      logger.error(`Error initilizing tracedata factory`);
      console.log(error);
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
      console.log(error.data);
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
    includeOpenPCRs: boolean = false,
    includeTestLog: boolean = false
  ) {
    let resultDataFactory: ResultDataFactory;
    let testDataFactory: TestDataFactory;
    try {
      if (!testPlanId) {
        throw new Error('No plan has been selected');
      }

      if (!this.teamProjectName) {
        throw new Error('Project name is not defined');
      }
      logger.debug(`fetching data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}
      includeOpenPCRs:${includeOpenPCRs}`);

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
        includeOpenPCRs,
        includeTestLog,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );

      await resultDataFactory.fetchGetCombinedResultsSummary();
    } catch (error) {
      logger.error(`Error initilizing result data factory: ${error.message}`);
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
            stepExecution?.generateRequirements.isEnabled,
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

          //if selectedMode by query
          switch (stepExecution?.generateRequirements?.requirementInclusionMode) {
            case 'query':
              await testDataFactory.fetchQueryResults();
              break;
            case 'linkedRequirement':
              await testDataFactory.fetchLinkedRequirementsTrace();
              break;
            default:
              break;
          }

          await testDataFactory.fetchTestData(
            stepExecution?.generateRequirements?.requirementInclusionMode === 'query'
          );

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
          logger.error(`Error Stack: ${error.stack}`);

          throw error;
        }
      }
      return contentControls;
    } catch (error) {
      console.log(error.data);
      throw new Error(`Error adding content control: ${error}`);
    }
  }

  //Test Group Summary

  async addChangeDescriptionTable(
    repoId: string,
    from: string | number,
    to: string | number,
    rangeType: string,
    linkTypeFilterArray: string[],
    contentControlTitle: string,
    headingLevel?: number,
    branchName?: string,
    includePullRequests?: boolean,
    includeChangeDescription: boolean = false,
    includeCommittedBy: boolean = false,
    systemOverviewQuery: any = null
  ) {
    let adoptedChangesData;
    logger.debug(`fetching data with params:
      repoId:${repoId}
      from:${from}
      to:${to}
      rangeType: ${rangeType}
      linkTypeFilterArray:${linkTypeFilterArray}
      teamProjectName:${this.teamProjectName}
      branchName:${branchName}
      includePullRequests:${includePullRequests}`);
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
        includeChangeDescription,
        includeCommittedBy,
        this.dgDataProviderAzureDevOps,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        undefined,
        systemOverviewQuery
      );
      await changeDataFactory.fetchSvdData();
      adoptedChangesData = changeDataFactory.getAdoptedData();
      this.minioAttachmentData.push(...changeDataFactory.getAttachmentMinioData());
    } catch (error) {
      throw new Error(`Error initilizing change table factory ${error}`);
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
        this.dgDataProviderAzureDevOps
      );
      await pullRequestDataFactory.fetchData();
      await pullRequestDataFactory.jsonSkinDataAdpater();
      adoptedChangesData = pullRequestDataFactory.getAdoptedData();
    } catch (error) {
      throw new Error(`Error initializing change table factory: ${error}`);
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
      console.log(error.data);
      throw new Error(`Error adding content control: ${error}`);
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
