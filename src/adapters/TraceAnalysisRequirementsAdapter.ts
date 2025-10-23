import logger from '../services/logger';

class TraceAnalysisRequirementsAdapter {
  rawQueryMapping: any;
  queryMode: string;
  sortingSourceColumnsMap: Map<string, string>;
  sortingTargetsColumnsMap: Map<string, string>;
  private adoptedData: any[] = [];

  constructor(
    rawQueryMapping: any,
    queryMode: string,
    sortingSourceColumnsMap?: Map<string, string>,
    sortingTargetsColumnsMap?: Map<string, string>
  ) {
    this.rawQueryMapping = rawQueryMapping;
    this.queryMode = queryMode;
    this.sortingSourceColumnsMap = sortingSourceColumnsMap || new Map();
    this.sortingTargetsColumnsMap = sortingTargetsColumnsMap || new Map();
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      const sysColors = ['DBE5F1', 'FFFFFF'];
      const softColors = ['E4DFEC', 'FFFFFF'];
      const baseShading = { color: 'auto' };
      let groupIdx = 0;

      // Handle both Map and array structures
      const entries =
        this.rawQueryMapping instanceof Map
          ? Array.from(this.rawQueryMapping.entries())
          : Array.isArray(this.rawQueryMapping)
          ? this.rawQueryMapping.map((item, index) => [item.source || item, item.targets || []])
          : [];

      for (const [source, targets] of entries) {
        const currentSysColor = sysColors[groupIdx % sysColors.length];
        const currentSoftColor = softColors[groupIdx % softColors.length];
        groupIdx++;

        switch (this.queryMode.toLowerCase()) {
          case 'sys-req-to-soft-req':
            this.processSysReqToSoftReq(
              source,
              targets || [],
              currentSysColor,
              currentSoftColor,
              baseShading
            );
            break;

          case 'soft-req-to-sys-req':
            this.processSoftReqToSysReq(
              source,
              targets || [],
              currentSoftColor,
              currentSysColor,
              baseShading
            );
            break;

          default:
            throw new Error(`Query mode not defined: ${this.queryMode}`);
        }
      }
    } catch (error) {
      logger.error(`Could not adapt query results skin: ${error.message}`);
    }
  }

  private processSysReqToSoftReq(
    source: any,
    targets: any[],
    currentSysColor: string,
    currentSoftColor: string,
    baseShading: any
  ) {
    // Extract field values using the same pattern as OpenPcrQueryResultsSkinAdapter
    const sourceId = source?.id || '';
    const sourceTitle = this.getFieldValue(source, 'System.Title') || '';
    const sourceWorkItemType = this.getFieldValue(source, 'System.WorkItemType') || 'System Requirement';
    const sourceState = this.getFieldValue(source, 'System.State') || '';
    if (targets.length === 0) {
      // No linked software requirement
      const fields = this.buildFields({
        items: [
          {
            name: 'ID',
            value: sourceId,
            width: '7%',
            color: currentSysColor,
            url: source?._links?.html?.href,
          },
          { name: 'WI Type', value: sourceWorkItemType, width: '12%', color: currentSysColor },
          { name: 'Title', value: sourceTitle, color: currentSysColor },
          { name: 'State', value: sourceState, color: currentSysColor },
          { name: 'ID', value: '', width: '7%', color: currentSoftColor },
          { name: 'WI Type', value: 'Software Requirement', width: '12%', color: currentSoftColor },
          { name: 'Title', value: '', color: currentSoftColor },
          { name: 'State', value: '', color: currentSoftColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const targetId = target?.id || '';
        const targetTitle = this.getFieldValue(target, 'System.Title') || '';
        const targetWorkItemType =
          this.getFieldValue(target, 'System.WorkItemType') || 'Software Requirement';
        const targetState = this.getFieldValue(target, 'System.State') || '';

        const fields = this.buildFields({
          items: [
            {
              name: 'ID',
              value: sourceId,
              width: '7%',
              color: currentSysColor,
              url: source?._links?.html?.href,
            },
            { name: 'WI Type', value: sourceWorkItemType, width: '12%', color: currentSysColor },
            { name: 'Title', value: sourceTitle, color: currentSysColor },
            { name: 'State', value: sourceState, color: currentSysColor },
            {
              name: 'ID',
              value: targetId,
              width: '7%',
              color: currentSoftColor,
              url: target?._links?.html?.href,
            },
            { name: 'WI Type', value: targetWorkItemType, width: '12%', color: currentSoftColor },
            { name: 'Title', value: targetTitle, color: currentSoftColor },
            { name: 'State', value: targetState, color: currentSoftColor },
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private processSoftReqToSysReq(
    source: any,
    targets: any[],
    currentSoftColor: string,
    currentSysColor: string,
    baseShading: any
  ) {
    // Extract field values using the same pattern as OpenPcrQueryResultsSkinAdapter
    const sourceId = source?.id || '';
    const sourceTitle = this.getFieldValue(source, 'System.Title') || '';
    const sourceWorkItemType = this.getFieldValue(source, 'System.WorkItemType') || 'Software Requirement';
    const sourceState = this.getFieldValue(source, 'System.State') || '';

    if (targets.length === 0) {
      // No linked system requirement
      const fields = this.buildFields({
        items: [
          {
            name: 'ID',
            value: sourceId,
            width: '7%',
            color: currentSoftColor,
            url: source?._links?.html?.href,
          },
          { name: 'WI Type', value: sourceWorkItemType, width: '12%', color: currentSoftColor },
          { name: 'Title', value: sourceTitle, color: currentSoftColor },
          { name: 'State', value: sourceState, color: currentSoftColor },
          { name: 'ID', value: '', width: '7%', color: currentSysColor },
          { name: 'WI Type', value: 'System Requirement', width: '12%', color: currentSysColor },
          { name: 'Title', value: '', color: currentSysColor },
          { name: 'State', value: '', color: currentSysColor },
        ],
        baseShading,
      });
      this.adoptedData.push({ fields });
    } else {
      targets.forEach((target) => {
        const targetId = target?.id || '';
        const targetTitle = this.getFieldValue(target, 'System.Title') || '';
        const targetWorkItemType = this.getFieldValue(target, 'System.WorkItemType') || 'System Requirement';
        const targetState = this.getFieldValue(target, 'System.State') || '';

        const fields = this.buildFields({
          items: [
            {
              name: 'ID',
              value: sourceId,
              width: '7%',
              color: currentSoftColor,
              url: source?._links?.html?.href,
            },
            { name: 'WI Type', value: sourceWorkItemType, width: '12%', color: currentSoftColor },
            { name: 'Title', value: sourceTitle, color: currentSoftColor },
            { name: 'State', value: sourceState, color: currentSoftColor },
            {
              name: 'ID',
              value: targetId,
              width: '7%',
              color: currentSysColor,
              url: target?._links?.html?.href,
            },
            { name: 'WI Type', value: targetWorkItemType, width: '12%', color: currentSysColor },
            { name: 'Title', value: targetTitle, color: currentSysColor },
            { name: 'State', value: targetState, color: currentSysColor },
          ],
          baseShading,
        });
        this.adoptedData.push({ fields });
      });
    }
  }

  private buildFields({ items, baseShading }: { items: any[]; baseShading: any }) {
    return items.filter(Boolean).map((item) => ({
      ...item,
      shading: { ...baseShading, fill: item.color },
    }));
  }

  private getFieldValue(item: any, fieldName: string): string {
    if (!item) return '';

    // First try direct property access
    if (item[fieldName]) {
      return item[fieldName];
    }

    // Then try fields property like OpenPcrQueryResultsSkinAdapter
    if (item.fields && item.fields[fieldName]) {
      return item.fields[fieldName];
    }

    // Try common field mappings
    const fieldMappings: { [key: string]: string[] } = {
      'System.Title': ['title', 'Title', 'System.Title'],
      'System.WorkItemType': ['workItemType', 'WorkItemType', 'System.WorkItemType', 'type'],
      'System.State': ['state', 'State', 'System.State'],
    };

    const possibleFields = fieldMappings[fieldName] || [fieldName];

    for (const field of possibleFields) {
      if (item[field]) {
        return item[field];
      }
      if (item.fields && item.fields[field]) {
        return item.fields[field];
      }
    }

    return '';
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}

export default TraceAnalysisRequirementsAdapter;
