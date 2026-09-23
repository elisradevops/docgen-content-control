import DgContentControls from '../../controllers';
import Skins from '@elisra-devops/docgen-skins';
import HtmlUtils from '../../services/htmlUtils';
import RichTextDataFactory from '../../factories/RichTextDataFactory';
import AttachmentsDataFactory from '../../factories/AttachmentsDataFactory';

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

// Description/Steps cleanup goes through HtmlUtils.cleanHtml + RichTextDataFactory (image
// download/embed). Mocked here the same way the STR adapter tests mock them, since the real
// pipeline's network/cheerio behavior is already covered by their own unit tests.
jest.mock('../../services/htmlUtils');
jest.mock('../../factories/RichTextDataFactory');
jest.mock('../../factories/AttachmentsDataFactory');

describe('DgContentControls historical compare report generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockImplementation(async (value: string) => `clean:${value}`),
    }));
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
      attachmentMinioData: [],
    }));
    (AttachmentsDataFactory as jest.Mock).mockImplementation(() => ({
      fetchWiAttachments: jest.fn().mockResolvedValue([]),
    }));
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

  test('generateContentControl cleans Description HTML and embeds images before invoking the time-machine skin', async () => {
    const controller = createController();
    const addNewContentToDocumentSkin = jest.fn(async (_title?, _skinType?, _data?) => [{ type: 'paragraph', runs: [] }]);
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin,
    };
    (controller as any).formattingSettings = { trimAdditionalSpacingInTables: true };
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare-html.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-html.json',
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
          baseline: { asOf: '2025-12-22T17:08:00.000Z', total: 1 },
          compareTo: { asOf: '2025-12-28T08:57:00.000Z', total: 1 },
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
              differences: [
                { field: 'Description', baseline: '<p>old</p>', compareTo: '<p><img src="x"/>new</p>' },
              ],
            },
          ],
        },
      },
    };

    await controller.generateContentControl(payload as any);

    const skinData = addNewContentToDocumentSkin.mock.calls[0][2];
    const diff = skinData.compareResult.rows[0].differences[0];
    // "old"/"new" are diff-highlighted; the <img> tag is preserved as-is (never wrapped).
    expect(diff.baselineDisplay).toBe('<p>2</p>rich:clean:<p><span style="color:#C00000"><s>old</s></span></p>');
    expect(diff.compareToDisplay).toBe(
      '<p>20</p>rich:clean:<p><img src="x"/><span style="color:#107C10">new</span></p>',
    );
    // Raw diff values must stay intact for anything else that still reads them.
    expect(diff.baseline).toBe('<p>old</p>');
  });

  test('generateContentControl collects RichTextDataFactory attachment data from the historical adapter', async () => {
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
      attachmentMinioData: [{ attachmentPath: `path-${text}`, fileName: `file-${text}` }],
    }));
    const controller = createController();
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin: jest.fn(async () => [{ type: 'paragraph', runs: [] }]),
    };
    (controller as any).formattingSettings = {};
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare-attach.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-attach.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: {
        teamProjectName: 'MEWP',
        compareResult: {
          baseline: { asOf: 'a', total: 1 },
          compareTo: { asOf: 'b', total: 1 },
          summary: { updatedCount: 1 },
          rows: [
            {
              id: 11,
              compareStatus: 'Changed',
              baselineRevisionId: 1,
              compareToRevisionId: 2,
              differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
            },
          ],
        },
      },
    };

    await controller.generateContentControl(payload as any);

    // Renamed to json-to-word's AttachmentsData contract (attachmentMinioPath/minioFileName) -
    // passing RichTextDataFactory's raw {attachmentPath, fileName} through crashes document
    // creation with a null Uri on the .NET side.
    expect((controller as any).minioAttachmentData).toEqual([
      { attachmentMinioPath: 'path-clean:<p>old</p>', minioFileName: 'file-clean:<p>old</p>' },
      { attachmentMinioPath: 'path-clean:<p>new</p>', minioFileName: 'file-clean:<p>new</p>' },
    ]);
  });

  test('generateContentControl re-fetches the compare result server-side when the payload only carries queryId + as-of timestamps', async () => {
    const controller = createController();
    const compareHistoricalQueryResults = jest.fn().mockResolvedValue({
      queryName: 'Refetched Query',
      baseline: { asOf: '2025-12-22T17:08:00.000Z', total: 1 },
      compareTo: { asOf: '2025-12-28T08:57:00.000Z', total: 1 },
      summary: { updatedCount: 1 },
      rows: [
        {
          id: 11,
          workItemType: 'Requirement',
          title: 'Req-11',
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Test Phase', baseline: 'FAT', compareTo: 'FAT; ATP' }],
        },
      ],
    });
    const getTicketsDataProvider = jest.fn().mockResolvedValue({
      CompareHistoricalQueryResults: compareHistoricalQueryResults,
    });
    (controller as any).dgDataProviderAzureDevOps = { getTicketsDataProvider };
    const addNewContentToDocumentSkin = jest.fn(async (_title?, _skinType?, _data?) => [{ type: 'paragraph', runs: [] }]);
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin,
    };
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare-lean.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-lean.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: {
        teamProjectName: 'MEWP',
        queryName: 'Shared Query',
        queryId: 'q-1',
        baselineAsOf: '2025-12-22T17:08:00.000Z',
        compareToAsOf: '2025-12-28T08:57:00.000Z',
      },
    };

    await controller.generateContentControl(payload as any);

    expect(getTicketsDataProvider).toHaveBeenCalled();
    expect(compareHistoricalQueryResults).toHaveBeenCalledWith(
      'q-1',
      'MEWP',
      '2025-12-22T17:08:00.000Z',
      '2025-12-28T08:57:00.000Z',
    );
    const skinData = addNewContentToDocumentSkin.mock.calls[0][2];
    expect(skinData.compareResult.rows[0].id).toBe(11);
  });

  test('generateContentControl throws a clear error when neither an inline compareResult nor queryId+timestamps are provided', async () => {
    const controller = createController();
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin: jest.fn(),
    };

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: { teamProjectName: 'MEWP' },
    };

    await expect(controller.generateContentControl(payload as any)).rejects.toThrow(
      /queryId \+ baselineAsOf \+ compareToAsOf/,
    );
  });

  test('fallback paragraph/table composition uses cleaned display values for HTML-bearing differences', async () => {
    const controller = createController();
    const addNewContentToDocumentSkin = jest.fn(async (_title, skinType, tableRows) => {
      if (skinType === 'time-machine-report') {
        throw new Error('Unknown skinType : time-machine-report - not appended to document skin');
      }
      if (skinType === 'table') {
        return [{ type: 'table', Rows: [], __tableRows: tableRows }];
      }
      return [{ type: 'paragraph', runs: [{ text: 'fallback' }] }];
    });
    (controller as any).skins = {
      SKIN_TYPE_PARAGRAPH: 'paragraph',
      SKIN_TYPE_TABLE: 'table',
      addNewContentToDocumentSkin,
    };
    jest
      .spyOn(controller as any, 'writeToJson')
      .mockResolvedValue('/tmp/historical-compare-fallback-html.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-fallback-html.json',
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
          baseline: { asOf: '2025-12-22T17:08:00.000Z', total: 1 },
          compareTo: { asOf: '2025-12-28T08:57:00.000Z', total: 1 },
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
              differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
            },
          ],
        },
      },
    };

    await controller.generateContentControl(payload as any);

    const diffTableCall = addNewContentToDocumentSkin.mock.calls.find(
      (call) =>
        call[1] === 'table' &&
        Array.isArray(call[2]) &&
        call[2][0]?.fields?.some((f: any) => f.name === 'Baseline'),
    );
    expect(diffTableCall).toBeTruthy();
    const baselineField = diffTableCall[2][0].fields.find((f: any) => f.name === 'Baseline');
    const compareField = diffTableCall[2][0].fields.find((f: any) => f.name === 'Compare to');
    expect(baselineField.value).toBe('<p>2</p>rich:clean:<p><span style="color:#C00000"><s>old</s></span></p>');
    expect(compareField.value).toBe('<p>20</p>rich:clean:<p><span style="color:#107C10">new</span></p>');
  });

  test('generateContentControl fetches and matches per-step attachments for a row with a Steps difference', async () => {
    (AttachmentsDataFactory as jest.Mock).mockImplementation(() => ({
      fetchWiAttachments: jest.fn().mockResolvedValue([
        {
          // Created after the baseline revision - noted as newly added.
          attachmentComment: '[TestStep=step-1]',
          attachmentFileName: 'screenshot.png',
          attachmentLink: 'TempFiles/screenshot.png',
          tableCellAttachmentLink: 'TempFiles/screenshot-thumb.png',
          attachmentMinioPath: 'minio/screenshot.png',
          minioFileName: 'screenshot.png',
          attachmentCreatedDate: '2025-06-01T00:00:00Z',
        },
        {
          // Matches the same step but predates baseline - already existed, so it's not noted.
          attachmentComment: '[TestStep=step-1]',
          attachmentFileName: 'pre-existing.png',
          attachmentMinioPath: 'minio/pre-existing.png',
          minioFileName: 'pre-existing.png',
          attachmentCreatedDate: '2024-01-01T00:00:00Z',
        },
        {
          attachmentComment: 'unrelated, no step marker',
          attachmentFileName: 'other.png',
          attachmentMinioPath: 'minio/other.png',
          minioFileName: 'other.png',
          attachmentCreatedDate: '2025-06-01T00:00:00Z',
        },
      ]),
    }));
    const controller = createController();
    const addNewContentToDocumentSkin = jest.fn(async (_title?, _skinType?, _data?) => [{ type: 'paragraph', runs: [] }]);
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin,
    };
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare-steps-attach.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-steps-attach.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: {
        teamProjectName: 'MEWP',
        compareResult: {
          baseline: { asOf: '2025-01-01T00:00:00Z', total: 1 },
          compareTo: { asOf: '2025-12-01T00:00:00Z', total: 1 },
          summary: { updatedCount: 1 },
          rows: [
            {
              id: 42,
              compareStatus: 'Changed',
              baselineRevisionId: 1,
              compareToRevisionId: 2,
              differences: [
                {
                  field: 'Steps',
                  baseline: '',
                  compareTo: '',
                  baselineSteps: [{ stepId: 'step-1', stepPosition: '1', action: 'Open app', expected: 'App opens' }],
                  compareToSteps: [
                    { stepId: 'step-1', stepPosition: '1', action: 'Open the app', expected: 'App opens' },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    await controller.generateContentControl(payload as any);

    // Fetched once, for the work item that actually carries a Steps difference.
    expect(AttachmentsDataFactory).toHaveBeenCalledWith('MEWP', '42', '', (controller as any).dgDataProviderAzureDevOps);
    const skinData = addNewContentToDocumentSkin.mock.calls[0][2];
    const diff = skinData.compareResult.rows[0].differences[0];
    const [updatedRow, previousRow] = diff.stepsTableRows;
    const attachmentsField = updatedRow.fields.find((f: any) => f.name === 'Attachments');
    // Only the attachment matching this step's [TestStep=<id>] marker AND created after the
    // baseline revision is noted - the unrelated one (no marker) and the pre-existing one
    // (predates baseline) are both silently omitted.
    expect(attachmentsField.value).toBe('<p>Attachment added: screenshot.png</p>');
    // The note is identical on both rows of a pair - attachments aren't revision-scoped.
    expect(previousRow.fields.find((f: any) => f.name === 'Attachments').value).toBe(
      '<p>Attachment added: screenshot.png</p>',
    );
    // All three fetched attachments are still queued for MinIO upload regardless of per-step
    // matching or the added/pre-existing distinction - the file itself may still be referenced
    // elsewhere in the document.
    expect((controller as any).minioAttachmentData).toEqual(
      expect.arrayContaining([
        { attachmentMinioPath: 'minio/screenshot.png', minioFileName: 'screenshot.png' },
        { attachmentMinioPath: 'minio/pre-existing.png', minioFileName: 'pre-existing.png' },
        { attachmentMinioPath: 'minio/other.png', minioFileName: 'other.png' },
      ]),
    );
  });

  test('generateContentControl degrades gracefully when fetching Steps attachments fails for one work item', async () => {
    (AttachmentsDataFactory as jest.Mock).mockImplementation(() => ({
      fetchWiAttachments: jest.fn().mockRejectedValue(new Error('network down')),
    }));
    const controller = createController();
    const addNewContentToDocumentSkin = jest.fn(async (_title?, _skinType?, _data?) => [{ type: 'paragraph', runs: [] }]);
    (controller as any).skins = {
      SKIN_TYPE_TIME_MACHINE: 'time-machine-report',
      addNewContentToDocumentSkin,
    };
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/historical-compare-steps-attach-fail.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'historical-compare-steps-attach-fail.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'historical-compare-report',
      title: 'historical-compare-report-content-control',
      headingLevel: 1,
      data: {
        teamProjectName: 'MEWP',
        compareResult: {
          baseline: { asOf: 'a', total: 1 },
          compareTo: { asOf: 'b', total: 1 },
          summary: { updatedCount: 1 },
          rows: [
            {
              id: 43,
              compareStatus: 'Changed',
              baselineRevisionId: 1,
              compareToRevisionId: 2,
              differences: [
                {
                  field: 'Steps',
                  baseline: '',
                  compareTo: '',
                  baselineSteps: [{ stepId: 'step-1', stepPosition: '1', action: 'Open app', expected: 'App opens' }],
                  compareToSteps: [
                    { stepId: 'step-1', stepPosition: '1', action: 'Open the app', expected: 'App opens' },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    // Must not throw - a fetch failure for one work item is logged and skipped.
    await expect(controller.generateContentControl(payload as any)).resolves.not.toThrow();
    const skinData = addNewContentToDocumentSkin.mock.calls[0][2];
    const diff = skinData.compareResult.rows[0].differences[0];
    // No attachment notes anywhere in this table (fetch failed) - the Attachments column is
    // dropped entirely rather than rendering an empty cell on every row.
    const attachmentsField = diff.stepsTableRows[0].fields.find((f: any) => f.name === 'Attachments');
    expect(attachmentsField).toBeUndefined();
  });
});
