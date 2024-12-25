import logger from '../services/logger';

export default class BugsTableSkinAdapter {
  fetchedWorkItems: any;
  queryMode: string;
  includeCustomerId: boolean;
  fieldsToIncludeMap: Map<string, string>;
  private adoptedData: any[] = [];

  constructor(rawResults, queryMode = 'none', includeCustomerId = false) {
    const { fetchedWorkItems, fieldsToIncludeMap } = rawResults;
    this.fetchedWorkItems = fetchedWorkItems;
    this.fieldsToIncludeMap = fieldsToIncludeMap;
    this.queryMode = queryMode;
    this.includeCustomerId = includeCustomerId;
  }

  adoptSkinData() {
    try {
      this.adoptedData = [];
      for (const workItem of this.fetchedWorkItems) {
        this.processTableAdaption(workItem);
      }
    } catch (error) {
      logger.error(`Could not adapt query results skin: ${error.message}`);
    }
  }

  // Helper Methods

  private adaptFields(item: any) {
    const adaptedFields: any[] = [];
    // Process 'Title' field first if it exists
    const titleReferenceName = Array.from(this.fieldsToIncludeMap.entries()).find(
      ([_, fieldName]) => fieldName === 'Title'
    )?.[0];

    if (item && titleReferenceName && item.fields[titleReferenceName] !== undefined) {
      adaptedFields.push({
        name: 'Title',
        value: item.fields[titleReferenceName],
      });
    }

    // Process other fields
    for (const [referenceName, fieldName] of this.fieldsToIncludeMap.entries()) {
      // Skip 'Title' and 'Work Item Type' as per original logic
      if (fieldName === 'Title' || fieldName === 'Work Item Type' || fieldName === 'ID') {
        continue;
      }

      switch (fieldName) {
        case 'Priority': {
          adaptedFields.push({
            name: fieldName,
            value: item?.fields[referenceName] || '',
            width: '6.5%',
          });
          break;
        }
        case 'Assigned To':
          adaptedFields.push({
            name: fieldName,
            value: item?.fields[referenceName]?.displayName || '',
          });
          break;
        case 'Customer ID':
          adaptedFields.push({
            name: fieldName,
            value: item?.fields[referenceName] || '',
            width: '9.7%',
          });

          break;
        case 'Area Path':
          adaptedFields.push({
            name: 'Node Name',
            value: this.convertAreaPathToNodeName(item?.fields[referenceName] || ''),
            width: '18%',
          });
          break;
        default:
          adaptedFields.push({
            name: fieldName,
            value: item?.fields[referenceName] || '',
          });
          break;
      }
    }

    return adaptedFields;
  }

  private processTableAdaption(wi: any) {
    const adaptedSourceFields: any[] = this.adaptFields(wi);
    const fields = this.buildFields({
      items: [
        { name: 'WI ID', value: wi.id, width: '6.8%', url: wi._links.html.href },
        ...adaptedSourceFields,
      ],
    });
    this.adoptedData.push({ fields });
  }

  private buildFields({ items }: { items: any[] }) {
    return items.filter(Boolean).map((item) => ({
      ...item,
    }));
  }

  private convertAreaPathToNodeName(areaPath = '') {
    return areaPath?.includes('\\') ? areaPath.split('\\').pop() : areaPath;
  }

  getAdoptedData() {
    return this.adoptedData;
  }
}
