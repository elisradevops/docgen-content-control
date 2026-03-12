import SuiteOverviewDataSkinAdapter from '../../adapters/SuiteOverviewDataSkinAdapter';

describe('SuiteOverviewDataSkinAdapter', () => {
  test('returns fallback row when suites are empty', () => {
    const adapter = new SuiteOverviewDataSkinAdapter([]);
    const adopted = adapter.getAdoptedData();

    expect(adopted).toHaveLength(1);
    expect(adopted[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '#', value: 1 }),
        expect.objectContaining({
          name: 'Items to Be Tested',
          value: 'No test suites found',
        }),
        expect.objectContaining({
          name: 'Description',
          value: 'No description',
        }),
      ])
    );
  });

  test('builds sequential numbering and hierarchical title prefixes', () => {
    const suites = [
      {
        temp: {
          name: 'Parent Suite',
          level: 1,
          description: 'Parent description',
          url: 'https://ado/suite/1',
        },
      },
      {
        temp: {
          name: 'Child Suite',
          level: 2,
          description: '<div>Child <b>description</b></div>',
          url: 'https://ado/suite/2',
        },
      },
    ];

    const adapter = new SuiteOverviewDataSkinAdapter(suites as any);
    const adopted = adapter.getAdoptedData();

    expect(adopted).toHaveLength(2);

    expect(adopted[0].fields[0]).toMatchObject({ name: '#', value: 1 });
    expect(adopted[1].fields[0]).toMatchObject({ name: '#', value: 2 });

    expect(adopted[0].fields[1]).toMatchObject({
      name: 'Items to Be Tested',
      value: 'Parent Suite',
    });
    expect(adopted[0].fields[1]).not.toHaveProperty('url');

    expect(adopted[1].fields[1]).toMatchObject({
      name: 'Items to Be Tested',
      value: '  Child Suite',
    });
    expect(adopted[1].fields[1]).not.toHaveProperty('url');
    expect(adopted[0].url).toBe('');
    expect(adopted[1].url).toBe('');

    expect(adopted[1].fields[2]).toMatchObject({
      name: 'Description',
      value: '<div>Child <b>description</b></div>',
    });
  });

  test('falls back to "No description" when suite description html is empty', () => {
    const suites = [
      {
        temp: {
          name: 'Suite A',
          level: 1,
          description: '<div>&nbsp;</div>',
        },
      },
    ];

    const adapter = new SuiteOverviewDataSkinAdapter(suites as any);
    const adopted = adapter.getAdoptedData();

    expect(adopted[0].fields[2]).toMatchObject({
      name: 'Description',
      value: 'No description',
    });
  });

  test('keeps media-only html description instead of replacing with fallback', () => {
    const suites = [
      {
        temp: {
          name: 'Suite With Image',
          level: 1,
          description: '<div><img src="TempFiles/image.png" alt="img" /></div>',
        },
      },
    ];

    const adapter = new SuiteOverviewDataSkinAdapter(suites as any);
    const adopted = adapter.getAdoptedData();

    expect(adopted[0].fields[2]).toMatchObject({
      name: 'Description',
      value: '<div><img src="TempFiles/image.png" alt="img" /></div>',
    });
  });
});
