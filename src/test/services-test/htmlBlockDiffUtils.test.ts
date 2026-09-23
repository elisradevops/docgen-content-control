import { diffHtmlContent } from '../../services/htmlBlockDiffUtils';

describe('htmlBlockDiffUtils', () => {
  describe('diffHtmlContent', () => {
    it('returns both inputs unchanged when they are identical', () => {
      const html = '<p>same</p><p>same too</p>';
      expect(diffHtmlContent(html, html)).toEqual({ baseline: html, compareTo: html });
    });

    it('falls back to a flat word-level diff when there are fewer than 2 blocks (leaf case)', () => {
      const result = diffHtmlContent('<p>old text</p>', '<p>new text</p>');
      expect(result.baseline).toBe('<p><span style="color:#C00000"><s>old</s></span> text</p>');
      expect(result.compareTo).toBe('<p><span style="color:#107C10">new</span> text</p>');
    });

    it('hunks table rows: only the changed row is shown, the rest collapse into one marker', () => {
      const buildTable = (rows: number, changedRow?: number) => {
        let html = '<table>';
        for (let r = 0; r < rows; r++) {
          html += `<tr><td>${changedRow === r ? 'UPDATED' : `value ${r}`}</td></tr>`;
        }
        return `${html}</table>`;
      };
      const baseline = buildTable(8);
      const compareTo = buildTable(8, 4);

      const result = diffHtmlContent(baseline, compareTo);
      expect(result.compareTo).toContain('<span style="color:#107C10">UPDATED</span>');
      expect(result.baseline).toContain('<span style="color:#C00000"><s>value 4</s></span>');
      expect(result.baseline).toContain('rows unchanged');
      expect(result.compareTo).toContain('rows unchanged');
      // Cheerio auto-inserts <tbody> even though the source never had one - the wrapper must
      // still come back out intact around the hunked rows.
      expect(result.baseline).toMatch(/^<table><tbody>.*<\/tbody><\/table>$/);
      // Collapsed/unchanged rows never render their own (unchanged) text on either side.
      expect(result.baseline).not.toContain('value 0<');
      expect(result.compareTo).not.toContain('value 0<');
    });

    it('diffs a table row whose cell contains its own nested table correctly, instead of corrupting on the inner </tr>', () => {
      const outerRow = (cell: string) => `<tr><td>${cell}</td></tr>`;
      const innerTable = (value: string) => `<table><tr><td>${value}</td></tr><tr><td>unrelated</td></tr></table>`;
      const baseline = `<table>${outerRow('before')}${outerRow(innerTable('old value'))}${outerRow('after')}</table>`;
      const compareTo = `<table>${outerRow('before')}${outerRow(innerTable('new value'))}${outerRow('after')}</table>`;

      const result = diffHtmlContent(baseline, compareTo);
      // The unrelated outer rows are untouched and still present in full on both sides.
      expect(result.baseline).toContain('before');
      expect(result.baseline).toContain('after');
      expect(result.compareTo).toContain('before');
      expect(result.compareTo).toContain('after');
      // The nested table's own structure survives fully valid - not corrupted by the outer
      // row's boundary, and its own unrelated row is preserved untouched on both sides.
      expect(result.baseline).toContain('unrelated');
      expect(result.compareTo).toContain('unrelated');
      // The actual change (inside the nested table) is found and diff-highlighted correctly.
      expect(result.baseline).toContain('<span style="color:#C00000"><s>old</s></span> value');
      expect(result.compareTo).toContain('<span style="color:#107C10">new</span> value');
      // Every opened table tag is closed - no corrupted/truncated structure.
      expect((result.baseline.match(/<table>/g) || []).length).toBe((result.baseline.match(/<\/table>/g) || []).length);
      expect((result.compareTo.match(/<table>/g) || []).length).toBe((result.compareTo.match(/<\/table>/g) || []).length);
    });

    it('hunks Description-style paragraphs: unchanged paragraphs collapse, the changed one is shown', () => {
      const buildParas = (count: number, changedIndex?: number) =>
        Array.from({ length: count }, (_, i) => `<p>${changedIndex === i ? 'Updated paragraph' : `Paragraph ${i}`}</p>`).join('');
      const baseline = buildParas(10);
      const compareTo = buildParas(10, 4);

      const result = diffHtmlContent(baseline, compareTo);
      expect(result.compareTo).toContain('<span style="color:#107C10">Updated</span>');
      expect(result.baseline).toContain('paragraphs unchanged');
      expect(result.baseline).not.toContain('Paragraph 0<');
    });

    it('hunks list items the same way, using an <li> marker', () => {
      const buildList = (count: number, changedIndex?: number) =>
        `<ul>${Array.from({ length: count }, (_, i) => `<li>${changedIndex === i ? 'Updated item' : `Item ${i}`}</li>`).join('')}</ul>`;
      const baseline = buildList(8);
      const compareTo = buildList(8, 4);

      const result = diffHtmlContent(baseline, compareTo);
      expect(result.compareTo).toContain('<span style="color:#107C10">Updated</span>');
      expect(result.baseline).toContain('items unchanged');
      expect(result.baseline).toMatch(/^<ul>.*<\/ul>$/);
    });

    it('correctly attributes each change when two adjacent blocks change at the same time', () => {
      // Regression for a cross-wiring bug: pairAdjacentReplacements used to pair the first
      // removed block with the first added block regardless of which blocks they actually
      // corresponded to, so two simultaneous adjacent changes (an intro paragraph edited right
      // before a table that also changed) got scrambled into one nonsensical whole-block diff.
      const buildTable = (changedRow?: number) =>
        `<table>${[0, 1, 2].map((r) => `<tr><td>${changedRow === r ? 'UPDATED' : `value ${r}`}</td></tr>`).join('')}</table>`;
      const baseline = `<p>Intro text</p>${buildTable()}<p>Outro text</p>`;
      const compareTo = `<p>Intro text edited</p>${buildTable(1)}<p>Outro text</p>`;

      const result = diffHtmlContent(baseline, compareTo);
      // The intro edit is attributed to the intro paragraph, not smeared across the table.
      expect(result.compareTo).toContain('<p>Intro text <span style="color:#107C10">edited</span></p>');
      // The table's own single-row change is found on its own, not as a whole-table replacement.
      expect(result.compareTo).toContain('<span style="color:#107C10">UPDATED</span>');
      expect(result.baseline).toContain('<span style="color:#C00000"><s>value 1</s></span>');
      // Unrelated rows/paragraphs are untouched, proving the change wasn't smeared across blocks.
      expect(result.baseline).toContain('value 0');
      expect(result.compareTo).toContain('value 0');
      expect(result.baseline).toContain('<p>Outro text</p>');
      expect(result.compareTo).toContain('<p>Outro text</p>');
    });

    it('preserves gap/prose content around a table, diffing it independently of the row hunking', () => {
      const baseline = '<p>Before</p><table><tr><td>a</td></tr><tr><td>b</td></tr></table><p>After</p>';
      const compareTo = '<p>Before edited</p><table><tr><td>a</td></tr><tr><td>b</td></tr></table><p>After</p>';

      const result = diffHtmlContent(baseline, compareTo);
      expect(result.compareTo).toContain('<p>Before <span style="color:#107C10">edited</span></p>');
      expect(result.baseline).toContain('<p>After</p>');
      expect(result.compareTo).toContain('<p>After</p>');
    });
  });
});
