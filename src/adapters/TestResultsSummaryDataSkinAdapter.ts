import logger from '../services/logger';

export default class TestResultsSummaryDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[], includeConfigurations: boolean) {
    try {
      return resultDataRaw.map((item, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}` },
          { name: 'Test Group', value: `${item.testGroupName}` },
          { name: 'Test Id', value: `${item.testId}` },
          { name: 'Test Name', value: `${item.testName}` },
          { name: 'Run Status', value: `${item.runStatus}` },
        ];

        if (includeConfigurations) {
          fields.splice(4, 0, { name: 'Configuration', value: `${item.configuration}` });
        }

        return { fields };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter: ${error.message}`);
    }
  }
}
