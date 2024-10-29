import * as cheerio from 'cheerio';
import logger from './logger';

export default class HtmlUtils {
  $: cheerio.Root;

  constructor() {}

  // Replace '\n' with a white space in all <span> text nodes, without removing nested elements
  private replaceNewlinesInSpans = () => {
    this.$('span').each((_, element) => {
      const $span = this.$(element);

      // Iterate over each text node within the <span> element
      $span.contents().each((_, node) => {
        if (node.type === 'text') {
          let content = node.data || ''; // Get the text content of the text node

          // Replace newlines with white space in text nodes
          content = content.replace(/\n/g, ' ').trim(); // Trim any trailing spaces or newlines

          // Update the text content of the node
          node.data = content;
        }
      });
    });
  };

  // Replace remaining '\n' with <br/> in other elements
  private replaceNewlinesWithBr = () => {
    this.$('*').each((_, element) => {
      const $element = this.$(element);
      const content = $element.html();

      if (content) {
        // Replace newline or <br> before </p> with an empty string
        const updatedContent = content
          .replace(/<br>(?=\s*<\/p>)/g, '') // Remove <br> before closing tags
          .replace(/\n(?=\s*<\/p>)/g, ''); // Remove newline before closing tags

        $element.html(updatedContent);
      }
    });
  };

  private unifyChainedSpans = () => {
    // Select all block-level elements where spans may be chained
    this.$('div, p, li, b, u').each((_, blockElement) => {
      const $blockElement = this.$(blockElement);
      let spanChain: cheerio.Cheerio[] = [];
      let concatenatedText = '';

      // Iterate over the child nodes of the block-level element
      $blockElement.contents().each((_, node) => {
        const $node = this.$(node);

        // If the node is a span with only text, add it to the chain
        if ($node.is('span') && $node.contents().length === 1 && $node.contents().first().text()) {
          spanChain.push($node);
          concatenatedText += $node.text().trim() + ' '; // Concatenate the text
        } else {
          // If the chain is broken or we hit a non-span element, process the span chain
          if (spanChain.length > 1) {
            this.replaceSpanChainWithUnifiedSpan(spanChain, concatenatedText.trim());
          }

          // Reset the chain and concatenated text for the next group of spans
          spanChain = [];
          concatenatedText = '';
        }
      });

      // Handle any remaining span chain at the end of the block element
      if (spanChain.length > 1) {
        this.replaceSpanChainWithUnifiedSpan(spanChain, concatenatedText.trim());
      }
    });
  };

  // Helper function to replace a chain of spans with a single unified span
  private replaceSpanChainWithUnifiedSpan = (spanChain: cheerio.Cheerio[], unifiedText: string) => {
    // Create a new unified <span> with the concatenated text
    const $unifiedSpan = this.$('<span></span>').text(unifiedText);

    // Insert the unified <span> before the first span in the chain
    spanChain[0].before($unifiedSpan);

    // Remove all spans in the chain
    spanChain.forEach(($span) => $span.remove());
  };

  // Utility function to create a paragraph with optional style
  private createParagraph = ($element: cheerio.Cheerio) => {
    const $p = this.$('<p></p>').html($element.html());
    if ($element.attr('style')) {
      $p.attr('style', $element.attr('style'));
    }
    return $p;
  };

  private replaceGroupWithList = (
    group: cheerio.Cheerio[],
    nestedGroup: cheerio.Cheerio[],
    isOrderedList: boolean
  ) => {
    const $list = isOrderedList ? this.$('<ol></ol>') : this.$('<ul></ul>');
    group.forEach(($p) => {
      const text = $p
        .text()
        .replace(/^\d+\.\s*(?:&nbsp;)*|^·\s*(?:&nbsp;)*/g, '')
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
          .replace(/&nbsp;/g, '');
        const $li = this.$('<li></li>').text(text);
        $nestedUl.append($li);
      });
      $list.find('li').last().append($nestedUl);
      nestedGroup.forEach(($p) => $p.remove());
    }
  };

  private processParagraphGroups = () => {
    const paragraphs = this.$('p');
    let currentGroup: cheerio.Cheerio[] = [];
    let previousIndex: number | null = null;
    let nestedGroup: cheerio.Cheerio[] = [];
    let isOrderedList = false;

    paragraphs.each((index, element) => {
      const $element = this.$(element);
      const text = $element.text().trim();

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

  private isOrderedItem = (text: string) => /^\d+\.\s*(?:&nbsp;|\s)+/.test(text);
  private isUnorderedItem = (text: string) => /^·\s*(?:&nbsp;)*\s*/.test(text);
  private isNestedItem = (text: string) => /^o\s*(?:&nbsp;)*\s*/.test(text);

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

  private replaceNestedBrWithSimpleBr = () => {
    this.$('div, span, b, u, i, em, strong').each((_, element) => {
      const $element = this.$(element);
      if ($element.contents().length === 1 && $element.contents().first().is('br')) {
        $element.replaceWith('<br />');
      }
    });
  };

  private replaceSpansWithParagraphs = () => {
    this.$('div > span').each((_, span) => {
      this.$(span).replaceWith(this.createParagraph(this.$(span)));
    });
  };

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

  private replaceBrInDivs = () => {
    this.$('div br').replaceWith('<p></p>');
  };

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

  public cleanHtml(html): any {
    try {
      this.$ = cheerio.load(html);
      this.unifyChainedSpans();
      this.replaceNewlinesInSpans();
      this.replaceNewlinesWithBr();
      this.processParagraphGroups();
      this.replaceNestedBrWithSimpleBr();
      this.replaceSpansWithParagraphs();
      this.handleDivs();
      this.replaceBrInDivs();
      this.wrapTextNodesInDivs();
      return this.$.html();
    } catch (error: any) {
      logger.error(`Error occurred during clean HTML: ${error.message}`);
      logger.error(`Error Stack: ${error.stack}`);
      return '';
    }
  }
}
