import logger from '../services/logger';

export default class OpenPCRsDataSkinAdapter {
  public jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      return resultDataRaw.map((item, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}` },
          { name: 'Test Id', value: `${item.testId}` },
          { name: 'Test Name', value: `${item.testName}` },
          { name: 'PCR Id', value: `${item.pcrId}`, url: `${item.pcrUrl}` },
          { name: 'WI Type', value: `${item.workItemType}` },
          { name: 'Title', value: `${item.title}` },
          { name: 'Severity', value: `${item.severity}` },
        ];

        return { fields };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter: ${error.message}`);
    }
  }
}
