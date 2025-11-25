import TraceByLinkedPCRAdapter from '../../adapters/TraceByLinkedPCRAdapter';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('TraceByLinkedPCRAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makePcrJson = (overrides: any = {}) =>
    JSON.stringify({
      pcrId: 1,
      pcrUrl: 'http://pcr/1',
      workItemType: 'PCR',
      severity: '1',
      title: 'PCR 1',
      ...overrides,
    });

  const makeTcJson = (overrides: any = {}) =>
    JSON.stringify({
      id: 10,
      testCaseUrl: 'http://tc/10',
      title: 'TC 10',
      ...overrides,
    });

  test('open-pcr-to-test: builds rows from JSON strings', () => {
    const map = new Map<string, string[]>([[makePcrJson(), [makeTcJson()]]]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'open-pcr-to-test');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');
    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');

    expect(pcrIdField.value).toBe(1);
    expect(pcrIdField.url).toBe('http://pcr/1');
    expect(tcIdField.value).toBe(10);
    expect(tcIdField.url).toBe('http://tc/10');
  });

  test('test-to-open-pcr: builds reciprocal mapping', () => {
    const map = new Map<string, string[]>([[makeTcJson(), [makePcrJson()]]]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'test-to-open-pcr');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const tcIdField = fields.find((f: any) => f.name === 'Test Case ID');
    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');

    expect(tcIdField.value).toBe(10);
    expect(pcrIdField.value).toBe(1);
  });

  test('open-pcr-to-test: missing PCR id/url falls back to empty values', () => {
    const map = new Map<string, string[]>([
      [makePcrJson({ pcrId: undefined, pcrUrl: undefined }), [makeTcJson()]],
    ]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'open-pcr-to-test');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');
    expect(pcrIdField.value).toBe('');
    expect(pcrIdField.url).toBeUndefined();
  });

  test('test-to-open-pcr: missing PCR id/url falls back to empty values', () => {
    const map = new Map<string, string[]>([
      [makeTcJson(), [makePcrJson({ pcrId: undefined, pcrUrl: undefined })]],
    ]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'test-to-open-pcr');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const fields = data[0].fields;

    const pcrIdField = fields.find((f: any) => f.name === 'PCR ID');
    expect(pcrIdField.value).toBe('');
    expect(pcrIdField.url).toBeUndefined();
  });

  test('open-pcr-to-test: undefined targets produces no rows but no error', () => {
    const map = new Map<string, string[] | undefined>([[makePcrJson(), undefined]]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'open-pcr-to-test');
    adapter.adoptSkinData();

    const data = adapter.getAdoptedData();
    expect(data.length).toBe(0);
  });

  test('test-to-open-pcr: undefined targets produces no rows but no error', () => {
    const map = new Map<string, string[] | undefined>([[makeTcJson(), undefined]]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'test-to-open-pcr');
    adapter.adoptSkinData();

    const data = adapter.getAdoptedData();
    expect(data.length).toBe(0);
  });

  test('unknown queryMode logs error and produces no adopted data', () => {
    const map = new Map<string, string[]>([[makePcrJson(), [makeTcJson()]]]);

    const adapter = new TraceByLinkedPCRAdapter(map, 'unknown-mode');
    adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(0);
    expect((logger as any).error).toHaveBeenCalled();
  });
});
