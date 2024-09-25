import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import DownloadManager from '../services/DownloadManager';
import logger from '../services/logger';

export default class TestResultsAttachmentDataFactory {
  teamProject: string = '';
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  templatePath: string = '';
  runResult: any;

  constructor(teamProject: string, templatePath: string, dgDataProvider: any, runResult: any) {
    this.teamProject = teamProject;
    this.templatePath = templatePath;
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.runResult = runResult;
  }

  public async generateTestResultsAttachments(
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string
  ): Promise<any> {
    try {
      if (this.runResult === undefined) {
        logger.info('Run result is undefined');
        return null;
      }
      const { iteration, analysisAttachments } = this.runResult;
      if (
        (iteration === undefined && analysisAttachments === undefined) ||
        (iteration.attachments?.length === 0 && analysisAttachments?.length === 0)
      ) {
        logger.info(
          `No attachments were found for run ${this.runResult.lastRunId} and run result ${this.runResult.lastResultId}`
        );
        return null;
      }
      let attachmentMap: { [key: string]: any[] } = {};
      // Process iteration attachments
      if (iteration.attachments?.length > 0) {
        await this.processAttachments(
          attachmentMap,
          iteration.attachments,
          attachmentsBucketName,
          minioEndPoint,
          minioAccessKey,
          minioSecretKey,
          PAT
        );
      }

      // Process analysis attachments
      if (analysisAttachments?.length > 0) {
        await this.processAttachments(
          attachmentMap,
          analysisAttachments,
          attachmentsBucketName,
          minioEndPoint,
          minioAccessKey,
          minioSecretKey,
          PAT
        );
      }

      return attachmentMap;
    } catch (e) {
      logger.error(`Error occurred while trying to fetch test results attachment: ${e.message}`);
      logger.error(`Error stack: ${e.stack}`);
      return null;
    }
  }

  // Private method to process attachments for both iteration and analysis attachments
  private async processAttachments(
    map: { [key: string]: any[] },
    attachments: any[],
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string
  ): Promise<void> {
    for (let attachment of attachments) {
      const attachmentData = await this.processAttachment(
        attachment,
        attachmentsBucketName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        PAT
      );

      const { comment, actionPath, name, id } = attachment;
      const actionPathKey =
        actionPath !== undefined ? (actionPath === '' ? 'caseLevel' : actionPath) : 'analysisLevel';

      if (!map[actionPathKey]) {
        map[actionPathKey] = [];
      }

      if (attachmentData.LocalThumbnailPath) {
        map[actionPathKey].push({
          name,
          id,
          attachmentComment: comment || '',
          attachmentFileName: attachmentData.fileName,
          attachmentLink: attachmentData.LocalAttachmentPath,
          relativeAttachmentLink: attachmentData.LocalAttachmentPath,
          tableCellAttachmentLink: attachmentData.LocalThumbnailPath,
          attachmentMinioPath: attachmentData.downloadedAttachmentData.attachmentPath,
          minioFileName: attachmentData.downloadedAttachmentData.fileName,
          ThumbMinioPath: attachmentData.downloadedAttachmentData.thumbnailPath,
          minioThumbName: attachmentData.downloadedAttachmentData.thumbnailName,
        });
      } else {
        map[actionPathKey].push({
          name,
          id,
          attachmentComment: comment || '',
          attachmentFileName: attachmentData.fileName,
          attachmentLink: attachmentData.LocalAttachmentPath,
          relativeAttachmentLink: attachmentData.LocalAttachmentPath,
          tableCellAttachmentLink: attachmentData.LocalAttachmentPath,
          attachmentMinioPath: attachmentData.downloadedAttachmentData.attachmentPath,
          minioFileName: attachmentData.downloadedAttachmentData.fileName,
        });
      }
    }
  }

  // Private method to process individual attachment and return relevant data
  private async processAttachment(
    attachment: any,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string
  ): Promise<any> {
    let attachmentFileName = attachment.downloadUrl.substring(
      attachment.downloadUrl.lastIndexOf('/') + 1,
      attachment.downloadUrl.length
    );
    let attachmentUrl = attachment.downloadUrl.substring(0, attachment.downloadUrl.lastIndexOf('/'));

    const downloadedAttachmentData = await this.downloadAttachment(
      attachmentsBucketName,
      attachmentUrl,
      attachmentFileName,
      minioEndPoint,
      minioAccessKey,
      minioSecretKey,
      PAT
    );

    const LocalAttachmentPath = `TempFiles/${downloadedAttachmentData.fileName}`;
    const LocalThumbnailPath = downloadedAttachmentData.thumbnailName
      ? `TempFiles/${downloadedAttachmentData.thumbnailName}`
      : null;

    return {
      fileName: attachmentFileName,
      LocalAttachmentPath,
      LocalThumbnailPath,
      downloadedAttachmentData,
    };
  }

  async downloadAttachment(
    attachmentsBucketName,
    attachmentUrl,
    attachmentFileName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    try {
      let downloadManager = new DownloadManager(
        attachmentsBucketName,
        minioEndPoint,
        minioAccessKey,
        minioSecretKey,
        attachmentUrl,
        attachmentFileName,
        this.teamProject,
        PAT
      );
      let res = await downloadManager.downloadFile();
      return res;
    } catch (e) {
      logger.error(`error downloading attachment : ${attachmentFileName}`);
      logger.error(JSON.stringify(e));
      return '';
    }
  }
}
