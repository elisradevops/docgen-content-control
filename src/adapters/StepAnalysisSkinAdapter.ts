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

      const mappedSuiteIdToSuiteName: Map<number, any> = new Map();

      runResults.forEach((result) => {
        mappedSuiteIdToSuiteName.set(result.testSuiteId, {
          suiteName: result.testSuiteName,
          isInserted: false,
        });
      });

      return runResults.map((runResult) => {
        const skins: any[] = [];
        const suiteTitleObj = mappedSuiteIdToSuiteName.get(runResult.testSuiteId);

        if (!suiteTitleObj.isInserted) {
          const suiteSkinData = {
            field: { name: 'Title', value: suiteTitleObj.suiteName },
            level: 1,
            type: 'Header',
          };
          suiteTitleObj.isInserted = true;
          mappedSuiteIdToSuiteName.set(runResult.testSuiteId, suiteTitleObj);
          skins.push(suiteSkinData);
        }

        //Push the test case after adding the test suite
        const caseSkinData = {
          field: { name: 'Title', value: runResult.testCaseName },
          level: 2,
          type: 'SubHeader',
        };

        skins.push(caseSkinData);
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
            this.AddResultAnalysisType('Analysis', skins);
            //Here we got an array of values that need to be uploaded
            analysisLevel.forEach((attachment) => {
              // iterate through all the analysis attachments
              this.AddAttachmentFileName(
                stepAnalysis.generateRunAttachments.includeAttachmentContent,
                attachment,
                skins
              );
              skins.push({
                type: 'File',
                attachmentLink: attachment.attachmentLink,
                attachmentFileName: attachment.attachmentFileName,
                attachmentType: stepAnalysis.generateRunAttachments.attachmentType,
                includeAttachmentContent: stepAnalysis.generateRunAttachments.includeAttachmentContent,
              });
            });
          }

          if (iterationAttachmentData && Object.keys(iterationAttachmentData).length !== 0) {
            const { caseLevel, ...stepLevels } = iterationAttachmentData;

            //iterate through all the test case attachments
            if (caseLevel) {
              this.AddResultAnalysisType('Test Case', skins);
              if (caseLevel.length > 0) {
                caseLevel.forEach((attachment) => {
                  this.AddAttachmentFileName(
                    stepAnalysis.generateRunAttachments.includeAttachmentContent,
                    attachment,
                    skins
                  );
                  skins.push({
                    type: 'File',
                    attachmentLink: attachment.attachmentLink,
                    attachmentFileName: attachment.attachmentFileName,
                    attachmentType: stepAnalysis.generateRunAttachments.attachmentType,
                    includeAttachmentContent: stepAnalysis.generateRunAttachments.includeAttachmentContent,
                  });
                });
              }
            }

            //iterate through all the test steps
            if (stepLevels) {
              this.AddResultAnalysisType('Test Step', skins);
              for (let [key, attachments] of Object.entries(stepLevels)) {
                skins.push({
                  field: {
                    name: 'Title',
                    type: 'SubHeader',
                    value: `Step #${this.takeStepIndex(key)}`,
                  },
                  type: 'SubHeader',
                });

                for (let attachment of attachments as any[]) {
                  this.AddAttachmentFileName(
                    stepAnalysis.generateRunAttachments.includeAttachmentContent,
                    attachment,
                    skins
                  );
                  skins.push({
                    type: 'File',
                    attachmentLink: attachment.attachmentLink,
                    attachmentFileName: attachment.attachmentFileName,
                    attachmentType: stepAnalysis.generateRunAttachments.attachmentType,
                    includeAttachmentContent: stepAnalysis.generateRunAttachments.includeAttachmentContent,
                  });
                }
              }
            }
          }
        }

        return skins;
      });
    } catch (error) {
      logger.error(
        `Error occurred while trying to build jsonSkinDataAdapter for step analysis: ${error.message}`
      );
      throw error;
    }
  }

  private AddResultAnalysisType(level: string, skins: any[]) {
    skins.push({
      field: {
        name: 'Title',
        type: 'SubHeader',
        value: `${level} Attachments:`,
      },
      type: 'SubHeader',
    });
  }

  private AddAttachmentFileName(includeAttachmentContent: boolean, attachment: any, skins: any[]) {
    if (includeAttachmentContent && attachment.attachmentFileName.match(/\.(docx?|DOCX?)$/)) {
      const attachmentName = attachment.attachmentFileName.replace(/\.[^/.]+$/, '');
      skins.push({
        field: {
          name: 'Title',
          type: 'SubHeader',
          value: `${attachmentName}`,
        },
        type: 'SubHeader',
      });
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
    try {
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
    } catch (error) {
      logger.error(`Error occurred while trying to fetch attachments for run results: ${error.message}`);
      throw error;
    }
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
      logger.error(e.message);
      throw e;
    }
  }
}
