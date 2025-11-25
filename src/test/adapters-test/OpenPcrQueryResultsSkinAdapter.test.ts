import OpenPcrQueryResultsSkinAdapter from '../../adapters/OpenPcrQueryResultsSkinAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../utils/tablePresentation', () => ({
  COLOR_PCR: 'REQ_COLOR',
  COLOR_TEST_SOFT: 'TEST_COLOR',
  normalizeFieldName: (name: string) => name,
}));

describe('OpenPcrQueryResultsSkinAdapter', () => {
  const makeItem = (id: number, fields: Record<string, any>) => ({
    id,
    fields,
    _links: { html: { href: `http://item/${id}` } },
  });

  const makeMaps = () => {
    const sortingSourceColumnsMap = new Map<string, string>([
      ['System.Title', 'Title'],
      ['Microsoft.VSTS.Common.Priority', 'Priority'],
      ['System.AssignedTo', 'Assigned To'],
      ['System.AreaPath', 'Area Path'],
    ]);
    const sortingTargetsColumnsMap = new Map<string, string>([
      ['System.Title', 'Title'],
      ['Microsoft.VSTS.Common.Priority', 'Priority'],
      ['System.AssignedTo', 'Assigned To'],
      ['System.AreaPath', 'Area Path'],
    ]);
    return { sortingSourceColumnsMap, sortingTargetsColumnsMap };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('open-pcr-to-test: with targets builds rows with PCR and Test fields', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const pcr = makeItem(1, {
      'System.Title': 'PCR 1',
      'Microsoft.VSTS.Common.Priority': '1',
      'System.AssignedTo': { displayName: 'Owner' },
      'System.AreaPath': 'Root\\Area',
    });
    const tc = makeItem(2, {
      'System.Title': 'TC 1',
      'Microsoft.VSTS.Common.Priority': '2',
      'System.AssignedTo': { displayName: 'Tester' },
      'System.AreaPath': 'Root\\AreaTC',
    });

    const sourceTargetsMap = new Map<any, any[]>([[pcr, [tc]]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'open-pcr-to-test',
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');
    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');
    const pcrTitleField = fields.find((f: any) => f.name === 'PCR Title');
    const tcTitleField = fields.find((f: any) => f.name === 'Test Case Title');

    expect(pcrIdField.value).toBe(1);
    expect(pcrIdField.url).toBe('http://item/1');
    expect(tcIdField.value).toBe(2);
    expect(tcIdField.url).toBe('http://item/2');
    expect(pcrTitleField.value).toBe('PCR 1');
    expect(tcTitleField.value).toBe('TC 1');
  });

  test('open-pcr-to-test: no targets leaves test side empty', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const pcr = makeItem(10, {
      'System.Title': 'PCR 10',
      'System.AreaPath': 'Root\\Area',
    });

    const sourceTargetsMap = new Map<any, any[]>([[pcr, []]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'open-pcr-to-test',
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

  test('test-to-open-pcr: with targets builds reciprocal mapping', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const tc = makeItem(20, {
      'System.Title': 'TC 20',
    });
    const pcr = makeItem(30, {
      'System.Title': 'PCR 30',
    });

    const sourceTargetsMap = new Map<any, any[]>([[tc, [pcr]]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'test-to-open-pcr',
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');
    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');

    expect(tcIdField.value).toBe(20);
    expect(pcrIdField.value).toBe(30);
  });

  test('test-to-open-pcr: no targets leaves PCR side empty', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const tc = makeItem(40, {
      'System.Title': 'TC 40',
    });

    const sourceTargetsMap = new Map<any, any[]>([[tc, []]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'test-to-open-pcr',
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');
    const pcrTitleField = fields.find((f: any) => f.name === 'PCR Title');

    expect(pcrIdField.value).toBe('');
    expect(pcrTitleField.value).toBe('');
  });

  test('open-pcr-to-test with openPcrOnly excludes common target columns', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const pcr = makeItem(1, {
      'System.Title': 'PCR 1',
      'System.AreaPath': 'Root\\Area',
    });
    const tc = makeItem(2, {
      'System.Title': 'TC 1',
      'System.AreaPath': 'Root\\AreaTC',
    });

    const sourceTargetsMap = new Map<any, any[]>([[pcr, [tc]]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'open-pcr-to-test',
      'openPcrOnly'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].fields;

    const nodeNameTestSide = fields.filter((f: any) => f.name === 'Node Name' && f.color === 'TEST_COLOR');
    expect(nodeNameTestSide.length).toBe(0);
  });

  test('test-to-open-pcr with testOnly excludes common PCR columns', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const tc = makeItem(10, {
      'System.Title': 'TC 10',
      'System.AreaPath': 'Root\\AreaTC',
    });
    const pcr = makeItem(20, {
      'System.Title': 'PCR 20',
      'System.AreaPath': 'Root\\Area',
    });

    const sourceTargetsMap = new Map<any, any[]>([[tc, [pcr]]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'test-to-open-pcr',
      'testOnly'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].fields;

    const nodeNamePcrSide = fields.filter((f: any) => f.name === 'Node Name' && f.color === 'REQ_COLOR');
    expect(nodeNamePcrSide.length).toBe(0);
  });

  test('adaptFields skips Work Item Type for Test Case and adapts custom object fields', () => {
    const sortingSourceColumnsMap = new Map<string, string>([
      ['System.Title', 'Title'],
      ['System.WorkItemType', 'Work Item Type'],
      ['Custom.Ref', 'Custom Field'],
    ]);
    const sortingTargetsColumnsMap = new Map<string, string>();

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap: new Map(), sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'open-pcr-to-test',
      'both'
    );

    const item = makeItem(1, {
      'System.Title': 'TC 1',
      'System.WorkItemType': 'Test Case',
      'Custom.Ref': { displayName: 'Custom Name' },
    });

    const fields = (adapter as any).adaptFields(item, 'TEST_COLOR', true, 'Test Case', false);

    const names = fields.map((f: any) => f.name);
    expect(names).toContain('Test Case Title');
    expect(names).not.toContain('Work Item Type');

    const customField = fields.find((f: any) => f.name === 'Custom Field');
    expect(customField.value).toBe('Custom Name');
  });

  test('convertAreaPathToNodeName returns input when there is no backslash', () => {
    const adapter = new OpenPcrQueryResultsSkinAdapter(
      {
        sourceTargetsMap: new Map(),
        sortingSourceColumnsMap: new Map(),
        sortingTargetsColumnsMap: new Map(),
      },
      'open-pcr-to-test',
      'both'
    );

    const result = (adapter as any).convertAreaPathToNodeName('PlainArea');
    expect(result).toBe('PlainArea');
  });

  test('unknown queryMode logs error and produces no adopted data', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();
    const pcr = makeItem(1, { 'System.Title': 'PCR' });
    const sourceTargetsMap = new Map<any, any[]>([[pcr, []]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'unknown-mode',
      'both'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(0);
    expect((logger as any).error).toHaveBeenCalled();
  });

  test('openPcrOnly mode excludes common columns', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const pcr = makeItem(1, {
      'System.Title': 'PCR 1',
      'System.AreaPath': 'Root\\Area',
    });
    const tc = makeItem(2, {
      'System.Title': 'TC 1',
      'System.AreaPath': 'Root\\AreaTC',
    });

    const sourceTargetsMap = new Map<any, any[]>([[pcr, [tc]]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'open-pcr-to-test',
      'openPcrOnly'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].fields;

    const commonColumns = fields.filter((f: any) => f.name === 'Node Name' && f.color === 'TEST_COLOR');
    expect(commonColumns.length).toBe(0);
  });

  test('testOnly mode excludes common columns', () => {
    const { sortingSourceColumnsMap, sortingTargetsColumnsMap } = makeMaps();

    const tc = makeItem(10, {
      'System.Title': 'TC 10',
      'System.AreaPath': 'Root\\AreaTC',
    });
    const pcr = makeItem(20, {
      'System.Title': 'PCR 20',
      'System.AreaPath': 'Root\\Area',
    });

    const sourceTargetsMap = new Map<any, any[]>([[tc, [pcr]]]);

    const adapter = new OpenPcrQueryResultsSkinAdapter(
      { sourceTargetsMap, sortingSourceColumnsMap, sortingTargetsColumnsMap },
      'test-to-open-pcr',
      'testOnly'
    );

    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].fields;

    const commonColumns = fields.filter((f: any) => f.name === 'Node Name' && f.color === 'REQ_COLOR');
    expect(commonColumns.length).toBe(0);
  });

  test('convertAreaPathToNodeName splits area path by backslash', () => {
    const adapter = new OpenPcrQueryResultsSkinAdapter(
      {
        sourceTargetsMap: new Map(),
        sortingSourceColumnsMap: new Map(),
        sortingTargetsColumnsMap: new Map(),
      },
      'open-pcr-to-test',
      'both'
    );

    const result = (adapter as any).convertAreaPathToNodeName('Root\\Area\\SubArea');
    expect(result).toBe('SubArea');
  });
});
