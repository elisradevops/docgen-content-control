import { level } from 'winston';
import logger from '../services/logger';
import TestResultsAttachmentDataFactory from '../factories/TestResultsAttachmentDataFactory';
import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';

export default class StepAnalysisSkinAdapter {
  templatePath: string;
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;

  attachmentsBucketName: string = '';
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  PAT: string;
  private attachmentMinioData: any[];

  constructor(
    dgDataProvider: any,
    templatePath = '',
    teamProject: string = '',
    attachmentBucketName: string = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    this.templatePath = templatePath;
    this.dgDataProvider = dgDataProvider;
    this.teamProject = teamProject;
    this.attachmentsBucketName = attachmentBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentMinioData = [];
  }

  public async jsonSkinDataAdapter(resultDataRaw: any[], stepAnalysis: any) {
    try {
      //Prepare attachment data(only if attachments are included)
      let runResults: any[];
      if (stepAnalysis && stepAnalysis.generateRunAttachments?.isEnabled) {
        runResults = await this.generateAttachmentsFromRawRunResultsData(resultDataRaw);
      } else {
        runResults = resultDataRaw;
      }

      return runResults.map((runResult) => {
        const skins: any[] = [];

        const suiteSkinData = {
          field: { name: 'Title', value: runResult.testSuiteName },
          level: 1,
          type: 'Header',
        };

        const caseSkinData = {
          field: { name: 'Title', value: runResult.testCaseName },
          level: 2,
          type: 'SubHeader',
        };

        skins.push(suiteSkinData, caseSkinData);
        if (!runResult.comment && !runResult?.iteration?.comment && !runResult?.attachmentsData) {
          skins.push({
            field: { name: 'Description', value: 'No comments are available for this suite' },
          });

          return skins;
        } else if (runResult.comment || runResult?.iteration?.comment || runResult?.attachmentsData) {
          skins.push({
            field: { name: 'Title', value: 'Analysis Result:' },
            type: 'SubHeader',
          });
        }

        if (runResult.comment) {
          skins.push({ field: { name: 'Description', value: `${runResult.comment}` } });
        }

        if (runResult?.iteration?.comment) {
          skins.push({
            field: {
              name: 'Description',
              value: `${runResult.iteration.comment}`,
            },
          });
        }

        //Generate attachments data:
        if (stepAnalysis && stepAnalysis.generateRunAttachments.isEnabled && runResult?.attachmentsData) {
          const { attachmentsData } = runResult;
          const { analysisLevel, ...iterationAttachmentData } = attachmentsData;

          //Analysis attachment
          if (analysisLevel) {
            //Here we got an array of values that need to be uploaded
            analysisLevel.forEach((attachment) => {
              // iterate through all the analysis attachments
              skins.push({
                type: 'File',
                attachmentLink: attachment.attachmentLink,
                attachmentFileName: attachment.attachmentFileName,
                attachmentType: stepAnalysis.generateRunAttachments.attachmentType,
              });
            });
          }

          if (iterationAttachmentData && Object.keys(iterationAttachmentData).length !== 0) {
            const { caseLevel, ...stepLevels } = iterationAttachmentData;

            //iterate through all the test case attachments
            if (caseLevel) {
              if (caseLevel.length > 0) {
                caseLevel.forEach((attachment) => {
                  skins.push({
                    type: 'File',
                    attachmentLink: attachment.attachmentLink,
                    attachmentFileName: attachment.attachmentFileName,
                    attachmentType: stepAnalysis.generateRunAttachments.attachmentType,
                  });
                });
              }
            }

            //iterate through all the test steps
            if (stepLevels) {
              for (let [key, attachments] of Object.entries(stepLevels)) {
                //TODO: delete later...
                logger.debug(`step level key ${key}`);
                skins.push({
                  field: {
                    name: 'Title',
                    type: 'SubHeader',
                    value: `Step #${this.takeStepIndex(key)}`,
                  },
                  type: 'SubHeader',
                });

                for (let attachment of attachments as any[]) {
                  skins.push({
                    type: 'File',
                    attachmentLink: attachment.attachmentLink,
                    attachmentFileName: attachment.attachmentFileName,
                    attachmentType: stepAnalysis.generateRunAttachments.attachmentType,
                  });
                }
              }
            }
          }
        }

        return skins;
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter: ${error.message}`);
      logger.error(`Error stack ${error.stack}`);
    }
  }

  /**
   * Converting the action path hexadecimal value into an integer and decrease by one because it starts from 2
   */
  private takeStepIndex(actionPath: string): string {
    const stepNum = actionPath.split('-').pop();
    return stepNum;
  }

  /**
   * Prepare attachment data of minio
   * @param map
   */
  private processAttachmentData = (map) => {
    // Iterating over keys and values using Object.entries()
    for (let [key, values] of Object.entries(map)) {
      // Iterating over the array (value) associated with the key
      for (let value of values as any[]) {
        let attachmentBucketData = {
          attachmentMinioPath: value.attachmentMinioPath,
          minioFileName: value.minioFileName,
        };
        this.attachmentMinioData.push(attachmentBucketData);

        if (value.ThumbMinioPath && value.minioThumbName) {
          let thumbBucketData = {
            attachmentMinioPath: value.ThumbMinioPath,
            minioFileName: value.minioThumbName,
          };
          this.attachmentMinioData.push(thumbBucketData);
        }
      }
    }
  };

  private async generateAttachmentsFromRawRunResultsData(runResults: any[]): Promise<any[]> {
    return await Promise.all(
      runResults.map(async (result) => {
        let attachmentsData = await this.generateAttachmentData(result);
        if (!attachmentsData) {
          return result;
        }

        this.processAttachmentData(attachmentsData);
        return { ...result, attachmentsData };
      })
    );
  }

  public getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }

  private async generateAttachmentData(runResult: any) {
    try {
      let attachmentsFactory = new TestResultsAttachmentDataFactory(
        this.teamProject,
        this.templatePath,
        this.dgDataProvider,
        runResult
      );
      let attachmentsData = await attachmentsFactory.generateTestResultsAttachments(
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );

      return attachmentsData;
    } catch (e) {
      logger.error(
        `error fetching attachments data for run result ${runResult.lastRunId}:${runResult.lastResultId}`
      );
    }
  }
}
