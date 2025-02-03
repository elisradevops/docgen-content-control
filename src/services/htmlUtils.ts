import * as cheerio from 'cheerio';
import logger from './logger';
import { minify } from 'html-minifier-terser';
export default class HtmlUtils {
  $: cheerio.Root;

  constructor() {}

  private filterStyleProperties = (style: string, allowedProps: string[]): string => {
    if (!style) return '';
    return style
      .split(';')
      .filter((prop) => {
        const propName = prop.split(':')[0]?.trim();
        return allowedProps.some((allowed) => propName === allowed);
      })
      .join(';');
  };

  private cleanAndPreserveTableAttributes = () => {
    const commonTableAttributes = ['valign', 'align'];
    const commonTableStyles = ['vertical-align', 'text-align', 'width'];

    // Element-specific allowed attributes
    const allowedAttributes = {
      table: [...commonTableAttributes, 'border', 'padding', 'margin', 'width'],
      td: [...commonTableAttributes, 'colspan', 'rowspan', 'width'],
      tr: [...commonTableAttributes, 'height'],
      th: [...commonTableAttributes],
      thead: [...commonTableAttributes],
      tbody: [...commonTableAttributes],
      tfoot: [...commonTableAttributes],
      img: ['src', 'alt', 'width', 'height'],
      div: ['align'],
      p: ['align', 'margin-top', 'margin-bottom'],
    };

    // Element-specific allowed style properties
    const allowedStyles = {
      table: [...commonTableStyles],
      td: [...commonTableStyles, 'writing-mode', 'padding'],
      tr: [...commonTableStyles],
      th: [...commonTableStyles],
      thead: [...commonTableStyles],
      tbody: [...commonTableStyles],
      tfoot: [...commonTableStyles],
    };

    // Remove attributes from non-supported elements
    const supportedElements = Object.keys(allowedAttributes).join(', ');
    this.$('*')
      .not(supportedElements)
      .each((_, element) => {
        const $element = this.$(element);
        Array.from($element.prop('attributes') || []).forEach((attr: any) => {
          $element.removeAttr(attr.name);
        });
      });

    // Handle table elements
    Object.entries(allowedAttributes).forEach(([selector, attrs]) => {
      this.$(selector).each((_, element) => {
        const $element = this.$(element);

        // Add default border to tables if missing
        if (selector === 'table' && !$element.attr('border')) {
          $element.attr('border', '1');
        }

        // Keep only allowed attributes
        Array.from($element.prop('attributes') || []).forEach((attr: any) => {
          if (!attrs.includes(attr.name) && attr.name !== 'style') {
            $element.removeAttr(attr.name);
          }
        });

        // Handle style attribute separately
        const style = $element.attr('style');
        if (style) {
          const filteredStyle = this.filterStyleProperties(style, allowedStyles[selector] || []);
          if (filteredStyle) {
            $element.attr('style', filteredStyle);
          } else {
            $element.removeAttr('style');
          }
        }
      });
    });
  };

  // Replace '\n' or '&nbsp;' with a white space in all inline element text nodes, without removing nested elements
  private replaceNewlinesInInlineElements = () => {
    this.$('span, li, b, u, i, em, strong').each((_, element: any) => {
      const $inlineElement = this.$(element);
      // Get the raw HTML content
      let rawContent = this.$.html($inlineElement);
      // Extract the inner HTML (remove the outer tags)
      const tagName = element.tagName;
      const startTag = new RegExp(`^<${tagName}[^>]*>`);
      const endTag = new RegExp(`<\\/${tagName}>$`);
      rawContent = rawContent.replace(startTag, '').replace(endTag, '');

      // Process the content while preserving &nbsp;
      const hasLeadingSpace = /^\s|^&nbsp;/.test(rawContent);
      const hasTrailingSpace = /\s$|&nbsp;$/.test(rawContent);

      let processedContent = rawContent
        .replace(/\n/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (hasLeadingSpace) {
        processedContent = ' ' + processedContent;
      }
      if (hasTrailingSpace) {
        processedContent += ' ';
      }

      $inlineElement.html(processedContent);
    });
  };

  private cleanupBlockElements = () => {
    // Step 1: Define block elements
    const blockSelector = 'div, p, h1, h2, h3, h4, h5, h6';

    // Step 2: Process text nodes and remove &nbsp;
    this.$(blockSelector).each((_, element: any) => {
      const $blockElement = this.$(element);
      let rawContent = this.$.html($blockElement);
      const tagName = element.tagName;
      const startTag = new RegExp(`^<${tagName}[^>]*>`);
      const endTag = new RegExp(`<\\/${tagName}>$`);
      rawContent = rawContent.replace(startTag, '').replace(endTag, '');
      let processedContent = rawContent.replace(/\n/g, '<br>').trim();
      $blockElement.html(processedContent);

      // Step 3: Remove br tags before closing block element
      const lastChild = $blockElement.contents().last();
      if (lastChild.is('br')) {
        lastChild.remove();
      }
    });

    // Step 4: Remove br tags after block elements
    this.$(blockSelector).each((_, element) => {
      const $block = this.$(element);
      const nextNode = $block.next();
      if (nextNode.is('br')) {
        nextNode.remove();
      }
    });
  };

  /**
   * Decodes HTML entities in a given string.
   *
   * This function replaces common HTML entities with their corresponding characters.
   * The supported entities are:
   * - `&nbsp;` -> `' '`
   * - `&amp;` -> `'&'`
   * - `&lt;` -> `'<'`
   * - `&gt;` -> `'>'`
   * - `&quot;` -> `'"'`
   * - `&#39;` -> `'\''`
   *
   * @param text - The string containing HTML entities to be decoded.
   * @returns The decoded string with HTML entities replaced by their corresponding characters.
   */
  private decodeHtmlEntities = (text: string): string => {
    const entities = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
    };

    return text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => entities[match]);
  };

  /**
   * Removes any <br> elements that are the last child of a <p> element.
   * Iterates over each <p> element in the current context and checks if the last child is a <br> element.
   * If a <br> element is found as the last child, it is removed from the DOM.
   *
   * @private
   */
  private clearBrBeforeEndOfParagraph = () => {
    this.$('p').each((_, p) => {
      const $p = this.$(p);
      const lastChild = $p.contents().last();
      if (lastChild.is('br')) {
        lastChild.remove();
      }
    });
  };

  private removeFormattingTags = () => {
    // Get initial counts for both tag types
    let selector = 'span, font';
    let elementsCount = this.$(selector).length;

    while (elementsCount > 0) {
      // Process deepest elements first to handle nesting
      this.$(selector).each((_, element) => {
        const $element = this.$(element);
        // Preserve content by getting all HTML contents including text and nested elements
        const contents = $element.contents();
        // Replace the element with its contents
        $element.replaceWith(contents);
      });

      // Check for remaining elements
      const newCount = this.$(selector).length;
      if (newCount >= elementsCount) {
        break; // Prevent infinite loop
      }
      elementsCount = newCount;
    }
  };

  private removeEmptyNodes = () => {
    const emptyElements = this.$('div, p, li').filter((_, element) => {
      const $element = this.$(element);
      // Element is considered empty if:
      // 1. Has no text content (after trimming)
      // 2. Has no images
      // 3. Has no tables
      // 4. Has no contents at all
      return (
        !$element.text().trim() &&
        $element.find('img').length === 0 &&
        $element.find('table').length === 0 &&
        (!$element.contents().length ||
          ($element.contents().length === 1 && $element.contents().first().is('br')))
      );
    });

    emptyElements.remove();
  };

  private removeInvalidInlineWrappersAroundBlocks = () => {
    const inlineElements = 'b, u, i, em, strong, span';
    const blockElements = 'div, p, h1, h2, h3, h4, h5, h6';

    // Process from bottom-up to handle nested cases efficiently
    const allInlines = this.$(inlineElements).get().reverse();

    allInlines.forEach((element) => {
      const $element = this.$(element);
      const hasDirectBlockChild = $element.children(blockElements).length > 0;

      if (hasDirectBlockChild) {
        // Collect non-block and block children separately
        const $children = $element.children();
        const nonBlockContent = $element.clone().empty();

        $element.contents().each((_, node) => {
          const $node = this.$(node);
          if (!$node.is(blockElements)) {
            nonBlockContent.append($node.clone());
          }
        });

        // Replace element with: wrapped inline content + unwrapped block content
        const replacement = nonBlockContent.html() + $children.filter(blockElements).toString();
        $element.replaceWith(replacement);
      }
    });
  };

  public async cleanHtml(html): Promise<any> {
    try {
      // Replace newlines within <p> elements
      html = html.replace(/<p>([\s\S]*?)<\/p>/gi, (match, content) => {
        return `<p>${content.replace(/\n/g, '<br>')}</p>`;
      });
      const minifiedHtml = await minify(html, {
        noNewlinesBeforeTagClose: true,
        collapseWhitespace: true,
        collapseInlineTagWhitespace: true,
        preserveLineBreaks: false,
        removeEmptyElements: true,
        removeOptionalTags: true,
      });
      this.$ = cheerio.load(minifiedHtml, { decodeEntities: false });
      this.cleanAndPreserveTableAttributes();
      this.replaceNewlinesInInlineElements();
      this.cleanupBlockElements();
      this.removeInvalidInlineWrappersAroundBlocks();
      this.removeFormattingTags();
      this.removeEmptyNodes();
      this.clearBrBeforeEndOfParagraph();
      return this.$.html();
    } catch (error: any) {
      logger.error(`Error occurred during clean HTML: ${error.message}`);
      logger.error(`Error Stack: ${error.stack}`);
      return '';
    }
  }
}
