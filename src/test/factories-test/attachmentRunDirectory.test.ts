// Links and the list of files json-to-word must download are built from the same download result, in
// many places. This runs the real DownloadManager through a real factory and checks they agree: the
// renderer loads "TempFiles/<link>" and json-to-word saves the download list entry at the same path.
import axios from 'axios';
import AttachmentsDataFactory from '../../factories/AttachmentsDataFactory';
import { runContextStore } from '../../services/runContext';

jest.mock('axios');
jest.mock('../../services/logger');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('attachment links and downloads agree on the per-run directory', () => {
  const dgDataProvider: any = {
    getTicketsDataProvider: jest.fn().mockResolvedValue({
      GetWorkitemAttachments: jest.fn().mockResolvedValue([
        { downloadUrl: 'http://ado/attachments/11111111-aaaa/photo.png' },
        { downloadUrl: 'http://ado/attachments/22222222-bbbb/notes.docx' },
      ]),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.downloadManagerUrl = 'http://download-manager';
    mockedAxios.post.mockImplementation(async (_url: string, body: any) => {
      const isImage = /\.png$/.test(body.fileExtension);
      return {
        status: 200,
        data: {
          fileName: `guid-${isImage ? 'img.png' : 'doc.docx'}`,
          attachmentPath: 'http://minio/attachments/x',
          ...(isImage ? { thumbnailName: 'guid-img-thumb.png', thumbnailPath: 'http://minio/attachments/t' } : {}),
        },
      } as any;
    });
  });

  const fetch = () =>
    new AttachmentsDataFactory('Project', '1', 'tpl', dgDataProvider).fetchWiAttachments(
      'attachments',
      'minio:9000',
      'ak',
      'sk',
      'pat'
    );

  test('with a run id every link points into the run directory and matches its download entry', async () => {
    const result: any[] = await runContextStore.run({ runId: 'req-abc' }, fetch);

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(item.attachmentLink).toBe(`TempFiles/${item.minioFileName}`);
      expect(item.attachmentLink.startsWith('TempFiles/run-req-abc/')).toBe(true);
      if (item.minioThumbName) {
        expect(item.tableCellAttachmentLink).toBe(`TempFiles/${item.minioThumbName}`);
        expect(item.tableCellAttachmentLink.startsWith('TempFiles/run-req-abc/')).toBe(true);
      }
    }
  });

  test('without a run id the links stay flat, exactly as before', async () => {
    const result: any[] = await fetch();

    expect(result.map((item) => item.attachmentLink)).toEqual(['TempFiles/guid-img.png', 'TempFiles/guid-doc.docx']);
    expect(result.map((item) => item.minioFileName)).toEqual(['guid-img.png', 'guid-doc.docx']);
  });
});
