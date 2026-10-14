import logger from './logger';
import axios from 'axios';
import { runAttachmentPath } from '../utils/runAttachmentDirectory';

// The download service answers 200 with this file when it could not fetch an attachment (its own log has the reason).
const BAD_ATTACHMENT_FILE_NAME = 'bad-attachment.png';

const SENSITIVE_QUERY_KEY = /sig|token|key|secret|pat|password|auth/i;
const MAX_LOGGED_SOURCE_LENGTH = 400;

// Where an image came from, for the log: no credentials in the URL, no secret-looking query values, bounded.
function maskSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    for (const key of Array.from(new Set(Array.from(parsed.searchParams.keys())))) {
      if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, '***');
    }
    return parsed.toString().slice(0, MAX_LOGGED_SOURCE_LENGTH);
  } catch {
    return String(url).replace(/\/\/[^/@\s]*@/, '//').slice(0, MAX_LOGGED_SOURCE_LENGTH);
  }
}

// What the caller knows about the image that the download service does not: which work item it belongs to and the
// original src (the download itself is requested without the src's query string).
export interface DownloadLogContext {
  workItem?: string;
  src?: string;
}

export default class DownloadManager {
  bucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  downloadUrl: string;
  fileExtension: string;
  projectName: string;
  PAT: string;
  logContext: DownloadLogContext;

  constructor(
    bucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    downloadUrl,
    fileName,
    projectName,
    PAT,
    logContext: DownloadLogContext = {}
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
    this.logContext = logContext;
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
      return response.data;
    } catch (error) {
      logger.error(`Error processing base64 content: ${error.message}`);
      throw error;
    }
  }

  // The local names callers put in the document JSON (TempFiles/<name>) and in the list of files
  // json-to-word must download. Prefixing them with the run's directory here, where they all originate,
  // keeps links and downloads in agreement. The MinIO locations (attachmentPath, thumbnailPath) are
  // untouched.
  private withRunDirectory(data: any) {
    if (data?.fileName) data.fileName = runAttachmentPath(data.fileName);
    if (data?.thumbnailName) data.thumbnailName = runAttachmentPath(data.thumbnailName);
    return data;
  }

  // The download service reports a failed download as a normal response carrying the placeholder file, so nothing
  // else surfaces it. The reason is in that service's own log ("[attachment] attachment_failed ...").
  private warnIfPlaceholder(data: any) {
    if (data?.fileName !== BAD_ATTACHMENT_FILE_NAME) return;
    const originalSrc = this.logContext.src ?? this.downloadUrl;
    const source = this.isBase64String(originalSrc) ? 'inline image (data URL)' : maskSourceUrl(originalSrc);
    const workItem = this.logContext.workItem ? ` (${this.logContext.workItem})` : '';
    logger.warn(
      `Attachment download failed${workItem}, the placeholder image is used instead: ${source} (project ${this.projectName}). ` +
        `See "[attachment] attachment_failed" in the download service log for the reason.`
    );
  }

  async downloadFile() {
    try {
      this.minioEndPoint = this.minioEndPoint.replace(/^https?:\/\//, '');
      if (this.isBase64String(this.downloadUrl)) {
        const base64Result = await this.sendBase64Chunks(this.downloadUrl);
        this.warnIfPlaceholder(base64Result);
        return this.withRunDirectory(base64Result);
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

      logger.info('downloaded to', downloadManagerResponse.data);
      this.warnIfPlaceholder(downloadManagerResponse.data);
      return downloadManagerResponse.status === 200 ? this.withRunDirectory(downloadManagerResponse.data) : null;
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
