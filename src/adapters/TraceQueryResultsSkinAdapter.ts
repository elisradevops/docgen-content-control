import logger from '../services/logger';
import {
  COLOR_REQ_SYS,
  COLOR_TEST_SOFT,
  normalizeFieldName,
  calculateAdaptiveIdColumnWidth,
} from '../utils/tablePresentation';

// Columns that are always rendered — visibility toggle has no effect on them.
const ALWAYS_VISIBLE_REFS = new Set(['System.Id', 'System.Title']);

export default class TraceQueryResultsSkinAdapter {
  rawQueryMapping: any;
  queryMode: string;
  includeCustomerId: boolean;
  sortingSourceColumnsMap: Map<string, string>;
  sortingTargetsColumnsMap: Map<string, string>;
  private includeCommonColumnsMode: string;
  private traceIdColumnWidth = '8.5%';
  private adoptedData: any[] = [];
  private fieldDisplayMapping: Record<string, Record<string, Record<string, string>>>;
  private fieldVisibility: Record<string, Record<string, Record<string, boolean>>>;
  private fieldOrder: Record<string, Record<string, string[]>>;

  constructor(
    rawResults,
    queryMode = 'none',
    includeCustomerId = false,
    includeCommonColumns: string = 'both',
    fieldDisplayMapping: Record<string, Record<string, Record<string, string>>> = {},
    fieldVisibility: Record<string, Record<string, Record<string, boolean>>> = {},
    fieldOrder: Record<string, Record<string, string[]>> = {}
  ) {
    const { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap } = rawResults;
    this.rawQueryMapping = sourceTargetsMap;
    this.sortingSourceColumnsMap = sortingSourceColumnsMap;
    this.sortingTargetsColumnsMap = sortingTargetsColumnsMap;
    this.queryMode = queryMode;
    this.includeCustomerId = includeCustomerId;
    this.includeCommonColumnsMode = includeCommonColumns;
    this.fieldDisplayMapping = fieldDisplayMapping || {};
    this.fieldVisibility = fieldVisibility || {};
    this.fieldOrder = fieldOrder || {};
  }

  private resolveDisplayName(defaultName: string, referenceName: string, type: string): string {
    const typeKey = type === 'Req' ? 'Requirement' : type;
    const override = this.fieldDisplayMapping[this.queryMode]?.[typeKey]?.[referenceName];
    return typeof override === 'string' && override.trim() ? override.trim() : defaultName;
  }

  private isHidden(referenceName: string, type: string): boolean {
    if (ALWAYS_VISIBLE_REFS.has(referenceName)) return false;
    const typeKey = type === 'Req' ? 'Requirement' : type;
    return this.fieldVisibility[this.queryMode]?.[typeKey]?.[referenceName] === false;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      this.traceIdColumnWidth = this.resolveTraceIdColumnWidth();
      const reqColors = [COLOR_REQ_SYS, 'FFFFFF'];
      const testColors = [COLOR_TEST_SOFT, 'FFFFFF'];
      const baseShading = { color: 'auto' };
      let groupIdx = 0;

      for (const [source, targets] of this.rawQueryMapping) {
        const currentReqColor = reqColors[groupIdx % reqColors.length];
        const currentTestColor = testColors[groupIdx % testColors.length];
        groupIdx++;

        switch (this.queryMode.toLowerCase()) {
          case 'req-test':
            this.processReqTest(source, targets, currentReqColor, currentTestColor, baseShading);
            break;

          case 'test-req':
            this.processTestReq(source, targets, currentReqColor, currentTestColor, baseShading);
            break;

          default:
            throw new Error('Query mode not defined');
        }
      }
    } catch (error) {
      logger.error(`Could not adapt query results skin: ${error.message}`);
    }
  }

  // Helper Methods

  private adaptFields(
    item: any,
    color: string,
    isSource: boolean,
    type: string,
    excludeCommonColumnInstance: boolean = false
  ) {
    const adaptedFields: any[] = [];
    const mapToUse: Map<string, string> = !isSource
      ? this.sortingTargetsColumnsMap
      : this.sortingSourceColumnsMap;

    // Detect Title by stable referenceName (value may be 'Title' or 'System.Title' depending on
    // whether System.Title was an explicitly selected query column or only force-included).
    const TITLE_REF = 'System.Title';
    const titleReferenceName = mapToUse.has(TITLE_REF) ? TITLE_REF : undefined;

    if (item && titleReferenceName && item.fields[titleReferenceName] !== undefined) {
      adaptedFields.push({
        name: this.resolveDisplayName(`${type} Title`, titleReferenceName, type),
        value: item.fields[titleReferenceName],
        color: color,
      });
    }

    // Process other fields — sorted by user-defined column order when present
    const typeKey = type === 'Req' ? 'Requirement' : type;
    const orderList = this.fieldOrder?.[this.queryMode]?.[typeKey] || [];
    const allEntries = [...mapToUse.entries()].filter(([ref, fn]) => {
      const dn = normalizeFieldName(fn);
      return ref !== TITLE_REF && dn !== 'Work Item Type' && dn !== 'ID';
    });
    if (orderList.length > 0) {
      allEntries.sort(([refA], [refB]) => {
        const ia = orderList.indexOf(refA);
        const ib = orderList.indexOf(refB);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }

    for (const [referenceName, fieldName] of allEntries) {
      const displayName = normalizeFieldName(fieldName);
      // Skip common columns if only one instance is allowed
      if (
        excludeCommonColumnInstance &&
        (fieldName === 'Test Phase' ||
          fieldName === 'Verification Method' ||
          fieldName === 'System Discipline')
      ) {
        continue;
      }
      // Skip user-hidden columns
      if (this.isHidden(referenceName, type)) {
        continue;
      }

      // Compute the final header: use user override if set, else the default display name
      const resolvedName = (defaultName: string) => this.resolveDisplayName(defaultName, referenceName, type);

      switch (displayName) {
        case 'Priority': {
          adaptedFields.push({
            name: resolvedName(displayName),
            value: item?.fields[referenceName] || '',
            width: '6.5%',
            color: color,
          });
          break;
        }
        case 'Assigned To':
          adaptedFields.push({
            name: resolvedName(displayName),
            value: item?.fields[referenceName]?.displayName || '',
            color: color,
          });
          break;
        case 'Customer ID':
          adaptedFields.push({
            name: resolvedName(displayName),
            value: item?.fields[referenceName] || '',
            color: color,
            width: '9.7%',
          });

          break;
        case 'Area Path':
          adaptedFields.push({
            name: resolvedName('Node Name'),
            value: this.convertAreaPathToNodeName(item?.fields[referenceName] || ''),
            color: color,
            width: '18%',
          });
          break;
        default:
          adaptedFields.push({
            name: resolvedName(displayName),
            value:
              typeof item?.fields[referenceName] === 'object'
                ? item?.fields[referenceName]?.displayName || ''
                : item?.fields[referenceName] || '',
            color: color,
          });
          break;
      }
    }

    return adaptedFields;
  }

  private processReqTest(
    source: any,
    targets: any[],
    currentReqColor: string,
    currentTestColor: string,
    baseShading: any
  ) {
    // Determine if common columns should be excluded

    const adaptedSourceFields: any[] = this.adaptFields(
      source,
      currentReqColor,
      true,
      'Req',
      this.includeCommonColumnsMode === 'testOnly'
    );
    if (targets.length === 0) {
      const adaptedTargetFields: any[] = this.adaptFields(
        null,
        currentTestColor,
        false,
        'Test Case',
        this.includeCommonColumnsMode === 'reqOnly'
      );

      const fields = this.buildFields({
        items: [
          { name: 'Req ID', value: source.id, width: this.traceIdColumnWidth, color: currentReqColor },
          ...adaptedSourceFields,
          { name: 'Test Case ID', value: '', width: this.traceIdColumnWidth, color: currentTestColor, sectionRefId: undefined, url: undefined },
          { name: this.resolveDisplayName('Test Case Title', 'System.Title', 'Test Case'), value: '', color: currentTestColor },
          ...adaptedTargetFields,
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const adaptedTargetFields: any[] = this.adaptFields(
          target,
          currentTestColor,
          false,
          'Test Case',
          this.includeCommonColumnsMode === 'reqOnly'
        );
        const fields = this.buildFields({
          items: [
            { name: 'Req ID', value: source.id, width: this.traceIdColumnWidth, color: currentReqColor },
            ...adaptedSourceFields,
            { name: 'Test Case ID', value: target.id, width: this.traceIdColumnWidth, color: currentTestColor, sectionRefId: String(target.id) },
            ...adaptedTargetFields,
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private processTestReq(
    source: any,
    targets: any[],
    currentReqColor: string,
    currentTestColor: string,
    baseShading: any
  ) {
    const adaptedSourceFields: any[] = this.adaptFields(
      source,
      currentTestColor,
      true,
      'Test Case',
      this.includeCommonColumnsMode === 'reqOnly'
    );
    if (targets.length === 0) {
      const adaptedTargetFields: any[] = this.adaptFields(
        null,
        currentReqColor,
        false,
        'Req',
        this.includeCommonColumnsMode === 'testOnly'
      );
      const fields = this.buildFields({
        items: [
          { name: 'Test Case ID', value: source.id, width: this.traceIdColumnWidth, color: currentTestColor, sectionRefId: String(source.id) },
          ...adaptedSourceFields,
          { name: 'Req ID', value: '', width: this.traceIdColumnWidth, color: currentReqColor },
          { name: this.resolveDisplayName('Req Title', 'System.Title', 'Req'), value: '', color: currentReqColor },
          ...adaptedTargetFields,
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const adaptedTargetFields: any[] = this.adaptFields(
          target,
          currentReqColor,
          false,
          'Req',
          this.includeCommonColumnsMode === 'testOnly'
        );
        const fields = this.buildFields({
          items: [
            { name: 'Test Case ID', value: source.id, width: this.traceIdColumnWidth, color: currentTestColor, sectionRefId: String(source.id) },
            ...adaptedSourceFields,
            { name: 'Req ID', value: target.id, width: this.traceIdColumnWidth, color: currentReqColor },
            ...adaptedTargetFields,
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private buildFields({ items, baseShading }: { items: any[]; baseShading: any }) {
    return items.filter(Boolean).map((item) => ({
      ...item,
      shading: { ...baseShading, fill: item.color },
    }));
  }

  private convertAreaPathToNodeName(areaPath = '') {
    return areaPath?.includes('\\') ? areaPath.split('\\').pop() : areaPath;
  }

  private resolveTraceIdColumnWidth(): string {
    const ids: Array<string | number | null | undefined> = [];

    for (const [source, targets] of this.rawQueryMapping || []) {
      ids.push(source?.id);
      (targets || []).forEach((target: any) => ids.push(target?.id));
    }

    return calculateAdaptiveIdColumnWidth(ids);
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
