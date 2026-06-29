import TraceByLinkedRequirementAdapter from '../../adapters/TraceByLinkedRequirementAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('TraceByLinkedRequirementAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeReqJson = (overrides: any = {}) =>
    JSON.stringify({
      id: 1,
      title: 'Req 1',
      customerId: undefined,
      ...overrides,
    });

  const makeTcJson = (overrides: any = {}) =>
    JSON.stringify({
      id: 10,
      title: 'TC 10',
      customerId: undefined,
      ...overrides,
    });

  test('req-test: includes Customer ID column when present on requirement', () => {
    const req = makeReqJson({ customerId: 'C-1' });
    const tc = makeTcJson();
    const map = new Map<string, string[]>([[req, [tc]]]);

    const adapter = new TraceByLinkedRequirementAdapter(map, 'req-test');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const customerField = fields.find((f: any) => f.name === 'Customer ID');
    const reqIdField = fields.find((f: any) => f.name === 'Req ID');
    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');
    expect(customerField.value).toBe('C-1');
    expect(reqIdField.width).toBe('8.5%');
    expect(tcIdField.width).toBe('8.5%');
  });

  test('test-req: includes Customer ID when any target has it', () => {
    const tc = makeTcJson();
    const reqWithCustomer = makeReqJson({ id: 2, customerId: 'C-2' });
    const reqWithoutCustomer = makeReqJson({ id: 3 });

    const map = new Map<string, string[]>([[tc, [reqWithCustomer, reqWithoutCustomer]]]);

    const adapter = new TraceByLinkedRequirementAdapter(map, 'test-req');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(2);
    const firstRowFields = data[0].fields;
    const customerField = firstRowFields.find((f: any) => f.name === 'Customer ID');
    const reqIdField = firstRowFields.find((f: any) => f.name === 'Req ID');
    const tcIdField = firstRowFields.find((f: any) => f.name === 'Test Case ID');
    expect(customerField.value).toBe('C-2');
    expect(reqIdField.width).toBe('8.5%');
    expect(tcIdField.width).toBe('8.5%');
  });

  test('unknown queryMode logs error and produces no adopted data', () => {
    const map = new Map<string, string[]>([[makeReqJson(), [makeTcJson()]]]);

    const adapter = new TraceByLinkedRequirementAdapter(map, 'unknown-mode');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(0);
    expect((logger as any).error).toHaveBeenCalled();
  });

  describe('fieldDisplayMapping overrides', () => {
    test('overrides Requirement Title in req-test mode', () => {
      const req = makeReqJson({ customerId: 'C-1' });
      const tc = makeTcJson();
      const map = new Map<string, string[]>([[req, [tc]]]);

      const fieldDisplayMapping = {
        Requirement: { Title: 'Req Name' },
      };

      const adapter = new TraceByLinkedRequirementAdapter(map, 'req-test', fieldDisplayMapping);
      adapter.adoptSkinData();
      const fields = adapter.getAdoptedData()[0].fields;

      expect(fields.find((f: any) => f.name === 'Req Name')).toBeDefined();
      expect(fields.find((f: any) => f.name === 'Req Name').value).toBe('Req 1');
    });

    test('overrides Customer ID for Requirement side', () => {
      const req = makeReqJson({ customerId: 'C-1' });
      const tc = makeTcJson();
      const map = new Map<string, string[]>([[req, [tc]]]);

      const fieldDisplayMapping = {
        Requirement: { 'Customer ID': 'System ID' },
      };

      const adapter = new TraceByLinkedRequirementAdapter(map, 'req-test', fieldDisplayMapping);
      adapter.adoptSkinData();
      const fields = adapter.getAdoptedData()[0].fields;

      const systemIdField = fields.find((f: any) => f.name === 'System ID');
      expect(systemIdField).toBeDefined();
      expect(systemIdField.value).toBe('C-1');
      expect(fields.find((f: any) => f.name === 'Customer ID')).toBeUndefined();
    });

    test('overrides Test Case Title in test-req mode', () => {
      const tc = makeTcJson();
      const req = makeReqJson({ id: 2, customerId: undefined });
      const map = new Map<string, string[]>([[tc, [req]]]);

      const fieldDisplayMapping = {
        'Test Case': { Title: 'TC Description' },
      };

      const adapter = new TraceByLinkedRequirementAdapter(map, 'test-req', fieldDisplayMapping);
      adapter.adoptSkinData();
      const fields = adapter.getAdoptedData()[0].fields;

      expect(fields.find((f: any) => f.name === 'TC Description')).toBeDefined();
      expect(fields.find((f: any) => f.name === 'TC Description').value).toBe('TC 10');
    });

    test('no mapping defaults to original names', () => {
      const req = makeReqJson();
      const tc = makeTcJson();
      const map = new Map<string, string[]>([[req, [tc]]]);

      const adapter = new TraceByLinkedRequirementAdapter(map, 'req-test');
      adapter.adoptSkinData();
      const fields = adapter.getAdoptedData()[0].fields;

      // Title fields should exist with default names
      const titleFields = fields.filter((f: any) => f.name === 'Title');
      expect(titleFields.length).toBe(2); // one for Req, one for TC
    });
  });

  test('adapts Req/Test Case ID column widths when IDs are long', () => {
    const req = makeReqJson({ id: 123456789012 });
    const tc = makeTcJson({ id: 987654321098 });
    const map = new Map<string, string[]>([[req, [tc]]]);

    const adapter = new TraceByLinkedRequirementAdapter(map, 'req-test');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].fields;

    const reqIdField = fields.find((f: any) => f.name === 'Req ID');
    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');

    expect(parseFloat(reqIdField.width)).toBeGreaterThan(8.5);
    expect(reqIdField.width).toBe(tcIdField.width);
  });
});
