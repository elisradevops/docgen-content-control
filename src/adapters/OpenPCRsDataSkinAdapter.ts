import logger from '../services/logger';

export default class OpenPCRsDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      return resultDataRaw.map((item, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}`, width: '5.5%' },
          { name: 'Test Id', value: `${item.testId}`, width: '7.6%' },
          { name: 'Test Name', value: `${item.testName}` },
          { name: 'PCR Id', value: `${item.pcrId}`, url: `${item.pcrUrl}`, width: '7.6%' },
          { name: 'WI Type', value: `${item.workItemType}`, width: '11.9%' },
          { name: 'Title', value: `${item.title}` },
          { name: 'Severity', value: `${item.severity}`, width: '10.4%' },
        ];

        return { fields };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter: ${error.message}`);
    }
  }
}
