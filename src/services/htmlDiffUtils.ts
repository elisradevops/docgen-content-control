import logger from './logger';

/**
 * Word/tag-level LCS diff used to give the Historical Query compare document git-diff /
 * Beyond Compare styling: unchanged text stays as-is, text removed from the baseline is
 * wrapped red+strikethrough, text added in the compare-to side is wrapped green.
 *
 * The two returned strings are each independently valid renderings of their own input: every
 * HTML tag from the original string is kept, in its original position, and is never itself
 * wrapped in diff markup - only the text content between tags is. This guarantees the diff
 * output can never corrupt block/inline nesting that the caller has already produced (e.g. via
 * HtmlUtils.cleanHtml), since we never move or wrap a tag.
 */

type TokenType = 'tag' | 'text';

export interface Token {
  type: TokenType;
  value: string;
}

type OpType = 'equal' | 'delete' | 'insert';

interface DiffOp {
  type: OpType;
  token: Token;
}

// Tags, HTML entities, alphanumeric words, whitespace runs, and single punctuation
// characters are each their own token, so word boundaries survive the diff.
const TOKEN_REGEX = /<[^>]+>|&[a-zA-Z][a-zA-Z0-9]*;|&#[0-9]+;|[A-Za-z0-9]+|\s+|[^\sA-Za-z0-9]/g;

// Above this token-product size the quadratic LCS table is skipped and the two inputs are
// returned unmarked, so a pathological work item degrades to today's undiffed output instead
// of stalling the request.
const MAX_DIFF_TOKEN_PRODUCT = 2000 * 2000;

const DELETE_OPEN = '<span style="color:#C00000"><s>';
const DELETE_CLOSE = '</s></span>';
const INSERT_OPEN = '<span style="color:#107C10">';
const INSERT_CLOSE = '</span>';

const WHITESPACE_ONLY = /^\s+$/;

function tokenize(html: string): Token[] {
  const matches = (html || '').match(TOKEN_REGEX) || [];
  return matches.map((value) => ({ type: (value.startsWith('<') ? 'tag' : 'text') as TokenType, value }));
}

/**
 * HTML-escapes a plain-text value so it can safely be tokenized and rendered alongside diff
 * markup without a stray `&`, `<` or `>` in the value breaking the surrounding HTML.
 */
export function escapeHtmlText(value: string): string {
  return (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Longest-common-subsequence diff between two token arrays. Uses a flat Int32Array DP table
 * (rather than an array of arrays) to keep memory bounded for the largest inputs this is
 * allowed to run on (see MAX_DIFF_TOKEN_PRODUCT).
 *
 * Exported so hunkDiffUtils.ts can reuse the exact same alignment engine to match items other
 * than HTML tokens (Steps, table rows) - fed synthetic `{type:'text', value: key}` tokens
 * instead. No new algorithm, just a different key.
 */
export function lcsDiff(a: Token[], b: Token[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i--) {
    const rowCur = i * width;
    const rowNext = (i + 1) * width;
    for (let j = m - 1; j >= 0; j--) {
      dp[rowCur + j] =
        a[i].value === b[j].value ? dp[rowNext + j + 1] + 1 : Math.max(dp[rowNext + j], dp[rowCur + j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].value === b[j].value) {
      ops.push({ type: 'equal', token: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: 'delete', token: a[i] });
      i++;
    } else {
      ops.push({ type: 'insert', token: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: 'delete', token: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: 'insert', token: b[j] });
    j++;
  }
  return ops;
}

/**
 * Renders one side of a diff script back into an HTML string.
 *
 * `changeType` is 'delete' for the baseline side (keep equal + delete ops) or 'insert' for the
 * compare-to side (keep equal + insert ops). Tag tokens are always emitted as-is and never
 * wrapped. Consecutive text tokens matching `changeType` are grouped into a single wrapper,
 * with leading/trailing whitespace of the group pulled back outside the wrapper so a deletion
 * doesn't carry a visibly-struck trailing space.
 */
function renderSide(ops: DiffOp[], changeType: 'delete' | 'insert'): string {
  const [open, close] = changeType === 'delete' ? [DELETE_OPEN, DELETE_CLOSE] : [INSERT_OPEN, INSERT_CLOSE];
  let result = '';
  let buffer: Token[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    let lead = 0;
    while (lead < buffer.length && WHITESPACE_ONLY.test(buffer[lead].value)) lead++;
    let trail = buffer.length;
    while (trail > lead && WHITESPACE_ONLY.test(buffer[trail - 1].value)) trail--;

    result += buffer
      .slice(0, lead)
      .map((t) => t.value)
      .join('');
    const core = buffer
      .slice(lead, trail)
      .map((t) => t.value)
      .join('');
    if (core) {
      result += open + core + close;
    }
    result += buffer
      .slice(trail)
      .map((t) => t.value)
      .join('');
    buffer = [];
  };

  for (const op of ops) {
    if (op.token.type === 'tag') {
      flush();
      result += op.token.value;
      continue;
    }
    if (op.type === changeType) {
      buffer.push(op.token);
    } else {
      flush();
      result += op.token.value;
    }
  }
  flush();
  return result;
}

/**
 * Builds a git-diff/Beyond-Compare styled pair from a baseline and compare-to string: the
 * baseline keeps its own text with removed portions wrapped red+strikethrough, the compare-to
 * keeps its own text with added portions wrapped green. Unchanged text is returned as-is on
 * both sides.
 *
 * Both inputs must already be complete, independently valid HTML (or escaped plain text) -
 * this function never adds, removes or relocates a tag, so each output remains structurally
 * identical to its own input.
 */
export function buildHtmlDiffPair(baselineHtml: string, compareToHtml: string): { baseline: string; compareTo: string } {
  const baselineInput = baselineHtml || '';
  const compareToInput = compareToHtml || '';

  if (baselineInput === compareToInput) {
    return { baseline: baselineInput, compareTo: compareToInput };
  }

  const baselineTokens = tokenize(baselineInput);
  const compareToTokens = tokenize(compareToInput);

  const minLen = Math.min(baselineTokens.length, compareToTokens.length);
  let start = 0;
  while (start < minLen && baselineTokens[start].value === compareToTokens[start].value) start++;

  let endA = baselineTokens.length;
  let endB = compareToTokens.length;
  while (endA > start && endB > start && baselineTokens[endA - 1].value === compareToTokens[endB - 1].value) {
    endA--;
    endB--;
  }

  const midA = baselineTokens.slice(start, endA);
  const midB = compareToTokens.slice(start, endB);

  if (midA.length * midB.length > MAX_DIFF_TOKEN_PRODUCT) {
    logger.warn(
      `htmlDiffUtils: skipping diff for oversized input (${midA.length}x${midB.length} tokens); returning undiffed values`,
    );
    return { baseline: baselineInput, compareTo: compareToInput };
  }

  const script = lcsDiff(midA, midB);
  const equalPrefix: DiffOp[] = baselineTokens.slice(0, start).map((token) => ({ type: 'equal', token }));
  const equalSuffix: DiffOp[] = baselineTokens.slice(endA).map((token) => ({ type: 'equal', token }));

  const baselineOps = equalPrefix.concat(
    script.filter((op) => op.type !== 'insert'),
    equalSuffix,
  );
  const compareToOps = equalPrefix.concat(
    script.filter((op) => op.type !== 'delete'),
    equalSuffix,
  );

  return {
    baseline: renderSide(baselineOps, 'delete'),
    compareTo: renderSide(compareToOps, 'insert'),
  };
}
