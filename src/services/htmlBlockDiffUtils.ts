import * as cheerio from 'cheerio';
import { buildHtmlDiffPair } from './htmlDiffUtils';
import { alignByKey, pairAdjacentReplacements, buildHunks, Aligned } from './hunkDiffUtils';

/**
 * Generic, recursive block-level HTML differ for the Historical Query compare docx. Replaces
 * the old regex-based table-row splitter (broke on a table nested inside a table cell, since a
 * flat `<tr>` regex can't tell an inner row's closing tag from the outer row's) and extends
 * hunking to any block-level content (e.g. Description's own paragraphs), not just table rows.
 *
 * Given two HTML fragments, splits each side's direct children (after peeling through any
 * "grouping" wrapper that is the sole content at a level - table/thead/tbody/tfoot/ul/ol,
 * including cheerio's auto-inserted `<tbody>`) into block-level elements and the "gap" content
 * (text/inline elements) around them. When both sides have at least 2 blocks, the blocks are
 * matched by a content signature and hunked (git-diff style: unchanged runs collapse, changed
 * blocks recurse into `diffHtmlContent` again so nested structure - e.g. a table nested in a
 * cell - is walked correctly instead of breaking). Otherwise (fewer than 2 blocks on either
 * side) this is the recursion's base case: a flat word/tag-level diff via `buildHtmlDiffPair`.
 *
 * Like `htmlDiffUtils.ts`, a tag is never itself wrapped in diff markup at any recursion level -
 * only text content is.
 */

const BLOCK_TAGS = new Set([
  'div',
  'p',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
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
]);

// Wrapper tags that are transparent for block-splitting purposes: a container whose only
// content is one of these is "unwrapped" one level, so e.g. a whole `<table>` (whose real rows
// live inside a `<tbody>` cheerio always inserts, even when absent from the source) or a whole
// `<ul>` (whose real items are its own children) still yields the actual blocks to hunk.
const GROUPING_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'ul', 'ol']);

type ContainerKind = 'table' | 'list' | 'other';

interface BlockEntry {
  html: string;
  index: number;
}

interface ParsedContainer {
  wrapOpen: string;
  wrapClose: string;
  containerKind: ContainerKind;
  blocks: BlockEntry[];
  gaps: string[];
}

function escapeAttrValue(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function openTagOf(el: any): string {
  const attrs = Object.entries(el.attribs || {})
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttrValue(value as string)}"`))
    .join('');
  return `<${el.tagName}${attrs}>`;
}

function closeTagOf(el: any): string {
  return `</${el.tagName}>`;
}

function isBlankTextNode(node: any): boolean {
  return node.type === 'text' && /^\s*$/.test(node.data || '');
}

/**
 * Parses one side's HTML fragment into the container it represents for block-splitting: peels
 * through any sole grouping wrapper (table/thead/tbody/tfoot/ul/ol) until reaching the level
 * whose direct children are the real blocks, then splits those children into block-level
 * elements (`BLOCK_TAGS`) and the gap content (text/inline elements) around them.
 */
function parseContainer(html: string): ParsedContainer {
  // Cast needed: the installed @types/cheerio@0.22 typings don't know about cheerio 1.0's
  // 3-arg `load(html, options, isDocument)` fragment-mode signature.
  const $ = (cheerio.load as any)(html, null, false);
  let scope: any = $.root();
  let wrapOpen = '';
  const wrapCloseParts: string[] = [];
  let containerKind: ContainerKind = 'other';

  while (true) {
    const significant = scope.contents().toArray().filter((n: any) => !isBlankTextNode(n));
    if (significant.length !== 1) break;
    const only = significant[0];
    const tag = only.type === 'tag' ? String(only.tagName || '').toLowerCase() : '';
    if (!GROUPING_TAGS.has(tag)) break;
    wrapOpen += openTagOf(only);
    wrapCloseParts.unshift(closeTagOf(only));
    containerKind = tag === 'ul' || tag === 'ol' ? 'list' : 'table';
    scope = $(only);
  }

  const blocks: BlockEntry[] = [];
  const gaps: string[] = [''];
  scope.contents().each((_: number, node: any) => {
    const tag = node.type === 'tag' ? String(node.tagName || '').toLowerCase() : '';
    if (tag && BLOCK_TAGS.has(tag)) {
      blocks.push({ html: $.html(node), index: blocks.length });
      gaps.push('');
    } else {
      gaps[gaps.length - 1] += $.html(node) || '';
    }
  });

  return { wrapOpen, wrapClose: wrapCloseParts.join(''), containerKind, blocks, gaps };
}

/**
 * Normalizes a block for equality matching only (never for rendering): strips every tag's
 * attributes and collapses whitespace, so two blocks with identical visible content but
 * different formatting (e.g. a cell width Word recalculates on every save) still match.
 */
function blockSignature(html: string): string {
  return html
    .replace(/<([a-zA-Z0-9]+)[^>]*>/g, '<$1>')
    .replace(/\s+/g, ' ')
    .trim();
}

function countCells(html: string | undefined): number {
  const matches = (html || '').match(/<td\b/gi);
  return matches && matches.length > 0 ? matches.length : 1;
}

function buildMarker(kind: ContainerKind, count: number, total: number, cols: number): string {
  if (kind === 'table') {
    return `<tr><td colspan="${cols}"><i>${count} of ${total} rows unchanged</i></td></tr>`;
  }
  if (kind === 'list') {
    return `<li><i>${count} of ${total} items unchanged</i></li>`;
  }
  return `<p><i>${count} of ${total} paragraphs unchanged</i></p>`;
}

function onlyBaseline(html: string): string {
  return html ? buildHtmlDiffPair(html, '').baseline : '';
}

function onlyCompareTo(html: string): string {
  return html ? buildHtmlDiffPair('', html).compareTo : '';
}

/**
 * Diffs two HTML fragments (a whole field's content, or one recursively-diffed block's own
 * content), returning a git-diff/Beyond-Compare styled pair - see the module doc comment for
 * the algorithm.
 */
export function diffHtmlContent(baselineHtml: string, compareToHtml: string): { baseline: string; compareTo: string } {
  const baselineInput = baselineHtml || '';
  const compareToInput = compareToHtml || '';

  if (baselineInput === compareToInput) {
    return { baseline: baselineInput, compareTo: compareToInput };
  }

  const baseParsed = parseContainer(baselineInput);
  const compParsed = parseContainer(compareToInput);

  if (baseParsed.blocks.length < 2 || compParsed.blocks.length < 2) {
    return buildHtmlDiffPair(baselineInput, compareToInput);
  }

  const aligned = pairAdjacentReplacements(
    alignByKey(baseParsed.blocks, compParsed.blocks, (b) => blockSignature(b.html)),
  );
  const hunks = buildHunks(aligned, () => false, { contextSize: 1 });

  const containerKind = baseParsed.containerKind !== 'other' ? baseParsed.containerKind : compParsed.containerKind;
  const cols = countCells((baseParsed.blocks[0] || compParsed.blocks[0])?.html);
  const total = Math.max(baseParsed.blocks.length, compParsed.blocks.length);

  // The gap immediately after a given block on its own side, or '' when it's the last block -
  // that trailing gap is handled once, globally, below (see leadingDiff/trailingDiff), so a
  // fully-collapsed run never swallows real prefix/suffix content around it.
  const gapAfter = (parsed: ParsedContainer, index: number): string =>
    index + 1 < parsed.blocks.length ? parsed.gaps[index + 1] : '';

  let baseOut = '';
  let compOut = '';

  for (const hunk of hunks) {
    if (hunk.type === 'collapsed') {
      const marker = buildMarker(containerKind, hunk.items.length, total, cols);
      baseOut += marker;
      compOut += marker;
      continue;
    }
    for (const item of hunk.items as Aligned<BlockEntry>[]) {
      if (item.status === 'matched') {
        baseOut += item.baseline!.html + gapAfter(baseParsed, item.baseline!.index);
        compOut += item.compareTo!.html + gapAfter(compParsed, item.compareTo!.index);
      } else if (item.status === 'replaced') {
        const refined = diffHtmlContent(item.baseline!.html, item.compareTo!.html);
        const gapDiff = buildHtmlDiffPair(
          gapAfter(baseParsed, item.baseline!.index),
          gapAfter(compParsed, item.compareTo!.index),
        );
        baseOut += refined.baseline + gapDiff.baseline;
        compOut += refined.compareTo + gapDiff.compareTo;
      } else if (item.status === 'removed') {
        baseOut += onlyBaseline(item.baseline!.html) + onlyBaseline(gapAfter(baseParsed, item.baseline!.index));
      } else if (item.status === 'added') {
        compOut += onlyCompareTo(item.compareTo!.html) + onlyCompareTo(gapAfter(compParsed, item.compareTo!.index));
      }
    }
  }

  const leadingDiff = buildHtmlDiffPair(baseParsed.gaps[0], compParsed.gaps[0]);
  const trailingDiff = buildHtmlDiffPair(
    baseParsed.gaps[baseParsed.blocks.length],
    compParsed.gaps[compParsed.blocks.length],
  );

  return {
    baseline: baseParsed.wrapOpen + leadingDiff.baseline + baseOut + trailingDiff.baseline + baseParsed.wrapClose,
    compareTo: compParsed.wrapOpen + leadingDiff.compareTo + compOut + trailingDiff.compareTo + compParsed.wrapClose,
  };
}

export { BLOCK_TAGS, blockSignature, countCells };
