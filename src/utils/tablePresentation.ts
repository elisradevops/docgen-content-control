// Centralized presentation helpers for tables (colors, grouped headers, field names)

export const COLOR_REQ_SYS = 'DBE5F1'; // Requirements/System/PCR
export const COLOR_TEST_SOFT = 'E4DFEC'; // Test Case/Software
export const COLOR_PCR = COLOR_REQ_SYS;

export function normalizeFieldName(name: string): string {
  if (name === 'System.WorkItemType') return 'Work Item Type';
  return name;
}

export function buildGroupedHeader(
  leftLabel: string,
  rightLabel: string,
  leftFill: string,
  rightFill: string
): any {
  return {
    leftLabel,
    rightLabel,
    leftShading: { color: 'auto', fill: leftFill },
    rightShading: { color: 'auto', fill: rightFill },
  };
}
