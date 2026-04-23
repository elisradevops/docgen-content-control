import CustomerCoverageTableSkinAdapter from '../../adapters/CustomerCoverageTableSkinAdapter';

describe('CustomerCoverageTableSkinAdapter', () => {
  test('shades every field on uncovered rows', () => {
    const adapter = new CustomerCoverageTableSkinAdapter([
      {
        sourceId: 100,
        sourceTitle: 'Customer requirement',
        uncovered: true,
      },
    ]);

    adapter.adoptSkinData();

    const fields = adapter.getAdoptedData()[0].fields;
    expect(fields).toHaveLength(4);
    fields.forEach((field: any) => {
      expect(field.shading).toEqual({ color: 'auto', fill: 'FFC7CE' });
    });
    // Uncovered cells use the shared em-dash placeholder by default.
    expect(fields[2].value).toBe('—');
    expect(fields[3].value).toBe('—');
  });

  test('honors explicit sourceOrder regardless of rawRows order', () => {
    const adapter = new CustomerCoverageTableSkinAdapter(
      [
        { sourceId: 200, sourceTitle: 'Second', coveringId: 20, coveringTitle: 'covers 20' },
        { sourceId: 100, sourceTitle: 'First', coveringId: 15, coveringTitle: 'covers 15' },
        { sourceId: 100, sourceTitle: 'First', coveringId: 10, coveringTitle: 'covers 10' },
      ],
      {},
      [100, 200],
    );

    adapter.adoptSkinData();

    const rows = adapter.getAdoptedData();
    // Source 100 rows first (covering ids ascending), then source 200.
    expect(rows.map((r: any) => r.fields[0].value)).toEqual([100, 100, 200]);
    expect(rows.map((r: any) => r.fields[2].value)).toEqual([10, 15, 20]);
  });

  test('does not shade covered rows', () => {
    const adapter = new CustomerCoverageTableSkinAdapter([
      {
        sourceId: 100,
        sourceTitle: 'Customer requirement',
        coveringId: 200,
        coveringTitle: 'System requirement',
      },
    ]);

    adapter.adoptSkinData();

    adapter.getAdoptedData()[0].fields.forEach((field: any) => {
      expect(field.shading).toBeUndefined();
    });
  });

  test('sorts multi-coverage rows by covering id for the same source', () => {
    const adapter = new CustomerCoverageTableSkinAdapter([
      {
        sourceId: 100,
        sourceTitle: 'Customer requirement',
        coveringId: 202,
        coveringTitle: 'Later system requirement',
      },
      {
        sourceId: 100,
        sourceTitle: 'Customer requirement',
        coveringId: 201,
        coveringTitle: 'Earlier system requirement',
      },
    ]);

    adapter.adoptSkinData();

    const adopted = adapter.getAdoptedData();
    expect(adopted[0].fields[2].value).toBe(201);
    expect(adopted[1].fields[2].value).toBe(202);
  });

  test('applies header and uncovered fill overrides', () => {
    const adapter = new CustomerCoverageTableSkinAdapter(
      [
        {
          sourceId: 100,
          sourceTitle: 'Customer requirement',
          uncovered: true,
        },
      ],
      {
        sourceIdHeader: 'Customer Req ID',
        uncoveredFill: 'ABCDEF',
      },
    );

    adapter.adoptSkinData();

    const fields = adapter.getAdoptedData()[0].fields;
    expect(fields[0].name).toBe('Customer Req ID');
    expect(fields[0].shading.fill).toBe('ABCDEF');
  });
});
