import * as cheerio from 'cheerio';
import logger from '../services/logger';
import TicketsDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/TicketsDataProvider';
import DownloadManager from '../services/DownloadManager';

export default class RichTextDataFactory {
  richTextString: string;
  stripedString: string;
  insideTableFlag: boolean;
  tableTagsCounter: number = 0;
  contentControlsStrings: any[] = [];
  skinDataContentControls: any[] = [];
  templatePath: string = '';
  teamProject: string = '';
  attachmentMinioData: any[];
  attachmentsBucketName: string = '';
  minioEndPoint: string = '';
  minioAccessKey: string = '';
  minioSecretKey: string = '';
  PAT: string = '';
  hasValues: boolean = false;
  excludeImages: boolean = false;
  $: cheerio.Root;
  private imageCache: Map<string, string>;
  constructor(
    startHtml: string,
    templatePath: string,
    teamProject: string,
    attachmentsBucketName: string = '',
    minioEndPoint: string = '',
    minioAccessKey: string = '',
    minioSecretKey: string = '',
    PAT: string = '',
    excludeImages: boolean = false
  ) {
    this.richTextString = startHtml;
    this.insideTableFlag = false;
    this.templatePath = templatePath;
    this.teamProject = teamProject;
    this.excludeImages = excludeImages;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.imageCache = new Map<string, string>();
    this.attachmentMinioData = [];
  }

  private async replaceImgSrcWithLocalPath() {
    const images = this.$('img');
    for (let i = 0; i < images.length; i++) {
      const image = this.$(images[i]);
      const src = image.attr('src');
      if (!src) {
        logger.warn('Image source not found');
        continue;
      }
      if (src.startsWith('data:')) {
        const localPath = await this.handleBase64Image(src);
        image.attr('src', localPath);
      } else {
        const localPath = await this.downloadImageAndReturnLocalPath(src);
        image.attr('src', localPath);
      }
    }
  }

  private async handleBase64Image(dataUrl: string): Promise<string> {
    try {
      if (this.imageCache.has(dataUrl)) {
        return this.imageCache.get(dataUrl)!;
      }

      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (!match) {
        // Not a standard base64 data URL or missing base64
        return '';
      }

      const [, mimeType] = match;

      let extension = '';
      if (mimeType === 'image/jpeg') {
        extension = 'jpg';
      } else if (mimeType === 'image/png') {
        extension = 'png';
      } else if (mimeType === 'image/gif') {
        extension = 'gif';
      } else {
        //fallback to bin
        extension = 'bin';
        throw new Error(`Unsupported image type: ${mimeType}`);
      }

      const fileName = `base64-image-${Date.now()}.${extension}`;

      const downloadManager = new DownloadManager(
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        dataUrl,
        fileName,
        this.teamProject,
        this.PAT
      );
      const attachmentData = await downloadManager.downloadFile();
      this.attachmentMinioData.push(attachmentData);
      const localPath = `TempFiles/${attachmentData.fileName}`;
      this.imageCache.set(dataUrl, localPath);
      return localPath;
    } catch (err) {
      logger.error(`Error handling base64 image: ${dataUrl}`);
      logger.error(`Error: ${err.message}`);
      return '';
    }
  }

  private checkIfEmptyHtml(): boolean {
    // Get the body element
    const $body = this.$('body');

    // Return true if:
    // 1. No text content after trimming
    // 2. No images
    // 3. No tables
    // 4. Only has empty divs
    return (
      !$body.text().trim() &&
      $body.find('img').length === 0 &&
      $body.find('table').length === 0 &&
      !$body
        .children()
        .get()
        .some((el) => {
          const $el = this.$(el);
          return $el.text().trim() || $el.find('img').length > 0 || $el.find('table').length > 0;
        })
    );
  }

  public async factorizeRichTextData() {
    this.$ = cheerio.load(this.richTextString);
    this.hasValues = !this.checkIfEmptyHtml();
    if (!this.hasValues) {
      return this.richTextString;
    }
    if (this.excludeImages) {
      await this.replaceImgSrcWithLocalPath();
    }
    this.richTextString = this.$.html();
    this.imageCache.clear();
    return this.richTextString;
  }

  private async downloadImageAndReturnLocalPath(originalUrl) {
    if (!originalUrl) {
      return '';
    }
    if (this.imageCache.has(originalUrl)) {
      return this.imageCache.get(originalUrl)!;
    }

    let imageFileName: string;
    let rawUrl: string;

    const idx = originalUrl.indexOf('?');
    if (idx !== -1) {
      imageFileName = originalUrl.substring(idx + 10);
      rawUrl = originalUrl.substring(0, idx);
    } else {
      // If there is no query string, just use the original URL
      // and extract the image file name from the URL
      const lastSlash = originalUrl.lastIndexOf('/');
      if (lastSlash === -1) {
        imageFileName = 'unknown.png';
        rawUrl = originalUrl;
      } else {
        imageFileName = originalUrl.substring(lastSlash + 1);
        rawUrl = originalUrl;
      }
    }

    try {
      if (this.attachmentsBucketName) {
        const downloadManager = new DownloadManager(
          this.attachmentsBucketName,
          this.minioEndPoint,
          this.minioAccessKey,
          this.minioSecretKey,
          rawUrl,
          imageFileName,
          this.teamProject,
          this.PAT
        );
        const attachmentData = await downloadManager.downloadFile();
        this.attachmentMinioData.push(attachmentData);
        // Return the local path of the downloaded image
        const localPath = `TempFiles/${attachmentData.fileName}`;
        this.imageCache.set(originalUrl, localPath);
        return localPath;
      } else {
        // If the attachments bucket name is not provided, return the original URL
        return originalUrl;
      }
    } catch (e) {
      logger.error(`Error downloading image from URL: ${originalUrl}`);
      logger.error(`Error: ${e.message}`);
      return originalUrl;
    }
  }
}
