import * as cheerio from 'cheerio';

export default class HtmlUtils {
  $: cheerio.Root;

  constructor() {}

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
    this.$ = cheerio.load(html);

    // Process the groups before any manipulations
    this.processParagraphGroups();
    this.replaceNestedBrWithSimpleBr();
    this.replaceSpansWithParagraphs();
    this.handleDivs();
    this.replaceBrInDivs();
    this.wrapTextNodesInDivs();
    return this.$.html();
  }
}
