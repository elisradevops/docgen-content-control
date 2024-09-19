import Skins from '@elisra-devops/docgen-skins';
import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import TestDataFactory from '../factories/TestDataFactory';
import TraceDataFactory from '../factories/TraceDataFactory';
import RichTextDataFactory from '../factories/RichTextDataFactory';
import ChangeDataFactory from '../factories/ChangeDataFactory';
import ResultDataFactory from '../factories/ResultDataFactory';
import PullRequestDataFactory from '../factories/PullRequestDataFactory';
import logger from '../services/logger';
import contentControl from '../models/contentControl';
import * as fs from 'fs';
import * as Minio from 'minio';
import { log } from 'console';

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
    minioSecretKey
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
  }

  async init() {
    logger.debug(`Initilizing DGContentControls`);
    //initilizing azureDevops connection
    this.dgDataProviderAzureDevOps = new DgDataProviderAzureDevOps(this.uri, this.PAT);
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
      ${JSON.stringify(error)} `);
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
            contentControlOptions.data.includeBugs,
            contentControlOptions.data.includeSeverity
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
            contentControlOptions.data.includeAttachments,
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
            contentControlOptions.data.includePullRequests
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
      logger.error(`Error initlizing Skins:
      ${error}`);
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

    res.forEach((wi, i) => {
      wi.fields.forEach(async (field, t) => {
        if (field.name === 'Description' || field.name === 'Test Description:') {
          console.log('index field', field);
          console.log('index t', t);
          let richTextFactory = new RichTextDataFactory(
            field.value || 'No description',
            this.templatePath,
            this.teamProjectName
          );
          console.log('index richTextFactory', richTextFactory);
          await richTextFactory.createRichTextContent(
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT
          );
          this.minioAttachmentData = this.minioAttachmentData.concat(richTextFactory.attachmentMinioData);
          res[i].fields[t].richText = richTextFactory.skinDataContentControls;
        }
        console.log('this.minioAttachmentData inedex', this.minioAttachmentData);
      });
    });
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
    includeBugs?: boolean,
    includeSeverity?: boolean,
    contentControl?: contentControl
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
        includeBugs,
        includeSeverity,
        false,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );
      //init the adopted data
      await testDataFactory.fetchTestData();
    } catch (error) {
      throw new Error(`Error initializing test data factory ${error}`);
    }
    try {
      if (!contentControl) {
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
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

      let attachmentData = await testDataFactory.getAttachmentMinioData();
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

      skins.forEach((skin) => {
        // Check if skin is of type 'paragraph' and contains the text 'Test Description:'
        if (skin.type === 'paragraph' && skin.runs.some((run) => run.text === 'Test Description:')) {
          return; // Skip this skin
        }
        contentControl.wordObjects.push(skin);
      });
      return contentControl;
    } catch (error: any) {
      console.log(error.data);
      logger.error(`Error adding content control: ${error}`);
      logger.error(`Stack trace: ${error.stack}`);
      throw new Error(`Error adding content control: ${error}`);
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
    includeAttachments: boolean = false,
    includeConfigurations: boolean = false,
    includeHierarchy: boolean = false,
    includeOpenPCRs: boolean = false,
    includeTestLog: boolean = false
  ) {
    let resultDataFactory: ResultDataFactory;
    logger.debug(`fetching data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}
      includeOpenPCRs:${includeOpenPCRs}`);
    try {
      resultDataFactory = new ResultDataFactory(
        this.attachmentsBucketName,
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        includeAttachments,
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
      logger.error(`Error initilizing test data factory: ${error}`);
      console.log(error);
    }
    try {
      const contentControls: contentControl[] = [];
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      logger.debug(JSON.stringify(defaultStyles));
      logger.debug(JSON.stringify(headingLevel));

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

      let skins = await Promise.all(
        adoptedDataArray.map(async (element) => {
          const skin = await this.skins.addNewContentToDocumentSkin(
            element.contentControl,
            this.skins.SKIN_TYPE_TABLE,
            element.data,
            headerStyles,
            styles,
            headingLevel
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

      // let attachmentData = await resultDataFactory.getAttachmentsMinioData();
      // this.minioAttachmentData = this.minioAttachmentData.concat(attachmentData);
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
    contentControl?: contentControl
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
        this.dgDataProviderAzureDevOps
      );
      await changeDataFactory.fetchData();
      await changeDataFactory.jsonSkinDataAdpater();
      adoptedChangesData = changeDataFactory.getAdoptedData();
    } catch (error) {
      throw new Error(`Error initilizing change table factory ${error}`);
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
