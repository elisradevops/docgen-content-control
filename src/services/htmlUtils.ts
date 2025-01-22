import * as cheerio from 'cheerio';
import logger from './logger';

export default class HtmlUtils {
  $: cheerio.Root;

  constructor() {}

  /**
   * Removes all attributes from all elements in the HTML content.
   */
  private removeAllElementAttributes = () => {
    this.$('*').each((_, element) => {
      const $element = this.$(element);
      const attributes = $element.attr();
      for (const attr in attributes) {
        $element.removeAttr(attr);
      }
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
          content = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

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
   * Replaces a chain of <span> elements with a single unified <span> containing the concatenated text.
   *
   * @param spanChain - An array of Cheerio <span> elements to be replaced.
   * @param unifiedText - The concatenated text to be set in the new unified <span>.
   */
  private replaceSpanChainWithUnifiedSpan = (spanChain: cheerio.Cheerio[], unifiedText: string) => {
    // Create a new unified <span> with the concatenated text
    const $unifiedSpan = this.$('<span></span>').text(unifiedText);

    // Insert the unified <span> before the first span in the chain
    spanChain[0].before($unifiedSpan);

    // Remove all spans in the chain
    spanChain.forEach(($span) => $span.remove());
  };

  /**
   * Replaces a group of cheerio elements with a list (ordered or unordered).
   *
   * @param group - The group of cheerio elements to be replaced.
   * @param nestedGroup - The nested group of cheerio elements to be handled separately.
   * @param isOrderedList - A boolean indicating whether the list should be ordered (`<ol>`) or unordered (`<ul>`).
   */
  private replaceGroupWithList = (
    group: cheerio.Cheerio[],
    nestedGroup: cheerio.Cheerio[],
    isOrderedList: boolean
  ) => {
    const $list = isOrderedList ? this.$('<ol></ol>') : this.$('<ul></ul>');
    group.forEach(($p) => {
      const text = $p
        .text()
        .replace(/^\d+\.\s*(?:&nbsp;)*|^·\s*(?:&nbsp;)*|^\s·\s*(?:&nbsp;)*/g, '')
        .replace(/&nbsp;/g, '');

      const $li = this.$('<li></li>').text(text);
      $list.append($li);
    });
    group[0].before($list);
    group.forEach(($p) => $p.remove());

    // Handle nested group
    if (nestedGroup.length > 0) {
      const $nestedUl = this.$('<ul></ul>');
      nestedGroup.forEach(($p) => {
        const text = $p
          .text()
          .replace(/^o\s*(?:&nbsp;)*/g, '')
          .replace(/^&nbsp;o(?:&nbsp;)*/g, '')
          .replace(/&nbsp;/g, '');
        const $li = this.$('<li></li>').text(text);
        $nestedUl.append($li);
      });
      $list.find('li').last().append($nestedUl);
      nestedGroup.forEach(($p) => $p.remove());
    }
  };

  /**
   * Processes paragraph groups within the HTML content.
   *
   * This method iterates over all paragraph (`<p>`) elements in the HTML content and groups them based on whether they are part of an ordered list, unordered list, or nested list items. It then processes these groups accordingly.
   *
   * - Ordered list items are identified using `isOrderedItem`.
   * - Unordered list items are identified using `isUnorderedItem`.
   * - Nested list items are identified using `isNestedItem`.
   *
   * For each paragraph, it determines the type of list item and processes it using `processListItem`. If a group of paragraphs is completed, it replaces the group with a list using `replaceGroupWithList`.
   *
   * @private
   */
  private processParagraphGroups = () => {
    const paragraphs = this.$('p');
    let currentGroup: cheerio.Cheerio[] = [];
    let previousIndex: number | null = null;
    let nestedGroup: cheerio.Cheerio[] = [];
    let isOrderedList = false;

    paragraphs.each((index, element) => {
      const $element = this.$(element);
      const text = $element.text();

      if (this.isOrderedItem(text)) {
        this.processListItem(index, $element, previousIndex, currentGroup, nestedGroup, isOrderedList);
        previousIndex = index;
        isOrderedList = true;
      } else if (this.isUnorderedItem(text)) {
        this.processListItem(index, $element, previousIndex, currentGroup, nestedGroup, isOrderedList);
        previousIndex = index;
        isOrderedList = false;
      } else if (this.isNestedItem(text)) {
        nestedGroup.push($element);
      } else {
        if (currentGroup.length > 0) {
          this.replaceGroupWithList(currentGroup, nestedGroup, isOrderedList);
        }
        currentGroup = [];
        nestedGroup = [];
        previousIndex = null;
        isOrderedList = false;
      }
    });

    if (currentGroup.length > 0) {
      this.replaceGroupWithList(currentGroup, nestedGroup, isOrderedList);
    }
  };

  /**
   * Checks if the given text represents an ordered list item.
   *
   * An ordered list item is defined as a string that starts with one or more digits
   * followed by a period and one or more whitespace characters or HTML non-breaking spaces.
   *
   * @param text - The text to check.
   * @returns `true` if the text represents an ordered list item, otherwise `false`.
   */
  private isOrderedItem = (text: string) => /^\d+\.\s*(?:&nbsp;|\s)+/.test(text);
  /**
   * Checks if the given text represents an unordered list item.
   *
   * This function uses a regular expression to determine if the text starts with
   * a bullet point (·) followed by optional whitespace and non-breaking spaces.
   *
   * @param text - The text to check.
   * @returns `true` if the text represents an unordered list item, otherwise `false`.
   */
  private isUnorderedItem = (text: string) => /^\s*·\s*(?:&nbsp;)*\s*|&nbsp;·(?:&nbsp;)+/.test(text);
  /**
   * Checks if the given text represents a nested item.
   *
   * A nested item is defined as a string that starts with the character 'o'
   * followed by zero or more spaces and/or HTML non-breaking spaces (`&nbsp;`).
   *
   * @param text - The text to be checked.
   * @returns `true` if the text represents a nested item, otherwise `false`.
   */
  private isNestedItem = (text: string) => /^o\s*(?:&nbsp;)*\s*/.test(text);

  /**
   * Processes a list item element and groups it with other list items if they are consecutive.
   * If the list item is not consecutive, it replaces the current group with a list and starts a new group.
   *
   * @param index - The index of the current list item.
   * @param $element - The Cheerio element representing the current list item.
   * @param previousIndex - The index of the previous list item, or null if there is no previous item.
   * @param currentGroup - The current group of consecutive list items.
   * @param nestedGroup - The nested group of list items.
   * @param isOrderedList - A boolean indicating whether the list is ordered (true) or unordered (false).
   */
  private processListItem = (
    index: number,
    $element: cheerio.Cheerio,
    previousIndex: number | null,
    currentGroup: cheerio.Cheerio[],
    nestedGroup: cheerio.Cheerio[],
    isOrderedList: boolean
  ) => {
    if (previousIndex === null || index === previousIndex + 1) {
      currentGroup.push($element);
    } else {
      if (currentGroup.length > 0) {
        this.replaceGroupWithList(currentGroup, nestedGroup, isOrderedList);
      }
      currentGroup.length = 0;
      currentGroup.push($element);
    }
  };

  /**
   * Replaces nested <br> elements within specified tags (div, span, b, u, i, em, strong) with a simple <br /> element.
   *
   * This method iterates over each specified tag and checks if it contains only a single <br> element.
   * If the condition is met, the entire tag is replaced with a <br /> element.
   *
   * @private
   */
  private replaceNestedBrWithSimpleBr = () => {
    this.$('div, span, b, u, i, em, strong').each((_, element) => {
      const $element = this.$(element);
      if ($element.contents().length === 1 && $element.contents().first().is('br')) {
        $element.replaceWith('<br />');
      }
    });
  };

  /**
   * Handles the transformation of `<div>` elements within the HTML content.
   *
   * This method processes each `<div>` element and performs the following actions:
   * - If the `<div>` contains only `<br>` elements or empty inline elements (`<b>`, `<u>`, `<i>`, `<em>`, `<strong>`)
   *   with a single `<br>` inside, the `<div>` is removed.
   * - If the `<div>` contains other content, it is replaced with a `<p>` element containing the same content,
   *   and any inline styles from the `<div>` are transferred to the `<p>`.
   *
   * @private
   */
  private handleDivs = () => {
    this.$('div').each((_, div) => {
      const $div = this.$(div);
      const childNodes = $div.contents();

      const containsOnlyBrOrEmptyInlineElements = childNodes
        .toArray()
        .every(
          (node) =>
            this.$(node).is('br') ||
            (this.$(node).is('b, u, i, em, strong') &&
              this.$(node).contents().length === 1 &&
              this.$(node).contents().first().is('br'))
        );

      if (!containsOnlyBrOrEmptyInlineElements) {
        const $p = this.$('<p></p>').append(childNodes.not('br').remove());
        if ($div.attr('style')) {
          $p.attr('style', $div.attr('style'));
        }
        $div.replaceWith($p);
      } else {
        $div.remove();
      }
    });
  };

  /**
   * Replaces all <br> elements within <div> tags with a <p> element.
   *
   * @remarks
   * This method iterates through the DOM of the current document context,
   * selecting all <div> tags that contain <br> elements, and replaces
   * those elements with a paragraph tag <p>.</p>
   *
   * @returns {void} No return value.
   */
  private replaceBrInDivs = () => {
    this.$('div br').replaceWith('<p></p>');
  };

  /**
   * Wraps all text nodes within `div` elements in `p` elements.
   *
   * This method selects all `div` elements, filters their contents to find text nodes,
   * and wraps each text node in a `p` element. If the parent `div` element has a `style`
   * attribute, the same style is applied to the new `p` element.
   *
   * @private
   */
  private wrapTextNodesInDivs = () => {
    this.$('div')
      .contents()
      .filter((_, node) => node.type === 'text' && node.data && node.data.trim() !== '')
      .each((_, textNode) => {
        const $textNode = this.$(textNode);
        const $p = this.$('<p></p>').text($textNode.text());
        if ($textNode.parent().attr('style')) {
          $p.attr('style', $textNode.parent().attr('style'));
        }
        $textNode.replaceWith($p);
      });
  };

  /**
   * Clears any <br> tags that appear immediately before the end of a paragraph (<p>) element.
   * This method iterates over all <p> elements in the current context and removes any <br> tags
   * that are directly followed by the closing </p> tag.
   *
   * @private
   */
  private clearBrBeforeEndOfParagraph = () => {
    this.$('p').each((_, p) => {
      const html = this.$(p).html();
      if (html) {
        this.$(p).html(html.replace(/<br\s*\/?>(?=\s*<\/p>)/gi, ''));
      }
    });
  };

  private removeAllSpans = () => {
    this.$('span').each((_, span) => {
      const $span = this.$(span);
      // Recursively remove nested spans
      $span.find('span').each((_, nestedSpan) => {
        const $nestedSpan = this.$(nestedSpan);
        $nestedSpan.replaceWith($nestedSpan.html());
      });
      $span.replaceWith($span.html());
    });
  };

  private removeFontTags = () => {
    this.$('font').each((_, font) => {
      const $font = this.$(font);
      $font.replaceWith($font.html());
    });
  };

  private removeSuffixWhiteSpace = () => {
    this.$('div, p, li').each((_, element) => {
      const $element = this.$(element);
      const content = $element.html();
      if (content) {
        $element.html(content.trim());
      }
    });
  };

  /**
   * Cleans the provided HTML string by performing a series of transformations.
   *
   * The transformations include:
   * - Loading the HTML into a Cheerio instance.
   * - Clearing element styles.
   * - Unifying chained spans.
   * - Replacing newlines in spans.
   * - Replacing newlines with <br> tags.
   * - Processing paragraph groups.
   * - Replacing nested <br> tags with simple <br> tags.
   * - Replacing spans with paragraphs.
   * - Handling <div> elements.
   * - Replacing <br> tags in <div> elements.
   * - Wrapping text nodes in <div> elements.
   * - Clearing <br> tags before the end of paragraphs.
   *
   * @param html - The HTML string to be cleaned.
   * @returns The cleaned HTML string.
   * @throws Will log an error and return an empty string if an error occurs during the cleaning process.
   */
  public cleanHtml(html): any {
    try {
      this.$ = cheerio.load(html, { decodeEntities: false, normalizeWhitespace: true });
      this.removeAllElementAttributes();
      this.replaceNewlinesInInlineElements();
      this.removeAllSpans();
      this.removeFontTags();
      this.removeSuffixWhiteSpace();
      this.processParagraphGroups();
      this.replaceNestedBrWithSimpleBr();
      this.handleDivs();
      this.replaceBrInDivs();
      this.wrapTextNodesInDivs();
      this.clearBrBeforeEndOfParagraph();
      return this.$.html();
    } catch (error: any) {
      logger.error(`Error occurred during clean HTML: ${error.message}`);
      logger.error(`Error Stack: ${error.stack}`);
      return '';
    }
  }
}
