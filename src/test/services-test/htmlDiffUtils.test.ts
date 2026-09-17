import { buildHtmlDiffPair, escapeHtmlText } from '../../services/htmlDiffUtils';
import logger from '../../services/logger';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('htmlDiffUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildHtmlDiffPair', () => {
    it('returns both inputs unmarked when they are identical', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('<p>same text</p>', '<p>same text</p>');
      expect(baseline).toBe('<p>same text</p>');
      expect(compareTo).toBe('<p>same text</p>');
    });

    it('marks a single-word replacement: deletion red+struck, insertion green', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('<p>every 5 seconds</p>', '<p>every 2 seconds</p>');
      expect(baseline).toBe('<p>every <span style="color:#C00000"><s>5</s></span> seconds</p>');
      expect(compareTo).toBe('<p>every <span style="color:#107C10">2</span> seconds</p>');
    });

    it('marks a pure deletion with no corresponding insertion, pulling leading whitespace outside the wrap', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('<p>hello world</p>', '<p>hello</p>');
      expect(baseline).toBe('<p>hello <span style="color:#C00000"><s>world</s></span></p>');
      expect(compareTo).toBe('<p>hello</p>');
    });

    it('marks a pure insertion with no corresponding deletion, pulling leading whitespace outside the wrap', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('<p>hello</p>', '<p>hello world</p>');
      expect(baseline).toBe('<p>hello</p>');
      expect(compareTo).toBe('<p>hello <span style="color:#107C10">world</span></p>');
    });

    it('never wraps a tag, even one only present on one side, but wraps new text inside it', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('<p>ok</p>', '<p>ok <b>done</b></p>');
      expect(baseline).toBe('<p>ok</p>');
      expect(compareTo).toBe('<p>ok <b><span style="color:#107C10">done</span></b></p>');
    });

    it('treats an HTML entity as one atomic token', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('<p>A &amp; B</p>', '<p>A &amp; C</p>');
      expect(baseline).toBe('<p>A &amp; <span style="color:#C00000"><s>B</s></span></p>');
      expect(compareTo).toBe('<p>A &amp; <span style="color:#107C10">C</span></p>');
    });

    it('returns undiffed text when one side is empty', () => {
      const { baseline, compareTo } = buildHtmlDiffPair('', '<p>new content</p>');
      expect(baseline).toBe('');
      expect(compareTo).toBe('<p><span style="color:#107C10">new content</span></p>');
    });

    it('falls back to the undiffed inputs and logs a warning when the token product is too large', () => {
      const bigA = `<p>${'wordA '.repeat(2500)}</p>`;
      const bigB = `<p>${'wordB '.repeat(2500)}</p>`;
      const { baseline, compareTo } = buildHtmlDiffPair(bigA, bigB);
      expect(baseline).toBe(bigA);
      expect(compareTo).toBe(bigB);
      expect((logger as any).warn).toHaveBeenCalled();
    });
  });

  describe('escapeHtmlText', () => {
    it('escapes &, < and >', () => {
      expect(escapeHtmlText('A & B < C > D')).toBe('A &amp; B &lt; C &gt; D');
    });

    it('handles null/undefined-ish empty input', () => {
      expect(escapeHtmlText('')).toBe('');
    });
  });
});
