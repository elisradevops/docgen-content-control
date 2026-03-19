import { calculateAdaptiveIdColumnWidth } from '../utils/tablePresentation';

export default class VcrmTableSkinAdapter {
  private readonly rawRows: any[];
  private adoptedData: any[] = [];

  constructor(rawRows: any[] = []) {
    this.rawRows = Array.isArray(rawRows) ? rawRows : [];
  }

  adoptSkinData() {
    const widths = this.resolveColumnWidths();

    this.adoptedData = this.rawRows.map((row) => {
      const fields = Array.isArray(row?.fields) ? row.fields : [];
      const adoptedFields = fields.map((field: any) => {
        const normalizedName = String(field?.name || '').trim().toLowerCase();

        switch (normalizedName) {
          case 'id':
            return { ...field, width: widths.id };
          case 'section':
            return { ...field, width: widths.section };
          case 'title':
            return { ...field, width: widths.title };
          case 'verification method':
            return { ...field, width: widths.verificationMethod };
          case 'site':
            return { ...field, width: widths.site };
          case 'test phase':
            return { ...field, width: widths.testPhase };
          default:
            return field;
        }
      });

      return {
        ...row,
        fields: adoptedFields,
      };
    });
  }

  private resolveColumnWidths() {
    const idValues = this.valuesByFieldName('id');
    const sectionValues = this.valuesByFieldName('section').map((value) =>
      this.normalizeSectionValueForWidth(value)
    );
    const verificationMethodValues = this.valuesByFieldName('verification method');
    const siteValues = this.valuesByFieldName('site');
    const testPhaseValues = this.valuesByFieldName('test phase');

    const id = calculateAdaptiveIdColumnWidth(idValues, {
      minWidthPercent: 5.5,
      maxWidthPercent: 11,
      baseDigits: 4,
      widthPerExtraDigit: 0.6,
    });
    const section = this.calculateAdaptiveTextWidth(sectionValues, 8, 15, 5, 0.65);
    const verificationMethod = this.calculateAdaptiveTextWidth(verificationMethodValues, 11, 20, 12, 0.45);
    const site = this.calculateAdaptiveTextWidth(siteValues, 8, 14, 8, 0.5);
    const testPhase = this.calculateAdaptiveTextWidth(testPhaseValues, 8, 13, 8, 0.45);

    const reserved = [id, section, verificationMethod, site, testPhase].reduce((sum, value) => {
      const numeric = parseFloat(String(value).replace('%', ''));
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);

    const title = `${Number(Math.max(20, 100 - reserved).toFixed(1))}%`;

    return {
      id,
      section,
      title,
      verificationMethod,
      site,
      testPhase,
    };
  }

  private valuesByFieldName(fieldName: string): Array<string | number | null | undefined> {
    const normalizedTarget = fieldName.trim().toLowerCase();
    return this.rawRows.map((row) => {
      const fields = Array.isArray(row?.fields) ? row.fields : [];
      const field = fields.find(
        (candidate: any) => String(candidate?.name || '').trim().toLowerCase() === normalizedTarget
      );
      return field?.value;
    });
  }

  private calculateAdaptiveTextWidth(
    values: Array<string | number | null | undefined>,
    minWidthPercent: number,
    maxWidthPercent: number,
    baseChars: number,
    widthPerExtraChar: number
  ): string {
    const maxChars = values.reduce<number>((max, value) => {
      const normalized = String(value ?? '').trim();
      return Math.max(max, normalized.length);
    }, 0);

    const extraChars = Math.max(0, maxChars - baseChars);
    const raw = minWidthPercent + extraChars * widthPerExtraChar;
    const clamped = Math.min(maxWidthPercent, Math.max(minWidthPercent, raw));
    return `${Number(clamped.toFixed(1))}%`;
  }

  private normalizeSectionValueForWidth(value: string | number | null | undefined): string {
    const raw = String(value ?? '').trim();
    const match = raw.match(/\{\{section:(?:[A-Za-z0-9_-]+:)?([0-9.]+)\}\}/);
    if (match?.[1]) {
      return match[1];
    }
    return raw;
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
