import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import { buildHtmlDiffPair, escapeHtmlText } from '../services/htmlDiffUtils';
import logger from '../services/logger';

/**
 * Cleans/renders the rich-text fields (Description, Steps) carried on a Historical Query compare
 * result, using the same mechanism STD/STR use for test-case content: HtmlUtils.cleanHtml for
 * Word-fidelity normalization, then RichTextDataFactory to download/embed images into MinIO.
 *
 * Every changed field - HTML-bearing (Description, Steps) and scalar (Title, State, Test Phase,
 * Related Link Count) alike - gets a baselineDisplay/compareToDisplay pair with git-diff/Beyond
 * Compare styling: text removed from the baseline is wrapped red+strikethrough, text added in
 * the compare-to side is wrapped green, via htmlDiffUtils.buildHtmlDiffPair. Scalar fields are
 * skipped when either side is empty or the two sides are equal, in which case the raw diff
 * object passes through unchanged.
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
    this.attachmentMinioData.push(...richTextFactory.attachmentMinioData);
    return richText;
  }

  /**
   * Renders a parsed test-step array (from TicketsDataProvider's TestStepParserHelper output) as
   * one HTML block of "N. Action:" / "Expected:" pairs, each side cleaned individually.
   */
  private async renderStepsHtml(steps: Array<{ stepPosition: string; action: string; expected: string }>) {
    const blocks = await Promise.all(
      steps.map(async (step) => {
        const cleanedAction = await this.cleanAndEmbed(step.action || '');
        const cleanedExpected = await this.cleanAndEmbed(step.expected || '');
        return (
          `<p><b>${step.stepPosition}. Action:</b></p>${cleanedAction}` +
          `<p><b>Expected:</b></p>${cleanedExpected}`
        );
      }),
    );
    return blocks.join('');
  }

  /**
   * Cleans the Steps difference for one side (baseline or compareTo). Prefers the parsed
   * Action/Expected steps when the data provider attached them; falls back to cleaning the raw
   * Steps XML string when parsing is unavailable or produced no steps, so behavior degrades
   * rather than breaks.
   */
  private async cleanStepsSide(rawValue: string, parsedSteps: any[] | undefined): Promise<string> {
    if (Array.isArray(parsedSteps) && parsedSteps.length > 0) {
      return this.renderStepsHtml(parsedSteps);
    }
    return this.cleanAndEmbed(rawValue);
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
   * git-diff/Beyond-Compare styling: text removed from the baseline is wrapped
   * red+strikethrough, text added in the compare-to side is wrapped green. Diffing happens
   * after `cleaned` has already been through HtmlUtils.cleanHtml/RichTextDataFactory - never
   * before - since cleanHtml strips the `color` style off spans it doesn't recognize.
   */
  private buildDiffedDisplays(
    row: any,
    cleanedBaseline: string,
    cleanedCompareTo: string,
  ): { baselineDisplay: string; compareToDisplay: string } {
    const { baseline: diffedBaseline, compareTo: diffedCompareTo } = buildHtmlDiffPair(
      cleanedBaseline,
      cleanedCompareTo,
    );
    return {
      baselineDisplay: this.buildDisplay(row?.baselineRevisionId, diffedBaseline),
      compareToDisplay: this.buildDisplay(row?.compareToRevisionId, diffedCompareTo),
    };
  }

  /**
   * Cleans every HTML-bearing difference on every "Changed" row of a Historical Query compare
   * result, returning a new compareResult object with baselineDisplay/compareToDisplay attached
   * and diff-highlighted per field. Scalar fields are diff-highlighted too, from their raw
   * (HTML-escaped) values, as long as both sides are non-empty and actually differ; every other
   * property of the payload passes through untouched.
   */
  public async adapt(compareResult: any): Promise<any> {
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
                const cleanedBaseline = await this.cleanStepsSide(diff?.baseline, diff?.baselineSteps);
                const cleanedCompareTo = await this.cleanStepsSide(diff?.compareTo, diff?.compareToSteps);
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
