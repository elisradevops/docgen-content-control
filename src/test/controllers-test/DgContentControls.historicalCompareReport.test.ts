import DgContentControls from '../../controllers';
import Skins from '@elisra-devops/docgen-skins';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@elisra-devops/docgen-data-provider', () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock('@elisra-devops/docgen-skins', () => {
  return jest.fn().mockImplementation(() => ({
    SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
    addNewContentToDocumentSkin: jest.fn(async () => [{ type: 'paragraph', runs: [{ text: 'Difference' }] }]),
    getDocumentSkin: jest.fn(() => ({ templatePath: '', contentControls: [] })),
  }));
});

describe('DgContentControls historical compare report generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createController = () =>
    new DgContentControls(
      'https://dev.azure.com/org/',
      'pat',
      'attachments',
      'MEWP',
      'json',
      '',
      'http://minio:9000',
      'ak',
      'sk',
    );

  test('init keeps an empty template path and initializes skins with it', async () => {
    const controller = createController();
    await controller.init();
    expect((controller as any).templatePath).toBe('');
    expect(Skins).toHaveBeenCalledWith('json', '');
  });

  test('generateContentControl routes historical-compare-report to skins time-machine-report', async () => {
    const controller = createController();
    const addNewContentToDocumentSkin = jest.fn(async () => [
      { type: 'paragraph', runs: [{ text: 'Difference' }] },
      { type: 'table', Rows: [] },
    ]);
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin,
    };
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: {
        teamProjectName: 'MEWP',
        queryName: 'Shared Query',
        compareResult: {
          baseline: { asOf: '2025-12-22T17:08:00.000Z', total: 4 },
          compareTo: { asOf: '2025-12-28T08:57:00.000Z', total: 4 },
          summary: { updatedCount: 1 },
          rows: [],
        },
      },
    };

    await controller.generateContentControl(payload as any);

    expect(addNewContentToDocumentSkin).toHaveBeenCalledWith(
      'historical-compare-report-content-control',
      'time-machine-report',
      expect.objectContaining({
        teamProjectName: 'MEWP',
        queryName: 'Shared Query',
      }),
      expect.objectContaining({
        isBold: true,
        Size: 10,
      }),
      expect.objectContaining({
        isBold: false,
        Size: 10,
      }),
      1,
    );
    expect((controller as any).writeToJson).toHaveBeenCalledWith([
      {
        title: 'historical-compare-report-content-control',
        wordObjects: [
          { type: 'paragraph', runs: [{ text: 'Difference' }] },
          { type: 'table', Rows: [] },
        ],
      },
    ]);
  });

  test('generateContentControl falls back to paragraph/table composition when time-machine skin is unavailable', async () => {
    const controller = createController();
    const addNewContentToDocumentSkin = jest.fn(async (_title, skinType) => {
      if (skinType === 'time-machine-report') {
        throw new Error('Unknown skinType : time-machine-report - not appended to document skin');
      }
      if (skinType === 'paragraph') {
        return [{ type: 'paragraph', runs: [{ text: 'fallback' }] }];
      }
      return [{ type: 'table', Rows: [] }];
    });
    (controller as any).skins = {
      SKIN_TYPE_PARAGRAPH: 'paragraph',
      SKIN_TYPE_TABLE: 'table',
      addNewContentToDocumentSkin,
    };
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare-fallback.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-fallback.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: {
        teamProjectName: 'MEWP',
        queryName: 'Shared Query',
        compareResult: {
          baseline: { asOf: '2025-12-22T17:08:00.000Z', total: 4 },
          compareTo: { asOf: '2025-12-28T08:57:00.000Z', total: 4 },
          summary: { updatedCount: 1 },
          rows: [
            {
              id: 11,
              workItemType: 'Requirement',
              title: 'Req-11',
              workItemUrl: 'https://dev.azure.com/org/project/_workitems/edit/11',
              baselineRevisionId: 2,
              compareToRevisionId: 20,
              compareStatus: 'Changed',
              differences: [{ field: 'Test Phase', baseline: 'FAT', compareTo: 'FAT; ATP' }],
            },
          ],
        },
      },
    };

    await controller.generateContentControl(payload as any);

    expect(addNewContentToDocumentSkin).toHaveBeenCalled();
    expect(addNewContentToDocumentSkin.mock.calls[0][1]).toBe('time-machine-report');
    expect(
      addNewContentToDocumentSkin.mock.calls.some(
        (call) => call[1] === 'paragraph' || call[1] === 'table',
      ),
    ).toBe(true);
    expect((controller as any).writeToJson).toHaveBeenCalled();
  });
});
