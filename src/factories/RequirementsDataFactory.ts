import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import RequirementDataSkinAdapter from '../adapters/RequirementDataSkinAdapter';
import TraceAnalysisRequirementsAdapter from '../adapters/TraceAnalysisRequirementsAdapter';
//Import Data skin adapter
//import RequirementsDataSkinAdapter from "../adapters/RequirementsDataSkinAdapter";

export default class RequirementsDataFactory {
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  teamProject: string;
  templatePath: string;
  attachmentsBucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  queriesRequest: any;
  adoptedData: any[];
  private formattingSettings: any;
  private attachmentMinioData: any[];

  constructor(
    teamProjectName,
    templatePath,
    attachmentsBucketName,
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    dgDataProvider,
    queriesRequest,
    formattingSettings
  ) {
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.teamProject = teamProjectName;
    this.templatePath = templatePath;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.queriesRequest = queriesRequest;
    this.formattingSettings = formattingSettings;
    this.adoptedData = [];
    this.attachmentMinioData = [];
  }

  async fetchRequirementsData() {
    try {
      logger.debug(`fetching requirements data`);
      const queryResults = await this.fetchQueryResults();

      // Set raw data and call jsonSkinDataAdapter once (similar to TestDataFactory pattern)
      this.adoptedData = await this.jsonSkinDataAdapter(null, queryResults);
    } catch (error) {
      logger.error(`Error fetching requirements data: ${error}`);
      throw error;
    }
  }

  private async fetchQueryResults(): Promise<any> {
    try {
      logger.debug(`fetching query results`);
      const ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      let queryResults = {};
      if (this.queriesRequest.systemRequirements) {
        logger.info('starting to fetch system requirements query results');

        logger.info('fetching results');
        let systemRequirementsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.systemRequirements.wiql.href,
          false,
          null
        );
        logger.info(
          `system requirements query results are ${systemRequirementsQueryData ? 'ready' : 'not found'}`
        );
        queryResults['systemRequirementsQueryData'] = systemRequirementsQueryData;
      }
      if (this.queriesRequest.systemToSoftwareRequirements) {
        logger.info('starting to fetch system to software requirements query results');

        logger.info('fetching results');
        let systemToSoftwareRequirementsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.systemToSoftwareRequirements.wiql.href,
          true, // Enable work item relations for traceability analysis
          null
        );
        logger.info(
          `system to software requirements query results are ${
            systemToSoftwareRequirementsQueryData ? 'ready' : 'not found'
          }`
        );
        queryResults['systemToSoftwareRequirementsQueryData'] = systemToSoftwareRequirementsQueryData;
      }
      if (this.queriesRequest.softwareToSystemRequirements) {
        logger.info('starting to fetch software to system requirements query results');

        logger.info('fetching results');
        let softwareToSystemRequirementsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.softwareToSystemRequirements.wiql.href,
          true, // Enable work item relations for traceability analysis
          null
        );
        logger.info(
          `software to system requirements query results are ${
            softwareToSystemRequirementsQueryData ? 'ready' : 'not found'
          }`
        );
        queryResults['softwareToSystemRequirementsQueryData'] = softwareToSystemRequirementsQueryData;
      }

      return queryResults;
    } catch (error) {
      logger.error(`Error fetching query results: ${error}`);
      throw error;
    }
  }

  private async jsonSkinDataAdapter(adapterType: string = null, rawData: any) {
    let adoptedRequirementsData: any = {};
    try {
      logger.debug(`=== RequirementsDataFactory.jsonSkinDataAdapter START ===`);
      logger.debug(`AdapterType: ${adapterType}`);
      logger.debug(`RawData keys: ${Object.keys(rawData || {}).join(', ')}`);
      logger.debug(
        `QueriesRequest systemToSoftwareRequirements exists: ${!!this.queriesRequest
          .systemToSoftwareRequirements}`
      );
      logger.debug(
        `RawData systemToSoftwareRequirementsQueryData exists: ${!!rawData.systemToSoftwareRequirementsQueryData}`
      );
      if (rawData.systemToSoftwareRequirementsQueryData) {
        logger.debug(
          `SystemToSoftwareRequirementsQueryData keys: ${Object.keys(
            rawData.systemToSoftwareRequirementsQueryData
          ).join(', ')}`
        );
        logger.debug(
          `SystemToSoftwareRequirementsQueryData structure:`,
          JSON.stringify(rawData.systemToSoftwareRequirementsQueryData, null, 2)
        );
      }
      // Handle system requirements if available
      if (this.queriesRequest.systemRequirements && rawData.systemRequirementsQueryData) {
        const requirementSkinAdapter = new RequirementDataSkinAdapter(
          this.teamProject,
          this.templatePath,
          this.attachmentsBucketName,
          this.minioEndPoint,
          this.minioAccessKey,
          this.minioSecretKey,
          this.PAT,
          this.formattingSettings
        );
        const systemRequirementsData = await requirementSkinAdapter.jsonSkinAdapter({
          requirementQueryData: rawData.systemRequirementsQueryData,
        });
        this.attachmentMinioData.push(...requirementSkinAdapter.getAttachmentMinioData());
        adoptedRequirementsData['systemRequirementsData'] = systemRequirementsData;
      }

      // Handle system to software requirements traceability
      if (this.queriesRequest.systemToSoftwareRequirements && rawData.systemToSoftwareRequirementsQueryData) {
        // Use sourceTargetsMap instead of workItemRelations
        const traceabilityData =
          rawData.systemToSoftwareRequirementsQueryData.sourceTargetsMap ||
          rawData.systemToSoftwareRequirementsQueryData.workItemRelations;

        if (traceabilityData && (traceabilityData.size > 0 || traceabilityData.length > 0)) {
          const traceAdapter = new TraceAnalysisRequirementsAdapter(
            traceabilityData,
            'sys-req-to-soft-req',
            rawData.systemToSoftwareRequirementsQueryData.sortingSourceColumnsMap,
            rawData.systemToSoftwareRequirementsQueryData.sortingTargetsColumnsMap
          );

          traceAdapter.adoptSkinData();
          const traceAdoptedData = traceAdapter.getAdoptedData();
          adoptedRequirementsData['sysReqToSoftReqAdoptedData'] = {
            adoptedData: traceAdoptedData,
          };
        } else {
          adoptedRequirementsData['sysReqToSoftReqAdoptedData'] = {
            adoptedData: null,
          };
        }
      }

      // Handle software to system requirements traceability (reverse)
      if (this.queriesRequest.softwareToSystemRequirements && rawData.softwareToSystemRequirementsQueryData) {
        // Use sourceTargetsMap instead of workItemRelations
        const traceabilityData =
          rawData.softwareToSystemRequirementsQueryData.sourceTargetsMap ||
          rawData.softwareToSystemRequirementsQueryData.workItemRelations;

        if (traceabilityData && (traceabilityData.size > 0 || traceabilityData.length > 0)) {
          const traceAdapter = new TraceAnalysisRequirementsAdapter(
            traceabilityData,
            'soft-req-to-sys-req',
            rawData.softwareToSystemRequirementsQueryData.sortingSourceColumnsMap,
            rawData.softwareToSystemRequirementsQueryData.sortingTargetsColumnsMap
          );

          traceAdapter.adoptSkinData();
          const traceAdoptedData = traceAdapter.getAdoptedData();
          adoptedRequirementsData['softReqToSysReqAdoptedData'] = {
            adoptedData: traceAdoptedData,
          };
        } else {
          adoptedRequirementsData['softReqToSysReqAdoptedData'] = {
            adoptedData: null,
          };
        }
      }

      return adoptedRequirementsData;
    } catch (error) {
      logger.error(
        `Error occurred during build json skin data adapter for adapter type: ${adapterType}, ${error.message}`
      );
      throw error;
    }
  }

  getAdoptedData() {
    return this.adoptedData;
  }

  getAttachmentMinioData() {
    return this.attachmentMinioData;
  }
}
