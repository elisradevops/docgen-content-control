import {
  COLOR_REQ_SYS,
  COLOR_TEST_SOFT,
  buildGroupedHeader,
} from '../utils/tablePresentation';

export interface CustomerCoverageColumnConfig {
  sourceIdHeader: string;
  sourceTitleHeader: string;
  coveringIdHeader: string;
  coveringTitleHeader: string;
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

const SOURCE_COLUMN_WIDTH = '7%';
const SOURCE_TITLE_WIDTH = '43%';
const COVERING_COLUMN_WIDTH = '7%';
const COVERING_TITLE_WIDTH = '43%';
const SOURCE_GROUP_FILLS = [COLOR_REQ_SYS, 'FFFFFF'];
const COVERING_GROUP_FILLS = [COLOR_TEST_SOFT, 'FFFFFF'];

const buildCustomerCoverageGroupedHeader = () =>
  buildGroupedHeader('Customer', 'System', COLOR_REQ_SYS, COLOR_TEST_SOFT, {
    leftColumns: 2,
    rightColumns: 2,
  });

const defaultConfig: CustomerCoverageColumnConfig = {
  sourceIdHeader: 'ID',
  sourceTitleHeader: 'Title',
  coveringIdHeader: 'ID',
  coveringTitleHeader: 'Title',
};

export default class CustomerCoverageTableSkinAdapter {
  private readonly rawRows: CustomerCoverageRow[];
  private readonly config: CustomerCoverageColumnConfig;
  private readonly sourceOrderIndex: Map<string, number>;
  private adoptedData: any = {
    adoptedData: [],
    groupedHeader: buildCustomerCoverageGroupedHeader(),
    errorMessage: null,
  };

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
    const rowsBySource = this.groupRowsBySource(sortedRows);
    const adoptedRows: any[] = [];

    rowsBySource.forEach((rows, groupIndex) => {
      const sourceFill = SOURCE_GROUP_FILLS[groupIndex % SOURCE_GROUP_FILLS.length];
      const coveringFill = COVERING_GROUP_FILLS[groupIndex % COVERING_GROUP_FILLS.length];

      rows.forEach((row, rowIndex) => {
        const isFirstRow = rowIndex === 0;

        adoptedRows.push({
          fields: [
            this.makeField(
              this.config.sourceIdHeader,
              isFirstRow ? row.sourceId : '',
              SOURCE_COLUMN_WIDTH,
              sourceFill,
              {
                url: isFirstRow ? row.sourceUrl : undefined,
              },
            ),
            this.makeField(
              this.config.sourceTitleHeader,
              isFirstRow ? row.sourceTitle : '',
              SOURCE_TITLE_WIDTH,
              sourceFill,
              {},
            ),
            this.makeField(
              this.config.coveringIdHeader,
              row.coveringId,
              COVERING_COLUMN_WIDTH,
              coveringFill,
              {
                url: row.coveringUrl,
              },
            ),
            this.makeField(
              this.config.coveringTitleHeader,
              row.coveringTitle,
              COVERING_TITLE_WIDTH,
              coveringFill,
              {},
            ),
          ],
        });
      });
    });

    this.adoptedData = {
      adoptedData: adoptedRows,
      groupedHeader: buildCustomerCoverageGroupedHeader(),
      errorMessage: null,
    };
  }

  getAdoptedData(): any {
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

  private groupRowsBySource(rows: CustomerCoverageRow[]): CustomerCoverageRow[][] {
    const groupedRows: CustomerCoverageRow[][] = [];
    let currentSourceKey: string | null = null;

    for (const row of rows) {
      const sourceKey = String(row.sourceId);
      if (sourceKey !== currentSourceKey) {
        groupedRows.push([]);
        currentSourceKey = sourceKey;
      }
      groupedRows[groupedRows.length - 1].push(row);
    }

    return groupedRows;
  }

  private makeField(
    name: string,
    value: string | number | null | undefined,
    width: string,
    defaultFill: string,
    options: { url?: string } = {},
  ) {
    const normalizedValue = value == null ? '' : value;

    const field: any = {
      name,
      value: normalizedValue,
      width,
      shading: {
        color: 'auto',
        fill: defaultFill,
      },
    };

    if (options.url) {
      field.url = options.url;
    }

    return field;
  }
}
