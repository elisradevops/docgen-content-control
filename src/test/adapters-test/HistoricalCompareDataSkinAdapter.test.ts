import HistoricalCompareDataSkinAdapter from '../../adapters/HistoricalCompareDataSkinAdapter';
import HtmlUtils from '../../services/htmlUtils';
import RichTextDataFactory from '../../factories/RichTextDataFactory';
import logger from '../../services/logger';

jest.mock('../../services/htmlUtils');
jest.mock('../../factories/RichTextDataFactory');
jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('HistoricalCompareDataSkinAdapter', () => {
  const createAdapter = (formattingSettings: any = { trimAdditionalSpacingInTables: true }) =>
    new HistoricalCompareDataSkinAdapter(
      '/tmp/template',
      'MEWP',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      formattingSettings,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockImplementation(async (value: string) => `clean:${value}`),
    }));
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
      attachmentMinioData: [],
    }));
  });

  it('cleans a Description difference, diff-highlights it, and prefixes the revision id as its own paragraph', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    // cleanHtml/RichTextDataFactory are mocked to prefix "clean:"/"rich:", so the cleaned
    // values diffed here are "rich:clean:<p>old</p>" vs "rich:clean:<p>new</p>" - only the
    // "old"/"new" word differs, so only that word is wrapped.
    expect(diff.baselineDisplay).toBe(
      '<p>2</p>rich:clean:<p><span style="color:#C00000"><s>old</s></span></p>',
    );
    expect(diff.compareToDisplay).toBe(
      '<p>20</p>rich:clean:<p><span style="color:#107C10">new</span></p>',
    );
    // Original raw fields are preserved untouched.
    expect(diff.baseline).toBe('<p>old</p>');
    expect(diff.compareTo).toBe('<p>new</p>');
  });

  it('diff-highlights scalar-field differences (e.g. Test Phase)', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Test Phase', baseline: 'FAT', compareTo: 'FAT; ATP' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    expect(diff.baselineDisplay).toBe('<p>2</p>FAT');
    expect(diff.compareToDisplay).toBe('<p>20</p>FAT<span style="color:#107C10">; ATP</span>');
    // Original raw fields are preserved untouched.
    expect(diff.baseline).toBe('FAT');
    expect(diff.compareTo).toBe('FAT; ATP');
  });

  it('leaves a scalar-field difference untouched when one side is empty', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'State', baseline: '', compareTo: 'Active' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    expect(result.rows[0].differences[0]).toEqual({ field: 'State', baseline: '', compareTo: 'Active' });
  });

  it('leaves a scalar-field difference untouched when both sides are equal', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Related Link Count', baseline: '3', compareTo: '3' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    expect(result.rows[0].differences[0]).toEqual({ field: 'Related Link Count', baseline: '3', compareTo: '3' });
  });

  it('renders parsed Action/Expected steps per side when the provider attached them', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 701,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [
            {
              field: 'Steps',
              baseline: '<steps>raw-baseline</steps>',
              compareTo: '<steps>raw-compare</steps>',
              baselineSteps: [{ stepPosition: '1', action: 'Open app', expected: 'Login shown' }],
              compareToSteps: [{ stepPosition: '1', action: 'Open app', expected: 'Dashboard shown' }],
            },
          ],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    // "Open app" is identical on both sides so it's left plain; only "Login"/"Dashboard" differ.
    expect(diff.baselineDisplay).toBe(
      '<p>1</p><p><b>Previous step 1. Action:</b></p>rich:clean:Open app<p><b>Expected:</b></p>rich:clean:<span style="color:#C00000"><s>Login</s></span> shown',
    );
    expect(diff.compareToDisplay).toBe(
      '<p>2</p><p><b>Updated step 1. Action:</b></p>rich:clean:Open app<p><b>Expected:</b></p>rich:clean:<span style="color:#107C10">Dashboard</span> shown',
    );
    // The same content also drives a paired-row table: "Updated step 1" directly above
    // "Previous step 1", word-level diffed the same way, columns Action/Expected Result. No
    // attachments were wired up for this call, so the Attachments column is dropped entirely
    // rather than rendering an empty cell on every row.
    expect(diff.stepsTableRows).toHaveLength(2);
    const [updatedRow, previousRow] = diff.stepsTableRows;
    expect(updatedRow.fields.map((f: any) => f.name)).toEqual(['', 'Action', 'Expected Result']);
    // The dropped Attachments column's 20% share is redistributed across the remaining three
    // columns (16/32/32 -> 20/40/40) so the table still fills the full page width.
    expect(updatedRow.fields.map((f: any) => f.width)).toEqual(['20%', '40%', '40%']);
    expect(updatedRow.fields[0].value).toBe('Updated step 1');
    expect(updatedRow.fields[2].value).toBe('rich:clean:<span style="color:#107C10">Dashboard</span> shown');
    expect(previousRow.fields[0].value).toBe('Previous step 1');
    expect(previousRow.fields[2].value).toBe('rich:clean:<span style="color:#C00000"><s>Login</s></span> shown');
    // Every cell in a row shares the same shading, and the two rows of a pair use different
    // (pale) colors so they're easy to tell apart.
    expect(updatedRow.fields.every((f: any) => f.shading?.fill === 'DDEBF7')).toBe(true);
    expect(previousRow.fields.every((f: any) => f.shading?.fill === 'F2F2F2')).toBe(true);
  });

  it('falls back to cleaning the raw Steps XML when no parsed steps are attached', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 801,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [
            {
              field: 'Steps',
              baseline: '<steps>raw-baseline</steps>',
              compareTo: '<steps>raw-compare</steps>',
              baselineSteps: [],
              compareToSteps: [],
            },
          ],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];
    // "raw-" is a shared prefix so it's left plain; only "baseline"/"compare" differ.
    expect(diff.baselineDisplay).toBe(
      '<p>1</p>rich:clean:<steps>raw-<span style="color:#C00000"><s>baseline</s></span></steps>',
    );
    expect(diff.compareToDisplay).toBe(
      '<p>2</p>rich:clean:<steps>raw-<span style="color:#107C10">compare</span></steps>',
    );
  });

  it('collects attachment MinIO data emitted while cleaning images across all differences, renamed to the json-to-word contract', async () => {
    (RichTextDataFactory as jest.Mock).mockImplementation((text: string) => ({
      factorizeRichTextData: jest.fn().mockResolvedValue(`rich:${text}`),
      attachmentMinioData: [{ attachmentPath: `path-for-${text}`, fileName: `file-for-${text}` }],
    }));
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          baselineRevisionId: 2,
          compareToRevisionId: 20,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
        },
      ],
    };

    await adapter.adapt(compareResult);
    // json-to-word's AttachmentsData model deserializes {attachmentMinioPath: Uri,
    // minioFileName: string} - RichTextDataFactory's {attachmentPath, fileName} must be renamed,
    // not passed through as-is (a null attachmentMinioPath crashes document creation).
    expect(adapter.attachmentMinioData).toEqual([
      { attachmentMinioPath: 'path-for-clean:<p>old</p>', minioFileName: 'file-for-clean:<p>old</p>' },
      { attachmentMinioPath: 'path-for-clean:<p>new</p>', minioFileName: 'file-for-clean:<p>new</p>' },
    ]);
  });

  it('rows with no differences (e.g. Added/Deleted) pass through unchanged', async () => {
    const adapter = createAdapter();
    const compareResult = {
      rows: [{ id: 5, compareStatus: 'Added', differences: [] }],
    };
    const result = await adapter.adapt(compareResult);
    expect(result.rows[0]).toEqual({ id: 5, compareStatus: 'Added', differences: [] });
  });

  it('omits every unchanged step entirely - no context, no collapse marker - only the changed step produces rows', async () => {
    const adapter = createAdapter();
    const total = 10;
    const changedIndex = 4; // step "5" (1-based)
    const baselineSteps = Array.from({ length: total }, (_, i) => ({
      stepId: String(i + 1),
      stepPosition: String(i + 1),
      action: `Do step ${i + 1}`,
      expected: `Result ${i + 1}`,
    }));
    const compareToSteps = baselineSteps.map((s, i) =>
      i === changedIndex ? { ...s, expected: `Result ${i + 1} updated` } : { ...s },
    );

    const compareResult = {
      rows: [
        {
          id: 900,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [{ field: 'Steps', baseline: '', compareTo: '', baselineSteps, compareToSteps }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];

    // Only step 5 (the one that actually changed) produces a row pair.
    expect(diff.stepsTableRows).toHaveLength(2);
    expect(diff.stepsTableRows[0].fields[0].value).toBe('Updated step 5');
    expect(diff.stepsTableRows[1].fields[0].value).toBe('Previous step 5');
    expect(diff.compareToDisplay).toContain('<span style="color:#107C10">updated</span>');
    expect(diff.baselineDisplay).not.toContain('<span style="color:#107C10">updated</span>');

    // No context around the change and no collapse marker - every unchanged step is fully absent.
    expect(diff.baselineDisplay).not.toContain('unchanged');
    expect(diff.baselineDisplay).not.toContain('4. Action');
    expect(diff.baselineDisplay).not.toContain('6. Action');
    expect(diff.baselineDisplay).not.toContain('Do step 1');
    expect(diff.baselineDisplay).not.toContain('Do step 10');
  });

  it('matches steps by stepId, not array position, so an earlier insertion does not misalign a later real change', async () => {
    const adapter = createAdapter();
    const baselineSteps = [
      { stepId: '1', stepPosition: '1', action: 'Open app', expected: 'App opens' },
      { stepId: '2', stepPosition: '2', action: 'Log in', expected: 'Dashboard shown' },
      { stepId: '3', stepPosition: '3', action: 'Open settings', expected: 'Settings page shown' },
    ];
    // A brand-new step is inserted at position 2 in compareTo, shifting stepPosition for every
    // step after it - but stepId '3' (the one with a real content edit) must still match its
    // own baseline counterpart, not whatever now sits at the same array index.
    const compareToSteps = [
      { stepId: '1', stepPosition: '1', action: 'Open app', expected: 'App opens' },
      { stepId: 'new', stepPosition: '2', action: 'Accept terms', expected: 'Terms accepted' },
      { stepId: '2', stepPosition: '3', action: 'Log in', expected: 'Dashboard shown' },
      { stepId: '3', stepPosition: '4', action: 'Open settings', expected: 'Settings page shown, dark mode on' },
    ];

    const compareResult = {
      rows: [
        {
          id: 910,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [{ field: 'Steps', baseline: '', compareTo: '', baselineSteps, compareToSteps }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];

    // The inserted step is a whole addition, fully colored green, and gets a single "Added step"
    // row (no Previous counterpart).
    expect(diff.compareToDisplay).toContain('<span style="color:#107C10">rich:clean:Accept terms</span>');
    expect(diff.baselineDisplay).not.toContain('Accept terms');
    // stepId '3''s real edit is found and attributed to step '3' specifically, not to the
    // inserted step or to step '2' (which is unchanged and must not be shown as changed).
    expect(diff.compareToDisplay).toContain('<span style="color:#107C10">, dark mode on</span>');
    expect(diff.compareToDisplay).not.toContain('color:#C00000');

    // Unchanged step '1' and '2' produce no rows at all; only the added step and the real edit do.
    const labels = diff.stepsTableRows.map((row: any) => row.fields[0].value);
    expect(labels).toEqual(['Added step 2', 'Updated step 4', 'Previous step 3']);
  });

  it('hunks table rows nested inside a Description field, diffing the surrounding prose separately', async () => {
    const adapter = createAdapter();
    const buildTable = (rows: number, changedRow?: number) => {
      let html = '<table>';
      for (let r = 0; r < rows; r++) {
        const cell = changedRow === r ? 'UPDATED' : `value ${r}`;
        html += `<tr><td style="width:${90 + r}px">${cell}</td></tr>`;
      }
      return `${html}</table>`;
    };
    const baseline = `<p>Intro text</p>${buildTable(8)}<p>Outro text</p>`;
    const compareTo = `<p>Intro text edited</p>${buildTable(8, 4)}<p>Outro text</p>`;

    const compareResult = {
      rows: [
        {
          id: 920,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline, compareTo }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];

    // The prose outside the table is diffed on its own - the intro edit is found even though
    // it sits alongside a table large enough to need row-hunking.
    expect(diff.compareToDisplay).toContain('<span style="color:#107C10">edited</span>');
    // Only the one changed row's cell is diffed; unrelated rows collapse into a summary and
    // never render their own (unchanged) text.
    expect(diff.compareToDisplay).toContain('<span style="color:#107C10">UPDATED</span>');
    expect(diff.baselineDisplay).toContain('<span style="color:#C00000"><s>value 4</s></span>');
    expect(diff.compareToDisplay).toContain('rows unchanged');
    expect(diff.baselineDisplay).not.toContain('value 0</td>');
  });

  it('hunks a Description with several unchanged paragraphs and one changed one', async () => {
    const adapter = createAdapter();
    const buildParas = (count: number, changedIndex?: number) =>
      Array.from(
        { length: count },
        (_, i) => `<p>${changedIndex === i ? 'Updated paragraph' : `Paragraph ${i}`}</p>`,
      ).join('');
    const baseline = buildParas(10);
    const compareTo = buildParas(10, 4);

    const compareResult = {
      rows: [
        {
          id: 930,
          baselineRevisionId: 1,
          compareToRevisionId: 2,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline, compareTo }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    const diff = result.rows[0].differences[0];

    // Only the changed paragraph's own text carries diff markup.
    expect(diff.compareToDisplay).toContain('<span style="color:#107C10">Updated</span>');
    // The unchanged paragraphs collapse into summary markers instead of rendering in full.
    expect(diff.baselineDisplay).toContain('paragraphs unchanged');
    expect(diff.compareToDisplay).toContain('paragraphs unchanged');
    expect(diff.baselineDisplay).not.toContain('Paragraph 0<');
    expect(diff.baselineDisplay).not.toContain('Paragraph 9<');
  });

  it('logs and returns the original compareResult when cleanup fails', async () => {
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockRejectedValue(new Error('clean failed')),
    }));
    const adapter = createAdapter();
    const compareResult = {
      rows: [
        {
          id: 11,
          compareStatus: 'Changed',
          differences: [{ field: 'Description', baseline: '<p>old</p>', compareTo: '<p>new</p>' }],
        },
      ],
    };

    const result = await adapter.adapt(compareResult);
    expect(result).toBe(compareResult);
    expect((logger as any).error).toHaveBeenCalled();
  });
});
