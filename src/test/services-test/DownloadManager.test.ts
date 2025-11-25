import DownloadManager from '../../services/DownloadManager';
import logger from '../../services/logger';
import axios from 'axios';

jest.mock('axios');

jest.mock('../../services/logger', () => ({
  info: jest.fn(),
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
      expect((logger as any).info).toHaveBeenCalledWith(expect.stringContaining('downloaded to :'));
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
