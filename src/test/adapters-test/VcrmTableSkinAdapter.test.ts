import VcrmTableSkinAdapter from '../../adapters/VcrmTableSkinAdapter';

describe('VcrmTableSkinAdapter', () => {
  test('sets dynamic widths for all columns and keeps Title as remaining width', () => {
    const adapter = new VcrmTableSkinAdapter([
      {
        fields: [
          { name: 'ID', value: 123 },
          { name: 'Section', value: '{{section:requirements-root:1.2}}' },
          { name: 'Title', value: 'Requirement title A' },
          { name: 'Verification Method', value: 'Inspection' },
          { name: 'Site', value: 'Lab 1' },
          { name: 'Test Phase', value: 'P1' },
        ],
      },
    ]);

    adapter.adoptSkinData();
    const adopted = adapter.getAdoptedData();
    const fields = adopted[0].fields;

    const idWidth = parseFloat(fields.find((f: any) => f.name === 'ID').width);
    const sectionWidth = parseFloat(fields.find((f: any) => f.name === 'Section').width);
    const titleWidth = parseFloat(fields.find((f: any) => f.name === 'Title').width);
    const methodWidth = parseFloat(fields.find((f: any) => f.name === 'Verification Method').width);
    const siteWidth = parseFloat(fields.find((f: any) => f.name === 'Site').width);
    const phaseWidth = parseFloat(fields.find((f: any) => f.name === 'Test Phase').width);

    expect(idWidth).toBeGreaterThan(0);
    expect(sectionWidth).toBeGreaterThan(0);
    expect(methodWidth).toBeGreaterThan(0);
    expect(siteWidth).toBeGreaterThan(0);
    expect(phaseWidth).toBeGreaterThan(0);
    expect(titleWidth).toBeGreaterThan(0);
    expect(titleWidth).toBeGreaterThan(siteWidth);

    const total = idWidth + sectionWidth + titleWidth + methodWidth + siteWidth + phaseWidth;
    expect(total).toBeCloseTo(100, 1);
  });

  test('expands section width when section values are longer', () => {
    const shortAdapter = new VcrmTableSkinAdapter([
      {
        fields: [
          { name: 'ID', value: 1 },
          { name: 'Section', value: '{{section:requirements-root:1}}' },
          { name: 'Title', value: 'Short section' },
          { name: 'Verification Method', value: '' },
          { name: 'Site', value: '' },
          { name: 'Test Phase', value: '' },
        ],
      },
    ]);
    shortAdapter.adoptSkinData();
    const shortSectionWidth = parseFloat(
      shortAdapter.getAdoptedData()[0].fields.find((f: any) => f.name === 'Section').width
    );

    const longAdapter = new VcrmTableSkinAdapter([
      {
        fields: [
          { name: 'ID', value: 1 },
          { name: 'Section', value: '{{section:requirements-root:123.456.789.1011}}' },
          { name: 'Title', value: 'Long section' },
          { name: 'Verification Method', value: '' },
          { name: 'Site', value: '' },
          { name: 'Test Phase', value: '' },
        ],
      },
    ]);
    longAdapter.adoptSkinData();
    const longSectionWidth = parseFloat(
      longAdapter.getAdoptedData()[0].fields.find((f: any) => f.name === 'Section').width
    );

    expect(longSectionWidth).toBeGreaterThan(shortSectionWidth);
  });
});
