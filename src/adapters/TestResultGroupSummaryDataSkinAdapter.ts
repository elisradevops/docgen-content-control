import logger from '../services/logger';
import { writeFileSync } from 'fs';

export default class TestResultGroupSummaryDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      let adoptedResultData = resultDataRaw.sort((a, b) => {
        if (a.testGroupName === 'Total') return 1; // Move "Total" to the end
        if (b.testGroupName === 'Total') return -1; // Move "Total" to the end
        return a.testGroupName.localeCompare(b.testGroupName); // Sort alphabetically
      });

      return adoptedResultData.map((item, idx) => {
        return {
          fields: [
            { name: '#', value: item.testGroupName !== 'Total' ? `${idx + 1}` : '' },
            { name: 'Test Group', value: `${item.testGroupName}` },
            { name: 'Passed', value: `${item.passed}` },
            { name: 'Failed', value: `${item.failed}` },
            { name: 'Blocked', value: `${item.blocked}` },
            { name: 'N/A', value: `${item.notApplicable}` },
            { name: 'Not Run', value: `${item.notRun}` },
            { name: 'Total', value: `${item.total}` },
            { name: '% of Success', value: `${item.successPercentage}` },
          ],
        };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter ${error.message}`);
    }
  }
}
