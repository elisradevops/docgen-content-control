import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';

export default class DetailedResultsSummaryDataSkinAdapter {
  htmlUtils: HtmlUtils;
  templatePath: string;
  teamProject: string;
  attachmentsBucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  constructor(
    templatePath: string,
    teamProject: string,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    this.htmlUtils = new HtmlUtils();
    this.templatePath = templatePath;
    this.teamProject = teamProject;
    this.attachmentsBucketName = attachmentsBucketName || '';
    this.minioEndPoint = minioEndPoint || '';
    this.minioAccessKey = minioAccessKey || '';
    this.minioSecretKey = minioSecretKey || '';
    this.PAT = PAT || '';
  }

  private async htmlStrip(text): Promise<any> {
    const richTextFactory = new RichTextDataFactory(
      text,
      this.templatePath,
      this.teamProject,
      this.attachmentsBucketName,
      this.minioEndPoint,
      this.minioAccessKey,
      this.minioSecretKey,
      this.PAT
    );
    const richText = await richTextFactory.factorizeRichTextData();
    return richText;
  }

  public async jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      return await Promise.all(
        resultDataRaw.map(async (item, idx) => {
          const cleanedActionHtml = this.htmlUtils.cleanHtml(`${item.stepAction}`);
          const cleanedExpectedHtml = this.htmlUtils.cleanHtml(`${item.stepExpected}`);

          const action = await this.htmlStrip(cleanedActionHtml);
          const expected = await this.htmlStrip(cleanedExpectedHtml);

          const fields = [
            { name: '#', value: `${idx + 1}`, width: '3.8%' },
            { name: 'Test Id', value: `${item.testId}`, width: '7.6%' },
            { name: 'Test Name', value: `${item.testName}` },
            { name: 'Step', value: `${item.stepNo}`, width: '5.3%' },
            { name: 'Action', value: action, width: '20.8%' },
            { name: 'Expected Result', value: expected, width: '20.8%' },
            { name: 'Actual Result', value: `${item.stepComments}` },
            { name: 'Step Status', value: `${item.stepStatus}`, width: '10%' },
            // TBD
            // { name: 'PCR No', value: `${item.PCR No}` },
          ];

          return { fields };
        })
      );
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter ${error.message}`);
    }
  }
}

// private async fetchStripDataContentControl(text): Promise<any> {
//   const richTextFactory = new RichTextDataFactory(
//     text,
//     this.templatePath,
//     this.teamProject,
//     this.attachmentsBucketName,
//     this.minioEndPoint,
//     this.minioAccessKey,
//     this.minioSecretKey,
//     this.PAT
//   );
//   await richTextFactory.createRichTextContent();
//   const skinDataContentControls = richTextFactory.skinDataContentControls;
//   return skinDataContentControls;
// }

// public async jsonSkinDataAdapter(resultDataRaw: any[]) {
//   try {
//     return await Promise.all(
//       resultDataRaw.map(async (item, idx) => {
//         const cleanedActionHtml = this.htmlUtils.cleanHtml(`${item.stepAction}`);
//         const cleanedExpectedHtml = this.htmlUtils.cleanHtml(`${item.stepExpected}`);

//         const actionRichText = await this.fetchStripDataContentControl(cleanedActionHtml);
//         const expectedRichText = await this.fetchStripDataContentControl(cleanedExpectedHtml);

//         const fields = [
//           { name: '#', value: `${idx + 1}`, width: '3.8%' },
//           { name: 'Test Id', value: `${item.testId}`, width: '7.6%' },
//           { name: 'Test Name', value: `${item.testName}` },
//           { name: 'Step', value: `${item.stepNo}`, width: '5.3%' },
//           { name: 'Action', value: cleanedActionHtml, richTextNodes: actionRichText, width: '20.8%' },
//           {
//             name: 'Expected Result',
//             value: cleanedActionHtml,
//             richTextNodes: expectedRichText,
//             width: '20.8%',
//           },
//           { name: 'Actual Result', value: `${item.stepComments}` },
//           { name: 'Step Status', value: `${item.stepStatus}`, width: '10%' },
//           // TBD
//           // { name: 'PCR No', value: `${item.PCR No}` },
//         ];

//         return { fields };
//       })
//     );
//   } catch (error: any) {
//     logger.error(`Error while building skin data adapter for Detailed Results Summary: ${error.message}`);
//     logger.error(`Error stack: ${error.stack}`);
//   }
// }
