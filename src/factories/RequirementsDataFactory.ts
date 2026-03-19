import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import { COLOR_REQ_SYS, COLOR_TEST_SOFT, buildGroupedHeader } from '../utils/tablePresentation';
import logger from '../services/logger';
import RequirementDataSkinAdapter from '../adapters/RequirementDataSkinAdapter';
import TraceAnalysisRequirementsAdapter from '../adapters/TraceAnalysisRequirementsAdapter';
import RichTextDataFactory from './RichTextDataFactory';
import htmlUtils from '../services/htmlUtils';
//Import Data skin adapter
//import RequirementsDataSkinAdapter from "../adapters/RequirementsDataSkinAdapter";

/**
 * Builds the data payloads for SRS/requirements-related content controls.
 *
 * Responsibilities:
 * - Fetch query results for system requirements and traceability queries
 * - Adapt raw results through dedicated adapters
 * - Optionally provide link-driven debug payloads for exact link-order rendering
 */
export default class RequirementsDataFactory {
  private static readonly SYSRS_SECTION_ANCHOR = 'requirements-root';
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  teamProject: string;
  templatePath: string;
  attachmentsBucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  queriesRequest: any;
  adoptedData: any[];
  private formattingSettings: any;
  private attachmentMinioData: any[];
  private allowBiggerThan500: boolean;
  private displayMode: string;
  private includeTFSLinks: boolean;
  private documentVariant: string;
  /**
   * Creates a RequirementsDataFactory
   */
  constructor(
    teamProjectName,
    templatePath,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    dgDataProvider,
    queriesRequest,
    formattingSettings,
    allowBiggerThan500 = false,
    displayMode = 'hierarchical',
    includeTFSLinks = true,
    documentVariant = 'srs',
  ) {
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.teamProject = teamProjectName;
    this.templatePath = templatePath;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.queriesRequest = queriesRequest;
    this.formattingSettings = formattingSettings;
    this.adoptedData = [];
    this.attachmentMinioData = [];
    this.allowBiggerThan500 = allowBiggerThan500;
    this.displayMode = displayMode || 'hierarchical';
    this.includeTFSLinks = includeTFSLinks;
    this.documentVariant = String(documentVariant || 'srs').toLowerCase();
  }

  /**
   * Fetches all requested requirements data and adapts it once.
   */
  async fetchRequirementsData() {
    try {
      const queryResults = await this.fetchQueryResults();

      // Set raw data and call jsonSkinDataAdapter once (similar to TestDataFactory pattern)
      this.adoptedData = await this.jsonSkinDataAdapter(
        null,
        queryResults,
        this.allowBiggerThan500,
        this.includeTFSLinks,
      );
    } catch (error) {
      logger.error(`Error fetching requirements data: ${error}`);
      throw error;
    }
  }

  /**
   * Fetches query results for system requirements and traceability requests.
   * - For system requirements: returns a tree of roots and a link debug block (if available)
   * - For traceability: returns the raw payloads used by the trace adapters
   */
  private async fetchQueryResults(): Promise<any> {
    try {
      const ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      const queryResults: any = {};
      const forwardTraceQuery =
        this.queriesRequest.systemToSoftwareRequirements ||
        this.queriesRequest.subsystemToSystemRequirements ||
        null;
      const reverseTraceQuery =
        this.queriesRequest.softwareToSystemRequirements ||
        this.queriesRequest.systemToSubsystemRequirements ||
        null;

      if (this.queriesRequest.systemRequirements) {
        // Check if we're in categorized mode
        if (this.displayMode === 'categorized') {
          logger.debug('Fetching requirements in categorized mode');
          const categorizedData = await ticketsDataProvider.GetCategorizedRequirementsByType(
            this.queriesRequest.systemRequirements.wiql.href,
          );
          queryResults['systemRequirementsCategorized'] = categorizedData;
        } else {
          // Hierarchical mode - fetch as before
          // SysRS needs all fields for VCRM/critical-requirements tables (custom fields included)
          const fetchAllFields = this.documentVariant === 'sysrs';
          let systemRequirementsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
            this.queriesRequest.systemRequirements.wiql.href,
            false,
            null,
            fetchAllFields,
          );

          queryResults['systemRequirementsQueryData'] =
            systemRequirementsQueryData.roots ?? systemRequirementsQueryData;
          // Expose workItemRelations and allItems for link-driven rendering when present
          if (systemRequirementsQueryData?.workItemRelations) {
            queryResults['systemRequirementsLinksDebug'] = {
              workItemRelations: systemRequirementsQueryData.workItemRelations,
              allItems: systemRequirementsQueryData.allItems, // Include all fetched items
            };
          }
        }
      }
      if (forwardTraceQuery) {
        let forwardTraceQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          forwardTraceQuery.wiql.href,
          true, // Enable work item relations for traceability analysis
          null,
        );
        queryResults['forwardTraceQueryData'] = forwardTraceQueryData;
      }
      if (reverseTraceQuery) {
        let reverseTraceQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          reverseTraceQuery.wiql.href,
          true, // Enable work item relations for traceability analysis
          null,
        );
        queryResults['reverseTraceQueryData'] = reverseTraceQueryData;
      }

      return queryResults;
    } catch (error) {
      logger.error(`Error fetching query results: ${error}`);
      throw error;
    }
  }

  /**
   * Adapts the fetched requirements data to skin-friendly structures.
   * - systemRequirements: emits in link order when provided with links debug, otherwise sanitized tree
   * - traceability: uses the TraceAnalysisRequirementsAdapter
   */
  private async jsonSkinDataAdapter(
    adapterType: string = null,
    rawData: any,
    allowBiggerThan500: boolean = false,
    includeTFSLinks: boolean = true,
  ) {
    let adoptedRequirementsData: any = {};
    try {
      // Handle system requirements based on display mode
      if (this.displayMode === 'categorized' && rawData.systemRequirementsCategorized) {
        // Categorized mode: process requirements grouped by type
        adoptedRequirementsData['systemRequirementsData'] = await this.adaptCategorizedData(
          rawData.systemRequirementsCategorized,
        );
      } else if (this.queriesRequest.systemRequirements && rawData.systemRequirementsQueryData) {
        // Hierarchical mode: process requirements in tree structure

        const requirementSkinAdapter = new RequirementDataSkinAdapter(
          this.teamProject,
          this.templatePath,
          this.attachmentsBucketName,
          this.minioEndPoint,
          this.minioAccessKey,
          this.minioSecretKey,
          this.PAT,
          this.formattingSettings,
          allowBiggerThan500,
          includeTFSLinks,
        );
        // If we have a link-order debug payload, let the adapter emit exactly in that order
        // and therefore use the raw provider tree (do not sanitize) so all ids are present
        const hasLinksDebug = !!rawData.systemRequirementsLinksDebug;

        const treeForAdapter = hasLinksDebug
          ? rawData.systemRequirementsQueryData
          : this.sanitizeHierarchy(rawData.systemRequirementsQueryData);

        const systemRequirementsData = await requirementSkinAdapter.jsonSkinAdapter({
          requirementQueryData: treeForAdapter,
          workItemLinksDebug: rawData.systemRequirementsLinksDebug,
        });
        this.attachmentMinioData.push(...requirementSkinAdapter.getAttachmentMinioData());
        adoptedRequirementsData['systemRequirementsData'] = systemRequirementsData;

        if (this.documentVariant === 'sysrs') {
          const sysRsTables = this.buildSysRsTables(rawData.systemRequirementsQueryData);
          adoptedRequirementsData['criticalRequirementsData'] = sysRsTables.criticalRequirementsData;
          adoptedRequirementsData['vcrmData'] = sysRsTables.vcrmData;
        }
      }

      // Handle forward traceability
      const hasForwardTraceRequest = !!(
        this.queriesRequest.systemToSoftwareRequirements || this.queriesRequest.subsystemToSystemRequirements
      );
      if (hasForwardTraceRequest && rawData.forwardTraceQueryData) {
        // Use sourceTargetsMap instead of workItemRelations
        const traceabilityData =
          rawData.forwardTraceQueryData.sourceTargetsMap || rawData.forwardTraceQueryData.workItemRelations;

        if (traceabilityData && (traceabilityData.size > 0 || traceabilityData.length > 0)) {
          const traceAdapter = new TraceAnalysisRequirementsAdapter(
            traceabilityData,
            'sys-req-to-soft-req',
            rawData.forwardTraceQueryData.sortingSourceColumnsMap,
            rawData.forwardTraceQueryData.sortingTargetsColumnsMap,
          );

          traceAdapter.adoptSkinData();
          const traceAdoptedData = traceAdapter.getAdoptedData();
          const groupedHeader =
            this.documentVariant === 'sysrs'
              ? buildGroupedHeader('Sub-System', 'System', COLOR_REQ_SYS, COLOR_TEST_SOFT)
              : buildGroupedHeader('System', 'Software', COLOR_REQ_SYS, COLOR_TEST_SOFT);
          const adoptedTraceData = {
            adoptedData: traceAdoptedData,
            groupedHeader,
          };
          const forwardKey =
            this.documentVariant === 'sysrs'
              ? 'subsystemToSystemTraceAdoptedData'
              : 'sysReqToSoftReqAdoptedData';
          adoptedRequirementsData[forwardKey] = adoptedTraceData;
        } else {
          const forwardKey =
            this.documentVariant === 'sysrs'
              ? 'subsystemToSystemTraceAdoptedData'
              : 'sysReqToSoftReqAdoptedData';
          adoptedRequirementsData[forwardKey] = { adoptedData: null };
        }
      }

      // Handle reverse traceability
      const hasReverseTraceRequest = !!(
        this.queriesRequest.softwareToSystemRequirements || this.queriesRequest.systemToSubsystemRequirements
      );
      if (hasReverseTraceRequest && rawData.reverseTraceQueryData) {
        // Use sourceTargetsMap instead of workItemRelations
        const traceabilityData =
          rawData.reverseTraceQueryData.sourceTargetsMap || rawData.reverseTraceQueryData.workItemRelations;

        if (traceabilityData && (traceabilityData.size > 0 || traceabilityData.length > 0)) {
          const traceAdapter = new TraceAnalysisRequirementsAdapter(
            traceabilityData,
            'soft-req-to-sys-req',
            rawData.reverseTraceQueryData.sortingSourceColumnsMap,
            rawData.reverseTraceQueryData.sortingTargetsColumnsMap,
          );

          traceAdapter.adoptSkinData();
          const traceAdoptedData = traceAdapter.getAdoptedData();
          const groupedHeader =
            this.documentVariant === 'sysrs'
              ? buildGroupedHeader('System', 'Sub-System', COLOR_TEST_SOFT, COLOR_REQ_SYS)
              : buildGroupedHeader('Software', 'System', COLOR_TEST_SOFT, COLOR_REQ_SYS);
          const adoptedTraceData = {
            adoptedData: traceAdoptedData,
            groupedHeader,
          };
          const reverseKey =
            this.documentVariant === 'sysrs'
              ? 'systemToSubsystemTraceAdoptedData'
              : 'softReqToSysReqAdoptedData';
          adoptedRequirementsData[reverseKey] = adoptedTraceData;
        } else {
          const reverseKey =
            this.documentVariant === 'sysrs'
              ? 'systemToSubsystemTraceAdoptedData'
              : 'softReqToSysReqAdoptedData';
          adoptedRequirementsData[reverseKey] = { adoptedData: null };
        }
      }

      return adoptedRequirementsData;
    } catch (error) {
      logger.error(
        `Error occurred during build json skin data adapter for adapter type: ${adapterType}, ${error.message}`,
      );
      throw error;
    }
  }

  private buildSysRsTables(systemRequirementsQueryData: any) {
    const rows = this.flattenRequirementsWithSections(systemRequirementsQueryData);
    const criticalRequirementsData = rows
      .filter((row) => this.isRequirementLike(row) && this.isPriorityOne(row.fields))
      .map((row) => ({
        fields: [
          { name: 'ID', value: row.id, url: row.htmlUrl || undefined },
          { name: 'Title', value: row.title },
          { name: 'Comment', value: this.readVerificationComment(row.fields) },
        ],
      }));

    const vcrmData = rows.map((row) => ({
      fields: [
        { name: 'ID', value: row.id, url: row.htmlUrl || undefined },
        { name: 'Section', value: row.section },
        { name: 'Title', value: row.title },
        { name: 'Verification Method', value: this.readVerificationMethod(row.fields) },
        { name: 'Site', value: this.readSite(row.fields) },
        { name: 'Test Phase', value: this.readTestPhase(row.fields) },
      ],
    }));

    return { criticalRequirementsData, vcrmData };
  }

  private flattenRequirementsWithSections(nodes: any): any[] {
    const roots = Array.isArray(nodes) ? nodes : [];
    const sanitizedRoots = this.sanitizeHierarchy(roots);
    const flattenedRows: any[] = [];

    const walk = (currentNodes: any[], path: number[] = [], ancestry: Set<any> = new Set()) => {
      if (!Array.isArray(currentNodes) || currentNodes.length === 0) return;
      const siblingsSeen = new Set<any>();
      let nodeIndex = 0;

      for (const node of currentNodes) {
        const key = node?.id ?? node;
        if (siblingsSeen.has(key)) continue;
        siblingsSeen.add(key);
        if (ancestry.has(key)) continue;
        nodeIndex += 1;

        const nextPath = [...path, nodeIndex];
        const fields = node?.fields && typeof node.fields === 'object' ? node.fields : {};
        const titleFromField = this.readField(fields, ['System.Title', 'Title'], ['title']);
        const title = String(node?.title || titleFromField || '').trim();

        flattenedRows.push({
          id: node?.id ?? '',
          title,
          htmlUrl: node?.htmlUrl,
          fields,
          workItemType: String(
            node?.workItemType || this.readField(fields, ['System.WorkItemType'], ['workitemtype']),
          ),
          section: `{{section:${RequirementsDataFactory.SYSRS_SECTION_ANCHOR}:${nextPath.join('.')}}}`,
        });

        if (Array.isArray(node?.children) && node.children.length > 0) {
          const nextAncestry = new Set(ancestry);
          nextAncestry.add(key);
          walk(node.children, nextPath, nextAncestry);
        }
      }
    };

    walk(sanitizedRoots);
    return flattenedRows;
  }

  private isRequirementLike(row: any): boolean {
    const workItemType = String(row?.workItemType || '').toLowerCase();
    if (!workItemType) return false;
    return workItemType.includes('requirement');
  }

  private isPriorityOne(fields: any): boolean {
    const priority = this.readField(fields, ['Microsoft.VSTS.Common.Priority', 'Priority'], ['priority']);
    const normalized = String(priority || '').trim();
    if (!normalized) return false;
    const exactNumeric = Number(normalized);
    if (Number.isFinite(exactNumeric)) return exactNumeric === 1;
    const firstNumber = normalized.match(/\d+/)?.[0];
    return Number(firstNumber) === 1;
  }

  private readVerificationComment(fields: any): string {
    return this.readField(
      fields,
      ['Microsoft.VSTS.Common.VerificationComment', 'Verification Comment', 'VerificationComment'],
      ['verificationcomment'],
    );
  }

  private readVerificationMethod(fields: any): string {
    return this.readField(
      fields,
      ['Microsoft.VSTS.Common.VerificationMethod', 'Verification Method', 'VerificationMethod'],
      ['verificationmethod', 'verifymethod'],
    );
  }

  private readSite(fields: any): string {
    return this.readField(
      fields,
      ['Microsoft.VSTS.Common.VerificationSite', 'Verification Site', 'Site', 'Test Site'],
      ['verificationsite', 'testsite', 'site'],
    );
  }

  private readTestPhase(fields: any): string {
    return this.readField(
      fields,
      ['Microsoft.VSTS.Common.TestPhase', 'Test Phase', 'TestPhase', 'Verification Phase'],
      ['testphase', 'verificationphase'],
    );
  }

  private readField(fields: any, exactCandidates: string[] = [], containsCandidates: string[] = []): string {
    if (!fields || typeof fields !== 'object') return '';
    const entries = Object.entries(fields);
    const valueByNormalizedKey = new Map<string, any>();
    for (const [key, value] of entries) {
      valueByNormalizedKey.set(this.normalizeFieldKey(key), value);
    }

    for (const key of exactCandidates) {
      const rawValue = valueByNormalizedKey.get(this.normalizeFieldKey(key));
      const serialized = this.serializeFieldValue(rawValue);
      if (serialized) return serialized;
    }

    for (const [key, value] of entries) {
      const normalizedKey = this.normalizeFieldKey(key);
      if (containsCandidates.some((candidate) => normalizedKey.includes(this.normalizeFieldKey(candidate)))) {
        const serialized = this.serializeFieldValue(value);
        if (serialized) return serialized;
      }
    }

    return '';
  }

  private normalizeFieldKey(value: any): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  private serializeFieldValue(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this.serializeFieldValue(item))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof value === 'object') {
      if (value.displayName) return String(value.displayName).trim();
      if (value.name) return String(value.name).trim();
      if (value.value != null) return this.serializeFieldValue(value.value);
    }
    return String(value).trim();
  }

  getAdoptedData() {
    return this.adoptedData;
  }

  getAttachmentMinioData() {
    return this.attachmentMinioData;
  }

  /**
   * Adapts categorized requirements data for skin rendering.
   * Converts the categorized structure into a format compatible with the skin generator.
   * Format matches RequirementDataSkinAdapter output: { fields: [...], level: number }
   */
  private async adaptCategorizedData(categorizedData: any): Promise<any[]> {
    const adoptedData: any[] = [];
    const { categories } = categorizedData;

    const htmlUtilsInstance = new htmlUtils();

    // Define the desired order of all categories
    const allCategories = [
      'External Interfaces Requirements',
      'Internal Interfaces Requirements',
      'Internal Data Requirements',
      'Adaptation Requirements',
      'Safety Requirements',
      'Security and Privacy Requirements',
      'CSCI Environment Requirements',
      'Computer Resource Requirements',
      'Software Quality Factors',
      'Design and Implementation Constraints',
      'Personnel-Related Requirements',
      'Training-Related Requirements',
      'Logistics-Related Requirements',
      'Other Requirements',
      'Packaging Requirements',
      'Precedence and Criticality of Requirements',
    ];

    // Process each category in the defined order
    for (const categoryName of allCategories) {
      // Add category header as a skin data object
      // Category headers need valid values for all fields to pass skin validation
      // Use minimal HTML for description to satisfy JSONRichTextParagraph validation
      const categoryHeader = {
        fields: [
          { name: 'Title', value: categoryName },
          { name: 'ID', value: '' }, // Empty string is OK for ID
          { name: 'WI Description', value: '<p></p>' }, // Minimal valid HTML for description
        ],
        level: 2,
      };
      adoptedData.push(categoryHeader);

      // Get requirements for this category (if any)
      const requirements = categories?.[categoryName] || [];

      // Add each requirement in the category (if any exist)
      for (const req of requirements as any[]) {
        // Process the requirement description
        let descriptionRichText = 'No description available';
        if (req.description) {
          try {
            // Clean the HTML first
            const cleanedDescription = await htmlUtilsInstance.cleanHtml(
              req.description,
              false,
              this.formattingSettings?.trimAdditionalSpacingInDescriptions || false,
            );

            // Process the HTML description using RichTextDataFactory
            const richTextFactory = new RichTextDataFactory(
              cleanedDescription,
              this.templatePath,
              this.teamProject,
              this.attachmentsBucketName,
              this.minioEndPoint,
              this.minioAccessKey,
              this.minioSecretKey,
              this.PAT,
              false, // excludeImages
            );

            descriptionRichText = await richTextFactory.factorizeRichTextData();

            // Collect attachments
            richTextFactory.attachmentMinioData.forEach((item) => {
              const attachmentBucketData = {
                attachmentMinioPath: item.attachmentPath,
                minioFileName: item.fileName,
              };
              this.attachmentMinioData.push(attachmentBucketData);
            });
          } catch (err: any) {
            logger.warn(`Could not process description for requirement ${req.id}: ${err.message}`);
            descriptionRichText = req.description || 'No description available';
          }
        }

        // Add requirement in the same format as RequirementDataSkinAdapter
        // Add space at the beginning for proper spacing after Word's automatic numbering
        const skinData = {
          fields: [
            { name: 'Title', value: ' ' + req.title.trim() + ' - ' },
            { name: 'ID', value: req.id, url: req.htmlUrl },
            { name: 'WI Description', value: descriptionRichText },
          ],
          level: 3,
        };
        adoptedData.push(skinData);
      }
    }

    return adoptedData;
  }

  // --- Helpers to sanitize hierarchical data returned by the provider ---
  /**
   * Produces a sanitized copy of the input hierarchical tree:
   * - Dedupes roots and children per parent
   * - Prunes cycles defensively
   */
  private sanitizeHierarchy(roots: any[]): any[] {
    try {
      if (!Array.isArray(roots) || roots.length === 0) return roots;

      // Dedupe roots by id, preserve first occurrence order
      const seenRoots = new Set<any>();
      const dedupedRoots: any[] = [];
      for (const r of roots) {
        const key = r?.id ?? r;
        if (seenRoots.has(key)) continue;
        seenRoots.add(key);
        dedupedRoots.push(r);
      }

      // Recursively dedupe children per parent and break cycles
      const result: any[] = [];
      const ancestry = new Set<any>();
      for (const root of dedupedRoots) {
        const sanitized = this.sanitizeNode(root, ancestry);
        if (sanitized) result.push(sanitized);
      }
      return result;
    } catch (e) {
      logger.error(`sanitizeHierarchy failed: ${e?.message || e}`);
      return roots;
    }
  }

  /**
   * Recursively sanitize a node, deduping per parent and pruning cycles.
   */
  private sanitizeNode(node: any, ancestry: Set<any>): any | null {
    if (!node) return null;
    const key = node?.id ?? node;
    if (ancestry.has(key)) return null; // break cycle

    // Shallow-copy node to avoid mutating original
    const out: any = {
      ...node,
      children: [],
    };
    ancestry.add(key);
    const siblingsSeen = new Set<any>();
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      const ckey = child?.id ?? child;
      if (siblingsSeen.has(ckey)) continue; // dedupe per parent
      const sanitizedChild = this.sanitizeNode(child, ancestry);
      if (sanitizedChild) {
        siblingsSeen.add(ckey);
        out.children.push(sanitizedChild);
      }
    }
    ancestry.delete(key);
    return out;
  }
}
