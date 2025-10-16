import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';

// Represents a single link edge from source id 's' to target id 't'.
type LinkPair = { s: number; t: number };
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
  private formattingSettings: any;
  private allowBiggerThan500: boolean;
  constructor(
    teamProject,
    templatePath,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    formattingSettings: any,
    allowBiggerThan500: boolean = false
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
    this.formattingSettings = formattingSettings;
    this.allowBiggerThan500 = allowBiggerThan500;
  }

  /**
   * Builds a flat map of work item id to its full node data from the provided tree.
   */
  private buildIdToNodeMap(nodes: any[]): Record<number, any> {
    const idToNode: Record<number, any> = {};
    const visited = new Set<any>();
    const walk = (arr: any[]) => {
      for (const n of arr || []) {
        const key = n?.id ?? n;
        if (visited.has(key)) continue;
        visited.add(key);
        idToNode[key] = n;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return idToNode;
  }

  /**
   * Counts total unique nodes from a tree while skipping cycles and duplicate siblings per parent.
   */
  private countTotalNodes(nodes: any[], ancestry: Set<any> = new Set()): number {
    let count = 0;
    const siblingsSeen = new Set<any>();
    for (const node of nodes) {
      const key = node?.id ?? node;
      // Dedupe repeated siblings per parent (preserve first occurrence order)
      if (siblingsSeen.has(key)) {
        continue;
      }
      siblingsSeen.add(key);
      // Skip cycles entirely: do not count or recurse
      if (ancestry.has(key)) {
        continue;
      }
      // Count this item once
      count++;
      ancestry.add(key);
      if (node.children?.length > 0) {
        count += this.countTotalNodes(node.children, ancestry);
      }
      ancestry.delete(key);
    }
    return count;
  }
  /**
   * Entry point for adapting System Overview data into skin-friendly rows.
   * If link-order debug (systemOverviewLinksDebug) is provided, emit in that exact order.
   * Otherwise, traverse recursively with cycle and sibling-duplicate protection.
   */
  public async jsonSkinAdapter(rawData: any) {
    try {
      const { systemOverviewQueryData } = rawData;
      if (rawData?.systemOverviewLinksDebug) {
        const totalNodes = this.countFromLinks(rawData.systemOverviewLinksDebug) ?? 0;
        if (!this.allowBiggerThan500 ? totalNodes > 500 : totalNodes > 1000) {
          const errorMsg = `Too many results to process: ${totalNodes}. Maximum allowed is ${
            this.allowBiggerThan500 ? 1000 : 500
          }.
           Please narrow down the query parameters.`;
          logger.error(errorMsg);
          throw new Error(errorMsg);
        }
        await this.adaptDataFromLinks(systemOverviewQueryData, rawData.systemOverviewLinksDebug);
      } else if (systemOverviewQueryData.length > 0) {
        // Count total nodes before processing
        const totalNodes = this.countTotalNodes(systemOverviewQueryData);

        // Check against the 500 limit
        if (!this.allowBiggerThan500 ? totalNodes > 500 : totalNodes > 1000) {
          const errorMsg = `Too many results to process: ${totalNodes}. Maximum allowed is ${
            this.allowBiggerThan500 ? 1000 : 500
          }.
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

  // --- Link-driven rendering (mirrors TFS order) ---
  /**
   * Counts how many rows would be emitted from the provided links debug structure.
   */
  private countFromLinks(linksDebug: any): number {
    try {
      const pairs = this.deriveLinkPairs(linksDebug);
      return pairs.length;
    } catch {
      return 0;
    }
  }

  /**
   * Emits rows exactly in the link order using a stack to reconstruct hierarchy boundaries.
   */
  private async adaptDataFromLinks(systemOverviewQueryData: any[], linksDebug: any) {
    const idToNode = this.buildIdToNodeMap(systemOverviewQueryData || []);
    const linkPairs = this.deriveLinkPairs(linksDebug);
    const rootLevel = 3;
    let pathStack: number[] = [];
    for (const { s, t } of linkPairs) {
      if (s === 0) {
        // New root group
        pathStack = [];
        await this.emitNodeById(idToNode, t, rootLevel + pathStack.length);
        pathStack.push(t);
        continue;
      }
      // Restore the correct parent on top of the stack
      while (pathStack.length > 0 && pathStack[pathStack.length - 1] !== s) {
        pathStack.pop();
      }
      // Defensive: if parent not found, start a new root with the source
      if (pathStack.length === 0) {
        await this.emitNodeById(idToNode, s, rootLevel);
        pathStack.push(s);
      }
      const depth = pathStack.length;
      await this.emitNodeById(idToNode, t, rootLevel + depth);
      pathStack.push(t);
    }
  }

  /**
   * Emits a single node by id at the desired header level (title, id, description rich text).
   */
  private async emitNodeById(idToNode: Record<number, any>, id: number, headerLevel: number) {
    const node = idToNode[id];
    if (!node) {
      return;
    }
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
  }

  /**
   * Normalizes links debug input into simple pairs (s -> t), supporting either
   * explicit arrays (sourceIds/targetIds) or workItemRelations shape.
   */
  private deriveLinkPairs(linksDebug: any): Array<LinkPair> {
    const sourceIds: number[] = linksDebug?.sourceIds ?? [];
    const targetIds: number[] = linksDebug?.targetIds ?? [];
    if (sourceIds.length && targetIds.length) {
      const n = Math.min(sourceIds.length, targetIds.length);
      const pairs: Array<LinkPair> = [];
      for (let i = 0; i < n; i++) pairs.push({ s: sourceIds[i], t: targetIds[i] });
      return pairs;
    }
    const workItemRelations: any[] = linksDebug?.workItemRelations ?? [];
    if (Array.isArray(workItemRelations) && workItemRelations.length) {
      const pairs: Array<LinkPair> = [];
      for (const rel of workItemRelations) {
        if (rel?.rel === null && !rel?.source) {
          pairs.push({ s: 0, t: Number(rel?.target?.id) });
        } else if (rel?.source && rel?.target) {
          pairs.push({ s: Number(rel.source.id), t: Number(rel.target.id) });
        }
      }
      return pairs;
    }
    return [];
  }

  // Debug printing removed

  /**
   * Recursively traverses the overview tree, skipping cycles and duplicate siblings per parent.
   */
  private async adaptDataRecursively(nodes: any[], headerLevel: number = 3, ancestry?: Set<any>) {
    if (!ancestry) ancestry = new Set<any>();
    const siblingsSeen = new Set<any>();
    for (const node of nodes) {
      const key = node?.id ?? node;
      // Dedupe repeated siblings per parent (preserve first occurrence order)
      if (siblingsSeen.has(key)) {
        continue;
      }
      siblingsSeen.add(key);
      // If cycle detected in current ancestry path, skip emitting and do not recurse
      if (ancestry.has(key)) {
        continue;
      }
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
      if (node.children?.length > 0) {
        ancestry.add(key);
        await this.adaptDataRecursively(node.children, headerLevel + 1, ancestry);
        ancestry.delete(key);
      }
    }
  }

  public getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }
}
