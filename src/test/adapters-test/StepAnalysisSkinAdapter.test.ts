import StepAnalysisSkinAdapter from '../../adapters/StepAnalysisSkinAdapter';
import TestResultsAttachmentDataFactory from '../../factories/TestResultsAttachmentDataFactory';
import logger from '../../services/logger';

jest.mock('../../factories/TestResultsAttachmentDataFactory');
jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('StepAnalysisSkinAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders suite/test headers and default message when no analysis content exists', async () => {
    const adapter = new StepAnalysisSkinAdapter(
      {} as any,
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat'
    );

    const rows = await adapter.jsonSkinDataAdapter(
      [
        {
          testSuiteId: 1,
          testSuiteName: 'Suite A',
          testCaseName: 'TC-1',
        },
      ] as any,
      { generateRunAttachments: { isEnabled: false } }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toMatchObject({ type: 'Header', level: 1 });
    expect(rows[0][1]).toMatchObject({ type: 'SubHeader', level: 2 });
    expect(rows[0][2]).toMatchObject({
      field: { name: 'Description', value: 'No comments are available for this suite' },
    });
  });

  it('generates and renders analysis/case/step attachments including minio metadata', async () => {
    (TestResultsAttachmentDataFactory as unknown as jest.Mock).mockImplementation(() => ({
      generateTestResultsAttachments: jest.fn().mockResolvedValue({
        analysisLevel: [
          {
            attachmentFileName: 'analysis.docx',
            attachmentLink: 'http://analysis',
            attachmentMinioPath: 'minio/analysis',
            minioFileName: 'analysis.docx',
          },
        ],
        caseLevel: [
          {
            attachmentFileName: 'case.png',
            attachmentLink: 'http://case',
            attachmentMinioPath: 'minio/case',
            minioFileName: 'case.png',
          },
        ],
        '1-2': [
          {
            attachmentFileName: 'step.doc',
            attachmentLink: 'http://step',
            attachmentMinioPath: 'minio/step',
            minioFileName: 'step.doc',
            ThumbMinioPath: 'minio/step-thumb',
            minioThumbName: 'step-thumb.png',
          },
        ],
      }),
    }));

    const adapter = new StepAnalysisSkinAdapter(
      {} as any,
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat'
    );

    const rows = await adapter.jsonSkinDataAdapter(
      [
        {
          testSuiteId: 1,
          testSuiteName: 'Suite A',
          testCaseName: 'TC-1',
          comment: 'Top comment',
          iteration: { comment: 'Iteration comment' },
          lastRunId: 100,
          lastResultId: 200,
        },
      ] as any,
      {
        generateRunAttachments: {
          isEnabled: true,
          includeAttachmentContent: true,
          attachmentType: 'asEmbedded',
        },
      } as any
    );

    const flattened = rows[0];
    expect(flattened.some((entry: any) => entry?.type === 'File')).toBe(true);
    expect(
      flattened.some(
        (entry: any) => entry?.field?.value === 'Analysis Result:' || entry?.field?.value === 'Step #2'
      )
    ).toBe(true);

    const minio = adapter.getAttachmentMinioData();
    expect(minio).toEqual(
      expect.arrayContaining([
        { attachmentMinioPath: 'minio/analysis', minioFileName: 'analysis.docx' },
        { attachmentMinioPath: 'minio/step-thumb', minioFileName: 'step-thumb.png' },
      ])
    );
  });

  it('logs and throws when attachment generation fails', async () => {
    (TestResultsAttachmentDataFactory as unknown as jest.Mock).mockImplementation(() => ({
      generateTestResultsAttachments: jest.fn().mockRejectedValue(new Error('boom')),
    }));
    const adapter = new StepAnalysisSkinAdapter(
      {} as any,
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat'
    );

    await expect(
      adapter.jsonSkinDataAdapter(
        [
          {
            testSuiteId: 1,
            testSuiteName: 'Suite A',
            testCaseName: 'TC-1',
            lastRunId: 100,
            lastResultId: 200,
          },
        ] as any,
        {
          generateRunAttachments: {
            isEnabled: true,
            includeAttachmentContent: true,
            attachmentType: 'asEmbedded',
          },
        } as any
      )
    ).rejects.toThrow('boom');

    expect((logger as any).error).toHaveBeenCalled();
  });
});
