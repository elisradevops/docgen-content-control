import logger from '../services/logger';

export default class TestResultsSummaryDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[], includeConfigurations: boolean) {
    try {
      return resultDataRaw.map((item, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}`, width: '3%' },
          { name: 'Test Group', value: `${item.testGroupName}` },
          { name: 'Test Id', value: `${item.testId}`, width: '6.4%' },
          { name: 'Test Name', value: `${item.testName}`, width: '' },
          { name: 'Run Status', value: `${item.runStatus}`, width: includeConfigurations ? '9.4%' : '10.8%' },
        ];

        if (includeConfigurations) {
          fields.splice(4, 0, { name: 'Configuration', value: `${item.configuration}`, width: '13%' });
        }

        return { fields };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter: ${error.message}`);
    }
  }
}
