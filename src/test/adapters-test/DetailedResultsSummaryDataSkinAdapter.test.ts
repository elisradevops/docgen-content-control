import DetailedResultsSummaryDataSkinAdapter from '../../adapters/DetailedResultsSummaryDataSkinAdapter';
import HtmlUtils from '../../services/htmlUtils';
import RichTextDataFactory from '../../factories/RichTextDataFactory';
import logger from '../../services/logger';

jest.mock('../../services/htmlUtils');
jest.mock('../../factories/RichTextDataFactory');
jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('DetailedResultsSummaryDataSkinAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockImplementation(async (value: string) => `clean:${value}`),
    }));
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
    }));
  });

  it('maps rows and converts action/expected HTML through rich text pipeline', async () => {
    const adapter = new DetailedResultsSummaryDataSkinAdapter(
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInTables: true }
    );

    const raw = [
      {
        testId: 11,
        testName: 'TC-11',
        stepNo: 2,
        stepAction: '<p>a</p>',
        stepExpected: '<p>e</p>',
        stepComments: 'actual',
        stepStatus: 'Passed',
      },
    ];

    const result = await adapter.jsonSkinDataAdapter(raw);
    expect(result).toHaveLength(1);
    const fields = result?.[0]?.fields || [];
    expect(fields[0]).toMatchObject({ name: '#', value: '1' });
    expect(fields[4]).toMatchObject({ name: 'Action', value: 'rich:clean:<p>a</p>' });
    expect(fields[5]).toMatchObject({ name: 'Expected Result', value: 'rich:clean:<p>e</p>' });
    expect(fields[6]).toMatchObject({ name: 'Actual Result', value: 'actual' });
    expect(fields[7]).toMatchObject({ name: 'Step Status', value: 'Passed' });
  });

  it('logs and returns undefined when adaptation fails', async () => {
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockRejectedValue(new Error('clean failed')),
    }));
    const adapter = new DetailedResultsSummaryDataSkinAdapter(
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInTables: false }
    );
    const result = await adapter.jsonSkinDataAdapter([{ stepAction: 'x', stepExpected: 'y' } as any]);
    expect(result).toBeUndefined();
    expect((logger as any).error).toHaveBeenCalled();
  });
});
