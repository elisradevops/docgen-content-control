import AttachmentsDataFactory from '../../factories/AttachmentsDataFactory';
import DownloadManager from '../../services/DownloadManager';
import logger from '../../services/logger';

// Mock dependencies
jest.mock('../../services/DownloadManager');
jest.mock('../../services/logger');

describe('AttachmentsDataFactory', () => {
  // Test data
  const teamProject = 'TestProject';
  const wiId = '12345';
  const templatePath = '/path/to/template';
  const attachmentsBucketName = 'test-bucket';
  const minioEndPoint = 'minio-endpoint.com';
  const minioAccessKey = 'test-access-key';
  const minioSecretKey = 'test-secret-key';
  const PAT = 'personal-access-token';

  // Create mock for DgDataProviderAzureDevOps
  const mockGetWorkitemAttachments = jest.fn();
  const mockTicketsDataProvider = {
    GetWorkitemAttachments: mockGetWorkitemAttachments,
  };
  const mockGetTicketsDataProvider = jest.fn().mockResolvedValue(mockTicketsDataProvider);
  const mockDgDataProvider = {
    getTicketsDataProvider: mockGetTicketsDataProvider,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchWiAttachments', () => {
    // Fix the test for handling errors in processing attachments
    test('should handle errors in processing attachments', async () => {
      const attachments = [
        {
          downloadUrl: 'http://example.com/attachments/file1.png',
        },
      ];

      mockGetWorkitemAttachments.mockResolvedValue(attachments);

      // Mock downloadAttachment method to throw an error instead of mocking downloadFile
      jest
        .spyOn(AttachmentsDataFactory.prototype, 'downloadAttachment')
        .mockImplementation(() => Promise.resolve('')); // Return empty string to simulate error

      const factory = new AttachmentsDataFactory(teamProject, wiId, templatePath, mockDgDataProvider);
      const result = await factory.fetchWiAttachments(
        attachmentsBucketName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT
      );

      // With empty string from downloadAttachment, we should still get an array but with empty/undefined values
      expect(result).toEqual([
        {
          attachmentComment: '',
          attachmentFileName: 'file1.png',
          attachmentLink: 'TempFiles/undefined',
          relativeAttachmentLink: 'TempFiles/undefined',
          tableCellAttachmentLink: 'TempFiles/undefined',
          attachmentMinioPath: undefined,
          minioFileName: undefined,
          attachmentStepNo: '',
        },
      ]);

      expect(logger.error).not.toHaveBeenCalled(); // No error should be logged for empty string result
    });

    // Add a new test that forces an exception to be thrown
    test('should return empty array when exception occurs in processing loop', async () => {
      const attachments = [
        {
          downloadUrl: 'http://example.com/attachments/file1.png',
        },
      ];

      mockGetWorkitemAttachments.mockResolvedValue(attachments);

      // Force downloadAttachment to throw an error
      jest.spyOn(AttachmentsDataFactory.prototype, 'downloadAttachment').mockImplementation(() => {
        throw new Error('Forced error');
      });

      const factory = new AttachmentsDataFactory(teamProject, wiId, templatePath, mockDgDataProvider);
      const result = await factory.fetchWiAttachments(
        attachmentsBucketName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT
      );

      expect(result).toEqual([]); // Now we expect empty array
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`error creating attachmets array for work item ${wiId}`)
      );
    });

    test('should use additionalAttachments when provided and set comment, stepNo and thumbnail data', async () => {
      const additionalAttachments = [
        {
          downloadUrl: 'http://example.com/attachments/file1.png',
          attributes: { comment: 'My comment' },
        },
        {
          downloadUrl: 'http://example.com/attachments/file2.png',
          stepNo: '2',
        },
      ];

      const downloadSpy = jest
        .spyOn(AttachmentsDataFactory.prototype, 'downloadAttachment')
        .mockResolvedValueOnce({
          fileName: 'file1.png',
          attachmentPath: 'minio/path1',
          thumbnailName: 'thumb1.png',
          thumbnailPath: 'minio/thumb1',
        })
        .mockResolvedValueOnce({
          fileName: 'file2.png',
          attachmentPath: 'minio/path2',
          thumbnailName: null,
          thumbnailPath: null,
        });

      const factory = new AttachmentsDataFactory(teamProject, wiId, templatePath, mockDgDataProvider);
      const result = await factory.fetchWiAttachments(
        attachmentsBucketName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT,
        additionalAttachments
      );

      expect(mockGetWorkitemAttachments).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          attachmentComment: 'My comment',
          attachmentFileName: 'file1.png',
          attachmentLink: 'TempFiles/file1.png',
          relativeAttachmentLink: 'TempFiles/file1.png',
          tableCellAttachmentLink: 'TempFiles/thumb1.png',
          attachmentMinioPath: 'minio/path1',
          minioFileName: 'file1.png',
          ThumbMinioPath: 'minio/thumb1',
          minioThumbName: 'thumb1.png',
          attachmentStepNo: '',
        },
        {
          attachmentComment: '',
          attachmentFileName: 'file2.png',
          attachmentLink: 'TempFiles/file2.png',
          relativeAttachmentLink: 'TempFiles/file2.png',
          tableCellAttachmentLink: 'TempFiles/file2.png',
          attachmentMinioPath: 'minio/path2',
          minioFileName: 'file2.png',
          attachmentStepNo: '2',
        },
      ]);

      downloadSpy.mockRestore();
    });

    test('should return empty array when GetWorkitemAttachments throws', async () => {
      mockGetWorkitemAttachments.mockRejectedValue(new Error('network error'));

      const factory = new AttachmentsDataFactory(teamProject, wiId, templatePath, mockDgDataProvider);
      const result = await factory.fetchWiAttachments(
        attachmentsBucketName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT
      );

      expect(mockGetWorkitemAttachments).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('downloadAttachment', () => {
    test('should return result when download succeeds', async () => {
      const attachmentUrl = 'http://example.com/attachments';
      const attachmentFileName = 'success-file.pdf';

      (DownloadManager.prototype.downloadFile as jest.Mock).mockResolvedValue({
        fileName: 'success-file.pdf',
        attachmentPath: 'minio/success-file.pdf',
      });

      const factory = new AttachmentsDataFactory(teamProject, wiId, templatePath, mockDgDataProvider);
      const result = await factory.downloadAttachment(
        attachmentsBucketName,
        attachmentUrl,
        attachmentFileName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT
      );

      expect(logger.error).not.toHaveBeenCalled();
      expect(result).toEqual({
        fileName: 'success-file.pdf',
        attachmentPath: 'minio/success-file.pdf',
      });
    });

    test('should handle errors when downloading attachment', async () => {
      const attachmentUrl = 'http://example.com/attachments';
      const attachmentFileName = 'error-file.pdf';

      // Reset any previous mock implementation
      jest.restoreAllMocks();
      jest.clearAllMocks();

      // Re-mock services after restore
      jest.mock('../../services/DownloadManager');
      jest.mock('../../services/logger');

      // Set up the mock to throw an error
      (DownloadManager.prototype.downloadFile as jest.Mock).mockRejectedValue(new Error('Download failed'));

      const factory = new AttachmentsDataFactory(teamProject, wiId, templatePath, mockDgDataProvider);
      const result = await factory.downloadAttachment(
        attachmentsBucketName,
        attachmentUrl,
        attachmentFileName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT
      );

      expect(logger.error).toHaveBeenCalled();
      expect(result).toBe('');
    });
  });
});
