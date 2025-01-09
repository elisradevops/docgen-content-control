import DGContentControls from '../controllers/index';
import RichTextDataFactory from '../factories/RichTextDataFactory';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import DownloadManager from '../services/DownloadManager';
import { json } from 'express';
jest.setTimeout(30000000);
require('dotenv').config();

const orgUrl = process.env.ORG_URL;
const token = process.env.PAT;

describe('Generate json document from queries - tests', () => {
  test('generate table content control - flat query', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();

    let jsonDoc = await dgContent.addQueryBasedContent(
      '08e044be-b9bc-4962-99c9-ffebb47ff95a',
      'system-capabilities',
      'table',
      3
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  });
  test('generate paragraph content control - flat query', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addQueryBasedContent(
      '08e044be-b9bc-4962-99c9-ffebb47ff95a',
      'system-capabilities',
      'paragraph',
      3
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  });
  test('generate table content control - tree query', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addQueryBasedContent(
      '253a04bf-7dbe-4d48-ae0e-744ca6428595',
      'system-capabilities',
      'table',
      3
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  });
  test('generate paragraph content control - tree query', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addQueryBasedContent(
      '253a04bf-7dbe-4d48-ae0e-744ca6428595',
      'system-capabilities',
      'paragraph',
      3
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  });
  test('generate paragraph & table content control - tree query', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addQueryBasedContent(
      '253a04bf-7dbe-4d48-ae0e-744ca6428595',
      'system-capabilities',
      'paragraph',
      3
    );

    jsonDoc = await dgContent.addQueryBasedContent(
      '253a04bf-7dbe-4d48-ae0e-744ca6428595',
      'system-capabilities',
      'table',
      3,
      jsonDoc
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(2);
  });
  test('generate 2 content controls - tree query', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let contentControl1 = await dgContent.addQueryBasedContent(
      '253a04bf-7dbe-4d48-ae0e-744ca6428595',
      'system-capabilities',
      'paragraph',
      3
    );
    let contentControl2 = await dgContent.addQueryBasedContent(
      '253a04bf-7dbe-4d48-ae0e-744ca6428595',
      'system-capabilities',
      'table',
      3
    );
    expect(contentControl1.wordObjects.length && contentControl2.wordObjects.length).toBeGreaterThanOrEqual(
      1
    );
  }); //useless test
  test('Generate trace-table content control - query', async () => {
    //complicated
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addTraceTableContent(
      540, // testPlanId: number,
      undefined, // testSuiteArray: number[],
      '86fffbc0-f892-46f4-89c5-edb226da6dc1', // queryId: string,
      ['System.LinkTypes.Hierarchy-Reverse'], // linkTypeFilterArray: string[],
      'system-capabilities', // contentControlTitle: string,
      0 // headingLevel?: number
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  });
});
describe('Generate json document from test plans - tests', () => {
  test('Generate std content control - complex test plan with attachments', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addTestDescriptionContent(
      540,
      undefined,
      'tests-description-content-control',
      4,
      true
    );
    expect(jsonDoc.length).toBeGreaterThanOrEqual(1);
  });
  test('Generate std content control - complex test plan no attachments', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addTestDescriptionContent(
      540,
      undefined,
      'tests-description-content-control',
      4,
      false
    );
    expect(jsonDoc.length).toBeGreaterThanOrEqual(1);
  });
  test.skip('Generate std content control - 1400 testcases complex test plan', async () => {
    //not enough testcases
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    await dgContent.addTestDescriptionContent(52909, null, 'system-capabilities', 0, true);
    let jsonDoc = dgContent.getDocument();

    expect(jsonDoc.contentControls.length).toBeGreaterThan(0);
  });
  test('Generate trace-table content control - complex test plan', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );
    await dgContent.init();
    let jsonDoc = await dgContent.addTraceTableContent(
      540,
      [541],
      '86fffbc0-f892-46f4-89c5-edb226da6dc1',
      ['Microsoft.VSTS.Common.TestedBy-Reverse'],
      'system-capabilities',
      0
    );
    expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  });

  //TODO replace this with the the test group summary
  // test("Generate str content control - test-group-summary", async () => {
  //   let dgContent = new DGContentControls(
  //     orgUrl,
  //     token,
  //     "tests",
  //     "json",
  //     "path:\\assaf",
  //     "http://s3:9000",
  //     "your-root-user",
  //     "your-root-password",
  //     "placeholderPat"
  //   );
  //   await dgContent.init();
  //   let jsonDoc = await dgContent.addTestResultTestGroupSummaryTable(
  //     540,                  //testPlanId: number,
  //     [562],             //testSuiteArray: number[],
  //     "system-capabilities", //contentControlTitle: string,
  //     4,                     //headingLevel?: number,
  //     true                  //includeAttachments: boolean = true
  //   );
  //   expect(jsonDoc.wordObjects.length).toBeGreaterThanOrEqual(1);
  // });
});
describe('Generate json document from git Changeset', () => {
  test('Generate changeset table from commit sha ranges', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );

    await dgContent.init();
    let jsonDoc = await dgContent.addChangeDescriptionTable(
      '68f2aee7-0864-458e-93ce-320303a080ed',
      'e46f8023be49db94b5cf188b41f7ba9db6fd8274',
      'e46f8023be49db94b5cf188b41f7ba9db6fd8274',
      'commitSha',
      null,
      'change-description-content-control',
      4,
      undefined
    );

    expect(jsonDoc.length).toBeGreaterThan(0);
  });
  test('Generate changeset table from date range', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'attachments',
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password'
    );

    await dgContent.init();
    let contentControls = await dgContent.addChangeDescriptionTable(
      '68f2aee7-0864-458e-93ce-320303a080ed',
      '2015-07-21T12:51:51Z',
      '2021-07-22T12:51:51Z',
      'date',
      null,
      'change-description-content-control',
      4
    );
    expect(contentControls.length).toBeGreaterThan(0);
  });
  test('Generate changeset table from pipeline range', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password',
      'placeholderPat'
    );

    await dgContent.init();
    let contentControls = await dgContent.addChangeDescriptionTable(
      '68f2aee7-0864-458e-93ce-320303a080ed',
      244,
      244,
      'pipeline',
      null,
      'change-description-content-control',
      4
    );
    expect(contentControls.length).toBeGreaterThan(1);
  });
  test('Generate changeset table from release range', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'attachments',
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password'
    );

    await dgContent.init();
    let contentControls = await dgContent.addChangeDescriptionTable(
      '68f2aee7-0864-458e-93ce-320303a080ed',
      1,
      1,
      'release',
      null,
      'change-description-content-control',
      4
    );
    expect(contentControls.length).toBeGreaterThan(1);
  });

  test('Generate changeset table from pull requests', async () => {
    let dgContent = new DGContentControls(
      orgUrl,
      token,
      'attachments',
      'tests',
      'json',
      'path:\\assaf',
      'http://s3:9000',
      'your-root-user',
      'your-root-password'
    );

    await dgContent.init();
    let jsonDoc = await dgContent.addPullRequestDescriptionTable(
      '68f2aee7-0864-458e-93ce-320303a080ed',
      [73, 74],
      null,
      'change-description-content-control',
      4,
      undefined
    );

    expect(jsonDoc.wordObjects.length).toBeGreaterThan(1);
  });
});
describe.skip('Rich Text Data factory Tests', () => {
  test('testing rich text factory with image table and paragraph', () => {
    let RichTextData = require('../../samples/data/richTextData.json');
    let richTextFactory = new RichTextDataFactory(
      RichTextData.description,
      'test=path',
      'tests',
      'tests',
      'minioEndPoint',
      'minioAccessKey',
      'minioSecretKey',
      'placeholderPat'
    );
    richTextFactory.createRichTextContent(); //change with actual props
    let richText = richTextFactory.skinDataContentControls;
    const SnapShot = require('../../samples/snapshots/common/richTextWithimageTableAndParagraph.json');
    expect(richText).toMatchObject(SnapShot);
  });

  test('testing rich text factory with only text', () => {
    let RichTextData = require('../../samples/data/richTextParagraph.json');
    let richTextFactory = new RichTextDataFactory(
      RichTextData.description,
      'test=path',
      'tests',
      'tests',
      'minioEndPoint',
      'minioAccessKey',
      'minioSecretKey',
      'placeholderPat'
    );
    richTextFactory.createRichTextContent(); //change with actual props
    let richText = richTextFactory.skinDataContentControls;
    const SnapShot = require('../../samples/snapshots/common/richTextParagraphOnly-contentControl.json');
    expect(richText).toMatchObject(SnapShot);
  });
});
// describe.skip("DownloadManger Tests", () => {
//   test("should handle linux path", () => {
//     let downloadManager = new DownloadManager(
//       "/docgen/documents/291020205230/SRS-29-10-2020-11-52.dotx",
//       "http://10.180.0.121:8080/tfs/TestCollection/b5d2079a-c6f0-4f25-8a7a-c95ed5e50c50/_apis/wit/attachments/e29ce61e-ee79-40e4-92f6-ec7ece754859",
//       "image.png",
//       process.env.DOWNLOAD_MANAGER_URL
//     );
//     expect(downloadManager.destPath).toBe("291020205230");
//   });
// });
// describe("Json data adapters Tests", () => {
//   test("Generate str content control - test-group-summary", async () => {
//     let rawData = require("../../samples/data/testDataRawWithOutcome.json");
//     let testResultGroupSummaryDataSkinAdapter =
//       new TestResultGroupSummaryDataSkinAdapter();
//     let result =
//       await testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdpater(rawData);
//     expect(result[0]).toBeDefined();
//   });
// });
