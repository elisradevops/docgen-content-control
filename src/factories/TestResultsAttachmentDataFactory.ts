import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import DownloadManager from '../services/DownloadManager';
import logger from '../services/logger';

export default class TestResultsAttachmentDataFactory {
  teamProject: string = '';
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  templatePath: string = '';
  runId: string;
  runResultId: string;

  constructor(
    teamProject: string,
    runId: string,
    resultId: string,
    templatePath: string,
    dgDataProvider: any
  ) {
    this.teamProject = teamProject;
    this.runId = runId;
    this.runResultId = resultId;
    this.templatePath = templatePath;
    this.dgDataProviderAzureDevOps = dgDataProvider;
  }

  public async fetchTestResultsAttachments(
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    let attachmentsData: any[] = [];
    try {
      let ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      const attachmentsDictionary = await ticketsDataProvider.GetTestRunResultAttachments(
        this.teamProject,
        this.runId,
        this.runResultId
      );

      if (attachmentsDictionary === undefined || attachmentsDictionary.length === 0) {
        logger.debug('No attachment found');
        return [];
      }

      logger.debug(
        `for test run item - ${this.runId}:${this.runResultId} fetched ${attachmentsDictionary.length} attachments`
      );

      for (const key in attachmentsDictionary) {
        if (attachmentsDictionary.hasOwnProperty(key)) {
          const attachments = attachmentsDictionary[key];

          attachments.forEach(async (attachment) => {
            const attachmentFileName = attachment.downloadUrl.substring(
              attachment.downloadUrl.lastIndexOf('/') + 1,
              attachment.downloadUrl.length
            );
            const attachmentUrl = attachment.downloadUrl.substring(
              0,
              attachment.downloadUrl.lastIndexOf('/')
            );
            let downloadedAttachmentData = await this.downloadAttachment(
              attachmentsBucketName,
              attachmentUrl,
              attachmentFileName,
              minioEndPoint,
              minioAccessKey,
              minioSecretKey,
              PAT
            );

            let LocalThumbnailPath;
            let LocalAttachmentPath = `TempFiles/${downloadedAttachmentData.fileName}`;
            if (downloadedAttachmentData.thumbnailName && downloadedAttachmentData.thumbnailPath) {
              LocalThumbnailPath = `TempFiles/${downloadedAttachmentData.thumbnailName}`;
              attachmentsData.push({
                //AttachmentComment will be the distinction between a step and a case
                attachmentComment:
                  key === 'caseLevel' ? 'Case attachment' : `Step attachment [${attachment.actionPath}]`,
                attachmentFileName: attachmentFileName,
                attachmentLink: LocalAttachmentPath,
                relativeAttachmentLink: LocalAttachmentPath,
                tableCellAttachmentLink: LocalThumbnailPath,
                attachmentMinioPath: downloadedAttachmentData.attachmentPath,
                minioFileName: downloadedAttachmentData.fileName,
                ThumbMinioPath: downloadedAttachmentData.thumbnailPath,
                minioThumbName: downloadedAttachmentData.thumbnailName,
              });
            } else {
              attachmentsData.push({
                //AttachmentComment will be the distinction between a step and a case
                attachmentComment:
                  key === 'caseLevel' ? 'Case attachment' : `Step attachment [${attachment.actionPath}]`,
                attachmentFileName: attachmentFileName,
                attachmentLink: LocalAttachmentPath,
                relativeAttachmentLink: LocalAttachmentPath,
                tableCellAttachmentLink: LocalAttachmentPath,
                attachmentMinioPath: downloadedAttachmentData.attachmentPath,
                minioFileName: downloadedAttachmentData.fileName,
              });
            }
          });
        }
      }
    } catch (e) {
      logger.error(`Error occurred while trying to fetch test results attachment ${e.message}`);
    } finally {
      return attachmentsData;
    }
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
      logger.error(
        `error downloading attachment : ${attachmentFileName} for Test run item ${this.runId}:${this.runResultId}`
      );
      logger.error(JSON.stringify(e));
      return '';
    }
  }
}
