import logger from '../services/logger';

export default class QueryResultsSkinAdapter {
  rawQueryMapping: Map<any, any[]>;
  queryMode: string;
  includeCustomerId: boolean;
  private adoptedData: any[] = [];

  constructor(rawResults, queryMode = 'none', includeCustomerId = false) {
    this.rawQueryMapping = rawResults;
    this.queryMode = queryMode;
    this.includeCustomerId = includeCustomerId;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      const reqColors = ['D1F4FF', 'FFFFFF'];
      const testColors = ['FFE2B3', 'FFFFFF'];
      const baseShading = { color: 'auto' };
      let groupIdx = 0;

      // Determine if we need to include the Customer ID column
      const includeCustomerIdColumn = this.checkIfCustomerIdExists();

      for (const [source, targets] of this.rawQueryMapping) {
        const sourceNodeName = this.convertAreaPathToNodeName(source?.fields['System.AreaPath'] || '');
        const currentReqColor = reqColors[groupIdx % reqColors.length];
        const currentTestColor = testColors[groupIdx % testColors.length];
        groupIdx++;

        switch (this.queryMode.toLowerCase()) {
          case 'req-test':
            this.processReqTest({
              source,
              targets,
              sourceNodeName,
              currentReqColor,
              currentTestColor,
              baseShading,
              includeCustomerIdColumn,
            });
            break;

          case 'test-req':
            this.processTestReq({
              source,
              targets,
              currentReqColor,
              currentTestColor,
              baseShading,
              includeCustomerIdColumn,
            });
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
    return item?.fields['Custom.CustomerID'] || item?.fields['Custom.CustomerRequirementId'];
  }

  private processReqTest(params: {
    source: any;
    targets: any[];
    sourceNodeName: string;
    currentReqColor: string;
    currentTestColor: string;
    baseShading: any;
    includeCustomerIdColumn: boolean;
  }) {
    const {
      source,
      targets,
      sourceNodeName,
      currentReqColor,
      currentTestColor,
      baseShading,
      includeCustomerIdColumn,
    } = params;

    const sourceCustomerIdField = includeCustomerIdColumn
      ? this.getCustomerIdField(source, currentReqColor)
      : undefined;

    if (targets.length === 0) {
      const fields = this.buildFields({
        items: [
          { name: 'Req ID', value: source.id, width: '6.8%', color: currentReqColor },
          this.includeCustomerId && sourceCustomerIdField,
          { name: 'Req Title', value: source?.fields['System.Title'], color: currentReqColor },
          sourceNodeName && {
            name: 'Node Name',
            value: sourceNodeName,
            color: currentReqColor,
            width: '18%',
          },
          { name: 'TC ID', value: '', width: '6.8%', color: currentTestColor },
          { name: 'TC Title', value: '', color: currentTestColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const fields = this.buildFields({
          items: [
            { name: 'Req ID', value: source.id, width: '6.8%', color: currentReqColor },
            this.includeCustomerId && sourceCustomerIdField,
            { name: 'Req Title', value: source?.fields['System.Title'], color: currentReqColor },
            sourceNodeName && {
              name: 'Node Name',
              value: sourceNodeName,
              color: currentReqColor,
              width: '18%',
            },
            { name: 'TC ID', value: target.id, width: '6.8%', color: currentTestColor },
            { name: 'TC Title', value: target?.fields['System.Title'], color: currentTestColor },
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private processTestReq(params: {
    source: any;
    targets: any[];
    currentReqColor: string;
    currentTestColor: string;
    baseShading: any;
    includeCustomerIdColumn: boolean;
  }) {
    const { source, targets, currentReqColor, currentTestColor, baseShading, includeCustomerIdColumn } =
      params;

    if (targets.length === 0) {
      const fields = this.buildFields({
        items: [
          { name: 'TC ID', value: source.id, width: '6.8%', color: currentTestColor },
          { name: 'TC Title', value: source?.fields['System.Title'], color: currentTestColor },
          { name: 'Req ID', value: '', width: '6.8%', color: currentReqColor },
          { name: 'Req Title', value: '', color: currentReqColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const targetCustomerIdField = includeCustomerIdColumn
          ? this.getCustomerIdField(target, currentReqColor)
          : undefined;
        const targetNodeName = this.convertAreaPathToNodeName(target?.fields['System.AreaPath'] || '');

        const fields = this.buildFields({
          items: [
            { name: 'TC ID', value: source.id, width: '6.8%', color: currentTestColor },
            { name: 'TC Title', value: source?.fields['System.Title'], color: currentTestColor },
            { name: 'Req ID', value: target.id, width: '6.8%', color: currentReqColor },
            this.includeCustomerId && targetCustomerIdField,
            { name: 'Req Title', value: target?.fields['System.Title'], color: currentReqColor },
            targetNodeName && {
              name: 'Node Name',
              value: targetNodeName,
              color: currentReqColor,
              width: '18%',
            },
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private getCustomerIdField(item: any, color: string) {
    const customerId = item?.fields['Custom.CustomerID'] || item?.fields['Custom.CustomerRequirementId'];
    return {
      name: 'Customer ID',
      value: customerId ?? '',
      width: '9.7%',
      color,
    };
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
