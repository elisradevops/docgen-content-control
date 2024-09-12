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

  private htmlStrip(text): string {
    const richTextFactory = new RichTextDataFactory(text, this.templatePath, this.teamProject);
    richTextFactory.htmlStrip();
    const strippedText = richTextFactory.skinDataContentControls[0].data.fields[0].value;
    return strippedText.replace(/\n/g, '<BR/>');
  }

  public jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      return resultDataRaw.map((item, idx) => {
        const cleanedActionHtml = this.htmlUtils.cleanHtml(`${item.stepAction}`);
        const cleanedExpectedHtml = this.htmlUtils.cleanHtml(`${item.stepExpected}`);

        const action = this.htmlStrip(cleanedActionHtml);
        const expected = this.htmlStrip(cleanedExpectedHtml);

        const fields = [
          { name: '#', value: `${idx + 1}` },
          { name: 'Test Id', value: `${item.testId}` },
          { name: 'Test Name', value: `${item.testName}` },
          { name: 'Step No', value: `${item.stepNo}` },
          { name: 'Action', value: action },
          { name: 'Expected Result', value: expected },
          { name: 'Step Status', value: `${item.stepStatus}` },
          { name: 'Step Comments', value: `${item.stepComments}` },
          // TBD
          // { name: 'PCR No', value: `${item.PCR No}` },
        ];

        return { fields };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter ${error.message}`);
    }
  }
}
