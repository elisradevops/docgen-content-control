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
});
