import {
  COLOR_TRACE_UNCOVERED,
  UNCOVERED_PLACEHOLDER,
  calculateAdaptiveIdColumnWidth,
} from '../utils/tablePresentation';

export interface CustomerCoverageColumnConfig {
  sourceIdHeader: string;
  sourceTitleHeader: string;
  coveringIdHeader: string;
  coveringTitleHeader: string;
  uncoveredFill: string;
  uncoveredPlaceholder: string;
}

export type CustomerCoverageRow = {
  sourceId: string | number;
  sourceTitle: string;
  sourceUrl?: string;
  coveringId?: string | number;
  coveringTitle?: string;
  coveringUrl?: string;
  uncovered?: boolean;
};

const defaultConfig: CustomerCoverageColumnConfig = {
  sourceIdHeader: 'Source Req ID',
  sourceTitleHeader: 'Source Req Title',
  coveringIdHeader: 'Covering Req ID',
  coveringTitleHeader: 'Covering Req Title',
  uncoveredFill: COLOR_TRACE_UNCOVERED,
  uncoveredPlaceholder: UNCOVERED_PLACEHOLDER,
};

export default class CustomerCoverageTableSkinAdapter {
  private readonly rawRows: CustomerCoverageRow[];
  private readonly config: CustomerCoverageColumnConfig;
  private readonly sourceOrderIndex: Map<string, number>;
  private adoptedData: any[] = [];

  constructor(
    rows: CustomerCoverageRow[] = [],
    config: Partial<CustomerCoverageColumnConfig> = {},
    sourceOrder?: Array<string | number>,
  ) {
    this.rawRows = Array.isArray(rows) ? rows : [];
    this.config = { ...defaultConfig, ...config };

    // Build an explicit source-ordering map. Callers can pass `sourceOrder`
    // (e.g. from the factory) to guarantee row order regardless of Array.sort
    // stability; otherwise we fall back to first-seen order from `rawRows`.
    const orderSource =
      Array.isArray(sourceOrder) && sourceOrder.length > 0
        ? sourceOrder
        : this.rawRows.map((row) => row.sourceId);
    this.sourceOrderIndex = new Map();
    for (const id of orderSource) {
      const key = String(id);
      if (!this.sourceOrderIndex.has(key)) {
        this.sourceOrderIndex.set(key, this.sourceOrderIndex.size);
      }
    }
  }

  adoptSkinData(): void {
    const sortedRows = [...this.rawRows].sort((left, right) => this.compareRows(left, right));
    const widths = this.resolveColumnWidths(sortedRows);

    this.adoptedData = sortedRows.map((row) => {
      const isUncovered = !!row.uncovered;
      const placeholder = this.config.uncoveredPlaceholder;
      const rowShading = isUncovered ? { color: 'auto', fill: this.config.uncoveredFill } : undefined;

      const makeField = (
        name: string,
        value: string | number | null | undefined,
        width: string,
        url?: string,
      ) => {
        const field: any = {
          name,
          value: value == null || value === '' ? placeholder : value,
          width,
        };
        if (url) {
          field.url = url;
        }
        if (rowShading) {
          field.shading = rowShading;
        }
        return field;
      };

      return {
        fields: [
          makeField(this.config.sourceIdHeader, row.sourceId, widths.sourceId, row.sourceUrl),
          makeField(this.config.sourceTitleHeader, row.sourceTitle, widths.sourceTitle),
          makeField(
            this.config.coveringIdHeader,
            isUncovered ? placeholder : row.coveringId,
            widths.coveringId,
            row.coveringUrl,
          ),
          makeField(
            this.config.coveringTitleHeader,
            isUncovered ? placeholder : row.coveringTitle,
            widths.coveringTitle,
          ),
        ],
      };
    });
  }

  getAdoptedData(): any[] {
    return this.adoptedData;
  }

  private compareRows(left: CustomerCoverageRow, right: CustomerCoverageRow): number {
    // Primary order: the explicit source ordering (from factory sourceOrder, or
    // first-seen order in rawRows). This makes row order independent of the
    // JS engine's Array.sort stability guarantees.
    const leftSourceKey = String(left.sourceId);
    const rightSourceKey = String(right.sourceId);
    if (leftSourceKey !== rightSourceKey) {
      const leftIdx = this.sourceOrderIndex.get(leftSourceKey) ?? Number.MAX_SAFE_INTEGER;
      const rightIdx = this.sourceOrderIndex.get(rightSourceKey) ?? Number.MAX_SAFE_INTEGER;
      if (leftIdx !== rightIdx) return leftIdx - rightIdx;
      // Fallback: lexical source-id compare if neither was registered.
      return leftSourceKey < rightSourceKey ? -1 : 1;
    }

    // Secondary order within a source: covering id ascending (numeric when possible).
    const leftCovering = Number(left.coveringId);
    const rightCovering = Number(right.coveringId);
    if (Number.isFinite(leftCovering) && Number.isFinite(rightCovering)) {
      return leftCovering - rightCovering;
    }

    return 0;
  }

  private resolveColumnWidths(rows: CustomerCoverageRow[]) {
    const sourceId = calculateAdaptiveIdColumnWidth(
      rows.map((row) => row.sourceId),
      { minWidthPercent: 7, maxWidthPercent: 12, baseDigits: 5, widthPerExtraDigit: 0.6 },
    );
    const coveringId = calculateAdaptiveIdColumnWidth(
      rows.map((row) => row.coveringId),
      { minWidthPercent: 7, maxWidthPercent: 12, baseDigits: 5, widthPerExtraDigit: 0.6 },
    );
    const reserved = [sourceId, coveringId].reduce((sum, value) => {
      const numeric = parseFloat(String(value).replace('%', ''));
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
    const titleWidth = Number(Math.max(18, (100 - reserved) / 2).toFixed(1));

    return {
      sourceId,
      sourceTitle: `${titleWidth}%`,
      coveringId,
      coveringTitle: `${titleWidth}%`,
    };
  }
}
