import * as cheerio from 'cheerio';
import logger from './logger';

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
    this.$('span, li, b, u, i, em, strong').each((_, element) => {
      const $inlineElement = this.$(element);

      // Iterate over each text node within the inline element
      $inlineElement.contents().each((_, node) => {
        if (node.type === 'text') {
          let content = (node.data || '').toString(); // Get the text content of the text node and ensure it's a string

          // Decode HTML entities first
          content = this.decodeHtmlEntities(content);

          // Replace newlines and '&nbsp;' with white space in text nodes
          content = content.replace(/\n/g, ' ').replace('&nbsp;', ' ').replace(/\s+/g, ' ').trim();

          // If the original text starts or ends with a space, preserve it
          if ((node.data || '').startsWith(' ')) {
            content = ' ' + content;
          }
          if ((node.data || '').endsWith(' ')) {
            content = content + ' ';
          }

          // Update the text content of the node
          node.data = content;
        }
      });
    });
  };

  private cleanupBlockElements = () => {
    // Step 1: Define block elements
    const blockSelector = 'div, p, h1, h2, h3, h4, h5, h6';

    // Step 2: Process text nodes and remove &nbsp;
    this.$(blockSelector).each((_, element) => {
      const $block = this.$(element);

      // Handle text nodes
      $block.contents().each((_, node) => {
        if (node.type === 'text') {
          let content = (node.data || '').toString();
          // Remove &nbsp; and normalize spaces
          content = content
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          node.data = content;
        }
      });

      // Step 3: Remove br tags before closing block element
      const lastChild = $block.contents().last();
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

  public cleanHtml(html): any {
    try {
      this.$ = cheerio.load(html, { decodeEntities: false });
      this.cleanAndPreserveTableAttributes();
      this.replaceNewlinesInInlineElements();
      this.cleanupBlockElements();
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
