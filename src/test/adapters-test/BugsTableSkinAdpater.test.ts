import BugsTableSkinAdapter from '../../adapters/BugsTableSkinAdpater';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('BugsTableSkinAdpater', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adapts fields and area path node name correctly', () => {
    const fieldsToIncludeMap = new Map<string, string>([
      ['System.Title', 'Title'],
      ['System.WorkItemType', 'Work Item Type'],
      ['System.Id', 'ID'],
      ['Microsoft.VSTS.Common.Priority', 'Priority'],
      ['System.AssignedTo', 'Assigned To'],
      ['Custom.CustomerId', 'Customer ID'],
      ['System.AreaPath', 'Area Path'],
      ['Custom.Plain', 'Custom Plain'],
    ]);

    const adapter = new BugsTableSkinAdapter({
      fetchedWorkItems: [
        {
          id: 123,
          fields: {
            'System.Title': 'Bug title',
            'Microsoft.VSTS.Common.Priority': 1,
            'System.AssignedTo': { displayName: 'Jane' },
            'Custom.CustomerId': 'SR0001',
            'System.AreaPath': 'MEWP\\ATP\\ESUK',
            'Custom.Plain': { displayName: 'Value from displayName' },
          },
          _links: { html: { href: 'http://wi/123' } },
        },
      ],
      fieldsToIncludeMap,
    });

    adapter.adoptSkinData();
    const adopted = adapter.getAdoptedData();

    expect(adopted).toHaveLength(1);
    const fields = adopted[0].fields;
    expect(fields[0]).toMatchObject({ name: 'WI ID', value: 123, url: 'http://wi/123' });
    expect(fields.find((f: any) => f.name === 'Title')?.value).toBe('Bug title');
    expect(fields.find((f: any) => f.name === 'Priority')?.value).toBe(1);
    expect(fields.find((f: any) => f.name === 'Assigned To')?.value).toBe('Jane');
    expect(fields.find((f: any) => f.name === 'Customer ID')?.value).toBe('SR0001');
    expect(fields.find((f: any) => f.name === 'Node Name')?.value).toBe('ESUK');
    expect(fields.find((f: any) => f.name === 'Custom Plain')?.value).toBe('Value from displayName');
  });

  it('logs and continues on malformed input', () => {
    const adapter = new BugsTableSkinAdapter({ fetchedWorkItems: null, fieldsToIncludeMap: new Map() });
    adapter.adoptSkinData();

    expect((logger as any).error).toHaveBeenCalled();
    expect(adapter.getAdoptedData()).toEqual([]);
  });
});
