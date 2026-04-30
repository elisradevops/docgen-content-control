import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import {
  COLOR_REQ_SYS,
  COLOR_TEST_SOFT,
  REQUIREMENT_WORK_ITEM_TYPES,
  buildGroupedHeader,
  isTraceabilityRel,
} from '../utils/tablePresentation';
import logger from '../services/logger';
import RequirementDataSkinAdapter from '../adapters/RequirementDataSkinAdapter';
import TraceAnalysisRequirementsAdapter from '../adapters/TraceAnalysisRequirementsAdapter';
import type { CustomerCoverageRow } from '../adapters/CustomerCoverageTableSkinAdapter';
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
  private static readonly SYSRS_VCRM_NA = 'N/A';
  private static readonly SYSRS_VCRM_EPIC_FILL = 'D9D9D9';
  private static readonly SYSRS_VCRM_FEATURE_FILL = 'EDEDED';
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
    this.documentVariant = String(documentVariant || 'srs').toLowerCase();
    this.displayMode = this.documentVariant === 'sysrs' ? 'hierarchical' : displayMode || 'hierarchical';
    this.includeTFSLinks = includeTFSLinks;
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
      const useCategorizedMode = this.displayMode === 'categorized' && this.documentVariant !== 'sysrs';

      if (this.queriesRequest.systemRequirements) {
        if (useCategorizedMode) {
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
      const useCategorizedMode = this.displayMode === 'categorized' && this.documentVariant !== 'sysrs';

      if (useCategorizedMode && rawData.systemRequirementsCategorized) {
        adoptedRequirementsData['systemRequirementsData'] = await this.adaptCategorizedData(
          rawData.systemRequirementsCategorized,
        );
      } else if (this.queriesRequest.systemRequirements && rawData.systemRequirementsQueryData) {
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

      if (this.documentVariant === 'sysrs' && this.queriesRequest?.customerRequirements) {
        try {
          adoptedRequirementsData.customerCoverageTableData = await this.buildCustomerCoverageTable(
            this.queriesRequest.customerRequirements,
          );
        } catch (err: any) {
          logger.error(`Customer traceability coverage build failed: ${err?.message}`);
          adoptedRequirementsData.customerCoverageTableData = {
            error: err?.message || 'Unknown error',
          };
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

  private async computeCoverageFromSourceLinks(
    sourceSet: any[],
    isCoverageRel: (rel: string) => boolean = isTraceabilityRel,
  ): Promise<Map<number, { source: any; covers: any[] }>> {
    const coverageBySource = new Map<number, { source: any; coversById: Map<number, any> }>();
    const uniqueLinkedIds = new Set<number>();

    for (const source of Array.isArray(sourceSet) ? sourceSet : []) {
      const sourceId = Number(source?.id);
      if (!Number.isFinite(sourceId)) {
        continue;
      }
      coverageBySource.set(sourceId, {
        source,
        coversById: new Map<number, any>(),
      });

      const relations = Array.isArray(source?.relations) ? source.relations : [];
      for (const relation of relations) {
        const relName = String(relation?.rel || '');
        if (!isCoverageRel(relName)) {
          continue;
        }

        const match = String(relation?.url || '').match(/\/workItems\/(\d+)/);
        if (!match?.[1]) {
          continue;
        }

        const targetId = Number(match[1]);
        if (targetId === sourceId) {
          continue;
        }

        uniqueLinkedIds.add(targetId);
        coverageBySource.get(sourceId)?.coversById.set(targetId, { id: targetId });
      }
    }

    if (uniqueLinkedIds.size > 0) {
      const ticketsDP = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      const hydratedTargets = await ticketsDP.PopulateWorkItemsByIds([...uniqueLinkedIds], this.teamProject);
      const hydratedById = new Map<number, any>();
      for (const target of Array.isArray(hydratedTargets) ? hydratedTargets : []) {
        const targetId = Number(target?.id);
        if (Number.isFinite(targetId)) {
          hydratedById.set(targetId, target);
        }
      }

      for (const coverage of coverageBySource.values()) {
        for (const targetId of coverage.coversById.keys()) {
          const hydratedTarget = hydratedById.get(targetId);
          if (hydratedTarget && this.isRequirementWorkItem(hydratedTarget)) {
            coverage.coversById.set(targetId, hydratedTarget);
          } else {
            coverage.coversById.delete(targetId);
          }
        }
      }
    }

    const result = new Map<number, { source: any; covers: any[] }>();
    for (const [sourceId, coverage] of coverageBySource.entries()) {
      result.set(sourceId, {
        source: coverage.source,
        covers: [...coverage.coversById.values()],
      });
    }

    return result;
  }

  private classifyCustomerTraceRelation(
    relation: any,
  ): 'customer-to-system' | 'system-to-customer' | null {
    const displayName = String(relation?.attributes?.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    const relRef = String(relation?.rel || '').toLowerCase();

    if (relRef.includes('affects-forward') || relRef.includes('coveredby-forward')) {
      return 'system-to-customer';
    }
    if (relRef.includes('affects-reverse') || relRef.includes('coveredby-reverse')) {
      return 'customer-to-system';
    }

    if (displayName === 'affectedby' || displayName === 'coveredby') {
      return 'customer-to-system';
    }
    if (displayName === 'affects' || displayName === 'covers') {
      return 'system-to-customer';
    }

    return null;
  }

  private extractRelationWorkItemId(relation: any): number | null {
    const match = String(relation?.url || '').match(/\/workItems\/(\d+)/);
    if (!match?.[1]) {
      return null;
    }

    const workItemId = Number(match[1]);
    return Number.isFinite(workItemId) ? workItemId : null;
  }

  private async buildOrientedCustomerCoverageRows(
    selectedRequirements: any[],
    ticketsDP: any,
    selectedRequirementsById: Map<number, any>,
  ): Promise<{ rows: CustomerCoverageRow[]; sourceOrder: number[]; stats: any }> {
    const relationRecords: Array<{
      selected: any;
      selectedId: number;
      targetId: number;
      orientation: 'customer-to-system' | 'system-to-customer';
    }> = [];
    const linkedIds = new Set<number>();

    for (const selected of Array.isArray(selectedRequirements) ? selectedRequirements : []) {
      const selectedId = Number(selected?.id);
      if (!Number.isFinite(selectedId)) {
        continue;
      }

      const relations = Array.isArray(selected?.relations) ? selected.relations : [];
      for (const relation of relations) {
        const orientation = this.classifyCustomerTraceRelation(relation);
        if (!orientation) {
          continue;
        }

        const targetId = this.extractRelationWorkItemId(relation);
        if (!targetId || targetId === selectedId) {
          continue;
        }

        if (!selectedRequirementsById.has(targetId)) {
          linkedIds.add(targetId);
        }
        relationRecords.push({
          selected,
          selectedId,
          targetId,
          orientation,
        });
      }
    }
    const hydratedTargets =
      linkedIds.size > 0 ? await ticketsDP.PopulateWorkItemsByIds([...linkedIds], this.teamProject) : [];
    const hydratedTargetsById = new Map<number, any>(selectedRequirementsById);
    for (const target of Array.isArray(hydratedTargets) ? hydratedTargets : []) {
      const targetId = Number(target?.id);
      if (Number.isFinite(targetId)) {
        hydratedTargetsById.set(targetId, target);
      }
    }

    const rows: CustomerCoverageRow[] = [];
    const rowKeys = new Set<string>();
    const sourceOrder: number[] = [];
    const orderedCustomers = new Set<number>();
    const coveredCustomers = new Set<number>();
    const systemSideRequirements = new Set<number>();
    const selectedIdsWithValidCoverage = new Set<number>();
    const selectedIdsWithInvalidCustomerCoverage = new Set<number>();

    const addCustomerOrder = (customerId: number) => {
      if (!orderedCustomers.has(customerId)) {
        orderedCustomers.add(customerId);
        sourceOrder.push(customerId);
      }
    };

    const addCoveredRow = (customer: any, system: any, selectedId: number) => {
      const customerId = Number(customer?.id);
      const systemId = Number(system?.id);
      if (!Number.isFinite(customerId) || !Number.isFinite(systemId)) {
        return;
      }

      const rowKey = `${customerId}:${systemId}`;
      if (rowKeys.has(rowKey)) {
        selectedIdsWithValidCoverage.add(selectedId);
        return;
      }

      rowKeys.add(rowKey);
      selectedIdsWithValidCoverage.add(selectedId);
      addCustomerOrder(customerId);
      coveredCustomers.add(customerId);
      systemSideRequirements.add(systemId);
      rows.push({
        sourceId: customerId,
        sourceTitle: this.readWorkItemTitle(customer),
        sourceUrl: customer?._links?.html?.href,
        coveringId: systemId,
        coveringTitle: this.readWorkItemTitle(system),
        coveringUrl: system?._links?.html?.href,
        uncovered: false,
      });
    };

    for (const record of relationRecords) {
      const linkedTarget = hydratedTargetsById.get(record.targetId);
      if (!linkedTarget || !this.isRequirementWorkItem(linkedTarget)) {
        if (record.orientation === 'customer-to-system') {
          selectedIdsWithInvalidCustomerCoverage.add(record.selectedId);
        }
        continue;
      }

      if (record.orientation === 'customer-to-system') {
        addCoveredRow(record.selected, linkedTarget, record.selectedId);
      } else {
        addCoveredRow(linkedTarget, record.selected, record.selectedId);
      }
    }

    for (const selected of selectedRequirements) {
      const selectedId = Number(selected?.id);
      if (!Number.isFinite(selectedId)) {
        continue;
      }
      if (
        selectedIdsWithValidCoverage.has(selectedId) ||
        coveredCustomers.has(selectedId) ||
        systemSideRequirements.has(selectedId) ||
        !selectedIdsWithInvalidCustomerCoverage.has(selectedId)
      ) {
        continue;
      }

      const rowKey = `${selectedId}:`;
      if (rowKeys.has(rowKey)) {
        continue;
      }

      rowKeys.add(rowKey);
      addCustomerOrder(selectedId);
      rows.push({
        sourceId: selectedId,
        sourceTitle: this.readWorkItemTitle(selected),
        sourceUrl: selected?._links?.html?.href,
        uncovered: true,
      });
    }

    const total = sourceOrder.length;
    const covered = sourceOrder.filter((sourceId) => coveredCustomers.has(sourceId)).length;
    const uncovered = total - covered;

    return {
      rows,
      sourceOrder,
      stats: {
        total,
        covered,
        uncovered,
      },
    };
  }

  private async buildCustomerCoverageTable(customerRequirementsQuery: any): Promise<any> {
    if (!customerRequirementsQuery?.wiql?.href) {
      throw new Error('Customer-side query is missing WIQL href.');
    }

    const ticketsDP = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
    const queryResult = await ticketsDP.GetQueryResultsFromWiql(
      customerRequirementsQuery.wiql.href,
      false,
      null,
    );

    const customerWIs = this.extractRequirementCandidates(queryResult).filter((wi) =>
      this.isRequirementWorkItem(wi),
    );
    logger.info(`Found ${customerWIs.length} customer requirements from query.`);

    const customerIds = customerWIs
      .map((workItem) => Number(workItem?.id))
      .filter((id) => Number.isFinite(id));
    const hydratedCustomerResults =
      customerIds.length > 0 ? await ticketsDP.PopulateWorkItemsByIds(customerIds, this.teamProject) : [];
    const hydratedCustomerById = new Map<number, any>();
    for (const customer of Array.isArray(hydratedCustomerResults) ? hydratedCustomerResults : []) {
      const customerId = Number(customer?.id);
      if (Number.isFinite(customerId)) {
        hydratedCustomerById.set(customerId, customer);
      }
    }
    const hydratedCustomers = customerIds
      .map((customerId) => hydratedCustomerById.get(customerId))
      .filter(Boolean);

    const { rows, sourceOrder, stats } = await this.buildOrientedCustomerCoverageRows(
      hydratedCustomers,
      ticketsDP,
      hydratedCustomerById,
    );
    if (stats.total > 0) {
      const pct = (value: number) => Math.round((value * 100) / stats.total);
      logger.info(
        `Customer requirements traceability coverage: total=${stats.total}, covered=${stats.covered} (${pct(
          stats.covered,
        )}%), uncovered=${stats.uncovered} (${pct(stats.uncovered)}%)`,
      );
    }

    return {
      rows,
      sourceOrder,
      stats,
    };
  }

  private extractRequirementCandidates(queryResult: any): any[] {
    const candidates: any[] = [];

    if (Array.isArray(queryResult)) {
      candidates.push(...queryResult);
    } else if (queryResult?.allItems || Array.isArray(queryResult?.roots)) {
      if (queryResult?.allItems && typeof queryResult.allItems === 'object') {
        candidates.push(...Object.values(queryResult.allItems));
      }
      if (Array.isArray(queryResult?.roots)) {
        const traverse = (nodes: any[]) => {
          for (const node of nodes) {
            candidates.push(node);
            if (Array.isArray(node?.children)) {
              traverse(node.children);
            }
          }
        };
        traverse(queryResult.roots);
      }
    } else {
      throw new Error('Customer-side query returned an unsupported result shape.');
    }

    const deduped: any[] = [];
    const seenIds = new Set<number>();
    for (const candidate of candidates) {
      const candidateId = Number(candidate?.id);
      if (!Number.isFinite(candidateId) || seenIds.has(candidateId)) {
        continue;
      }
      seenIds.add(candidateId);
      deduped.push(candidate);
    }
    return deduped;
  }

  private readWorkItemTitle(workItem: any): string {
    return String(workItem?.fields?.['System.Title'] || workItem?.title || '').trim();
  }

  private isRequirementWorkItem(workItem: any): boolean {
    const workItemType = String(workItem?.fields?.['System.WorkItemType'] || workItem?.workItemType || '')
      .trim()
      .toLowerCase();
    if (!workItemType) return false;
    return REQUIREMENT_WORK_ITEM_TYPES.includes(workItemType);
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

    const vcrmData = rows.map((row) => {
      const rowType = this.resolveSysRsHierarchyRowType(row);
      const isRequirementRow = rowType === 'requirement';
      const rowShading = this.resolveSysRsVcrmShading(rowType);

      const makeField = (name: string, value: any, url?: string) => ({
        name,
        value,
        url,
        shading: rowShading,
      });

      return {
        fields: [
          makeField('ID', row.id, row.htmlUrl || undefined),
          makeField('Section', row.section),
          makeField('Title', isRequirementRow ? row.title : `<b>${this.escapeHtml(row.title)}</b>`),
          makeField(
            'Verification Method',
            isRequirementRow
              ? this.readVerificationMethod(row.fields)
              : RequirementsDataFactory.SYSRS_VCRM_NA,
          ),
          makeField(
            'Site',
            isRequirementRow ? this.readSite(row.fields) : RequirementsDataFactory.SYSRS_VCRM_NA,
          ),
          makeField(
            'Test Phase',
            isRequirementRow ? this.readTestPhase(row.fields) : RequirementsDataFactory.SYSRS_VCRM_NA,
          ),
        ],
      };
    });

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
          hierarchyLevel: nextPath.length,
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

  private resolveSysRsHierarchyRowType(row: any): 'epic' | 'feature' | 'requirement' {
    if (this.isRequirementLike(row)) {
      return 'requirement';
    }

    const workItemType = String(row?.workItemType || '').toLowerCase();
    if (workItemType.includes('epic') || Number(row?.hierarchyLevel || 0) <= 1) {
      return 'epic';
    }

    return 'feature';
  }

  private resolveSysRsVcrmShading(rowType: 'epic' | 'feature' | 'requirement') {
    if (rowType === 'epic') {
      return {
        color: 'auto',
        fill: RequirementsDataFactory.SYSRS_VCRM_EPIC_FILL,
      };
    }
    if (rowType === 'feature') {
      return {
        color: 'auto',
        fill: RequirementsDataFactory.SYSRS_VCRM_FEATURE_FILL,
      };
    }
    return undefined;
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

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
