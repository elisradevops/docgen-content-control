import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import DownloadManager from '../services/DownloadManager';
import logger from '../services/logger';

export default class AttachmentsDataFactory {
  teamProject: string = '';
  wiId: string = null;
  templatePath: string = '';
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;

  constructor(teamProject: string, wiId: string, templatePath: string, dgDataProvider: any) {
    this.teamProject = teamProject;
    this.templatePath = templatePath;
    this.wiId = wiId;
    this.dgDataProviderAzureDevOps = dgDataProvider;
  }

  async fetchWiAttachments(
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    additionalAttachments: any[] = []
  ) {
    let rawAttachmentData: any[] = [];
    let isRunAttachments = additionalAttachments.length > 0;
    if (additionalAttachments.length === 0) {
      try {
        let ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
        rawAttachmentData = await ticketsDataProvider.GetWorkitemAttachments(this.teamProject, this.wiId);
      } catch (e) {
        rawAttachmentData = [];
      }
    } else {
      rawAttachmentData = additionalAttachments;
    }
    logger.debug(
      `for work item - ${this.wiId} fetched ${rawAttachmentData.length} ${isRunAttachments ? 'run ' : ''
      }attachments`
    );
    try {
      let attachmentData = [];
      for (let i = 0; i < rawAttachmentData.length; i++) {
        let attachmentFileName = rawAttachmentData[i].downloadUrl.substring(
          rawAttachmentData[i].downloadUrl.lastIndexOf('/') + 1,
          rawAttachmentData[i].downloadUrl.length
        );
        let attachmentUrl = rawAttachmentData[i].downloadUrl.substring(
          0,
          rawAttachmentData[i].downloadUrl.lastIndexOf('/')
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
        let attachmentComment: string = '';
        let attachmentStepNo: string = '';
        let LocalAttachmentPath = `TempFiles/${downloadedAttachmentData.fileName}`;
        if (rawAttachmentData[i].attributes && rawAttachmentData[i].attributes.comment) {
          attachmentComment = rawAttachmentData[i].attributes.comment;
        } else if (isRunAttachments && rawAttachmentData[i]) {
          attachmentStepNo = rawAttachmentData[i].stepNo;
        }

        if (downloadedAttachmentData.thumbnailName && downloadedAttachmentData.thumbnailPath) {
          LocalThumbnailPath = `TempFiles/${downloadedAttachmentData.thumbnailName}`;
          attachmentData.push({
            attachmentComment: attachmentComment,
            attachmentFileName: attachmentFileName,
            attachmentLink: LocalAttachmentPath,
            relativeAttachmentLink: LocalAttachmentPath,
            tableCellAttachmentLink: LocalThumbnailPath,
            attachmentMinioPath: downloadedAttachmentData.attachmentPath,
            minioFileName: downloadedAttachmentData.fileName,
            ThumbMinioPath: downloadedAttachmentData.thumbnailPath,
            minioThumbName: downloadedAttachmentData.thumbnailName,
            attachmentStepNo: attachmentStepNo,
          });
        } else {
          attachmentData.push({
            attachmentComment: attachmentComment,
            attachmentFileName: attachmentFileName,
            attachmentLink: LocalAttachmentPath,
            relativeAttachmentLink: LocalAttachmentPath,
            tableCellAttachmentLink: LocalAttachmentPath,
            attachmentMinioPath: downloadedAttachmentData.attachmentPath,
            minioFileName: downloadedAttachmentData.fileName,
            attachmentStepNo: attachmentStepNo,
          });
        }
      }
      return attachmentData;
    } catch (e) {
      logger.error(`error creating attachmets array for work item ${this.wiId}`);
      logger.error(JSON.stringify(e));
      return [];
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
      logger.error(`error downloading attachmet : ${attachmentFileName} for work item ${this.wiId}`);
      logger.error(JSON.stringify(e));
      return '';
    }
  }
}
