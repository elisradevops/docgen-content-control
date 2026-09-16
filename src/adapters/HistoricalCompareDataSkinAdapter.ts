import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';

/**
 * Cleans/renders the rich-text fields (Description, Steps) carried on a Historical Query compare
 * result, using the same mechanism STD/STR use for test-case content: HtmlUtils.cleanHtml for
 * Word-fidelity normalization, then RichTextDataFactory to download/embed images into MinIO.
 *
 * Only HTML-bearing fields are touched. Scalar fields (Title, State, Test Phase, Related Link
 * Count) are left untouched by this adapter.
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
   * Cleans every HTML-bearing difference on every "Changed" row of a Historical Query compare
   * result, returning a new compareResult object with baselineDisplay/compareToDisplay attached.
   * Scalar-field differences and every other property of the payload pass through untouched.
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
                return {
                  ...diff,
                  baselineDisplay: this.buildDisplay(row?.baselineRevisionId, cleanedBaseline),
                  compareToDisplay: this.buildDisplay(row?.compareToRevisionId, cleanedCompareTo),
                };
              }
              if (HistoricalCompareDataSkinAdapter.HTML_FIELDS.has(diff?.field)) {
                const cleanedBaseline = await this.cleanAndEmbed(diff?.baseline);
                const cleanedCompareTo = await this.cleanAndEmbed(diff?.compareTo);
                return {
                  ...diff,
                  baselineDisplay: this.buildDisplay(row?.baselineRevisionId, cleanedBaseline),
                  compareToDisplay: this.buildDisplay(row?.compareToRevisionId, cleanedCompareTo),
                };
              }
              return diff;
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
