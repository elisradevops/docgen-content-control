import striphtml from 'string-strip-html';
import * as cheerio from 'cheerio';
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
  attachmentMinioData: any[] = [];

  constructor(richTextString: string, templatePath: string, teamProject: string) {
    this.richTextString = richTextString;
    this.insideTableFlag = false;
    this.templatePath = templatePath;
    this.teamProject = teamProject;
  }
  async createRichTextContent(attachmentsBucketName, minioEndPoint, minioAccessKey, minioSecretKey, PAT) {
    await this.htmlStrip();
    await this.downloadImages(attachmentsBucketName, minioEndPoint, minioAccessKey, minioSecretKey, PAT);
  }

  replaceTags = ({ tag, deleteFrom, deleteTo, rangesArr }) => {
    switch (tag.name.toLowerCase()) {
      case `br`:
      case `b`:
      case `u`:
      case `ol`:
      case `ul`:
      case `li`:
      case `p`:
        break;
      case 'table':
        if (!tag.slashPresent) {
          if (this.tableTagsCounter === 0) {
            rangesArr.push(deleteFrom, deleteTo, '-----EN-PAR----- -----ST-TBL-----<table>');
          }
          this.tableTagsCounter += 1;
        } else {
          this.tableTagsCounter -= 1;
          if (this.tableTagsCounter === 0) {
            rangesArr.push(deleteFrom, deleteTo, '</table>-----EN-TBL----- -----ST-PAR-----');
          }
        }
        break;
      case 'tr':
        rangesArr.push(deleteFrom, deleteTo, '<tr>');
        break;
      case 'td':
        rangesArr.push(deleteFrom, deleteTo, '<td>');
        break;
      case 'img':
        rangesArr.push(deleteFrom, deleteFrom, '-----EN-PAR----- -----ST-IMG-----');
        rangesArr.push(deleteTo, deleteTo, '-----EN-IMG----- -----ST-PAR-----');
        break;
      default:
        rangesArr.push(deleteFrom, deleteTo, '');
        break;
    }
  };

  private isEmptyNode($, node: cheerio.Element): boolean {
    const $node = $(node);
    // Check if the node is a <br> element or a self-closing tag
    if ($node.is('td') || $node.is('br') || this.isSelfClosing($node)) {
      return false;
    }
    // Check if the node has no text and no children (ignoring whitespace)
    return !$node.text().trim() && !$node.children().length;
  }

  private isSelfClosing($node: cheerio.Element): boolean {
    const selfClosingTags = [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'keygen',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ];
    const nodeName = $node[0]?.name?.toLowerCase();
    return selfClosingTags.includes(nodeName);
  }

  private processNode($, node: cheerio.Element): void {
    const $node = $(node);

    // Recursively process child nodes
    $node.children().each((_, child) => {
      this.processNode($, child);
    });

    // Remove the node if it's empty
    if (this.isEmptyNode($, $node)) {
      $node.remove();
      return;
    }

    // Remove inline styles
    if ($node.attr('style')) {
      $node.removeAttr('style');
    }

  }


  public clean(html: string): string {
    const $ = cheerio.load(html);

    // Process all nodes starting from the root
    $.root()
      .children()
      .each((_, child) => {
        this.processNode($, child);
      });

    return $.html();
  }

  async htmlStrip() {
    const cleanedHtml = this.clean(this.richTextString);
    this.stripedString = striphtml(cleanedHtml, {
      cb: this.replaceTags,
      skipHtmlDecoding: true,
    }).result;
    this.stripedString = '-----ST-PAR-----' + this.stripedString;
    this.stripedStringParser();
    this.contentControlsStrings.forEach((contentControl) => {
      switch (contentControl.type) {
        case 'table':
          this.tableDataParser(contentControl.value);
          break;
        case 'image':
          this.imgDataParser(contentControl.value);
          break;
        case 'paragraph':
          this.paragraphDataParser(contentControl.value);
          break;
      }
    });
  }

  //download all images needed
  async downloadImages(attachmentsBucketName, minioEndPoint, minioAccessKey, minioSecretKey, PAT) {
    await Promise.all(
      this.skinDataContentControls.map(async (skinContentControl, i) => {
        if (skinContentControl.type === 'picture') {
          let imageUrl: string = skinContentControl.data;
          let imageFileName = imageUrl.substring(imageUrl.indexOf('?') + 10, imageUrl.length);
          imageUrl = imageUrl.substring(0, imageUrl.indexOf('?'));

          let downloadManager = new DownloadManager(
            attachmentsBucketName,
            minioEndPoint,
            minioAccessKey,
            minioSecretKey,
            imageUrl,
            imageFileName,
            this.teamProject,
            PAT
          );
          let attachmentData = await downloadManager.downloadFile();
          this.attachmentMinioData.push(attachmentData);
          this.skinDataContentControls[i].data = `TempFiles/${attachmentData.fileName}`;
        } else {
          return false;
        }
      })
    );
    return this.skinDataContentControls;
  }

  stripedStringParser() {
    //count number of content controls
    this.stripedString = this.stripedString + '-----EN-PAR-----';
    let contentControlsCount = this.stripedString.match(/-----..-...-----/g);
    //checks if needs string parsing - no parsing needed
    if (contentControlsCount.length === 0) {
      this.contentControlsStrings.push({
        type: 'paragraph',
        value: this.stripedString,
      });
    }
    //checks if needs string parsing - only paragraph
    if (contentControlsCount.length === 1) {
      contentControlsCount = this.stripedString.match(/-----..-...-----/g);
    }
    //checks if needs string parsing - multipile components
    if (contentControlsCount.length > 1) {
      let tempStripedString = this.stripedString;
      for (let i = 0; i <= contentControlsCount.length - 1; i += 2) {
        let sub: any = { type: '', value: '' };

        sub.value = tempStripedString.substring(
          tempStripedString.indexOf(contentControlsCount[i]),
          tempStripedString.indexOf(contentControlsCount[i + 1]) + 16
        );

        tempStripedString = tempStripedString.replace(sub.value, '');
        sub.value = sub.value.replace(contentControlsCount[i], '');
        sub.value = sub.value.replace(contentControlsCount[i + 1], '');

        switch (contentControlsCount[i]) {
          case '-----ST-PAR-----':
            sub.type = 'paragraph';
            break;
          case '-----ST-IMG-----':
            sub.type = 'image';
            break;
          case '-----ST-TBL-----':
            sub.type = 'table';
            break;
        }
        if (!sub.value.match(/-----..-...-----/g)) {
          this.contentControlsStrings.push(sub);
        }
      }
    }
  }

  tableDataParser(contentString: string) {
    let tableSkinData = [];
    let HtmlTableToJson = require('html-table-to-json');
    let tableJson = HtmlTableToJson.parse(contentString);
    tableJson = tableJson.results[0];
    tableJson.forEach((tableRow) => {
      let skinDataTableRow = { fields: [] };
      Object.keys(tableRow).forEach((tableCell) => {
        //filtering numbers only titles
        if (!/^[0-9]+$/.test(tableCell)) {
          let field = { name: tableCell, value: tableRow[tableCell] };
          skinDataTableRow.fields.push(field);
        }
      });
      tableSkinData.push(skinDataTableRow);
    });
    this.skinDataContentControls.push({ type: 'table', data: tableSkinData });
  }

  extractImgSrc = ({ tag, deleteFrom, deleteTo, rangesArr }) => {
    if (tag.name === 'img') {
      tag.attributes.forEach((attribute: any) => {
        if (attribute.name == 'src') {
          rangesArr.push(deleteFrom, deleteTo, attribute.value);
        }
      });
    }
  };

  imgDataParser(contentString: string) {
    let imagesrc = striphtml(contentString, {
      cb: this.extractImgSrc,
    }).result;
    this.skinDataContentControls.push({ type: 'picture', data: imagesrc });
  }

  paragraphDataParser(contentString: string) {
    let paragraphData = { fields: [{ name: 'text', value: contentString }] };
    this.skinDataContentControls.push({
      type: 'paragraph',
      data: paragraphData,
    });
  }
}
