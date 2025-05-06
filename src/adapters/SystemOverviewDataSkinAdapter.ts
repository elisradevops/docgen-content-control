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
  constructor(
    teamProject,
    templatePath,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
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
  }

  private countTotalNodes(nodes: any[]): number {
    let count = 0;
    for (const node of nodes) {
      // Count this node
      count++;
      // Recursively count children
      if (node.children?.length > 0) {
        count += this.countTotalNodes(node.children);
      }
    }
    return count;
  }
  public async jsonSkinAdapter(rawData: any) {
    try {
      const { systemOverviewQueryData } = rawData;
      if (systemOverviewQueryData.length > 0) {
        // Count total nodes before processing
        const totalNodes = this.countTotalNodes(systemOverviewQueryData);

        // Check against the 500 limit
        if (totalNodes > 500) {
          const errorMsg = `Too many results to process: ${totalNodes}. Maximum allowed is 500.
           Please narrow down the query parameters.`;
          logger.error(errorMsg);
          throw new Error(errorMsg);
        }
        await this.adaptDataRecursively(systemOverviewQueryData);
      }
      return this.adoptedData;
    } catch (err: any) {
      logger.error(`could not create the adopted data for system overview ${err.message}`);
      throw err;
    }
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
          { name: 'Title', value: node.title.trim() + ' - ' },
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
