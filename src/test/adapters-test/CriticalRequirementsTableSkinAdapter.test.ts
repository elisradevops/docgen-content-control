import CriticalRequirementsTableSkinAdapter from '../../adapters/CriticalRequirementsTableSkinAdapter';

describe('CriticalRequirementsTableSkinAdapter', () => {
  test('applies compact ID width for short IDs', () => {
    const adapter = new CriticalRequirementsTableSkinAdapter([
      {
        fields: [
          { name: 'ID', value: 7 },
          { name: 'Title', value: 'Short ID requirement' },
          { name: 'Comment', value: 'x' },
        ],
      },
    ]);

    adapter.adoptSkinData();
    const adopted = adapter.getAdoptedData();

    expect(adopted[0].fields[0].width).toBe('5.5%');
  });

  test('expands ID width for long IDs', () => {
    const adapter = new CriticalRequirementsTableSkinAdapter([
      {
        fields: [
          { name: 'ID', value: 1234567890123 },
          { name: 'Title', value: 'Long ID requirement' },
          { name: 'Comment', value: 'x' },
        ],
      },
    ]);

    adapter.adoptSkinData();
    const adopted = adapter.getAdoptedData();

    expect(parseFloat(adopted[0].fields[0].width)).toBeGreaterThan(5.5);
  });

  test('keeps non-ID fields unchanged', () => {
    const source = [
      {
        fields: [
          { name: 'ID', value: 42, url: 'https://example.com/42' },
          { name: 'Title', value: 'Req-42' },
          { name: 'Comment', value: 'critical path' },
        ],
      },
    ];

    const adapter = new CriticalRequirementsTableSkinAdapter(source);
    adapter.adoptSkinData();
    const adopted = adapter.getAdoptedData();

    expect(adopted[0].fields[1]).toEqual(source[0].fields[1]);
    expect(adopted[0].fields[2]).toEqual(source[0].fields[2]);
    expect(adopted[0].fields[0].url).toBe('https://example.com/42');
  });
});

