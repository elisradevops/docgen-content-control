import {
  COLOR_REQ_SYS,
  COLOR_TEST_SOFT,
  COLOR_PCR,
  normalizeFieldName,
  buildGroupedHeader,
  calculateAdaptiveIdColumnWidth,
} from '../../utils/tablePresentation';

describe('tablePresentation', () => {
  it('normalizeFieldName should map System.WorkItemType to a friendly label', () => {
    expect(normalizeFieldName('System.WorkItemType')).toBe('Work Item Type');
  });

  it('normalizeFieldName should leave other field names unchanged', () => {
    expect(normalizeFieldName('Custom.Field')).toBe('Custom.Field');
  });

  it('COLOR_PCR should equal COLOR_REQ_SYS and constants should have expected values', () => {
    expect(COLOR_PCR).toBe(COLOR_REQ_SYS);
    expect(typeof COLOR_REQ_SYS).toBe('string');
    expect(typeof COLOR_TEST_SOFT).toBe('string');
  });

  it('buildGroupedHeader should construct a grouped header structure correctly', () => {
    const header = buildGroupedHeader('Left', 'Right', 'AAA', 'BBB');

    expect(header.leftLabel).toBe('Left');
    expect(header.rightLabel).toBe('Right');
    expect(header.leftShading).toEqual({ color: 'auto', fill: 'AAA' });
    expect(header.rightShading).toEqual({ color: 'auto', fill: 'BBB' });
  });

  it('buildGroupedHeader should include explicit column spans when provided', () => {
    const header = buildGroupedHeader('Left', 'Right', 'AAA', 'BBB', {
      leftColumns: 3,
      rightColumns: 2,
    });

    expect(header.leftColumns).toBe(3);
    expect(header.rightColumns).toBe(2);
  });

  it('calculateAdaptiveIdColumnWidth should keep base width for short IDs', () => {
    expect(calculateAdaptiveIdColumnWidth([1, 25, 333])).toBe('8.5%');
  });

  it('calculateAdaptiveIdColumnWidth should expand width for long IDs up to max', () => {
    expect(parseFloat(calculateAdaptiveIdColumnWidth([123456789012]))).toBeGreaterThan(8.5);
    expect(calculateAdaptiveIdColumnWidth([1234567890123456789012345])).toBe('14%');
  });
});
