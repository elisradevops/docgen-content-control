import logger from '../services/logger';
import { writeFileSync } from 'fs';

export default class TestResultGroupSummaryDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[], includeHardCopyRun: boolean): any[] {
    try {
      let adoptedResultData = resultDataRaw.sort((a, b) => {
        if (a.testGroupName === 'Total') return 1; // Move "Total" to the end
        if (b.testGroupName === 'Total') return -1; // Move "Total" to the end
        return a.testGroupName.localeCompare(b.testGroupName); // Sort alphabetically
      });

      return adoptedResultData.map((item, idx) => {
        return {
          fields: [
            { name: '#', value: item.testGroupName !== 'Total' ? `${idx + 1}` : '', width: '3.8%' },
            { name: 'Test Group', value: `${item.testGroupName}` },
            { name: 'Passed', value: `${!includeHardCopyRun ? item.passed : ''}`, width: '7.6%' },
            { name: 'Failed', value: `${!includeHardCopyRun ? item.failed : ''}`, width: '7.6%' },
            { name: 'Blocked', value: `${!includeHardCopyRun ? item.blocked : ''}`, width: '7.6%' },
            { name: 'N/A', value: `${!includeHardCopyRun ? item.notApplicable : ''}`, width: '7.6%' },
            { name: 'Not Run', value: `${!includeHardCopyRun ? item.notRun : ''}`, width: '7.6%' },
            { name: 'Total', value: `${!includeHardCopyRun ? item.total : ''}`, width: '7.6%' },
            {
              name: '% of Success',
              value: `${!includeHardCopyRun ? item.successPercentage : ''}`,
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
