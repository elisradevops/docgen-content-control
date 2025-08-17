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
      ol: [], // Allow ol elements to preserve their style attributes
      ul: [], // Allow ul elements to preserve their style attributes
      li: [], // Allow li elements to preserve their style attributes
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
      ol: ['list-style', 'list-style-type'], // Allow list-style properties for ol
      ul: ['list-style', 'list-style-type'], // Allow list-style properties for ul
      li: [], // Allow li elements to preserve their style attributes
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
      let processedContent = this.stripTagsAndTrim(element.tagName, rawContent, false);
      $inlineElement.html(processedContent);
    });
  };

  private cleanupBlockElements = () => {
    try {
      // Step 1: Define block elements
      const blockSelector = 'div, p, h1, h2, h3, h4, h5, h6';

      // Step 2: Process text nodes and remove &nbsp;
      this.$(blockSelector).each((_, element: any) => {
        try {
          // Skip if element is not a tag node or doesn't have expected properties
          if (!element || element.type !== 'tag' || !element.tagName) return;

          const $blockElement = this.$(element);
          if (!$blockElement.length) return;

          const rawContent = this.$.html($blockElement);
          const processedContent = this.stripTagsAndTrim(element.tagName, rawContent, true);
          $blockElement.html(processedContent);

          // Step 3: Remove br tags before closing block element
          const $contents = $blockElement.contents();
          if ($contents.length > 0) {
            const lastChild = $contents.last();
            if (lastChild.length > 0 && lastChild.is('br')) {
              lastChild.remove();
            }
          }
        } catch (innerError) {
          logger.error(`Error processing block element: ${innerError.message}`);
        }
      });

      // Step 4: Remove br tags after block elements
      this.$(blockSelector).each((_, element: any) => {
        try {
          // Skip if element is not a tag node or doesn't have expected properties
          if (!element || element.type !== 'tag' || !element.tagName) return;

          const $block = this.$(element);
          if (!$block.length) return;

          const nextNode = $block.next();
          if (nextNode.length > 0 && nextNode[0]?.type === 'tag' && nextNode.is('br')) {
            nextNode.remove();
          }
        } catch (innerError) {
          logger.error(`Error processing block element sibling: ${innerError.message}`);
        }
      });
    } catch (error) {
      logger.error(`Unexpected error in cleanupBlockElements: ${error.message}`);
    }
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

  private stripTagsAndTrim(tagName: string, rawContent: string, isBlockElement: boolean): string {
    const startTag = new RegExp(`^<${tagName}[^>]*>`);
    const endTag = new RegExp(`<\\/${tagName}>$`);
    rawContent = rawContent.replace(startTag, '').replace(endTag, '');

    // Process the content while preserving &nbsp;
    let processedContent = rawContent
      .replace(/\n/g, isBlockElement ? '<br>' : ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ');

    return processedContent;
  }

  /**
   * Removes all img elements from the HTML document.
   * This helps with creating cleaner documents without images.
   *
   * @private
   */
  private removeImgElements = () => {
    this.$('img').each((_, element) => {
      this.$(element).remove();
    });
  };

  /**
   * Optimized method to fix invalid HTML structure by unwrapping inline elements that contain block elements
   */
  private validateAndFixHtmlStructure = () => {
    const inlineElements = [
      'span',
      'b',
      'i',
      'u',
      'strong',
      'em',
      'a',
      'code',
      'font',
      's',
      'strike',
      'small',
      'big',
    ];
    const blockElements = [
      'div',
      'p',
      'table',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'pre',
      'hr',
      'form',
      'fieldset',
      'address',
    ];

    // Single pass: find all invalid inline elements and fix them
    const invalidElements: any[] = [];

    // Collect all invalid inline elements first
    inlineElements.forEach((inlineTag) => {
      this.$(inlineTag).each((_, element) => {
        const $inline = this.$(element);
        const hasBlockChildren = $inline.find(blockElements.join(',')).length > 0;

        if (hasBlockChildren) {
          invalidElements.push({
            element: $inline,
            tagName: inlineTag,
          });
        }
      });
    });

    // Process from innermost to outermost (reverse order)
    invalidElements.reverse().forEach(({ element }) => {
      if (element.parent().length > 0) {
        // Make sure element still exists in DOM
        this.unwrapElement(element);
      }
    });
  };

  /**
   * Safely unwraps an element by replacing it with its contents
   */
  private unwrapElement = ($element: any) => {
    try {
      const contents = $element.contents();

      if (contents.length === 0) {
        // Empty element, just remove it
        $element.remove();
      } else {
        // Replace element with its contents
        $element.replaceWith(contents);
      }
    } catch (error) {
      // If unwrapping fails, just remove the element
      try {
        $element.remove();
      } catch (removeError) {
        // Element might already be removed, ignore
      }
    }
  };

  /**
   * Convert table column widths to percentages and remove colgroup/col tags
   */
  private convertTableWidthsToPercentages = () => {
    this.$('table').each((_, tableElement) => {
      try {
        const $table = this.$(tableElement);
        const widths: number[] = [];
        // Clean the table element itself first
        this.cleanTableStyle($table);

        // Remove colgroup and col tags entirely
        $table.find('colgroup, col').remove();

        // Get widths from first row cells (td or th)
        const $firstRowCells = $table.find('tr:first td, tr:first th');

        $firstRowCells.each((_, cell) => {
          const $cell = this.$(cell);
          let width = null;

          // Try to get width from width attribute first
          width = $cell.attr('width');

          // If no width attribute, try to extract from style
          if (!width) {
            const style = $cell.attr('style') || '';
            const widthMatch = style.match(/width:\s*([^;]+)/i);
            if (widthMatch) {
              width = widthMatch[1].trim();
            }
          }

          if (width) {
            widths.push(this.parseWidth(width));
          } else {
            // If no width found, use equal distribution
            widths.push(100); // Will be normalized later
          }
        });

        // If we have widths, convert to percentages
        if (widths.length > 0) {
          const totalWidth = widths.reduce((sum, width) => sum + width, 0);

          if (totalWidth > 0) {
            // Convert to percentages and round to 2 decimal places
            const percentages = widths.map((width) => Math.round((width / totalWidth) * 100 * 100) / 100);

            // Apply percentages to ALL rows, not just first row
            $table.find('tr').each((_, row) => {
              const $row = this.$(row);
              const $cells = $row.find('td, th');

              $cells.each((cellIndex, cell) => {
                if (cellIndex < percentages.length) {
                  const $cell = this.$(cell);

                  // Set width attribute with percentage
                  $cell.attr('width', `${percentages[cellIndex]}%`);

                  // Clean style attribute - remove width and other unwanted properties
                  this.cleanCellStyle($cell);
                }
              });
            });
          }
        } else {
          // No widths found, distribute equally
          const $allRows = $table.find('tr');
          const maxCells = Math.max(...$allRows.toArray().map((row) => this.$(row).find('td, th').length));

          if (maxCells > 0) {
            const equalWidth = Math.round((100 / maxCells) * 100) / 100;

            $allRows.each((_, row) => {
              const $cells = this.$(row).find('td, th');
              $cells.each((_, cell) => {
                const $cell = this.$(cell);

                // Set width attribute with percentage
                $cell.attr('width', `${equalWidth}%`);

                // Clean style attribute
                this.cleanCellStyle($cell);
              });
            });
          }
        }
      } catch (error) {
        logger.debug(`Error processing table widths: ${error}`);
      }
    });
  };

  /**
   * Clean table style attribute by extracting valid attributes and removing unwanted properties
   */
  private cleanTableStyle = ($table: any) => {
    let style = $table.attr('style') || '';

    if (style) {
      // Extract and set valid table attributes from style

      // Extract align
      const alignMatch = style.match(/text-align:\s*([^;]+)/i);
      if (alignMatch) {
        const alignValue = alignMatch[1].trim();
        if (['left', 'center', 'right', 'justify'].includes(alignValue)) {
          $table.attr('align', alignValue);
          style = style.replace(/text-align:\s*[^;]+;?/gi, '');
        }
      }

      // Extract border
      const borderMatch = style.match(/border:\s*([^;]+)/i);
      if (borderMatch) {
        const borderValue = borderMatch[1].trim();
        // Extract just the border width if it's a simple border (e.g., "1px solid black" -> "1")
        const borderWidth = borderValue.match(/^(\d+)(?:px)?/);
        if (borderWidth) {
          $table.attr('border', borderWidth[1]);
        }
        style = style.replace(/border:\s*[^;]+;?/gi, '');
      }

      // Extract border-width specifically
      const borderWidthMatch = style.match(/border-width:\s*([^;]+)/i);
      if (borderWidthMatch) {
        const borderWidthValue = borderWidthMatch[1].trim();
        const borderWidthNum = borderWidthValue.match(/^(\d+)(?:px)?/);
        if (borderWidthNum) {
          $table.attr('border', borderWidthNum[1]);
        }
        style = style.replace(/border-width:\s*[^;]+;?/gi, '');
      }

      // Extract padding
      const paddingMatch = style.match(/padding:\s*([^;]+)/i);
      if (paddingMatch) {
        const paddingValue = paddingMatch[1].trim();
        // Convert padding to cellpadding attribute
        const paddingNum = paddingValue.match(/^(\d+)(?:px)?/);
        if (paddingNum) {
          $table.attr('cellpadding', paddingNum[1]);
        }
        style = style.replace(/padding:\s*[^;]+;?/gi, '');
      }

      // Extract margin
      const marginMatch = style.match(/margin:\s*([^;]+)/i);
      if (marginMatch) {
        const marginValue = marginMatch[1].trim();
        // Convert margin to cellspacing attribute
        const marginNum = marginValue.match(/^(\d+)(?:px)?/);
        if (marginNum) {
          $table.attr('cellspacing', marginNum[1]);
        }
        style = style.replace(/margin:\s*[^;]+;?/gi, '');
      }

      // Extract width (but only if not already set as attribute)
      if (!$table.attr('width')) {
        const widthMatch = style.match(/width:\s*([^;]+)/i);
        if (widthMatch) {
          const widthValue = widthMatch[1].trim();
          // Accept px, pt, % values
          if (widthValue.match(/^\d+(?:px|pt|%)?$/)) {
            $table.attr('width', widthValue);
          }
          style = style.replace(/width:\s*[^;]+;?/gi, '');
        }
      } else {
        // Remove width from style if width attribute already exists
        style = style.replace(/width:\s*[^;]+;?/gi, '');
      }

      // Remove other potentially problematic properties
      style = style.replace(/height:\s*[^;]+;?/gi, '');

      // Clean up multiple semicolons and whitespace
      style = style.replace(/;+/g, ';'); // Replace multiple semicolons with single
      style = style.replace(/;\s*;/g, ';'); // Remove empty style declarations
      style = style.replace(/^;+|;+$/g, ''); // Remove leading/trailing semicolons
      style = style.trim();

      // If style is not empty, set it back, otherwise remove the attribute
      if (style) {
        $table.attr('style', style);
      } else {
        $table.removeAttr('style');
      }
    }
    // Always set table width to 100%
    $table.attr('width', '100%');
  };

  /**
   * Clean cell style attribute by removing width and other unwanted properties
   */
  private cleanCellStyle = ($cell: any) => {
    let style = $cell.attr('style') || '';

    if (style) {
      // Remove width property completely
      style = style.replace(/width:\s*[^;]+;?/gi, '');

      // Remove other potentially problematic properties
      style = style.replace(/height:\s*[^;]+;?/gi, '');

      // Clean up multiple semicolons and whitespace
      style = style.replace(/;+/g, ';'); // Replace multiple semicolons with single
      style = style.replace(/;\s*;/g, ';'); // Remove empty style declarations
      style = style.replace(/^;+|;+$/g, ''); // Remove leading/trailing semicolons
      style = style.trim();

      // If style is not empty, set it back, otherwise remove the attribute
      if (style) {
        $cell.attr('style', style);
      } else {
        $cell.removeAttr('style');
      }
    }

    // Also remove deprecated attributes
    $cell.removeAttr('align');
    $cell.removeAttr('valign');
    $cell.removeAttr('height');
  };

  private removeRedundantElements = () => {
    // First, unwrap all span elements
    this.$('span').each((_, element) => {
      const $span = this.$(element);
      $span.replaceWith($span.contents());
    });

    // Then remove other empty inline elements
    this.$('b, i, u, strong, em, font').each((_, element) => {
      const $el = this.$(element);
      if (!$el.text().trim() && $el.children().length === 0) {
        $el.remove();
      }
    });
  };

  /**
   * Helper method to extract width value from style string
   */
  private extractWidthFromStyle = (style: string): string | null => {
    const match = style.match(/width:\s*([^;]+)/i);
    return match ? match[1].trim() : null;
  };

  /**
   * Helper method to parse width value and convert to numeric value
   */
  private parseWidth = (width: string): number => {
    const numericValue = parseFloat(width);

    if (isNaN(numericValue)) {
      return 100; // Default fallback
    }

    if (width.includes('pt')) {
      return numericValue * 1.33; // Convert points to pixels
    } else if (width.includes('%')) {
      return numericValue; // Keep percentage as-is
    } else if (width.includes('px')) {
      return numericValue; // Pixels
    } else {
      return numericValue; // Assume pixels
    }
  };

  private preserveListSpacing = () => {
    this.$('*').each((_, element) => {
      const $element = this.$(element);
      let html = $element.html();

      if (!html) return;

      // Replace all nbsp with a single space first
      html = html.replace(/&nbsp;/g, ' ');

      // Handle various bullet points with consistent spacing
      // Current bullets: o, ●, ◊, -, *, •, ◦, ▪, ▫, ♦, ♠, ♣, ♥, ✓, ➢, ➤, →, ►, ▶
      // Also supports numbered bullets like 1., 2., a), b), i., ii., etc.
      html = html.replace(/([o●◊\-\*•◦▪▫♦♠♣♥✓➢➤→►▶]|\d+[.)]|[a-z]\)|i+v?i*\.?|v?i{1,3}\.)\s+/g, '$1   ');

      if (html !== $element.html()) {
        $element.html(html);
      }
    });
  };

  /**
   * Trims whitespace from text nodes within block elements
   */
  private trimTextNodes = () => {
    const blockSelector =
      'p, div, h1, h2, h3, h4, h5, h6, li, td, th, header, footer, section, article, aside, nav';

    this.$(blockSelector).each((_, blockElement) => {
      const $blockEl = this.$(blockElement);

      // Trim leading whitespace from the first text node child, if it exists
      const firstChild = $blockEl.contents().first();
      if (firstChild.length > 0 && firstChild[0].type === 'text') {
        // Assert as a text node type with a 'data' property
        const textNode = firstChild[0] as { type: 'text'; data: string };
        const originalText = textNode.data || '';
        const newText = originalText.replace(/^\s+/, '');
        if (newText !== originalText) {
          textNode.data = newText;
        }
      }

      // Trim trailing whitespace from the last text node child, if it exists
      const lastChild = $blockEl.contents().last();
      if (lastChild.length > 0 && lastChild[0].type === 'text') {
        // Assert as a text node type with a 'data' property
        // If firstChild and lastChild are the same node, originalText for this operation
        // should be its current state (possibly modified by leading trim)
        const textNode = lastChild[0] as { type: 'text'; data: string };
        const originalText = textNode.data || '';
        const newText = originalText.replace(/\s+$/, '');
        if (newText !== originalText) {
          textNode.data = newText;
        }
      }
    });
  };

  /**
   * Trims whitespace around <br> tags
   */
  private trimWhitespaceAroundBr = () => {
    this.$('br').each((_, brElement) => {
      const brNode = brElement; // brElement is the raw DOM node

      // Handle text node before <br>
      const prevNode = brNode.prev;
      if (prevNode && prevNode.type === 'text') {
        const textNode = prevNode as { type: 'text'; data: string };
        const originalText = textNode.data;
        if (typeof originalText === 'string') {
          const newText = originalText.replace(/\s+$/, ''); // Trim trailing whitespace
          if (newText !== originalText) {
            textNode.data = newText;
          }
          if (textNode.data === '') {
            this.$(textNode).remove();
          }
        }
      }

      // Handle text node after <br>
      const nextNode = brNode.next;
      if (nextNode && nextNode.type === 'text') {
        const textNode = nextNode as { type: 'text'; data: string };
        const originalText = textNode.data;
        if (typeof originalText === 'string') {
          const newText = originalText.replace(/^\s+/, ''); // Trim leading whitespace
          if (newText !== originalText) {
            textNode.data = newText;
          }
          if (textNode.data === '') {
            this.$(textNode).remove();
          }
        }
      }
    });
  };

  public async cleanHtml(
    html,
    needToRemoveImg: boolean = false,
    splitParagraphsIntoSeparateElements: boolean = false
  ): Promise<any> {
    try {
      // Replace newlines within <p> elements
      html = html.replace(/<p>([\s\S]*?)<\/p>/gi, (match, content) => {
        return `<p>${content.replace(/\n/g, '<br>')}</p>`;
      });
      const minifiedHtml = await minify(html, {
        noNewlinesBeforeTagClose: true,
        collapseWhitespace: true,
        conservativeCollapse: true,
        preserveLineBreaks: false,
        removeEmptyElements: true,
        removeOptionalTags: false, // Preserve style attributes including list-style
        removeEmptyAttributes: false, // Don't remove style attributes that might appear "empty"
        removeStyleLinkTypeAttributes: false, // Preserve all style-related attributes
      });
      // this.$ = cheerio.load(minifiedHtml, { decodeEntities: false });
      this.$ = cheerio.load(minifiedHtml);
      // Step 1: Fix HTML structure (remove invalid inline wrappers)
      this.validateAndFixHtmlStructure();
      // Step 2: Preserve list spacing
      this.preserveListSpacing();
      // Step 3: Convert table widths to percentages
      this.convertTableWidthsToPercentages();
      // Step 4: Normalize list-style attributes to list-style-type
      this.normalizeListStyleAttributes();
      // Step 5: Remove redundant elements
      this.removeRedundantElements();
      // Step 6: Apply existing cleaning methods
      this.cleanAndPreserveTableAttributes();
      // Step 7: Replace newlines in inline elements
      this.replaceNewlinesInInlineElements();
      // Step 8: Cleanup block elements
      this.cleanupBlockElements();
      // Step 9: Remove invalid inline wrappers around blocks
      this.removeInvalidInlineWrappersAroundBlocks();
      // Step 10: Clear <br> before end of paragraph
      this.clearBrBeforeEndOfParagraph();
      // Step 11: Remove <img> elements if needed
      if (needToRemoveImg) {
        this.removeImgElements();
      }
      // Step 12: Split paragraphs if table cell content and trimAdditionalSpacingInTables is enabled
      if (splitParagraphsIntoSeparateElements) {
        this.splitParagraphsIntoSeparateElements();
      }
      // Step 13: Trim text nodes before returning
      this.trimTextNodes();
      // Step 14: Trim whitespace around <br> tags
      this.trimWhitespaceAroundBr();
      return this.$.html();
    } catch (error: any) {
      logger.error(`Error occurred during clean HTML: ${error.message}`);
      logger.error(`error stack ${error.stack}`);
      throw error;
    }
  }

  private splitParagraphsIntoSeparateElements = () => {
    // Process all elements that might contain text content
    this.$('p, div, td, th, li').each((_, element) => {
      const $element = this.$(element);
      let html = $element.html();

      if (!html) return;

      // Step 1: Clean up redundant whitespace and newlines
      // Remove newlines that are followed by <br> tags (redundant)
      html = html.replace(/\n\s*<br\s*\/?>/gi, '<br>');

      // Remove newlines that are preceded by <br> tags (redundant)
      html = html.replace(/<br\s*\/?>\s*\n/gi, '<br>');

      // Handle <br>&nbsp; patterns specifically
      html = html.replace(/<br\s*\/?>&nbsp;\s*/gi, '<br>');

      // Step 2: Split content by <br> tags and newlines
      let parts = html.split(/<br\s*\/?>/gi);

      // Further split by actual newline characters
      const finalParts: string[] = [];
      parts.forEach((part) => {
        const subParts = part.split(/\n/);
        finalParts.push(...subParts);
      });

      // Step 3: Clean each part thoroughly
      const cleanParts = finalParts
        .map((part) => {
          // Replace &nbsp; with regular spaces
          part = part.replace(/&nbsp;/g, ' ');
          // Remove multiple consecutive spaces
          part = part.replace(/\s+/g, ' ');
          // Trim whitespace
          part = part.trim();
          return part;
        })
        .filter((part) => part.length > 0); // Remove empty parts

      // Step 4: Replace element content based on element type
      if (cleanParts.length > 1) {
        if ($element.is('p')) {
          // For paragraphs, create multiple separate paragraphs
          const newParagraphs = cleanParts.map((part) => `<p>${part}</p>`).join('');
          $element.replaceWith(newParagraphs);
        } else {
          // For other elements (div, td, th, li), create paragraphs inside
          const newContent = cleanParts.map((part) => `<p>${part}</p>`).join('');
          $element.html(newContent);
        }
      } else if (cleanParts.length === 1) {
        // Single clean part - just update the content
        if ($element.is('p')) {
          $element.html(cleanParts[0]);
        } else {
          $element.html(`<p>${cleanParts[0]}</p>`);
        }
      }
    });

    // Step 5: Remove any remaining empty elements
    this.$('p, div').each((_, element) => {
      const $element = this.$(element);
      const text = $element.text().trim();
      const hasContent = $element.children().length > 0 || text.length > 0;

      if (!hasContent) {
        $element.remove();
      }
    });
  };

  /**
   * Normalizes list-style attributes to list-style-type attributes.
   * Converts shorthand 'list-style' CSS property to specific 'list-style-type' property
   * for proper parsing by HTML to OpenXML converters.
   */
  private normalizeListStyleAttributes = (): void => {
    // Find all ol and ul elements with style attributes
    this.$('ol[style], ul[style]').each((_, element) => {
      const $element = this.$(element);
      const styleAttr = $element.attr('style');
      
      if (!styleAttr) return;

      // Parse the style attribute to extract list-style values
      const styles = styleAttr.split(';').reduce((acc, style) => {
        const [property, value] = style.split(':').map(s => s.trim());
        if (property && value) {
          acc[property] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      // Check if list-style property exists and list-style-type doesn't
      if (styles['list-style'] && !styles['list-style-type']) {
        const listStyleValue = styles['list-style'].trim();
        
        // Extract the list-style-type from the list-style shorthand
        // Common list-style-type values: decimal, lower-alpha, upper-alpha, lower-roman, upper-roman, disc, circle, square, none
        const listStyleTypes = [
          'decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman',
          'disc', 'circle', 'square', 'none'
        ];
        
        // Find matching list-style-type in the shorthand value
        const matchedType = listStyleTypes.find(type => 
          listStyleValue.includes(type)
        );
        
        if (matchedType) {
          // Remove the old list-style property and add list-style-type
          delete styles['list-style'];
          styles['list-style-type'] = matchedType;
          
          // Rebuild the style attribute
          const newStyleAttr = Object.entries(styles)
            .map(([prop, val]) => `${prop}: ${val}`)
            .join('; ');
          
          $element.attr('style', newStyleAttr);
        }
      }
    });
  };
}
