import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';
export default class SystemOverviewDataSkinAdapter {
  private htmlUtils: HtmlUtils;
  private adoptedData: any[];
  private teamProject: string;
  private templatePath: string;
  constructor(teamProject, templatePath) {
    this.teamProject = teamProject;
    this.templatePath = templatePath;
    this.htmlUtils = new HtmlUtils();
    this.adoptedData = [];
  }
  public async jsonSkinAdapter(systemOverviewRawData: any[]) {
    try {
      if (systemOverviewRawData.length > 0) {
        await this.adaptDataRecursively(systemOverviewRawData);
      }
    } catch (err: any) {
      logger.error(`could not create the adopted data ${err.message}`);
    }
    return this.adoptedData;
  }

  private async adaptDataRecursively(nodes: any[], headerLevel: number = 3) {
    for (const node of nodes) {
      let Description = node.description || 'No description';
      let cleanedDescription = this.htmlUtils.cleanHtml(Description);
      let richTextFactory = new RichTextDataFactory(cleanedDescription, this.templatePath, this.teamProject);
      await richTextFactory.createRichTextContentWithNoImages();
      let richText = richTextFactory.skinDataContentControls;
      let skinData = {
        fields: [
          { name: 'Title', value: node.title + ' - ' },
          { name: 'ID', value: node.id, url: node.htmlUrl },
          { name: 'WI Description', value: cleanedDescription, richText },
        ],
        level: headerLevel,
      };
      this.adoptedData.push(skinData);
      if (node.children?.length > 0) {
        await this.adaptDataRecursively(node.children, headerLevel + 1);
      }
    }
  }
}
