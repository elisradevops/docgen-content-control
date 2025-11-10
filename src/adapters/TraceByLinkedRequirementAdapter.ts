import logger from '../services/logger';
import { COLOR_REQ_SYS, COLOR_TEST_SOFT } from '../utils/tablePresentation';

export default class TraceByLinkedRequirementAdapter {
  rawMapping: any;
  queryMode: string;
  includeCustomerId: boolean;
  private adoptedData: any[] = [];

  constructor(rawResults, queryMode = 'none') {
    this.rawMapping = rawResults;
    this.queryMode = queryMode;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      const reqColors = [COLOR_REQ_SYS, 'FFFFFF'];
      const testColors = [COLOR_TEST_SOFT, 'FFFFFF'];
      const baseShading = { color: 'auto' };
      let groupIdx = 0;

      for (const [source, targets] of this.rawMapping) {
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

  private processReqTest(
    source: string,
    targets: string[],
    currentReqColor: string,
    currentTestColor: string,
    baseShading: any
  ) {
    const requirementSource = JSON.parse(source);
    const hasCustomerId = requirementSource.customerId !== undefined;

    targets?.forEach((target) => {
      const tcTarget = JSON.parse(target);
      const fields = this.buildFields({
        items: [
          { name: 'Req ID', value: requirementSource.id, width: '6.8%', color: currentReqColor },
          { name: 'Title', value: requirementSource.title, color: currentReqColor },
          hasCustomerId && {
            name: 'Customer ID',
            value: requirementSource.customerId,
            color: currentReqColor,
          },
          { name: 'Test Case ID', value: tcTarget.id, width: '6.8%', color: currentTestColor },
          { name: 'Title', value: tcTarget.title, color: currentTestColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    });
  }

  private processTestReq(
    source: string,
    targets: string[],
    currentReqColor: string,
    currentTestColor: string,
    baseShading: any
  ) {
    const tcSource = JSON.parse(source);

    const hasCustomerId = targets.find((target) => {
      const targetObj = JSON.parse(target);
      return targetObj.customerId !== undefined;
    });
    targets?.forEach((target) => {
      const reqTarget = JSON.parse(target);
      const fields = this.buildFields({
        items: [
          { name: 'Test Case ID', value: tcSource.id, width: '6.8%', color: currentTestColor },
          { name: 'Title', value: tcSource.title, color: currentTestColor },
          { name: 'Req ID', value: reqTarget.id, width: '6.8%', color: currentReqColor },
          { name: 'Title', value: reqTarget.title, color: currentReqColor },
          hasCustomerId && { name: 'Customer ID', value: reqTarget.customerId, color: currentReqColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    });
  }

  private buildFields({ items, baseShading }: { items: any[]; baseShading: any }) {
    return items.filter(Boolean).map((item) => ({
      ...item,
      shading: { ...baseShading, fill: item.color },
    }));
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
