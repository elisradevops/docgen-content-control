// Centralized presentation helpers for tables (colors, grouped headers, field names)

export const COLOR_REQ_SYS = 'DBE5F1'; // Requirements/System/PCR
export const COLOR_TEST_SOFT = 'E4DFEC'; // Test Case/Software
export const COLOR_PCR = COLOR_REQ_SYS;
export const COLOR_TRACE_UNCOVERED = 'FFC7CE';

// Link-type tokens used to detect traceability relations between work items.
// Matches substrings of ADO link-type ref names (e.g. 'System.LinkTypes.Affects-Forward',
// 'Elisra.CoveredBy-Reverse').
export const TRACE_LINK_REL_TOKENS = ['Affects', 'CoveredBy'];

// Placeholder rendered in customer traceability coverage tables for uncovered / N/A cells.
export const UNCOVERED_PLACEHOLDER = '—';

// Canonical work item types that count as "Requirement" for SysRS coverage tables.
export const REQUIREMENT_WORK_ITEM_TYPES = ['requirement'];

export function isTraceabilityRel(rel: string | null | undefined): boolean {
  if (!rel) return false;
  return TRACE_LINK_REL_TOKENS.some((token) => rel.includes(token));
}

export function normalizeFieldName(name: string): string {
  if (name === 'System.WorkItemType') return 'Work Item Type';
  return name;
}

export function buildGroupedHeader(
  leftLabel: string,
  rightLabel: string,
  leftFill: string,
  rightFill: string,
  options?: { leftColumns?: number; rightColumns?: number },
): any {
  return {
    leftLabel,
    rightLabel,
    leftColumns: options?.leftColumns,
    rightColumns: options?.rightColumns,
    leftShading: { color: 'auto', fill: leftFill },
    rightShading: { color: 'auto', fill: rightFill },
  };
}

type AdaptiveIdWidthOptions = {
  minWidthPercent?: number;
  maxWidthPercent?: number;
  baseDigits?: number;
  widthPerExtraDigit?: number;
};

export function calculateAdaptiveIdColumnWidth(
  values: Array<string | number | null | undefined>,
  options: AdaptiveIdWidthOptions = {},
): string {
  const minWidth = options.minWidthPercent ?? 8.5;
  const maxWidth = options.maxWidthPercent ?? 14;
  const baseDigits = options.baseDigits ?? 5;
  const widthPerExtraDigit = options.widthPerExtraDigit ?? 0.7;

  const maxDigits = values.reduce<number>((max, value) => {
    const normalized = String(value ?? '').replace(/\D/g, '');
    return Math.max(max, normalized.length);
  }, 0);

  const extraDigits = Math.max(0, maxDigits - baseDigits);
  const rawWidth = minWidth + extraDigits * widthPerExtraDigit;
  const clampedWidth = Math.min(maxWidth, Math.max(minWidth, rawWidth));

  return `${Number(clampedWidth.toFixed(1))}%`;
}
