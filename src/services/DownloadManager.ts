import logger from './logger';
import axios from 'axios';

export default class DownloadManager {
  bucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  downloadUrl: string;
  fileExtension: string;
  projectName: string;
  PAT: string;

  constructor(
    bucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    downloadUrl,
    fileName,
    projectName,
    PAT
  ) {
    this.bucketName = bucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.downloadUrl = downloadUrl;
    let fileNameArray = fileName.split('.');
    this.fileExtension = `.${fileNameArray[fileNameArray.length - 1]}`;
    this.projectName = projectName;
    this.PAT = PAT;
  }

  private isBase64String(str: string): boolean {
    const base64Regex = /^data:.*;base64,/;
    return base64Regex.test(str);
  }

  private async sendBase64Chunks(base64Data: string) {
    // Remove the data URL prefix if present
    const base64Content = base64Data.replace(/^data:.*;base64,/, '');
    // Split into chunks of approximately 1MB
    const chunkSize = 1024 * 1024;
    const chunks = [];

    for (let i = 0; i < base64Content.length; i += chunkSize) {
      chunks.push(base64Content.slice(i, i + chunkSize));
    }

    try {
      const response = await axios.post(`${process.env.downloadManagerUrl}/uploadAttachment`, {
        bucketName: this.bucketName,
        minioEndPoint: this.minioEndPoint,
        minioAccessKey: this.minioAccessKey,
        minioSecretKey: this.minioSecretKey,
        fileExtension: this.fileExtension,
        projectName: this.projectName,
        token: this.PAT,
        isBase64: true,
        base64Content: chunks,
      });
      logger.debug(`sendBase64Chunks response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      logger.error(`Error processing base64 content: ${error.message}`);
      throw error;
    }
  }

  async downloadFile() {
    try {
      this.minioEndPoint = this.minioEndPoint.replace(/^https?:\/\//, '');
      if (this.isBase64String(this.downloadUrl)) {
        return await this.sendBase64Chunks(this.downloadUrl);
      }

      let downloadManagerResponse = await axios.post(`${process.env.downloadManagerUrl}/uploadAttachment`, {
        bucketName: this.bucketName,
        minioEndPoint: this.minioEndPoint,
        minioAccessKey: this.minioAccessKey,
        minioSecretKey: this.minioSecretKey,
        downloadUrl: this.downloadUrl,
        fileExtension: this.fileExtension,
        projectName: this.projectName,
        token: this.PAT,
      });

      logger.info(`downloaded to :${JSON.stringify(downloadManagerResponse.data)}`);
      return downloadManagerResponse.status === 200 ? downloadManagerResponse.data : null;
    } catch (e) {
      logger.error(`error downloading : ${this.downloadUrl}`);
      throw e;
    }
  }

  convertToWinodwsPath(linuxPath: string) {
    let windowsPath = linuxPath.split('/').join('\\');
    windowsPath = 'C:' + windowsPath;
    return windowsPath;
  }
}
