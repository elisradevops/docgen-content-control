import logger from '../services/logger';

export default class ReleaseComponentDataSkinAdapter {
  public jsonSkinAdapter(releaseComponentDataRaw: any[]) {
    try {
      return releaseComponentDataRaw.map((item: any, idx) => {
        const fields = [
          { name: '#', value: `${idx + 1}`, width: '3.8%' },
          { name: 'Software Components', value: item.artifactName },
          { name: 'Version', value: item.artifactVersion },
        ];
        return { fields };
      });
    } catch (err: any) {
      logger.error(`could not create the adopted data ${err.message}`);
    }
  }
}
