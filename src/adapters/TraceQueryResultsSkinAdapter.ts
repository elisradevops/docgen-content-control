import logger from '../services/logger';
import { COLOR_REQ_SYS, COLOR_TEST_SOFT, normalizeFieldName } from '../utils/tablePresentation';

const TRACE_ID_COLUMN_WIDTH = '8.5%';

export default class TraceQueryResultsSkinAdapter {
  rawQueryMapping: any;
  queryMode: string;
  includeCustomerId: boolean;
  sortingSourceColumnsMap: Map<string, string>;
  sortingTargetsColumnsMap: Map<string, string>;
  private includeCommonColumnsMode: string;
  private adoptedData: any[] = [];

  constructor(
    rawResults,
    queryMode = 'none',
    includeCustomerId = false,
    includeCommonColumns: string = 'both'
  ) {
    const { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap } = rawResults;
    this.rawQueryMapping = sourceTargetsMap;
    this.sortingSourceColumnsMap = sortingSourceColumnsMap;
    this.sortingTargetsColumnsMap = sortingTargetsColumnsMap;
    this.queryMode = queryMode;
    this.includeCustomerId = includeCustomerId;
    this.includeCommonColumnsMode = includeCommonColumns;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
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
    // Process 'Title' field first if it exists
    const titleReferenceName = Array.from(mapToUse.entries()).find(
      ([_, fieldName]) => fieldName === 'Title'
    )?.[0];

    if (item && titleReferenceName && item.fields[titleReferenceName] !== undefined) {
      adaptedFields.push({
        name: `${type} Title`,
        value: item.fields[titleReferenceName],
        color: color,
      });
    }

    // Process other fields
    for (const [referenceName, fieldName] of mapToUse.entries()) {
      const displayName = normalizeFieldName(fieldName);
      // Skip 'Title' and 'Work Item Type'; never include ID as a regular column
      if (displayName === 'Title' || displayName === 'Work Item Type' || displayName === 'ID') {
        continue;
      }
      // Skip common columns if only one instance is allowed
      if (
        excludeCommonColumnInstance &&
        (fieldName === 'Test Phase' ||
          fieldName === 'Verification Method' ||
          fieldName === 'System Discipline')
      ) {
        continue;
      }

      switch (displayName) {
        case 'Priority': {
          adaptedFields.push({
            name: displayName,
            value: item?.fields[referenceName] || '',
            width: '6.5%',
            color: color,
          });
          break;
        }
        case 'Assigned To':
          adaptedFields.push({
            name: displayName,
            value: item?.fields[referenceName]?.displayName || '',
            color: color,
          });
          break;
        case 'Customer ID':
          adaptedFields.push({
            name: displayName,
            value: item?.fields[referenceName] || '',
            color: color,
            width: '9.7%',
          });

          break;
        case 'Area Path':
          adaptedFields.push({
            name: 'Node Name',
            value: this.convertAreaPathToNodeName(item?.fields[referenceName] || ''),
            color: color,
            width: '18%',
          });
          break;
        default:
          adaptedFields.push({
            name: displayName,
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
      false,
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
          { name: 'Req ID', value: source.id, width: TRACE_ID_COLUMN_WIDTH, color: currentReqColor },
          ...adaptedSourceFields,
          { name: 'Test Case ID', value: '', width: TRACE_ID_COLUMN_WIDTH, color: currentTestColor },
          { name: 'Test Case Title', value: '', color: currentTestColor },
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
            { name: 'Req ID', value: source.id, width: TRACE_ID_COLUMN_WIDTH, color: currentReqColor },
            ...adaptedSourceFields,
            { name: 'Test Case ID', value: target.id, width: TRACE_ID_COLUMN_WIDTH, color: currentTestColor },
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
          { name: 'Test Case ID', value: source.id, width: TRACE_ID_COLUMN_WIDTH, color: currentTestColor },
          ...adaptedSourceFields,
          { name: 'Req ID', value: '', width: TRACE_ID_COLUMN_WIDTH, color: currentReqColor },
          { name: 'Req Title', value: '', color: currentReqColor },
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
            { name: 'Test Case ID', value: source.id, width: TRACE_ID_COLUMN_WIDTH, color: currentTestColor },
            ...adaptedSourceFields,
            { name: 'Req ID', value: target.id, width: TRACE_ID_COLUMN_WIDTH, color: currentReqColor },
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

  getAdoptedData() {
    return this.adoptedData;
  }
}
