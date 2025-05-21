import logger from '../services/logger';

export default class TraceByLinkedPCRAdapter {
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
      const pcrColors = ['DBE5F1', 'FFFFFF'];
      const testColors = ['DBE5F1', 'FFFFFF'];
      const baseShading = { color: 'auto' };
      let groupIdx = 0;

      for (const [source, targets] of this.rawMapping) {
        const currentPcrColor = pcrColors[groupIdx % pcrColors.length];
        const currentTestColor = testColors[groupIdx % testColors.length];
        groupIdx++;

        switch (this.queryMode.toLowerCase()) {
          case 'open-pcr-to-test':
            this.processPcrTest(source, targets, currentPcrColor, currentTestColor, baseShading);
            break;

          case 'test-to-open-pcr':
            this.processTestReq(source, targets, currentPcrColor, currentTestColor, baseShading);
            break;

          default:
            throw new Error('Query mode not defined');
        }
      }
    } catch (error) {
      logger.error(`Could not adapt query results skin: ${error.message}`);
    }
  }

  private processPcrTest(
    source: string,
    targets: string[],
    currentPcrColor: string,
    currentTestColor: string,
    baseShading: any
  ) {
    const pcrSource = JSON.parse(source);

    targets?.forEach((target) => {
      const tcTarget = JSON.parse(target);
      const fields = this.buildFields({
        items: [
          {
            name: 'PCR ID',
            value: pcrSource.pcrId || '',
            width: '6.8%',
            color: currentPcrColor,
            url: pcrSource.pcrUrl,
          },
          { name: 'WI Type', value: pcrSource.workItemType, width: '11.9%', color: currentPcrColor },
          { name: 'Severity', value: pcrSource.severity, width: '10.4%', color: currentPcrColor },
          { name: 'Title', value: pcrSource.title, color: currentPcrColor },
          {
            name: 'Test Case ID',
            value: tcTarget.id,
            width: '6.8%',
            color: currentTestColor,
            url: tcTarget.testCaseUrl,
          },
          { name: 'Title', value: tcTarget.title, color: currentTestColor },
          // { name: 'Run Status', value: tcTarget.runStatus, color: currentTestColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    });
  }

  private processTestReq(
    source: string,
    targets: string[],
    currentPcrColor: string,
    currentTestColor: string,
    baseShading: any
  ) {
    const tcSource = JSON.parse(source);

    targets?.forEach((target) => {
      const pcrTarget = JSON.parse(target);
      const fields = this.buildFields({
        items: [
          {
            name: 'Test Case ID',
            value: tcSource.id,
            width: '6.8%',
            color: currentTestColor,
            url: tcSource.testCaseUrl,
          },
          { name: 'Title', value: tcSource.title, color: currentTestColor },
          {
            name: 'PCR ID',
            value: pcrTarget.pcrId || '',
            width: '6.8%',
            color: currentPcrColor,
            url: pcrTarget.pcrUrl,
          },
          { name: 'WI Type', value: pcrTarget.workItemType, width: '11.9%', color: currentPcrColor },
          { name: 'Severity', value: pcrTarget.severity, width: '10.4%', color: currentPcrColor },
          { name: 'Title', value: pcrTarget.title, color: currentPcrColor },
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
