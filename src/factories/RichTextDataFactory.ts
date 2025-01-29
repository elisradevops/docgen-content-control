import * as cheerio from 'cheerio';
import logger from '../services/logger';
import TicketsDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/TicketsDataProvider';

export default class RichTextDataFactory {
  richTextString: string;
  stripedString: string;
  insideTableFlag: boolean;
  tableTagsCounter: number = 0;
  contentControlsStrings: any[] = [];
  skinDataContentControls: any[] = [];
  templatePath: string = '';
  teamProject: string = '';
  attachmentMinioData: any[] = [];
  attachmentsBucketName: string = '';
  minioEndPoint: string = '';
  minioAccessKey: string = '';
  minioSecretKey: string = '';
  PAT: string = '';
  ticketProvider: TicketsDataProvider;
  hasValues: boolean = false;
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
    ticketsProvider: TicketsDataProvider = undefined
  ) {
    this.richTextString = startHtml;
    this.insideTableFlag = false;
    this.templatePath = templatePath;
    this.teamProject = teamProject;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.imageCache = new Map<string, string>();
    this.ticketProvider = ticketsProvider;
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
      if (!src.startsWith('data:')) {
        const baseImg64 = await this.downloadRemoteImage(src);
        image.attr('src', baseImg64);
      }
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
    await this.replaceImgSrcWithLocalPath();
    this.richTextString = this.$.html();
    this.imageCache.clear();
    return this.richTextString;
  }

  private async downloadRemoteImage(imageUrl: string) {
    if (this.ticketProvider !== undefined) {
      return await this.ticketProvider.FetchImageAsBase64(imageUrl);
    }
    return '';
  }
}
