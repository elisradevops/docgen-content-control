import Skins from "@elisra-devops/docgen-skins";
import DgDataProviderAzureDevOps from "@elisra-devops/docgen-data-provider";
import TestDataFactory from "../factories/TestDataFactory";
import TraceDataFactory from "../factories/TraceDataFactory";
import RichTextDataFactory from "../factories/RichTextDataFactory";
import ChangeDataFactory from "../factories/ChangeDataFactory";
import PullRequestDataFactory from "../factories/PullRequestDataFactory";
import logger from "../services/logger";
import contentControl from "../models/contentControl";
import * as fs from 'fs';
import * as Minio from 'minio';


let styles = {
  isBold: false,
  IsItalic: false,
  IsUnderline: false,
  Size: 12,
  Uri: null,
  Font: "Arial",
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
  attachmentsBucketName:string;
  jsonFileBucketName:string;

  constructor(uri, PAT, attachmentsBucketName, teamProjectName, outputType, templatePath, minioEndPoint, minioAccessKey, minioSecretKey) {
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
    this.jsonFileBucketName = "content-controls"
  }

  async init() {
    logger.debug(`Initilizing DGContentControls`);
    //initilizing azureDevops connection
    this.dgDataProviderAzureDevOps = new DgDataProviderAzureDevOps(
      this.uri,
      this.PAT
      );
    if (!this.templatePath)
    {
      this.templatePath = "template path"
    }
    console.log("^^^^^^^^^^this.skins^^^^^^^^^^^^^^^^", this.skins)
    this.skins = new Skins("json",this.templatePath)
    console.log("^^^^^^^^^^this.skins2^^^^^^^^^^^^^^^", this.skins)
    console.log("^^^^^^^^^^templatePath^^^^^^^^^^^^^^^", this.templatePath)

    logger.debug(`Initilized`);
    return true;
  } //init

  async generateDocTemplate() {
    try {
      console.log("this.skins.getDocumentSkin()", this.skins.getDocumentSkin())
      return this.skins.getDocumentSkin();
    } catch (error) {
      logger.error(`Error initlizing Skins:
      ${JSON.stringify(error)} `);
    }
  }

  async generateContentControl(contentControlOptions) {
    try {
      let contentControlData
      switch (contentControlOptions.type) {
        case "query":
          contentControlData =  await this.addQueryBasedContent(
            contentControlOptions.data.queryId,
            contentControlOptions.title,
            contentControlOptions.data.skinType,
            contentControlOptions.headingLevel
          );
          break;
        case "test-description":
          contentControlData = await this.addTestDescriptionContent(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel,
            contentControlOptions.data.includeAttachments,
            contentControlOptions.data.includeRequirements,
            contentControlOptions.data.includeCustomerId
          );

          break;
        case "trace-table":
          contentControlData = await this.addTraceTableContent(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.data.queryId,
            contentControlOptions.data.linkTypeFilterArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel
          );
          break;
        case "test-result-test-group-summary-table":
          contentControlData = await this.addTestResultTestGroupSummaryTable(
            contentControlOptions.data.testPlanId,
            contentControlOptions.data.testSuiteArray,
            contentControlOptions.title,
            contentControlOptions.headingLevel,
            contentControlOptions.data.includeAttachments,
            contentControlOptions.data.includeRequirements,
            contentControlOptions.data.includeCustomerId
          );
          break;
        case "change-description-table":
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
          case "pr-change-description-table":
            contentControlData = await this.addPullRequestDescriptionTable(
              contentControlOptions.data.repoId,
              contentControlOptions.data.prIds,
              contentControlOptions.data.linkTypeFilterArray,
              contentControlOptions.title,
              contentControlOptions.headingLevel
            );
            break;
      }
      let jsonLocalData = await this.writeToJson(contentControlData)
      let jsonData = await this.uploadToMinio(jsonLocalData,this.minioEndPoint,this.jsonFileBucketName)
      this.deleteFile(jsonLocalData)
      return jsonData;
    } catch (error) {
      logger.error(`Error initlizing Skins:
      ${(error)}`);
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
      let ticketsDataProvider =
        await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      res = await ticketsDataProvider.GetQueryResultById(
        queryId,
        this.teamProjectName
      );
    } catch (error) {
      logger.error(`Error Quering Azure with query id :${queryId}`);
      console.log(error);
    }

    res.forEach((wi, i) => {
      wi.fields.forEach(async (field, t) => {
        if (
          field.name === "Description" ||
          field.name === "Test Description:"
        ) {
          console.log("index field", field)
          console.log("index t", t)
          let richTextFactory = new RichTextDataFactory(
            field.value || "No description",
            this.templatePath,
            this.teamProjectName
          );
          console.log("index richTextFactory", richTextFactory)
          await richTextFactory.createRichTextContent(
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT
            );
          this.minioAttachmentData = this.minioAttachmentData.concat(richTextFactory.attachmentMinioData)
          res[i].fields[t].richText = richTextFactory.skinDataContentControls;
        }
        console.log("this.minioAttachmentData inedex", this.minioAttachmentData)
      });
    });
    try {
      if (!contentControl){
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(skinType));
      logger.debug(JSON.stringify(styles));
      logger.debug(JSON.stringify(headingLevel));
      let skins =  await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        skinType,
        res,
        styles,
        headingLevel
      );
      skins.forEach(skin => {
      contentControl.wordObjects.push(skin);
      });
      return contentControl;

    } catch (error) {
      logger.error(`Error adding content contorl:`);
      console.log(error.data);
    }
  }

  async addTestDescriptionContent(
    testPlanId: number,
    testSuiteArray: number[],
    contentControlTitle: string,
    headingLevel?: number,
    includeAttachments: boolean = true,
    includeRequirements?: boolean,
    includeCustomerId?: boolean,
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
        includeRequirements,
        includeCustomerId,
        false,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
      )
      await testDataFactory.fetchTestData();
    } catch (error) {
      logger.error(`Error initilizing test data factory`);
      console.log(error);
    }
    try {
      if (!contentControl){
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TEST_PLAN));
      logger.debug(JSON.stringify(styles));
      logger.debug(JSON.stringify(headingLevel));
      let attachmentData = await testDataFactory.getAttachmentMinioData();
      this.minioAttachmentData = this.minioAttachmentData.concat(attachmentData)
      let skins = await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        this.skins.SKIN_TYPE_TEST_PLAN,
        testDataFactory.adoptedTestData,
        styles,
        headingLevel,
        includeAttachments
      );

      skins.forEach(skin => {
        // Check if skin is of type 'paragraph' and contains the text 'Test Description:'
        if (skin.type === 'paragraph' && skin.runs.some(run => run.text === 'Test Description:')) {
            return; // Skip this skin
    }
        contentControl.wordObjects.push(skin);
        });
      return contentControl;
    } catch (error) {
      logger.error(`Error adding content contorl:`);
      console.log(error.data);
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
        if (!contentControl){
          contentControl = { title: contentControlTitle, wordObjects: [] };
        }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TEST_PLAN));
      logger.debug(JSON.stringify(styles));
      logger.debug(JSON.stringify(headingLevel));
      let skins = await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        this.skins.SKIN_TYPE_TABLE,
        traceFactory.adoptedData,
        styles,
        headingLevel
      );
      skins.forEach(skin => {
        contentControl.wordObjects.push(skin);
        });
      return contentControl
    } catch (error) {
      logger.error(`Error adding content contorl:`);
      console.log(error.data);
    }
  }

  async addTestResultTestGroupSummaryTable(
    testPlanId: number,
    testSuiteArray: number[],
    contentControlTitle: string,
    headingLevel?: number,
    includeAttachments: boolean = true,
    includeRequirements?: boolean,
    includeCustomerId?: boolean,
    contentControl?: contentControl
  ) {
    let testDataFactory: TestDataFactory;
    logger.debug(`fetching data with params:
      testPlanId:${testPlanId}
      testSuiteArray:${testSuiteArray}
      teamProjectName:${this.teamProjectName}`);
    try {
      testDataFactory = new TestDataFactory(
        this.attachmentsBucketName,
        this.teamProjectName,
        testPlanId,
        testSuiteArray,
        includeAttachments,
        includeRequirements,
        includeCustomerId,
        true,
        this.dgDataProviderAzureDevOps,
        this.templatePath,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );
      await testDataFactory.fetchTestData();
    } catch (error) {
      logger.error(`Error initilizing test data factory`);
      console.log(error);
    }
    try {
      if (!contentControl){
        contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      logger.debug(JSON.stringify(styles));
      logger.debug(JSON.stringify(headingLevel));
      let adoptedData = await testDataFactory.getAdoptedTestData();
      let skins = await this.skins.addNewContentToDocumentSkin(
        contentControlTitle,
        this.skins.SKIN_TYPE_TEST_PLAN,
        adoptedData,
        styles,
        headingLevel
      );
      skins.forEach(skin => {
        contentControl.wordObjects.push(skin);
        });
        let attachmentData = await testDataFactory.getAttachmentMinioData();
        this.minioAttachmentData = this.minioAttachmentData.concat(attachmentData)
      return contentControl
    } catch (error) {
      logger.error(`Error adding content contorl:`);
      console.log(error.data);
    }
  }
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
      includePullRequests:${includePullRequests}`)

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
      logger.error(`Error initilizing change table factory`);
      console.log(error);
    }
    try {
      if (!contentControl){
      contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      logger.debug(JSON.stringify(styles));
      logger.debug(JSON.stringify(headingLevel));

      for (const artifactChangesData of adoptedChangesData) {
        let paragraphSkins = await this.skins.addNewContentToDocumentSkin(
          contentControlTitle,
          this.skins.SKIN_TYPE_PARAGRAPH,
          artifactChangesData.artifact,
          styles,
          headingLevel
        );

        let tableSkins = await this.skins.addNewContentToDocumentSkin(
          contentControlTitle,
          this.skins.SKIN_TYPE_TABLE,
          artifactChangesData.artifactChanges,
          styles,
          headingLevel
        );
        paragraphSkins.forEach(skin => {
          contentControl.wordObjects.push(skin);
          });
          tableSkins.forEach(skin => {
          contentControl.wordObjects.push(skin);
          });
        return contentControl;
      }
    } catch (error) {
      logger.error(`Error adding content contorl:`);
      console.log(error.data);
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
      logger.error(`Error initilizing change table factory`);
      console.log(error);
    }
    try {
      if (!contentControl){
      contentControl = { title: contentControlTitle, wordObjects: [] };
      }
      logger.debug(JSON.stringify(contentControlTitle));
      logger.debug(JSON.stringify(this.skins.SKIN_TYPE_TABLE));
      logger.debug(JSON.stringify(styles));
      logger.debug(JSON.stringify(headingLevel));

      for (const artifactChangesData of adoptedChangesData) {
        let paragraphSkins = await this.skins.addNewContentToDocumentSkin(
          contentControlTitle,
          this.skins.SKIN_TYPE_PARAGRAPH,
          artifactChangesData.artifact,
          styles,
          headingLevel
        );

        let tableSkins = await this.skins.addNewContentToDocumentSkin(
          contentControlTitle,
          this.skins.SKIN_TYPE_TABLE,
          artifactChangesData.artifactChanges,
          styles,
          headingLevel
        );
        paragraphSkins.forEach(skin => {
          contentControl.wordObjects.push(skin);
          });
          tableSkins.forEach(skin => {
          contentControl.wordObjects.push(skin);
          });
        return contentControl;
      }
    } catch (error) {
      logger.error(`Error adding content contorl:`);
      console.log(error.data);
    }
  }

  getDocument() {
    return this.skins.getDocumentSkin();
  }

  async writeToJson(contentControlData){
    return new Promise((resolve,reject) => {
        const timeNow = Date.now();
        let jsonObj = JSON.stringify(contentControlData);
        let jsonName = this.teamProjectName+ timeNow.toString()+".json";
        let localJsonPath = `./${this.jsonFileBucketName}/${jsonName}`
        if (!fs.existsSync(`./${this.jsonFileBucketName}`)){
          fs.mkdirSync(`./${this.jsonFileBucketName}`);
      }
    fs.writeFile(localJsonPath, jsonObj, function (error) {
      if (error) {
        logger.error("issue writing to json due to : " + error)
        reject("issue writing to json due to: " + error)
      }      console.log(`${jsonName} file was created`);
      resolve({
        localJsonPath,
        jsonName
      });
    });
  });
}
  async uploadToMinio(jsonLocalData,minioEndPoint,jsonFileBucketName) {
    return new Promise((resolve,reject) => {
      try{
        const minioClient = new Minio.Client({
          endPoint: minioEndPoint.split(':')[0],
          port: 9000,
          useSSL: false,
          accessKey: this.minioAccessKey,
          secretKey: this.minioSecretKey
        });
        minioClient.fPutObject(
          jsonFileBucketName, jsonLocalData.jsonName, jsonLocalData.localJsonPath,function(error) {
            if (error) {
              logger.error("issue uploading to minio due to : " + error)
              reject("issue uploading to minio due to : " + error)
            }
            logger.info('File uploaded successfully.')
            resolve({
              jsonPath:`http://${minioEndPoint}/${jsonFileBucketName}/${jsonLocalData.jsonName}`,
              jsonName: jsonLocalData.jsonName
            })
          })
        }
        catch(error)
        {
          logger.error("issue uploading to minio due to : " + error)
          reject("issue uploading to minio due to : " + error)
        }
      });
    }
    deleteFile(jsonLocalData){
      try {
        fs.unlinkSync(jsonLocalData.localJsonPath);
        logger.info(`File removed at :${jsonLocalData.localJsonPath}`);
      } catch (err) {
        logger.error(err);
      }
    }
  } //class
