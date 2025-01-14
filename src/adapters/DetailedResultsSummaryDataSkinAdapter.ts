import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';

export default class DetailedResultsSummaryDataSkinAdapter {
  htmlUtils: HtmlUtils;
  templatePath: string;
  teamProject: string;
  constructor(templatePath: string, teamProject: string) {
    this.htmlUtils = new HtmlUtils();
    this.templatePath = templatePath;
    this.teamProject = teamProject;
  }

  private async fetchStripDataContentControl(text): Promise<any> {
    const richTextFactory = new RichTextDataFactory(text, this.templatePath, this.teamProject);
    await richTextFactory.createRichTextContent();
    const skinDataContentControls = richTextFactory.skinDataContentControls;
    return skinDataContentControls;
  }

  public async jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      return await Promise.all(
        resultDataRaw.map(async (item, idx) => {
          const cleanedActionHtml = this.htmlUtils.cleanHtml(`${item.stepAction}`);
          const cleanedExpectedHtml = this.htmlUtils.cleanHtml(`${item.stepExpected}`);

          const actionRichText = await this.fetchStripDataContentControl(cleanedActionHtml);
          const expectedRichText = await this.fetchStripDataContentControl(cleanedExpectedHtml);

          const fields = [
            { name: '#', value: `${idx + 1}`, width: '3.8%' },
            { name: 'Test Id', value: `${item.testId}`, width: '7.6%' },
            { name: 'Test Name', value: `${item.testName}` },
            { name: 'Step', value: `${item.stepNo}`, width: '5.3%' },
            { name: 'Action', value: cleanedActionHtml, richTextNodes: actionRichText, width: '20.8%' },
            {
              name: 'Expected Result',
              value: cleanedActionHtml,
              richTextNodes: expectedRichText,
              width: '20.8%',
            },
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
