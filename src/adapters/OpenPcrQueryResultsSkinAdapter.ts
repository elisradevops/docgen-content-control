import logger from '../services/logger';

export default class OpenPcrQueryResultsSkinAdapter {
  rawQueryMapping: any;
  queryMode: string;
  sortingSourceColumnsMap: Map<string, string>;
  sortingTargetsColumnsMap: Map<string, string>;
  private includeCommonColumnsMode: string;
  private adoptedData: any[] = [];

  constructor(rawResults, queryMode = 'none', includeCommonColumns: string = 'both') {
    const { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap } = rawResults;
    this.rawQueryMapping = sourceTargetsMap;
    this.sortingSourceColumnsMap = sortingSourceColumnsMap;
    this.sortingTargetsColumnsMap = sortingTargetsColumnsMap;
    this.queryMode = queryMode;
    this.includeCommonColumnsMode = includeCommonColumns;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      const reqColors = ['DBE5F1', 'FFFFFF'];
      const testColors = ['DBE5F1', 'FFFFFF'];
      const baseShading = { color: 'auto' };
      let groupIdx = 0;

      for (const [source, targets] of this.rawQueryMapping) {
        const currentOpenPcrColor = reqColors[groupIdx % reqColors.length];
        const currentTestColor = testColors[groupIdx % testColors.length];
        groupIdx++;

        switch (this.queryMode.toLowerCase()) {
          case 'open-pcr-to-test':
            this.processOpenPcrTest(source, targets, currentOpenPcrColor, currentTestColor, baseShading);
            break;

          case 'test-to-open-pcr':
            this.processTestOpenPcr(source, targets, currentOpenPcrColor, currentTestColor, baseShading);
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
    const sourceMap = this.sortingSourceColumnsMap;
    const targetMap = this.sortingTargetsColumnsMap;
    const mapToUse: Map<string, string> = !isSource ? targetMap : sourceMap;

    // Find common fields between source and target maps
    let commonFields: Set<string> = new Set();
    if (excludeCommonColumnInstance) {
      // Get all field names from both maps
      const sourceFieldNames = new Set(Array.from(sourceMap.values()));
      const targetFieldNames = new Set(Array.from(targetMap.values()));

      // Find intersection of field names (common fields)
      for (const fieldName of sourceFieldNames) {
        if (targetFieldNames.has(fieldName)) {
          commonFields.add(fieldName);
        }
      }
    }

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
      // Skip 'Title' and 'Work Item Type' as per original logic
      if (
        fieldName === 'Title' ||
        (type === 'Test Case' && fieldName === 'Work Item Type') ||
        fieldName === 'ID'
      ) {
        continue;
      }

      // Skip common fields if excludeCommonColumnInstance is true
      if (excludeCommonColumnInstance && commonFields.has(fieldName)) {
        continue;
      }

      switch (fieldName) {
        case 'Priority': {
          adaptedFields.push({
            name: fieldName,
            value: item?.fields[referenceName] || '',
            width: '6.5%',
            color: color,
          });
          break;
        }
        case 'Assigned To':
          adaptedFields.push({
            name: fieldName,
            value: item?.fields[referenceName]?.displayName || '',
            color: color,
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
            name: fieldName,
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
  private processOpenPcrTest(
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
      'PCR',
      this.includeCommonColumnsMode === 'testOnly'
    );
    if (targets.length === 0) {
      const adaptedTargetFields: any[] = this.adaptFields(
        null,
        currentTestColor,
        false,
        'Test Case',
        this.includeCommonColumnsMode === 'openPcrOnly'
      );

      const fields = this.buildFields({
        items: [
          {
            name: 'PCR ID',
            value: source.id,
            width: '6.8%',
            color: currentReqColor,
            url: source._links?.html?.href || undefined,
          },
          ...adaptedSourceFields,
          { name: 'Test Case ID', value: '', width: '6.8%', color: currentTestColor },
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
          this.includeCommonColumnsMode === 'openPcrOnly'
        );
        const fields = this.buildFields({
          items: [
            {
              name: 'PCR ID',
              value: source.id,
              width: '6.8%',
              color: currentReqColor,
              url: source._links?.html?.href || undefined,
            },
            ...adaptedSourceFields,
            {
              name: 'Test Case ID',
              value: target.id,
              width: '6.8%',
              color: currentTestColor,
              url: target._links?.html?.href || undefined,
            },
            ...adaptedTargetFields,
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private processTestOpenPcr(
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
      this.includeCommonColumnsMode === 'openPcrOnly'
    );
    if (targets.length === 0) {
      const adaptedTargetFields: any[] = this.adaptFields(
        null,
        currentReqColor,
        false,
        'PCR',
        this.includeCommonColumnsMode === 'testOnly'
      );
      const fields = this.buildFields({
        items: [
          {
            name: 'Test Case ID',
            value: source.id,
            width: '6.8%',
            color: currentTestColor,
            url: source._links?.html?.href || undefined,
          },
          ...adaptedSourceFields,
          { name: 'PCR ID', value: '', width: '6.8%', color: currentReqColor },
          { name: 'PCR Title', value: '', color: currentReqColor },
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
          'PCR',
          this.includeCommonColumnsMode === 'testOnly'
        );
        const fields = this.buildFields({
          items: [
            {
              name: 'Test Case ID',
              value: source.id,
              width: '6.8%',
              color: currentTestColor,
              url: source._links?.html?.href || undefined,
            },
            ...adaptedSourceFields,
            {
              name: 'PCR ID',
              value: target.id,
              width: '6.8%',
              color: currentReqColor,
              url: target._links?.html?.href || undefined,
            },
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
