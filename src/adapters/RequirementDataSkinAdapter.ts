import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';

export default class RequirementDataSkinAdapter {
  private adoptedData: any[] = [];
  private attachmentMinioData: any[] = [];
  private htmlUtils: any;
  private templatePath: string;
  private teamProject: string;
  private attachmentsBucketName: string;
  private minioEndPoint: string;
  private minioAccessKey: string;
  private minioSecretKey: string;
  private PAT: string;
  private formattingSettings: any;

  constructor(
    teamProject: string,
    templatePath: string,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string,
    formattingSettings: any
  ) {
    this.teamProject = teamProject;
    this.templatePath = templatePath;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.formattingSettings = formattingSettings;
    this.htmlUtils = new HtmlUtils();
    this.adoptedData = [];
    this.attachmentMinioData = [];
  }

  public async jsonSkinAdapter(rawData: any) {
    try {
      const { requirementQueryData } = rawData;
      if (requirementQueryData.length > 0) {
        const totalNodes = this.countTotalNodes(requirementQueryData);

        if (totalNodes > 500) {
          const errorMsg = `Too many results to process: ${totalNodes}. Maximum allowed is 500.
           Please narrow down the query parameters.`;
          logger.error(errorMsg);
          throw new Error(errorMsg);
        }
        await this.adaptDataRecursively(requirementQueryData);
      }
      return this.adoptedData;
    } catch (err: any) {
      logger.error(`could not create the adopted data for requirements ${err.message}`);
      throw err;
    }
  }

  private async adaptDataRecursively(
    nodes: any[],
    headerLevel: number = 2,
    baseLevel?: number,
    visited: Set<any> = new Set()
  ) {
    // Initialize base level on first call
    if (baseLevel === undefined) baseLevel = headerLevel;
    for (const node of nodes) {
      // Check for circular reference to prevent infinite recursion
      if (visited.has(node)) {
        logger.warn(`Circular reference detected during adaptation for node: ${node.id || 'unknown'}`);
        continue;
      }

      visited.add(node);

      let Description = node.description || 'No description';
      let cleanedDescription = await this.htmlUtils.cleanHtml(
        Description,
        false,
        this.formattingSettings.trimAdditionalSpacingInDescriptions
      );
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

      // Recurse; cap header level at baseLevel + 2 (do not increase beyond it)
      if (node.children?.length > 0) {
        const nextLevel = headerLevel - baseLevel < 2 ? headerLevel + 1 : headerLevel;
        await this.adaptDataRecursively(node.children, nextLevel, baseLevel, visited);
      }

      // Remove from visited set after processing to allow the same node in different branches
      visited.delete(node);
    }
  }

  private countTotalNodes(nodes: any[], visited: Set<any> = new Set()): number {
    let count = 0;
    for (const node of nodes) {
      // Check for circular reference to prevent infinite recursion
      if (visited.has(node)) {
        logger.warn(`Circular reference detected for node: ${node.id || 'unknown'}`);
        continue;
      }

      visited.add(node);
      count++;

      if (node.children?.length) {
        count += this.countTotalNodes(node.children, visited);
      }

      // Remove from visited set after processing to allow the same node in different branches
      visited.delete(node);
    }
    return count;
  }

  public getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }
}
