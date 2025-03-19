import logger from '../services/logger';
import { writeFileSync } from 'fs';

export default class TestResultGroupSummaryDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[]): any[] {
    try {
      let adoptedResultData = resultDataRaw.sort((a, b) => {
        if (a.testGroupName === 'Total') return 1; // Move "Total" to the end
        if (b.testGroupName === 'Total') return -1; // Move "Total" to the end
        return a.testGroupName.toLowerCase().localeCompare(b.testGroupName.toLowerCase()); // Sort alphabetically
      });

      return adoptedResultData.map((item, idx) => {
        return {
          fields: [
            { name: '#', value: item.testGroupName !== 'Total' ? `${idx + 1}` : '', width: '3.8%' },
            { name: 'Test Group', value: `${item.testGroupName}` },
            { name: 'Passed', value: `${item.passed}`, width: '7.6%' },
            { name: 'Failed', value: `${item.failed}`, width: '7.6%' },
            { name: 'Blocked', value: `${item.blocked}`, width: '7.6%' },
            { name: 'N/A', value: `${item.notApplicable}`, width: '7.6%' },
            { name: 'Not Run', value: `${item.notRun}`, width: '7.6%' },
            { name: 'Total', value: `${item.total}`, width: '7.6%' },
            {
              name: '% of Success',
              value: `${item.successPercentage}`,
              width: '10.4%',
            },
          ],
        };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter ${error.message}`);
    }
  }
}
