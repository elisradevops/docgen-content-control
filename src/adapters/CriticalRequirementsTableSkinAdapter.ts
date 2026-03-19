import { calculateAdaptiveIdColumnWidth } from '../utils/tablePresentation';

export default class CriticalRequirementsTableSkinAdapter {
  private readonly rawRows: any[];
  private adoptedData: any[] = [];

  constructor(rawRows: any[] = []) {
    this.rawRows = Array.isArray(rawRows) ? rawRows : [];
  }

  adoptSkinData() {
    const idWidth = this.resolveIdColumnWidth();

    this.adoptedData = this.rawRows.map((row) => {
      const fields = Array.isArray(row?.fields) ? row.fields : [];
      const adoptedFields = fields.map((field: any) => {
        const name = String(field?.name || '').trim().toLowerCase();
        if (name === 'id') {
          return {
            ...field,
            width: idWidth,
          };
        }
        return field;
      });

      return {
        ...row,
        fields: adoptedFields,
      };
    });
  }

  private resolveIdColumnWidth(): string {
    const ids = this.rawRows.map((row) => {
      const fields = Array.isArray(row?.fields) ? row.fields : [];
      const idField = fields.find((field: any) => String(field?.name || '').trim().toLowerCase() === 'id');
      return idField?.value;
    });

    return calculateAdaptiveIdColumnWidth(ids, {
      minWidthPercent: 5.5,
      maxWidthPercent: 11,
      baseDigits: 4,
      widthPerExtraDigit: 0.6,
    });
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}

