import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import { escapeHtmlText } from '../services/htmlDiffUtils';
import { diffHtmlContent } from '../services/htmlBlockDiffUtils';
import { alignByKey } from '../services/hunkDiffUtils';
import { COLOR_HISTORICAL_STEP_UPDATED, COLOR_HISTORICAL_STEP_PREVIOUS } from '../utils/tablePresentation';
import logger from '../services/logger';

/**
 * Cleans/renders the rich-text fields (Description, Steps) carried on a Historical Query compare
 * result, using the same mechanism STD/STR use for test-case content: HtmlUtils.cleanHtml for
 * Word-fidelity normalization, then RichTextDataFactory to download/embed images into MinIO.
 *
 * Every changed field - HTML-bearing (Description, Steps) and scalar (Title, State, Test Phase,
 * Related Link Count) alike - gets a baselineDisplay/compareToDisplay pair with git-diff/Beyond
 * Compare styling: text removed from the baseline is wrapped red+strikethrough, text added in
 * the compare-to side is wrapped green. Scalar fields are skipped when either side is empty or
 * the two sides are equal, in which case the raw diff object passes through unchanged.
 *
 * Steps get their own dedicated rendering, `diff.stepsTableRows`: steps are matched by their
 * stable stepId (survives steps being added/removed/reordered elsewhere in the test case).
 * Unchanged steps are omitted entirely (no context, no collapse marker - unlike the git-diff
 * hunking below). Each changed step produces a pair of table rows - "Updated step N" (the
 * compare-to side, word-level diffed, pale-blue row shading) directly above "Previous step N"
 * (the baseline side, same word-level diff, pale-gray row shading) - with columns Action /
 * Expected Result / Attachments, so the two rows read like a real Beyond-Compare view of that
 * one step rather than a flat blob. A purely added/removed step (no counterpart on the other
 * side) gets a single row instead of a pair. The Attachments cell is a short text note, not an
 * embedded file - see `attachmentsNoteForStep` for why and for the exact "was this added since
 * baseline" heuristic, since work-item attachments aren't revision-scoped.
 *
 * Known limitation (accepted, not addressed here): a step whose ONLY difference between
 * revisions is styling/formatting (e.g. bold vs italic, a color/attribute change) with
 * identical visible text is treated as unchanged and omitted - `htmlDiffUtils`'s tag-is-never-
 * diff-marked invariant means `diffHtmlContent` hands back both inputs verbatim in that case,
 * which this method's own change-detection (comparing that output against the cleaned input)
 * reads as "nothing changed."
 *
 * Every other field (Description, or the Steps field when the data provider couldn't parse
 * either side into per-step structure) gets a compact, git-diff-style "hunked" rendering instead
 * of a flat word-level diff, so a large amount of unchanged content doesn't bury the real edit:
 * its block-level content (paragraphs, table rows, list items) is recursively hunked by
 * htmlBlockDiffUtils - matched by a normalized content signature (blocks have no stable id) -
 * which is what keeps a large nested table from tripping buildHtmlDiffPair's token-product cap
 * and silently returning both sides completely undiffed, and lets Description's own paragraphs
 * collapse too when mostly unchanged.
 */
export default class HistoricalCompareDataSkinAdapter {
  htmlUtils: HtmlUtils;
  templatePath: string;
  teamProject: string;
  attachmentsBucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  formattingSettings: any;
  attachmentMinioData: any[] = [];
  private attachmentsByWorkItemId: Map<string, any[]> = new Map();

  private static readonly HTML_FIELDS = new Set(['Description']);

  constructor(
    templatePath: string,
    teamProject: string,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    formattingSettings,
  ) {
    this.htmlUtils = new HtmlUtils();
    this.templatePath = templatePath;
    this.teamProject = teamProject;
    this.attachmentsBucketName = attachmentsBucketName || '';
    this.minioEndPoint = minioEndPoint || '';
    this.minioAccessKey = minioAccessKey || '';
    this.minioSecretKey = minioSecretKey || '';
    this.PAT = PAT || '';
    this.formattingSettings = formattingSettings || {};
  }

  /**
   * Cleans a single HTML fragment and embeds/downloads any images it contains, collecting the
   * resulting MinIO attachment data on this adapter instance.
   */
  private async cleanAndEmbed(html: string): Promise<string> {
    const cleaned = await this.htmlUtils.cleanHtml(
      html || '',
      false,
      this.formattingSettings.trimAdditionalSpacingInTables,
    );
    const richTextFactory = new RichTextDataFactory(
      cleaned,
      this.templatePath,
      this.teamProject,
      this.attachmentsBucketName,
      this.minioEndPoint,
      this.minioAccessKey,
      this.minioSecretKey,
      this.PAT,
    );
    const richText = await richTextFactory.factorizeRichTextData();
    // RichTextDataFactory returns {attachmentPath, fileName, ...}; json-to-word's AttachmentsData
    // model deserializes {attachmentMinioPath: Uri, minioFileName: string} - same rename every
    // other adapter that collects attachments applies (see AttachmentsDataFactory.ts). Without
    // it, attachmentMinioPath comes back null on the .NET side and document creation throws a
    // NullReferenceException in AWSS3Service.DownloadFileFromS3BucketAsync.
    this.attachmentMinioData.push(
      ...richTextFactory.attachmentMinioData.map((attachment: any) => ({
        attachmentMinioPath: attachment.attachmentPath,
        minioFileName: attachment.fileName,
      })),
    );
    return richText;
  }

  /**
   * Builds the "{revisionId}" + cleaned-HTML display value for a difference side, so the revision
   * id renders as its own paragraph instead of being string-concatenated inside the HTML body.
   */
  private buildDisplay(revisionId: any, cleanedHtml: string): string {
    const revisionText = revisionId === null || revisionId === undefined ? '' : String(revisionId);
    return revisionText ? `<p>${revisionText}</p>${cleanedHtml}` : cleanedHtml;
  }

  /**
   * Builds the baselineDisplay/compareToDisplay pair for a difference, giving the two sides
   * git-diff/Beyond-Compare styling. Diffing happens after `cleaned` has already been through
   * HtmlUtils.cleanHtml/RichTextDataFactory - never before - since cleanHtml strips the `color`
   * style off spans it doesn't recognize.
   */
  private buildDiffedDisplays(
    row: any,
    cleanedBaseline: string,
    cleanedCompareTo: string,
  ): { baselineDisplay: string; compareToDisplay: string } {
    const { baseline: diffedBaseline, compareTo: diffedCompareTo } = diffHtmlContent(cleanedBaseline, cleanedCompareTo);
    return {
      baselineDisplay: this.buildDisplay(row?.baselineRevisionId, diffedBaseline),
      compareToDisplay: this.buildDisplay(row?.compareToRevisionId, diffedCompareTo),
    };
  }

  /**
   * A short note for one step's Attachments cell - not the attachment itself (embedding raw
   * attachment data here produced "DocGen Error: Invalid data format" cells downstream and
   * wasn't the point anyway). Matched by an ADO attachment's `[TestStep=<stepId>]` comment
   * marker (the same convention `TestDataFactory.ts` uses for STD reports).
   *
   * Work-item attachments aren't revision-scoped - ADO only exposes the *current* attachment
   * list, not what existed at each specific revision - so "added"/"removed" can't be determined
   * exactly. As a practical approximation, an attachment whose own `resourceCreatedDate` is
   * after the baseline revision's timestamp is noted as newly added; one that predates baseline
   * (or whose date/baseline timestamp can't be parsed - safer to assume nothing changed than to
   * risk false "added" noise) renders nothing, on the assumption it already existed. A truly
   * *removed* attachment (deleted after baseline, gone from the current list entirely) can't be
   * detected this way and is a known, accepted gap.
   */
  private attachmentsNoteForStep(workItemId: any, stepId: string | undefined, baselineAsOf: any): string {
    if (!stepId) return '';
    const attachments = this.attachmentsByWorkItemId.get(String(workItemId)) || [];
    const matching = attachments.filter((attachment: any) =>
      String(attachment?.attachmentComment || '').includes(`[TestStep=${stepId}]`),
    );
    if (matching.length === 0) return '';
    const baselineTime = baselineAsOf ? new Date(baselineAsOf).getTime() : NaN;
    const added = matching.filter((attachment: any) => {
      const createdTime = attachment?.attachmentCreatedDate ? new Date(attachment.attachmentCreatedDate).getTime() : NaN;
      return Number.isFinite(createdTime) && Number.isFinite(baselineTime) && createdTime > baselineTime;
    });
    return added
      .map((attachment: any) => `<p>Attachment added: ${escapeHtmlText(attachment.attachmentFileName || '')}</p>`)
      .join('');
  }

  /**
   * Builds one table row for a single step-side ("Updated step N" / "Previous step N" /
   * "Added step N" / "Removed step N"), with the Action / Expected Result / Attachments column
   * contract every row for a Steps difference must share while being built (the renderer derives
   * the table's header labels from the first row's field names) - `buildStepDiffTableRows` may
   * strip the Attachments field back out of every row afterward if none of them ended up with a
   * note. `isUpdatedSide` picks the row shading (pale blue for Updated/Added, pale gray for
   * Previous/Removed) so the two rows of a pair are easy to tell apart at a glance.
   */
  private static readonly STEP_ROW_WIDTHS = { label: 16, action: 32, expected: 32, attachments: 20 };

  private buildStepRow(
    workItemId: any,
    label: string,
    action: string,
    expected: string,
    stepId: string | undefined,
    baselineAsOf: any,
    isUpdatedSide: boolean,
  ): any {
    const shading = { color: 'auto', fill: isUpdatedSide ? COLOR_HISTORICAL_STEP_UPDATED : COLOR_HISTORICAL_STEP_PREVIOUS };
    const w = HistoricalCompareDataSkinAdapter.STEP_ROW_WIDTHS;
    return {
      url: '',
      fields: [
        { name: '', value: label, width: `${w.label}%`, shading },
        { name: 'Action', value: action, width: `${w.action}%`, shading },
        { name: 'Expected Result', value: expected, width: `${w.expected}%`, shading },
        {
          name: 'Attachments',
          value: this.attachmentsNoteForStep(workItemId, stepId, baselineAsOf),
          width: `${w.attachments}%`,
          shading,
        },
      ],
      Source: Number(workItemId || 0),
      level: 0,
    };
  }

  /**
   * Renders the Steps difference: steps are matched by their stable stepId (survives steps
   * being added/removed/reordered elsewhere in the test case, unlike array position). Unchanged
   * steps are omitted entirely - no context, no collapse marker. Each changed step becomes a
   * pair of table rows - "Updated step N" (the compare-to side) directly above "Previous step N"
   * (the baseline side) - both word-level diffed via `diffHtmlContent` (the same engine used
   * elsewhere in this adapter), so the two rows read like a real diff of that one step instead
   * of an opaque whole-value swap. A purely added/removed step gets a single row instead of a
   * pair. Also returns a flattened baselineDisplay/compareToDisplay HTML pair as a fallback, in
   * case the renderer doesn't support `stepsTableRows` for some reason.
   */
  private async buildStepDiffTableRows(
    workItemId: any,
    baselineSteps: Array<{ stepId?: string; stepPosition: string; action: string; expected: string }>,
    compareToSteps: Array<{ stepId?: string; stepPosition: string; action: string; expected: string }>,
    baselineAsOf: any,
  ): Promise<{ tableRows: any[]; baseline: string; compareTo: string }> {
    const cleanStep = async (step: { action: string; expected: string }) => ({
      action: await this.cleanAndEmbed(step.action || ''),
      expected: await this.cleanAndEmbed(step.expected || ''),
    });

    const [cleanedBaseline, cleanedCompareTo] = await Promise.all([
      Promise.all(baselineSteps.map(cleanStep)),
      Promise.all(compareToSteps.map(cleanStep)),
    ]);

    const baselineEntries = baselineSteps.map((step, i) => ({ step, cleaned: cleanedBaseline[i] }));
    const compareToEntries = compareToSteps.map((step, i) => ({ step, cleaned: cleanedCompareTo[i] }));

    const aligned = alignByKey(baselineEntries, compareToEntries, (entry) => entry.step.stepId || '');

    const tableRows: any[] = [];
    let baseHtml = '';
    let compHtml = '';

    for (const item of aligned) {
      if (item.status === 'matched') {
        const baseEntry = item.baseline!;
        const compEntry = item.compareTo!;
        const actionDiff = diffHtmlContent(baseEntry.cleaned.action, compEntry.cleaned.action);
        const expectedDiff = diffHtmlContent(baseEntry.cleaned.expected, compEntry.cleaned.expected);
        const changed =
          actionDiff.baseline !== baseEntry.cleaned.action ||
          actionDiff.compareTo !== compEntry.cleaned.action ||
          expectedDiff.baseline !== baseEntry.cleaned.expected ||
          expectedDiff.compareTo !== compEntry.cleaned.expected;
        if (!changed) continue; // unchanged step: omit entirely, no row, no marker

        tableRows.push(
          this.buildStepRow(
            workItemId,
            `Updated step ${compEntry.step.stepPosition}`,
            actionDiff.compareTo,
            expectedDiff.compareTo,
            compEntry.step.stepId,
            baselineAsOf,
            true,
          ),
        );
        tableRows.push(
          this.buildStepRow(
            workItemId,
            `Previous step ${baseEntry.step.stepPosition}`,
            actionDiff.baseline,
            expectedDiff.baseline,
            baseEntry.step.stepId,
            baselineAsOf,
            false,
          ),
        );
        baseHtml += `<p><b>Previous step ${baseEntry.step.stepPosition}. Action:</b></p>${actionDiff.baseline}<p><b>Expected:</b></p>${expectedDiff.baseline}`;
        compHtml += `<p><b>Updated step ${compEntry.step.stepPosition}. Action:</b></p>${actionDiff.compareTo}<p><b>Expected:</b></p>${expectedDiff.compareTo}`;
      } else if (item.status === 'removed') {
        const { step, cleaned } = item.baseline!;
        const actionDiff = diffHtmlContent(cleaned.action, '');
        const expectedDiff = diffHtmlContent(cleaned.expected, '');
        tableRows.push(
          this.buildStepRow(
            workItemId,
            `Removed step ${step.stepPosition}`,
            actionDiff.baseline,
            expectedDiff.baseline,
            step.stepId,
            baselineAsOf,
            false,
          ),
        );
        baseHtml += `<p><b>Removed step ${step.stepPosition}. Action:</b></p>${actionDiff.baseline}<p><b>Expected:</b></p>${expectedDiff.baseline}`;
      } else if (item.status === 'added') {
        const { step, cleaned } = item.compareTo!;
        const actionDiff = diffHtmlContent('', cleaned.action);
        const expectedDiff = diffHtmlContent('', cleaned.expected);
        tableRows.push(
          this.buildStepRow(
            workItemId,
            `Added step ${step.stepPosition}`,
            actionDiff.compareTo,
            expectedDiff.compareTo,
            step.stepId,
            baselineAsOf,
            true,
          ),
        );
        compHtml += `<p><b>Added step ${step.stepPosition}. Action:</b></p>${actionDiff.compareTo}<p><b>Expected:</b></p>${expectedDiff.compareTo}`;
      }
    }

    // The Attachments column is only worth showing when at least one row in this Steps table
    // actually has a note - otherwise every row carries an empty cell and the column is dead
    // weight. Drop the field from every row rather than leaving it blank. json-to-word's
    // TableService renders the table at a fixed 100%-page width regardless of what the cell
    // widths sum to (TableService.cs's `totalWidth` is a hardcoded constant, not derived from
    // the JSON), so the remaining columns' widths are rescaled to fill the Attachments column's
    // share rather than leaving an unexplained gap on the page.
    const hasAnyAttachmentNote = tableRows.some((row) =>
      row.fields.some((field: any) => field.name === 'Attachments' && field.value),
    );
    if (!hasAnyAttachmentNote) {
      const w = HistoricalCompareDataSkinAdapter.STEP_ROW_WIDTHS;
      const scale = 100 / (w.label + w.action + w.expected);
      for (const row of tableRows) {
        row.fields = row.fields
          .filter((field: any) => field.name !== 'Attachments')
          .map((field: any) => ({
            ...field,
            width: `${Number((parseFloat(field.width) * scale).toFixed(1))}%`,
          }));
      }
    }

    return { tableRows, baseline: baseHtml, compareTo: compHtml };
  }

  /**
   * Cleans every HTML-bearing difference on every "Changed" row of a Historical Query compare
   * result, returning a new compareResult object with baselineDisplay/compareToDisplay attached
   * and diff-highlighted per field. Scalar fields are diff-highlighted too, from their raw
   * (HTML-escaped) values, as long as both sides are non-empty and actually differ; every other
   * property of the payload passes through untouched.
   */
  public async adapt(compareResult: any, attachmentsByWorkItemId?: Map<string, any[]>): Promise<any> {
    this.attachmentsByWorkItemId = attachmentsByWorkItemId || new Map();
    try {
      const rows = Array.isArray(compareResult?.rows) ? compareResult.rows : [];
      const adaptedRows = await Promise.all(
        rows.map(async (row: any) => {
          const differences = Array.isArray(row?.differences) ? row.differences : [];
          if (differences.length === 0) {
            return row;
          }
          const adaptedDifferences = await Promise.all(
            differences.map(async (diff: any) => {
              if (diff?.field === 'Steps') {
                const baselineSteps = Array.isArray(diff?.baselineSteps) ? diff.baselineSteps : [];
                const compareToSteps = Array.isArray(diff?.compareToSteps) ? diff.compareToSteps : [];
                if (baselineSteps.length > 0 || compareToSteps.length > 0) {
                  const { tableRows, baseline, compareTo } = await this.buildStepDiffTableRows(
                    row?.id,
                    baselineSteps,
                    compareToSteps,
                    compareResult?.baseline?.asOf,
                  );
                  return {
                    ...diff,
                    stepsTableRows: tableRows,
                    baselineDisplay: this.buildDisplay(row?.baselineRevisionId, baseline),
                    compareToDisplay: this.buildDisplay(row?.compareToRevisionId, compareTo),
                  };
                }
                // Fallback: the data provider couldn't parse either side into steps (malformed
                // XML, shared-step lookup failure) - no per-step structure to hunk, so clean and
                // diff the raw Steps XML as one blob per side, same as before that feature.
                const cleanedBaseline = await this.cleanAndEmbed(diff?.baseline);
                const cleanedCompareTo = await this.cleanAndEmbed(diff?.compareTo);
                return { ...diff, ...this.buildDiffedDisplays(row, cleanedBaseline, cleanedCompareTo) };
              }
              if (HistoricalCompareDataSkinAdapter.HTML_FIELDS.has(diff?.field)) {
                const cleanedBaseline = await this.cleanAndEmbed(diff?.baseline);
                const cleanedCompareTo = await this.cleanAndEmbed(diff?.compareTo);
                return { ...diff, ...this.buildDiffedDisplays(row, cleanedBaseline, cleanedCompareTo) };
              }
              const baselineText = diff?.baseline === null || diff?.baseline === undefined ? '' : String(diff.baseline);
              const compareToText = diff?.compareTo === null || diff?.compareTo === undefined ? '' : String(diff.compareTo);
              if (!baselineText || !compareToText || baselineText === compareToText) {
                return diff;
              }
              return {
                ...diff,
                ...this.buildDiffedDisplays(row, escapeHtmlText(baselineText), escapeHtmlText(compareToText)),
              };
            }),
          );
          return { ...row, differences: adaptedDifferences };
        }),
      );
      return { ...compareResult, rows: adaptedRows };
    } catch (error: any) {
      logger.error(`Error occurred while trying to build HistoricalCompareDataSkinAdapter: ${error.message}`);
      return compareResult;
    }
  }
}
