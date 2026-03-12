export default class SuiteOverviewDataSkinAdapter {
  private readonly suites: any[];

  constructor(suites: any[]) {
    this.suites = Array.isArray(suites) ? suites : [];
  }

  private normalizeSuiteDescription(rawDescription: any): string {
    const raw = String(rawDescription || '').trim();
    if (!raw) {
      return 'No description';
    }

    const hasMedia = /<(img|table|ol|ul)\b/i.test(raw);
    const plainText = raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plainText && !hasMedia) {
      return 'No description';
    }

    return raw;
  }

  getAdoptedData() {
    if (this.suites.length === 0) {
      return [
        {
          fields: [
            { name: '#', value: 1, width: '8%' },
            { name: 'Items to Be Tested', value: 'No test suites found' },
            { name: 'Description', value: 'No description' },
          ],
          Source: 0,
          level: 1,
          url: '',
        },
      ];
    }

    return this.suites.map((suite: any, index: number) => {
      const suiteLevel = Math.max(1, Number(suite?.temp?.level || 1));
      const prefix = suiteLevel > 1 ? `${'  '.repeat(suiteLevel - 1)}` : '';
      const suiteTitle = `${prefix}${String(suite?.temp?.name || '').trim()}`;
      const suiteDescription = this.normalizeSuiteDescription(suite?.temp?.description);
      return {
        fields: [
          { name: '#', value: index + 1, width: '8%' },
          {
            name: 'Items to Be Tested',
            value: suiteTitle,
          },
          {
            name: 'Description',
            value: suiteDescription,
          },
        ],
        Source: index + 1,
        level: 1,
        url: '',
      };
    });
  }
}
