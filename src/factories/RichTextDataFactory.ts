import * as cheerio from 'cheerio';
import DownloadManager from '../services/DownloadManager';
import logger from '../services/logger';
import {
  RichNode,
  ParagraphNode,
  TextNode,
  ImageNode,
  TableNode,
  OtherNode,
  BreakNode,
  textStyle,
  ListNode,
} from '../models/RichTextNodeTypes'; // wherever you put your interfaces

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
  private imageCache: Map<string, string>;
  constructor(
    startHtml: string,
    templatePath: string,
    teamProject: string,
    attachmentsBucketName: string = '',
    minioEndPoint: string = '',
    minioAccessKey: string = '',
    minioSecretKey: string = '',
    PAT: string = ''
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
  }

  /**
   * Asynchronously creates rich text content.
   *
   * This method first creates rich text content without images. If the `attachmentsBucketName`
   * property is not an empty string, it proceeds to download images.
   *
   * @returns {Promise<void>} A promise that resolves when the rich text content has been created.
   */
  async createRichTextContent() {
    try {
      this.skinDataContentControls = await this.parseHtmlToRichNodes();
    } catch (err: any) {
      logger.error(`Failed to create rich text content: ${err.message}`);
      logger.error(`Error stack: ${err.stack}`);
      this.skinDataContentControls = [];
    }
  }

  /**
   * Downloads an image from the specified URL and returns a local file path if available.
   *
   * If a query parameter with the file name is present in the URL, it is extracted. Otherwise,
   * the file name is derived from the path. If an attachments bucket is provided, the file is
   * downloaded to a temporary folder and the local path is returned; otherwise, the original
   * URL is returned.
   *
   * @param originalUrl - The URL of the image to download.
   * @returns A Promise that resolves to the local path of the downloaded image, or the original
   * URL if the file download is not performed or fails.
   */
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

  /**
   * Applies style modifications to a given base text style based on a specific HTML tag.
   *
   * @param baseStyle - The original text style object to modify.
   * @param tagName - The HTML tag representing the style to be applied (e.g., "b", "u", "i").
   * @returns The updated style object including the modifications applied.
   */
  private applyTagStyle(baseStyle: textStyle, tag: cheerio.TagElement): textStyle {
    const newStyle = { ...baseStyle };
    const tagName = tag.name.toLowerCase();
    switch (tagName) {
      case 'b':
      case 'strong':
        newStyle.Bold = true;
        break;
      case 'u':
        newStyle.Underline = true;
        break;
      case 'i':
      case 'em':
        newStyle.Italic = true;
        break;
      case 'small':
        newStyle.Small = true;
        break;
      case 'del':
        newStyle.StrikeThrough = true;
        break;
      case 'mark':
        newStyle.Marked = true;
        break;
      case 'sub':
        newStyle.Subscript = true;
        break;
      case 'sup':
        newStyle.Superscript = true;
        break;
      case 'a':
        newStyle.Href = tag.attribs.href || '';
      default:
        break;
    }

    return newStyle;
  }

  /**
   * Determines if the specified tag name represents an inline HTML element.
   *
   * @param tagName - The lowercase name of the HTML tag to check.
   * @returns True if the tag name is recognized as an inline HTML element; otherwise, false.
   */
  private isInlineTag(tagName: string): boolean {
    return (
      tagName === 'b' ||
      tagName === 'strong' ||
      tagName === 'u' ||
      tagName === 'i' ||
      tagName === 'em' ||
      tagName === 'small' ||
      tagName === 'del' ||
      tagName === 'mark' ||
      tagName === 'sub' ||
      tagName === 'sup' ||
      tagName === 'span' ||
      tagName === 'a'
    );
  }

  /**
   * Parses a set of HTML elements and applies the given text style to each, returning a list of rich text nodes.
   *
   * @param $ - The Cheerio root instance, representing loaded HTML content.
   * @param elements - A list of Cheerio elements to be parsed.
   * @param style - The text style to be applied to the parsed content.
   * @returns A promise that resolves to an array of RichNode objects.
   */
  private async parseChildrenWithStyle(
    $: cheerio.Root,
    elements: cheerio.Element[],
    style: textStyle
  ): Promise<RichNode[]> {
    const results: RichNode[] = [];
    for (const el of elements) {
      const parentTagName = el.parent && el.parent.type === 'tag' ? el.parent.name : '';
      const parsed = await this.parseNode($, el, style, parentTagName);
      if (Array.isArray(parsed)) {
        results.push(
          ...parsed.filter((node) => parentTagName === 'td' || !(node.type === 'text' && node.value === ''))
        );
      } else if (parentTagName === 'td' || parsed.type !== 'text' || parsed.value !== '') {
        results.push(parsed);
      }
    }
    return results;
  }

  /**
   * Parses a Cheerio element into a structured rich text node or collection of nodes.
   *
   * Determines whether the provided element is a text node, an inline HTML tag, or a
   * block-level tag, then processes it accordingly. The function inherits and applies
   * inline styles to child elements when encountered, recursively parsing them. Depending
   * on the element type, it may return a single text node, an image node, a paragraph,
   * or any other supported rich-text node structure.
   *
   * @param $ - The Cheerio root object used for DOM manipulation.
   * @param element - The Cheerio element to be parsed.
   * @param style - An optional text styling object to be merged with child node styles.
   * @returns A promise resolving to either a single rich text node or an array of rich text nodes.
   */
  private async parseNode(
    $: cheerio.Root,
    element: cheerio.Element,
    style: textStyle = {},
    parentTagName: string = ''
  ): Promise<RichNode | RichNode[]> {
    try {
      // 1) TEXT NODE
      if (element.type === 'text') {
        const textContent = (element as cheerio.TextElement).data || '';
        style.InsertSpace = false;
        if (!textContent.trim()) {
          return { type: 'text', value: '' }; // Skip whitespace-only text nodes
        }
        // If the text node is not empty and starts/ends with a space, add a flag to insert a space
        if (textContent.startsWith(' ') || textContent.endsWith(' ')) {
          style.InsertSpace = true;
        }
        return {
          type: 'text',
          value: textContent,
          textStyling: { ...style },
        } as TextNode;
      }

      // 2) TAG NODE
      if (element.type === 'tag') {
        const tagName = element.name.toLowerCase();
        const childElements = element.children || [];

        if (this.isInlineTag(tagName)) {
          const newStyle = this.applyTagStyle(style, element);

          // Parse children recursively with the updated style
          return await this.parseChildrenWithStyle($, childElements, newStyle);
        }

        const childNodes: RichNode[] = await this.parseChildrenWithStyle($, childElements, style);

        switch (tagName) {
          case 'p': {
            if (childNodes.length === 0 || (childNodes.length === 1 && childNodes[0].type === 'break')) {
              return { type: 'text', value: '' };
            }
            return { type: 'paragraph', children: childNodes } as ParagraphNode;
          }
          case 'img': {
            const $el = $(element);
            const src = $el.attr('src') || '';
            const alt = $el.attr('alt') || '';

            let finalLocalPath = '';
            if (src.startsWith('data:')) {
              finalLocalPath = await this.handleBase64Image(src);
            } else {
              finalLocalPath = await this.downloadImageAndReturnLocalPath(src);
            }

            return { type: 'image', src: finalLocalPath, alt } as ImageNode;
          }
          case 'table': {
            return { type: 'table', children: childNodes } as TableNode;
          }
          case 'br': {
            // If the parent is a <p>, treat <br> as a line break
            return parentTagName === 'p' ? ({ type: 'break' } as BreakNode) : { type: 'text', value: '' };
          }
          case 'ul': {
            return { type: 'list', isOrdered: false, children: childNodes } as ListNode;
          }
          case 'ol': {
            return { type: 'list', isOrdered: true, children: childNodes } as ListNode;
          }
          case 'div': {
            const splitted = this.splitDivChildrenIntoParagraphs(childNodes);
            if (splitted.length === 0) return { type: 'text', value: '' };
            return {
              type: 'other',
              tagName,
              children: splitted,
            } as OtherNode;
          }
          default: {
            if (childNodes.length === 0) return { type: 'text', value: '' };
            return {
              type: 'other',
              tagName,
              children: childNodes,
            } as OtherNode;
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to parse node: ${error.message}`);
    }
    // 3) UNKNOWN NODE TYPE
    return { type: 'text', value: '' };
  }

  /**
   * Pushes the current paragraph to the result array if it is not empty or meaningless.
   * Resets and returns a new empty paragraph node for the next paragraph.
   *
   * @param result - The array of RichNode to which the current paragraph will be added if not empty.
   * @param currentParagraph - The current ParagraphNode that is being evaluated.
   * @returns A new empty ParagraphNode to be used for the next paragraph.
   */
  private pushCurrentParagraphIfNotEmpty(result: RichNode[], currentParagraph: ParagraphNode): ParagraphNode {
    if (!this.isParagraphMeaningless(currentParagraph)) {
      result.push(currentParagraph);
    }
    // reset for next paragraph
    return { type: 'paragraph', children: [] };
  }

  /**
   * Splits the given child nodes into multiple paragraphs/tables
   * so that text/images remain inside paragraphs, but table becomes a separate node.
   *
   * E.g. if we have: text, image, table, text => it becomes:
   *   Paragraph(text, image), Table(...), Paragraph(text).
   *
   * Returns an array of RichNodes, e.g. [{type:'paragraph'}, {type:'table'}, {type:'paragraph'}...].
   */
  private splitDivChildrenIntoParagraphs(children: RichNode[]): RichNode[] {
    const result: RichNode[] = [];
    let currentParagraph: ParagraphNode = {
      type: 'paragraph',
      children: [], // in your model, paragraphs store children or runs, depending on your interface
    };

    for (const child of children) {
      if (child.type === 'table') {
        // Encountered a table => finalize the current paragraph if it has content
        currentParagraph = this.pushCurrentParagraphIfNotEmpty(result, currentParagraph);
        // push the table as its own node
        result.push(child);
        // after that, we start a fresh paragraph if there's more content
      } else if (child.type === 'paragraph') {
        // Flatten this child's own children into the current paragraph
        currentParagraph.children.push(...child.children);
      } else {
        // For text, image, break, or even 'other' that we treat inline:
        currentParagraph.children.push(child);
      }
    }

    // End of loop => if we still have leftover in currentParagraph, push it
    currentParagraph = this.pushCurrentParagraphIfNotEmpty(result, currentParagraph);

    return result;
  }

  /**
   * Handles a base64 encoded image URL, extracts the image data, and saves it to a file.
   * The file is then uploaded to a specified MinIO bucket.
   *
   * @param dataUrl - The base64 encoded image URL.
   * @returns A promise that resolves to the file path of the saved image, or an empty string if an error occurs.
   *
   * @throws Will log an error message if the base64 image handling fails.
   */
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

  /**
   * Returns `true` if the paragraph is effectively empty:
   *  - Has no children
   *  - Or has exactly one child that is a 'break'
   */
  private isParagraphMeaningless(paragraph: ParagraphNode): boolean {
    if (!paragraph.children || paragraph.children.length === 0) {
      return true; // no children at all
    }
    if (paragraph.children.length === 1 && paragraph.children[0].type === 'break') {
      return true; // only one <br> node
    }
    return false;
  }

  /**
   * Asynchronously parses the component's rich text HTML into an array of RichNode objects.
   * Utilizes Cheerio to traverse the HTML, handling both <body> elements and root-level nodes.
   * Filters out empty text nodes to produce a cleaned, structured representation of the parsed HTML.
   *
   * @returns A promise resolving to an array of RichNode objects extracted from the HTML content.
   */
  private async parseHtmlToRichNodes(): Promise<RichNode[]> {
    const $ = cheerio.load(this.richTextString);

    // If there's a <body>, parse its contents; otherwise parse the root
    const $body = $('body');
    const rootElements = $body.length > 0 ? $body.contents().toArray() : $.root().contents().toArray();

    const result: RichNode[] = [];

    for (const elem of rootElements) {
      try {
        // parseNode can return RichNode or RichNode[]
        const parsed = await this.parseNode($, elem);

        // Convert parsed to an array in one go
        const parsedArray = Array.isArray(parsed) ? parsed : [parsed];

        // Filter out empty text nodes and push the rest
        for (const node of parsedArray) {
          if (node.type === 'text' && node.value === '') {
            continue;
          }
          result.push(node);
        }
      } catch (error) {
        logger.error(`Error with parsing Html element: ${error.message}`);
        logger.error(`error stack: ${error.stack}`);
      }
    }
    //clear the image cache after parsing
    this.imageCache.clear();
    return result;
  }
}
