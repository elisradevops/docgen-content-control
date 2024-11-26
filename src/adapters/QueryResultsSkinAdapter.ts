import logger from '../services/logger';

export default class QueryResultsSkinAdapter {
  rawQueryMapping: any;
  queryMode: string;
  includeCustomerId: boolean;
  sortingSourceColumnsMap: Map<string, string>;
  sortingTargetsColumnsMap: Map<string, string>;
  private adoptedData: any[] = [];

  constructor(rawResults, queryMode = 'none', includeCustomerId = false) {
    const { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap } = rawResults;
    this.rawQueryMapping = sourceTargetsMap;
    this.sortingSourceColumnsMap = sortingSourceColumnsMap;
    this.sortingTargetsColumnsMap = sortingTargetsColumnsMap;
    this.queryMode = queryMode;
    this.includeCustomerId = includeCustomerId;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      const reqColors = ['DBE5F1', 'FFFFFF'];
      const testColors = ['DBE5F1', 'FFFFFF'];
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

  private checkIfCustomerIdExists(): boolean {
    for (const [source, targets] of this.rawQueryMapping) {
      if (this.itemHasCustomerId(source)) {
        return true;
      }
      for (const target of targets) {
        if (this.itemHasCustomerId(target)) {
          return true;
        }
      }
    }
    return false;
  }

  private itemHasCustomerId(item: any): boolean {
    return (
      item?.fields['Custom.CustomerID'] ||
      item?.fields['Custom.CustomerRequirementId'] ||
      item?.fields['Elisra.CustomerRequirementId']
    );
  }

  private adaptFields(item: any, color: string, isSource: boolean) {
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
        name: 'Title',
        value: item.fields[titleReferenceName],
        color: color,
      });
    }

    // Process other fields
    for (const [referenceName, fieldName] of mapToUse.entries()) {
      // Skip 'Title' and 'Work Item Type' as per original logic
      if (fieldName === 'Title' || fieldName === 'Work Item Type' || fieldName === 'ID') {
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
        case 'Customer ID':
          adaptedFields.push({
            name: fieldName,
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
            name: fieldName,
            value: item?.fields[referenceName] || '',
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
    const adaptedSourceFields: any[] = this.adaptFields(source, currentReqColor, true);
    if (targets.length === 0) {
      const adaptedTargetFields: any[] = this.adaptFields(null, currentTestColor, false);
      const fields = this.buildFields({
        items: [
          { name: 'Req ID', value: source.id, width: '6.8%', color: currentReqColor },
          ...adaptedSourceFields,
          { name: 'Test Case ID', value: '', width: '6.8%', color: currentTestColor },
          { name: 'Title', value: '', color: currentTestColor },
          ...adaptedTargetFields,
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const adaptedTargetFields: any[] = this.adaptFields(target, currentTestColor, false);
        const fields = this.buildFields({
          items: [
            { name: 'Req ID', value: source.id, width: '6.8%', color: currentReqColor },
            ...adaptedSourceFields,
            { name: 'Test Case ID', value: target.id, width: '6.8%', color: currentTestColor },
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
    const adaptedSourceFields: any[] = this.adaptFields(source, currentTestColor, true);
    if (targets.length === 0) {
      const adaptedTargetFields: any[] = this.adaptFields(null, currentReqColor, false);
      const fields = this.buildFields({
        items: [
          { name: 'Test Case ID', value: source.id, width: '6.8%', color: currentTestColor },
          // { name: 'TC Title', value: source?.fields['System.Title'], color: currentTestColor },
          ...adaptedSourceFields,
          { name: 'Req ID', value: '', width: '6.8%', color: currentReqColor },
          { name: 'Title', value: '', color: currentReqColor },
          // this.includeCustomerId && { name: 'Customer ID', value: '', color: currentReqColor },
          ...adaptedTargetFields,
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        // const targetCustomerIdField = includeCustomerIdColumn
        //   ? this.getCustomerIdField(target, currentReqColor)
        //   : undefined;
        const adaptedTargetFields: any[] = this.adaptFields(target, currentReqColor, false);
        const fields = this.buildFields({
          items: [
            { name: 'Test Case ID', value: source.id, width: '6.8%', color: currentTestColor },
            ...adaptedSourceFields,
            { name: 'Req ID', value: target.id, width: '6.8%', color: currentReqColor },
            ...adaptedTargetFields,
            // { name: 'Title', value: target?.fields['System.Title'], color: currentReqColor },
            // this.includeCustomerId && targetCustomerIdField,
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  // private getCustomerIdField(item: any, color: string) {
  //   const customerId =
  //     item?.fields['Custom.CustomerID'] ||
  //     item?.fields['Custom.CustomerRequirementId'] ||
  //     item?.fields['Elisra.CustomerRequirementId'];
  //   return {
  //     name: 'Customer ID',
  //     value: customerId ?? '',
  //     width: '9.7%',
  //     color,
  //   };
  // }

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
