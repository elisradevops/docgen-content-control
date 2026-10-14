import DownloadManager from '../../services/DownloadManager';
import logger from '../../services/logger';
import axios from 'axios';
import { runContextStore } from '../../services/runContext';

jest.mock('axios');

jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DownloadManager', () => {
  const bucketName = 'test-bucket';
  const endpoint = 'https://minio.example.com';
  const accessKey = 'access';
  const secretKey = 'secret';
  const projectName = 'project1';
  const pat = 'pat-token';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.downloadManagerUrl = 'http://download-manager';
  });

  describe('constructor and helpers', () => {
    it('should derive file extension from file name', () => {
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        'url',
        'file.test.txt',
        projectName,
        pat
      );
      expect(dm.fileExtension).toBe('.txt');
    });

    it('isBase64String should detect data URLs correctly', () => {
      const dm: any = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        'url',
        'file.bin',
        projectName,
        pat
      );

      expect(dm.isBase64String('data:image/png;base64,AAA')).toBe(true);
      expect(dm.isBase64String('http://example.com/image.png')).toBe(false);
      expect(dm.isBase64String('data:;base64,')).toBe(true);
    });

    it('convertToWinodwsPath should convert linux path to windows path', () => {
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        'url',
        'file.bin',
        projectName,
        pat
      );
      const result = dm.convertToWinodwsPath('/folder/sub/file.bin');
      expect(result).toBe('C:\\folder\\sub\\file.bin');
    });
  });

  describe('downloadFile - per-run local names', () => {
    const response = {
      status: 200,
      data: {
        fileName: 'guid.png',
        attachmentPath: 'http://minio/attachments/guid.png',
        thumbnailName: 'guid-thumb.png',
        thumbnailPath: 'http://minio/attachments/guid-thumb.png',
      },
    };
    const newDm = (url = 'http://ado/attachments/x') =>
      new DownloadManager(bucketName, endpoint, accessKey, secretKey, url, 'x.png', projectName, pat);

    it('prefixes the local file and thumbnail names with the run directory, not the MinIO locations', async () => {
      mockedAxios.post.mockResolvedValue({ ...response, data: { ...response.data } } as any);

      const result = await runContextStore.run({ runId: 'req-77' }, () => newDm().downloadFile());

      expect(result.fileName).toBe('run-req-77/guid.png');
      expect(result.thumbnailName).toBe('run-req-77/guid-thumb.png');
      expect(result.attachmentPath).toBe('http://minio/attachments/guid.png');
      expect(result.thumbnailPath).toBe('http://minio/attachments/guid-thumb.png');
    });

    it('applies to base64 uploads too', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: { fileName: 'img.png' } } as any);

      const result = await runContextStore.run({ runId: 'req-77' }, () =>
        newDm('data:image/png;base64,AAAA').downloadFile()
      );

      expect(result.fileName).toBe('run-req-77/img.png');
    });

    it('leaves the names flat when there is no run id', async () => {
      mockedAxios.post.mockResolvedValue({ ...response, data: { ...response.data } } as any);

      const result = await newDm().downloadFile();

      expect(result.fileName).toBe('guid.png');
      expect(result.thumbnailName).toBe('guid-thumb.png');
    });

    it('still returns null for a non-200 response', async () => {
      mockedAxios.post.mockResolvedValue({ status: 204, data: undefined } as any);

      expect(await runContextStore.run({ runId: 'req-77' }, () => newDm().downloadFile())).toBeNull();
    });
  });

  describe('downloadFile - placeholder for a failed download', () => {
    const newDm = (url: string) =>
      new DownloadManager(bucketName, endpoint, accessKey, secretKey, url, 'x.png', projectName, pat);
    const placeholder = {
      status: 200,
      data: { fileName: 'bad-attachment.png', attachmentPath: 'http://minio/attachments/bad-attachment.png' },
    };

    it('warns with the source URL and project, and still returns the placeholder', async () => {
      mockedAxios.post.mockResolvedValue({ ...placeholder, data: { ...placeholder.data } } as any);

      const result = await newDm('http://ado/_apis/wit/attachments/abc').downloadFile();

      expect(result.fileName).toBe('bad-attachment.png');
      expect((logger as any).warn).toHaveBeenCalledTimes(1);
      const message = (logger as any).warn.mock.calls[0][0];
      expect(message).toContain('http://ado/_apis/wit/attachments/abc');
      expect(message).toContain('project1');
      expect(message).not.toContain(pat);
    });

    it('does not put an inline image into the log', async () => {
      mockedAxios.post.mockResolvedValue({ ...placeholder, data: { ...placeholder.data } } as any);

      await newDm('data:image/png;base64,AAAA').downloadFile();

      const message = (logger as any).warn.mock.calls[0][0];
      expect(message).toContain('inline image');
      expect(message).not.toContain('AAAA');
    });

    it('does not warn for a normal download', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: { fileName: 'guid.png' } } as any);

      await newDm('http://ado/attachments/x').downloadFile();

      expect((logger as any).warn).not.toHaveBeenCalled();
    });
  });

  describe('downloadFile', () => {
    it('should upload base64 content in chunks when downloadUrl is a data URL', async () => {
      const base64 = 'data:image/png;base64,' + 'A'.repeat(3 * 1024); // small but valid-looking base64
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        base64,
        'image.png',
        projectName,
        pat
      );

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { fileName: 'image.png', filePath: '/tmp/image.png' },
      } as any);

      const result = await dm.downloadFile();

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, body]: any = mockedAxios.post.mock.calls[0];
      expect(url).toBe('http://download-manager/uploadAttachment');
      expect(body.bucketName).toBe(bucketName);
      expect(body.minioEndPoint).toBe('minio.example.com');
      expect(body.isBase64).toBe(true);
      expect(Array.isArray(body.base64Content)).toBe(true);
      expect(result).toEqual({ fileName: 'image.png', filePath: '/tmp/image.png' });
    });

    it('should upload by URL when downloadUrl is not base64 and return data on 200', async () => {
      const url = 'http://example.com/file.txt';
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        url,
        'file.txt',
        projectName,
        pat
      );

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { fileName: 'file.txt', filePath: '/tmp/file.txt' },
      } as any);

      const result = await dm.downloadFile();

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [calledUrl, body]: any = mockedAxios.post.mock.calls[0];
      expect(calledUrl).toBe('http://download-manager/uploadAttachment');
      expect(body.downloadUrl).toBe(url);
      expect(body.bucketName).toBe(bucketName);
      expect(body.minioEndPoint).toBe('minio.example.com');
      expect(result).toEqual({ fileName: 'file.txt', filePath: '/tmp/file.txt' });
      // Was JSON.stringify'd inline into the message (a crash risk on circular data / BigInt);
      // now passed as meta and logged as a separate arg — see docgen-log-redaction / Phase 2.
      expect((logger as any).info).toHaveBeenCalledWith('downloaded to', { fileName: 'file.txt', filePath: '/tmp/file.txt' });
    });

    it('should return null when upload by URL responds with non-200 status', async () => {
      const url = 'http://example.com/file.txt';
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        url,
        'file.txt',
        projectName,
        pat
      );

      mockedAxios.post.mockResolvedValue({
        status: 500,
        data: { error: 'failed' },
      } as any);

      const result = await dm.downloadFile();

      expect(result).toBeNull();
    });

    it('should log and rethrow errors when upload by URL fails', async () => {
      const url = 'http://example.com/file.txt';
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        url,
        'file.txt',
        projectName,
        pat
      );

      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(dm.downloadFile()).rejects.toThrow('Network error');
      expect((logger as any).error).toHaveBeenCalledWith(`error downloading : ${url}`);
    });

    it('should log and rethrow errors when processing base64 content fails', async () => {
      const base64 = 'data:image/png;base64,' + 'A'.repeat(1024);
      const dm = new DownloadManager(
        bucketName,
        endpoint,
        accessKey,
        secretKey,
        base64,
        'image.png',
        projectName,
        pat
      );

      mockedAxios.post.mockRejectedValue(new Error('Chunk upload failed'));

      await expect(dm.downloadFile()).rejects.toThrow('Chunk upload failed');

      // First from sendBase64Chunks, then from outer downloadFile catch
      expect((logger as any).error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing base64 content: Chunk upload failed')
      );
      expect((logger as any).error).toHaveBeenCalledWith(`error downloading : ${base64}`);
    });
  });
});
