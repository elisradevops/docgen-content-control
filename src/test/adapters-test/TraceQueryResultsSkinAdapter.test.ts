import TraceQueryResultsSkinAdapter from '../../adapters/TraceQueryResultsSkinAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../utils/tablePresentation', () => ({
  COLOR_REQ_SYS: 'REQ_COLOR',
  COLOR_TEST_SOFT: 'TEST_COLOR',
  normalizeFieldName: (name: string) => name,
}));

describe('TraceQueryResultsSkinAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeItem = (id: number, fields: Record<string, any>) => ({
    id,
    fields,
  });

  const makeMaps = () => {
    const sortingSourceColumnsMap = new Map<string, string>([
      ['System.Title', 'Title'],
      ['Microsoft.VSTS.Common.Priority', 'Priority'],
      ['System.AssignedTo', 'Assigned To'],
      ['System.AreaPath', 'Area Path'],
      ['Custom.CustomerId', 'Customer ID'],
    ]);
    const sortingTargetsColumnsMap = new Map<string, string>([
      ['System.Title', 'Title'],
      ['Microsoft.VSTS.Common.Priority', 'Priority'],
      ['System.AssignedTo', 'Assigned To'],
      ['System.AreaPath', 'Area Path'],
      ['Custom.CustomerId', 'Customer ID'],
    ]);
    return { sortingSourceColumnsMap, sortingTargetsColumnsMap };
  };

  test('req-test: builds rows with requirement and test fields including Customer ID', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const req = makeItem(1, {
      'System.Title': 'Req 1',
      'Custom.CustomerId': 'C1',
      'System.AreaPath': 'Root\\Area',
    });
    const tc = makeItem(2, {
      'System.Title': 'TC 1',
      'Custom.CustomerId': 'C2',
      'System.AreaPath': 'Root\\AreaTC',
    });

    const sourceTargetsMap = new Map<any, any[]>([[req, [tc]]]);

    const adapter = new TraceQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'req-test',
      true,
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const reqIdField = fields.find((f: any) => f.name === 'Req ID');
    const custIdFields = fields.filter((f: any) => f.name === 'Customer ID');
    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');

    expect(reqIdField.value).toBe(1);
    expect(reqIdField.width).toBe('8.5%');
    expect(tcIdField.width).toBe('8.5%');
    expect(custIdFields.length).toBeGreaterThan(0);
  });

  test('test-req: builds reciprocal mapping', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const tc = makeItem(10, {
      'System.Title': 'TC 10',
    });
    const req = makeItem(20, {
      'System.Title': 'Req 20',
    });

    const sourceTargetsMap = new Map<any, any[]>([[tc, [req]]]);

    const adapter = new TraceQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'test-req',
      false,
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');
    const reqIdField = fields.find((f: any) => f.name === 'Req ID');

    expect(tcIdField.value).toBe(10);
    expect(tcIdField.width).toBe('8.5%');
    expect(reqIdField.value).toBe(20);
    expect(reqIdField.width).toBe('8.5%');
  });

  test('adaptFields skips common columns when excludeCommonColumnInstance is true and handles object/string defaults', () => {
    const sortingSourceColumnsMap = new Map<string, string>([
      ['Custom.Phase', 'Test Phase'],
      ['Custom.Obj', 'Obj Field'],
      ['Custom.Str', 'Str Field'],
    ]);
    const sortingTargetsColumnsMap = new Map<string, string>();

    const adapter = new TraceQueryResultsSkinAdapter(
      { sourceTargetsMap: new Map(), sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'req-test',
      false,
      'both'
    );

    const item = makeItem(1, {
      'Custom.Phase': 'Phase 1',
      'Custom.Obj': { displayName: 'Obj Name' },
      'Custom.Str': 'Str Name',
    });

    const fields = (adapter as any).adaptFields(item, 'REQ_COLOR', true, 'Req', true);

    const names = fields.map((f: any) => f.name);
    expect(names).not.toContain('Test Phase');
    expect(names).toContain('Obj Field');
    expect(names).toContain('Str Field');

    const objField = fields.find((f: any) => f.name === 'Obj Field');
    const strField = fields.find((f: any) => f.name === 'Str Field');
    expect(objField.value).toBe('Obj Name');
    expect(strField.value).toBe('Str Name');
  });

  test('req-test: no targets leaves test side empty', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const req = makeItem(5, {
      'System.Title': 'Req 5',
    });

    const sourceTargetsMap = new Map<any, any[]>([[req, []]]);

    const adapter = new TraceQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'req-test',
      false,
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');
    const tcTitleField = fields.find((f: any) => f.name === 'Test Case Title');

    expect(tcIdField.value).toBe('');
    expect(tcTitleField.value).toBe('');
  });

  test('test-req: no targets leaves requirement side empty', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const tc = makeItem(15, {
      'System.Title': 'TC 15',
    });

    const sourceTargetsMap = new Map<any, any[]>([[tc, []]]);

    const adapter = new TraceQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'test-req',
      false,
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const reqIdField = fields.find((f: any) => f.name === 'Req ID');
    const reqTitleField = fields.find((f: any) => f.name === 'Req Title');

    expect(reqIdField.value).toBe('');
    expect(reqTitleField.value).toBe('');
  });

  test('unknown queryMode logs error and produces no adopted data', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();
    const req = makeItem(1, { 'System.Title': 'Req' });
    const sourceTargetsMap = new Map<any, any[]>([[req, []]]);

    const adapter = new TraceQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'unknown-mode',
      false,
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(0);
    expect((logger as any).error).toHaveBeenCalled();
  });
});
