import HistoricalCompareDataSkinAdapter from '../../adapters/HistoricalCompareDataSkinAdapter';
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

describe('HistoricalCompareDataSkinAdapter', () => {
  const createAdapter = (formattingSettings: any = { trimAdditionalSpacingInTables: true }) =>
    new HistoricalCompareDataSkinAdapter(
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      formattingSettings,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockImplementation(async (value: string) => `clean:${value}`),
    }));
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
      attachmentMinioData: [],
    }));
  });

  it('cleans a Description difference and prefixes the revision id as its own paragraph', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    expect(diff.baselineDisplay).toBe('<p>2</p>rich:clean:<p>old</p>');
    expect(diff.compareToDisplay).toBe('<p>20</p>rich:clean:<p>new</p>');
    // Original raw fields are preserved untouched.
    expect(diff.baseline).toBe('<p>old</p>');
    expect(diff.compareTo).toBe('<p>new</p>');
  });

  it('leaves scalar-field differences (e.g. Test Phase) untouched', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Test Phase', baseline: 'FAT', compareTo: 'FAT; ATP' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    expect(result.rows[0].differences[0]).toEqual({ field: 'Test Phase', baseline: 'FAT', compareTo: 'FAT; ATP' });
  });

  it('renders parsed Action/Expected steps per side when the provider attached them', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 701,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [
            {
              field: 'Steps',
              baseline: '<steps>raw-baseline</steps>',
              compareTo: '<steps>raw-compare</steps>',
              baselineSteps: [{ stepPosition: '1', action: 'Open app', expected: 'Login shown' }],
              compareToSteps: [{ stepPosition: '1', action: 'Open app', expected: 'Dashboard shown' }],
            },
          ],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    expect(diff.baselineDisplay).toBe(
      '<p>1</p><p><b>1. Action:</b></p>rich:clean:Open app<p><b>Expected:</b></p>rich:clean:Login shown',
    );
    expect(diff.compareToDisplay).toBe(
      '<p>2</p><p><b>1. Action:</b></p>rich:clean:Open app<p><b>Expected:</b></p>rich:clean:Dashboard shown',
    );
  });

  it('falls back to cleaning the raw Steps XML when no parsed steps are attached', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 801,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [
            {
              field: 'Steps',
              baseline: '<steps>raw-baseline</steps>',
              compareTo: '<steps>raw-compare</steps>',
              baselineSteps: [],
              compareToSteps: [],
            },
          ],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    expect(diff.baselineDisplay).toBe('<p>1</p>rich:clean:<steps>raw-baseline</steps>');
    expect(diff.compareToDisplay).toBe('<p>2</p>rich:clean:<steps>raw-compare</steps>');
  });

  it('collects attachment MinIO data emitted while cleaning images across all differences', async () => {
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
      attachmentMinioData: [{ attachmentPath: `path-for-${text}`, fileName: `file-for-${text}` }],
    }));
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
        },
      ],
    };

    await adapter.adapt(compareResult);
    expect(adapter.attachmentMinioData).toEqual([
      { attachmentPath: 'path-for-clean:<p>old</p>', fileName: 'file-for-clean:<p>old</p>' },
      { attachmentPath: 'path-for-clean:<p>new</p>', fileName: 'file-for-clean:<p>new</p>' },
    ]);
  });

  it('rows with no differences (e.g. Added/Deleted) pass through unchanged', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [{ id: 5, compareStatus: 'Added', differences: [] }],
    };
    const result = await adapter.adapt(compareResult);
    expect(result.rows[0]).toEqual({ id: 5, compareStatus: 'Added', differences: [] });
  });

  it('logs and returns the original compareResult when cleanup fails', async () => {
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockRejectedValue(new Error('clean failed')),
    }));
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    expect(result).toBe(compareResult);
    expect((logger as any).error).toHaveBeenCalled();
  });
});
