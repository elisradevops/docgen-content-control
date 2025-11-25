import TraceAnalysisRequirementsAdapter from '../../adapters/TraceAnalysisRequirementsAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('TraceAnalysisRequirementsAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeItem = (id: number, overrides: any = {}) => ({
    id,
    fields: {
      'System.Title': `Item ${id}`,
      'System.WorkItemType': overrides.type || undefined,
      'System.State': overrides.state || 'Active',
    },
    _links: { html: { href: `http://item/${id}` } },
    ...overrides,
  });

  test('sys-req-to-soft-req: Map input with multiple targets', () => {
    const map = new Map<any, any>();
    const source = makeItem(1, { type: 'System Requirement' });
    const targets = [
      makeItem(2, { type: 'Software Requirement' }),
      makeItem(3, { type: 'Software Requirement' }),
    ];
    map.set(source, targets);

    const adapter = new TraceAnalysisRequirementsAdapter(map, 'sys-req-to-soft-req');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(2);
    const firstRow = data[0].fields;

    // First row includes source + first target
    const idFieldSys = firstRow.find((f: any) => f.name === 'ID' && f.color === 'DBE5F1');
    const idFieldSoft = firstRow.find((f: any) => f.name === 'ID' && f.color === 'E4DFEC');

    expect(idFieldSys?.value).toBe(1);
    expect(idFieldSys?.url).toBe('http://item/1');
    expect(idFieldSoft?.value).toBe(2);
    expect(idFieldSoft?.url).toBe('http://item/2');
  });

  test('sys-req-to-soft-req: no targets creates empty soft side columns', () => {
    const map = new Map<any, any>();
    const source = makeItem(10, { type: 'System Requirement' });
    map.set(source, []);

    const adapter = new TraceAnalysisRequirementsAdapter(map, 'sys-req-to-soft-req');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const row = data[0].fields;

    const softIdField = row.find((f: any) => f.name === 'ID' && f.color === 'E4DFEC');
    expect(softIdField?.value).toBe('');
  });

  test('soft-req-to-sys-req: Map input with single target', () => {
    const map = new Map<any, any>();
    const source = makeItem(5, { type: 'Software Requirement' });
    const targets = [makeItem(6, { type: 'System Requirement' })];
    map.set(source, targets);

    const adapter = new TraceAnalysisRequirementsAdapter(map, 'soft-req-to-sys-req');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const row = data[0].fields;

    const softIdField = row.find((f: any) => f.name === 'ID' && f.color === 'E4DFEC');
    const sysIdField = row.find((f: any) => f.name === 'ID' && f.color === 'DBE5F1');

    expect(softIdField?.value).toBe(5);
    expect(sysIdField?.value).toBe(6);
  });

  test('soft-req-to-sys-req: no targets creates empty system side columns', () => {
    const map = new Map<any, any>();
    const source = makeItem(7, { type: 'Software Requirement' });
    map.set(source, []);

    const adapter = new TraceAnalysisRequirementsAdapter(map, 'soft-req-to-sys-req');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const row = data[0].fields;

    const sysIdField = row.find((f: any) => f.name === 'ID' && f.color === 'DBE5F1');
    expect(sysIdField?.value).toBe('');
  });

  test('array rawQueryMapping is supported', () => {
    const source = makeItem(100, { type: 'System Requirement' });
    const targets = [makeItem(200, { type: 'Software Requirement' })];
    const raw = [
      {
        source,
        targets,
      },
    ];

    const adapter = new TraceAnalysisRequirementsAdapter(raw, 'sys-req-to-soft-req');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const row = data[0].fields;
    const sysIdField = row.find((f: any) => f.name === 'ID' && f.color === 'DBE5F1');
    const softIdField = row.find((f: any) => f.name === 'ID' && f.color === 'E4DFEC');

    expect(sysIdField?.value).toBe(100);
    expect(softIdField?.value).toBe(200);
  });

  test('unknown queryMode logs error and produces no adopted data', () => {
    const map = new Map<any, any>();
    map.set(makeItem(1), []);

    const adapter = new TraceAnalysisRequirementsAdapter(map, 'unknown-mode');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(0);
    expect((logger as any).error).toHaveBeenCalled();
  });

  test('getFieldValue resolves fields from multiple shapes', () => {
    const adapter = new TraceAnalysisRequirementsAdapter(new Map(), 'sys-req-to-soft-req');
    const anyAdapter: any = adapter as any;

    // Direct property
    expect(anyAdapter.getFieldValue({ 'System.Title': 'A' }, 'System.Title')).toBe('A');

    // From .fields
    expect(anyAdapter.getFieldValue({ fields: { 'System.Title': 'B' } }, 'System.Title')).toBe('B');

    // From mapped aliases
    expect(anyAdapter.getFieldValue({ title: 'C' }, 'System.Title')).toBe('C');
    expect(anyAdapter.getFieldValue({ workItemType: 'Type1' }, 'System.WorkItemType')).toBe('Type1');
    expect(anyAdapter.getFieldValue({ state: 'Done' }, 'System.State')).toBe('Done');

    // From .fields using alias mapping
    expect(anyAdapter.getFieldValue({ fields: { title: 'D' } }, 'System.Title')).toBe('D');

    // Fallback to empty string
    expect(anyAdapter.getFieldValue({}, 'System.Title')).toBe('');
  });
});
