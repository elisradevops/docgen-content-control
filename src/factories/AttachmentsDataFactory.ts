import DgDataProviderAzureDevOps from "@elisra-devops/docgen-data-provider";
import DownloadManager from "../services/DownloadManager";
import logger from "../services/logger";

export default class AttachmentsDataFactory {
  teamProject: string = "";
  wiId: string = null;
  templatePath: string = "";
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;

  constructor(
    teamProject: string,
    wiId: string,
    templatePath: string,
    dgDataProvider: any
  ) {
    this.teamProject = teamProject;
    this.templatePath = templatePath;
    this.wiId = wiId;
    this.dgDataProviderAzureDevOps = dgDataProvider;
  }

  async fetchWiAttachments(attachmentsBucketName,minioEndPoint, minioAccessKey, minioSecretKey, PAT) {
    let attachments;
    try {
        let ticketsDataProvider =  await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
        attachments = await ticketsDataProvider.GetWorkitemAttachments(
        this.teamProject,
        this.wiId
      );
    } catch (e) {
      attachments = [];
    }
    logger.debug(
      `for work item - ${this.wiId} fetched ${attachments.length} attachments`
    );
    try {
      let attachmentData = [];
      for (let i = 0; i < attachments.length; i++) {
        let attachmentFileName = attachments[i].downloadUrl.substring(
          attachments[i].downloadUrl.lastIndexOf("/") + 1,
          attachments[i].downloadUrl.length
        );
        let attachmentUrl = attachments[i].downloadUrl.substring(
          0,
          attachments[i].downloadUrl.lastIndexOf("/")
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
        let LocalThumbnailPath
        let LocalAttachmentPath = `TempFiles/${downloadedAttachmentData.fileName}`
        if (downloadedAttachmentData.thumbnailName && downloadedAttachmentData.thumbnailPath){
          LocalThumbnailPath = `TempFiles/${downloadedAttachmentData.thumbnailName}`
          attachmentData.push({
            attachmentComment: attachments[i].attributes.comment || "",
            attachmentFileName: attachmentFileName,
            attachmentLink: LocalAttachmentPath,
            relativeAttachmentLink: LocalAttachmentPath,
            tableCellAttachmentLink: LocalThumbnailPath,
            attachmentMinioPath: downloadedAttachmentData.attachmentPath,
            minioFileName: downloadedAttachmentData.fileName,
            ThumbMinioPath: downloadedAttachmentData.thumbnailPath,
            minioThumbName: downloadedAttachmentData.thumbnailName
          });
        }
        else{
          attachmentData.push({
            attachmentComment: attachments[i].attributes.comment || "",
            attachmentFileName: attachmentFileName,
            attachmentLink: LocalAttachmentPath,
            relativeAttachmentLink: LocalAttachmentPath,
            tableCellAttachmentLink: LocalAttachmentPath,
            attachmentMinioPath: downloadedAttachmentData.attachmentPath,
            minioFileName: downloadedAttachmentData.fileName
          });
        }

      }
      
      return attachmentData;
    } catch (e) {
      logger.error(
        `error creating attachmets array for work item ${this.wiId}`
      );
      logger.error(JSON.stringify(e));
      return [];
    }
  }

  async downloadAttachment(attachmentsBucketName,attachmentUrl, attachmentFileName, minioEndPoint, minioAccessKey, minioSecretKey, PAT) {
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
        `error downloading attachmet : ${attachmentFileName} for work item ${
          this.wiId
        }`
      );
      logger.error(JSON.stringify(e));
      return "";
    }
  }
}