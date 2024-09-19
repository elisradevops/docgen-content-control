import logger from '../services/logger';

export default class TestLogDataSkinAdapter {
  private convertDateToLocalTime(utcDateString: string): string {
    const localDate = new Date(utcDateString);
    return localDate.toLocaleString();
  }

  public jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      return resultDataRaw.map((item, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}`, width: '5.5%' },
          { name: 'Test Id', value: `${item.testId}`, width: '11.1%' },
          { name: 'Test Name', value: `${item.testName}` },
          {
            name: 'Execution Date',
            value: `${this.convertDateToLocalTime(item.executedDate)}`,
            width: '16.6%',
          },
          { name: 'Performed By', value: `${item.performedBy}`, width: '26.3%' },
        ];

        return { fields };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter: ${error.message}`);
    }
  }
}
