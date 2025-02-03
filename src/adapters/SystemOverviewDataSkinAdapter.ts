import TicketsDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/TicketsDataProvider';
import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';
export default class SystemOverviewDataSkinAdapter {
  private htmlUtils: HtmlUtils;
  private adoptedData: any[];
  private teamProject: string;
  private templatePath: string;
  private attachmentsBucketName: string;
  private minioEndPoint: string;
  private minioAccessKey: string;
  private minioSecretKey: string;
  private PAT: string;
  private attachmentMinioData: any[];
  private ticketsProvider: TicketsDataProvider;
  constructor(
    teamProject,
    templatePath,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    ticketsProvider
  ) {
    this.teamProject = teamProject;
    this.templatePath = templatePath;
    this.htmlUtils = new HtmlUtils();
    this.adoptedData = [];
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentMinioData = [];
    this.ticketsProvider = ticketsProvider;
  }
  public async jsonSkinAdapter(rawData: any) {
    try {
      const { systemOverviewQueryData } = rawData;
      if (systemOverviewQueryData.length > 0) {
        await this.adaptDataRecursively(systemOverviewQueryData);
      }
    } catch (err: any) {
      logger.error(`could not create the adopted data ${err.message}`);
      logger.error(err.stack);
    }
    return this.adoptedData;
  }

  private async adaptDataRecursively(nodes: any[], headerLevel: number = 3) {
    for (const node of nodes) {
      let Description = node.description || 'No description';
      let cleanedDescription = await this.htmlUtils.cleanHtml(Description);
      let richTextFactory = new RichTextDataFactory(
        cleanedDescription,
        this.templatePath,
        this.teamProject,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );
      const descriptionRichText = await richTextFactory.factorizeRichTextData();
      richTextFactory.attachmentMinioData.forEach((item) => {
        let attachmentBucketData = {
          attachmentMinioPath: item.attachmentPath,
          minioFileName: item.fileName,
        };
        this.attachmentMinioData.push(attachmentBucketData);
      });
      let skinData = {
        fields: [
          { name: 'Title', value: node.title + ' - ' },
          { name: 'ID', value: node.id, url: node.htmlUrl },
          { name: 'WI Description', value: descriptionRichText },
        ],
        level: headerLevel,
      };
      this.adoptedData.push(skinData);
      if (node.children?.length > 0) {
        await this.adaptDataRecursively(node.children, headerLevel + 1);
      }
    }
  }

  public getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }
}
