import CustomerCoverageTableSkinAdapter from '../../adapters/CustomerCoverageTableSkinAdapter';

describe('CustomerCoverageTableSkinAdapter', () => {
  test('renders uncovered rows with regular side banding and empty covering cells', () => {
    const adapter = new CustomerCoverageTableSkinAdapter([
      {
        sourceId: 100,
        sourceTitle: 'Customer requirement',
        uncovered: true,
      },
    ]);

    adapter.adoptSkinData();

    const adopted = adapter.getAdoptedData();
    const fields = adopted.adoptedData[0].fields;
    expect(adopted.errorMessage).toBeNull();
    expect(adopted.groupedHeader.leftLabel).toBe('Customer');
    expect(adopted.groupedHeader.rightLabel).toBe('System');
    expect(fields).toHaveLength(4);
    expect(fields[0].shading).toEqual({ color: 'auto', fill: 'DBE5F1' });
    expect(fields[1].shading).toEqual({ color: 'auto', fill: 'DBE5F1' });
    expect(fields[2].shading).toEqual({ color: 'auto', fill: 'E4DFEC' });
    expect(fields[3].shading).toEqual({ color: 'auto', fill: 'E4DFEC' });
    expect(fields[2].value).toBe('');
    expect(fields[3].value).toBe('');
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

    const rows = adapter.getAdoptedData().adoptedData;
    // Source 100 rows first (covering ids ascending), then source 200.
    expect(rows.map((r: any) => r.fields[0].value)).toEqual([100, '', 200]);
    expect(rows.map((r: any) => r.fields[2].value)).toEqual([10, 15, 20]);
  });

  test('applies grouped side shading to covered rows', () => {
    const adapter = new CustomerCoverageTableSkinAdapter([
      {
        sourceId: 100,
        sourceTitle: 'Customer requirement',
        coveringId: 200,
        coveringTitle: 'System requirement',
      },
    ]);

    adapter.adoptSkinData();

    const fields = adapter.getAdoptedData().adoptedData[0].fields;
    expect(fields[0].shading.fill).toBe('DBE5F1');
    expect(fields[1].shading.fill).toBe('DBE5F1');
    expect(fields[2].shading.fill).toBe('E4DFEC');
    expect(fields[3].shading.fill).toBe('E4DFEC');
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

    const adopted = adapter.getAdoptedData().adoptedData;
    expect(adopted[0].fields[2].value).toBe(201);
    expect(adopted[1].fields[2].value).toBe(202);
    expect(adopted[1].fields[0].value).toBe('');
    expect(adopted[1].fields[1].value).toBe('');
  });

  test('applies custom column header overrides', () => {
    const adapter = new CustomerCoverageTableSkinAdapter(
      [
        {
          sourceId: 100,
          sourceTitle: 'Customer requirement',
          uncovered: true,
        },
      ],
      {
        coveringIdHeader: 'Customer Req ID',
      },
    );

    adapter.adoptSkinData();

    const fields = adapter.getAdoptedData().adoptedData[0].fields;
    expect(fields[2].name).toBe('Customer Req ID');
  });

  test('alternates side banding by source group', () => {
    const adapter = new CustomerCoverageTableSkinAdapter([
      {
        sourceId: 100,
        sourceTitle: 'First source',
        coveringId: 200,
        coveringTitle: 'First target',
      },
      {
        sourceId: 101,
        sourceTitle: 'Second source',
        coveringId: 201,
        coveringTitle: 'Second target',
      },
    ]);

    adapter.adoptSkinData();

    const rows = adapter.getAdoptedData().adoptedData;
    expect(rows[0].fields[0].shading.fill).toBe('DBE5F1');
    expect(rows[0].fields[2].shading.fill).toBe('E4DFEC');
    expect(rows[1].fields[0].shading.fill).toBe('FFFFFF');
    expect(rows[1].fields[2].shading.fill).toBe('FFFFFF');
  });
});
