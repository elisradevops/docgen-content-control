import logger from '../services/logger';
import {
  COLOR_REQ_SYS,
  COLOR_TEST_SOFT,
  calculateAdaptiveIdColumnWidth,
} from '../utils/tablePresentation';

export default class TraceByLinkedRequirementAdapter {
  rawMapping: any;
  queryMode: string;
  includeCustomerId: boolean;
  private traceIdColumnWidth = '8.5%';
  private adoptedData: any[] = [];
  private fieldDisplayMapping: Record<string, Record<string, string>>;
  private fieldVisibility: Record<string, Record<string, boolean>>;

  constructor(
    rawResults,
    queryMode = 'none',
    fieldDisplayMapping: Record<string, Record<string, string>> = {},
    fieldVisibility: Record<string, Record<string, boolean>> = {}
  ) {
    this.rawMapping = rawResults;
    this.queryMode = queryMode;
    this.fieldDisplayMapping = fieldDisplayMapping || {};
    this.fieldVisibility = fieldVisibility || {};
  }

  private resolveDisplayName(defaultName: string, type: 'Requirement' | 'Test Case'): string {
    // Linked mode has no referenceName — match by default display name as pseudo-key
    const override = this.fieldDisplayMapping[type]?.[defaultName];
    return typeof override === 'string' && override.trim() ? override.trim() : defaultName;
  }

  private isHidden(pseudoKey: string, type: 'Requirement' | 'Test Case'): boolean {
    return this.fieldVisibility[type]?.[pseudoKey] === false;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      this.traceIdColumnWidth = this.resolveTraceIdColumnWidth();
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
    const customerIdHidden = this.isHidden('Customer ID', 'Requirement');

    targets?.forEach((target) => {
      const tcTarget = JSON.parse(target);
      const fields = this.buildFields({
        items: [
          {
            name: 'Req ID',
            value: requirementSource.id,
            width: this.traceIdColumnWidth,
            color: currentReqColor,
          },
          { name: this.resolveDisplayName('Title', 'Requirement'), value: requirementSource.title, color: currentReqColor },
          hasCustomerId && !customerIdHidden && {
            name: this.resolveDisplayName('Customer ID', 'Requirement'),
            value: requirementSource.customerId,
            color: currentReqColor,
          },
          {
            name: 'Test Case ID',
            value: tcTarget.id,
            width: this.traceIdColumnWidth,
            color: currentTestColor,
            sectionRefId: String(tcTarget.id),
          },
          { name: this.resolveDisplayName('Title', 'Test Case'), value: tcTarget.title, color: currentTestColor },
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
    const customerIdHidden = this.isHidden('Customer ID', 'Requirement');
    targets?.forEach((target) => {
      const reqTarget = JSON.parse(target);
      const fields = this.buildFields({
        items: [
          {
            name: 'Test Case ID',
            value: tcSource.id,
            width: this.traceIdColumnWidth,
            color: currentTestColor,
            sectionRefId: String(tcSource.id),
          },
          { name: this.resolveDisplayName('Title', 'Test Case'), value: tcSource.title, color: currentTestColor },
          { name: 'Req ID', value: reqTarget.id, width: this.traceIdColumnWidth, color: currentReqColor },
          { name: this.resolveDisplayName('Title', 'Requirement'), value: reqTarget.title, color: currentReqColor },
          hasCustomerId && !customerIdHidden && { name: this.resolveDisplayName('Customer ID', 'Requirement'), value: reqTarget.customerId, color: currentReqColor },
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

  private resolveTraceIdColumnWidth(): string {
    const ids: Array<string | number | null | undefined> = [];

    for (const [source, targets] of this.rawMapping || []) {
      try {
        const parsedSource = JSON.parse(source);
        ids.push(parsedSource?.id);
      } catch {
        ids.push(undefined);
      }

      (targets || []).forEach((target: string) => {
        try {
          const parsedTarget = JSON.parse(target);
          ids.push(parsedTarget?.id);
        } catch {
          ids.push(undefined);
        }
      });
    }

    return calculateAdaptiveIdColumnWidth(ids);
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
