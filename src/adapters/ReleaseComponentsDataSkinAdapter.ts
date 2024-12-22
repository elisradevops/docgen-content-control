import logger from '../services/logger';

export default class ReleaseComponentDataSkinAdapter {
  public jsonSkinAdapter(releaseComponentDataRaw: any[]) {
    try {
      return releaseComponentDataRaw.map((item: any, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}`, width: '5.5%' },
          { name: 'Software Components', value: item.artifactName, width: '36.1%' },
          { name: 'Version', value: item.artifactVersion, width: '23.6%' },
          { name: 'Comments', value: '' },
        ];
        return { fields };
      });
    } catch (err: any) {
      logger.error(`could not create the adopted data ${err.message}`);
    }
  }
}
