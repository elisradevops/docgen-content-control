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

  async downloadFile() {
    try {
      this.minioEndPoint = this.minioEndPoint.replace(/^https?:\/\//, '');
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
      if (downloadManagerResponse.status == 200) return downloadManagerResponse.data;
      else return null;
    } catch (e) {
      logger.error(`error dowloading : ${this.downloadUrl}`);
    }
  }

  convertToWinodwsPath(linuxPath: string) {
    let windowsPath = linuxPath.split('/').join('\\');
    windowsPath = 'C:' + windowsPath;
    return windowsPath;
  }
}
