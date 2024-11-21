import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import RichTextDataFactory from './RichTextDataFactory';
import AttachmentsDataFactory from './AttachmentsDataFactory';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import logger from '../services/logger';
import HtmlUtils from '../services/htmlUtils';
import QueryResultsSkinAdapter from '../adapters/QueryResultsSkinAdapter';

const styles = {
  isBold: false,
  IsItalic: false,
  IsUnderline: false,
  Size: 12,
  Uri: null,
  Font: 'Arial',
  InsertLineBreak: false,
  InsertSpace: false,
};

export default class TestDataFactory {
  isSuiteSpecific = false;
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;
  testPlanId: number;
  testSuiteArray: number[];
  testDataRaw: any;
  adoptedTestData: any;
  adoptedQueryResults: any;
  templatePath: string;
  includeAttachments: boolean;
  attachmentType: string;
  includeRequirements: boolean;
  includeCustomerId: boolean;
  includeBugs: boolean;
  includeSeverity: boolean;
  selectedQueries: any;
  reqTestQueryResults: Map<any, any[]>;
  testReqQueryResults: Map<any, any[]>;
  includeTestResults: boolean;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  attachmentMinioData: any[];
  PAT: string;
  attachmentsBucketName: string;
  htmlUtils: HtmlUtils;
  stepResultDetails?: any[];

  constructor(
    attachmentsBucketName,
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    includeAttachments: boolean = true,
    attachmentType: string = 'asEmbedded',
    includeRequirements: boolean = false,
    includeCustomerId: boolean = false,
    includeBugs: boolean = false,
    includeSeverity: boolean = false,
    selectedQueries: any = undefined,
    includeTestResults: boolean = false,
    dgDataProvider: any,
    templatePath = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    stepResultDetails?: any[]
  ) {
    this.teamProject = teamProject;
    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.includeAttachments = includeAttachments;
    this.attachmentType = attachmentType;
    this.includeRequirements = includeRequirements;
    this.includeCustomerId = includeCustomerId;
    this.includeBugs = includeBugs;
    this.includeSeverity = includeSeverity;
    this.selectedQueries = selectedQueries;
    this.dgDataProvider = dgDataProvider;
    this.templatePath = templatePath;
    this.includeTestResults = includeTestResults;
    if (testSuiteArray !== null) {
      this.isSuiteSpecific = true;
    }
    this.attachmentMinioData = [];
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentsBucketName = attachmentsBucketName;
    this.htmlUtils = new HtmlUtils();
    this.stepResultDetails = stepResultDetails;
  }
  async fetchTestData() {
    try {
      let testfilteredPlan;
      let testDataProvider = await this.dgDataProvider.getTestDataProvider();
      let projectTestPlans: any = await testDataProvider.GetTestPlans(this.teamProject);

      if (!projectTestPlans || projectTestPlans.count === 0) {
        throw new Error(`No test plans for project ${this.teamProject} were found`);
      }
      testfilteredPlan = projectTestPlans.value.filter((testPlan) => {
        return testPlan.id === this.testPlanId;
      });
      let testSuites: any[] = await testDataProvider.GetTestSuitesByPlan(
        this.teamProject,
        `${this.testPlanId}`,
        true
      );
      logger.debug(`fetched ${testSuites.length} testSuites for test plan ${this.testPlanId}`);
      // check if reccurse fetching by plan or per suite

      if (testSuites.length === 0) {
        throw new Error(`No test suites for plan id ${this.testPlanId} were found`);
      }

      if (this.isSuiteSpecific == true && testSuites.length != 0) {
        await Promise.all(
          (testSuites = testSuites.filter((suite) => {
            return this.testSuiteArray.indexOf(suite.id) !== -1;
          }))
        );
      } //end of if
      let allTestCases: any[] = await testDataProvider.GetTestCasesBySuites(
        this.teamProject,
        `${this.testPlanId}`,
        `${this.testPlanId + 1}`,
        true,
        this.includeRequirements,
        this.includeCustomerId,
        this.includeBugs,
        this.includeSeverity,
        this.stepResultDetails
      );

      logger.debug(`fetched ${allTestCases.length} test cases for test suite ${this.testPlanId}`);

      if (testSuites.length !== 0) {
        let SuitesAndTestCases: any = [];
        for (let j = 0; j < testSuites.length; j++) {
          let testCases = await this.generateSuiteObject(testSuites[j], allTestCases);
          let temp = testSuites[j];
          if (testCases) {
            SuitesAndTestCases.push({ temp, testCases });
          } else {
            let testCases: any[] = [];
            SuitesAndTestCases.push({ temp, testCases });
          }
        }

        this.testDataRaw = {
          plan: testfilteredPlan,
          suites: SuitesAndTestCases,
        };
        this.adoptedTestData = await this.jsonSkinDataAdpater(null);
      }
    } catch (err) {
      throw new Error(`Error occurred during fetching data: ${err}`);
    }
  }

  async generateSuiteObject(suite, allTestCases) {
    let testCases: any = allTestCases.filter((testCase) => testCase.suit === suite.id);

    logger.debug(`filtered ${testCases.length} test cases for test suite ${suite.id}`);

    if (testCases.length != 0) {
      let testCasesWithAttachments: any = [];
      for (const testCase of testCases) {
        //TODO check of test case has the same revision as the STR data
        let attachmentsData = [];
        if (this.includeAttachments) {
          attachmentsData = await this.generateAttachmentData(testCase.id);
          attachmentsData.forEach((item) => {
            let attachmentBucketData = {
              attachmentMinioPath: item.attachmentMinioPath,
              minioFileName: item.minioFileName,
            };
            this.attachmentMinioData.push(attachmentBucketData);
            if (item.ThumbMinioPath && item.minioThumbName) {
              let thumbBucketData = {
                attachmentMinioPath: item.ThumbMinioPath,
                minioFileName: item.minioThumbName,
              };
              this.attachmentMinioData.push(thumbBucketData);
            }
          });
        }
        let testCaseWithAttachments: any = JSON.parse(JSON.stringify(testCase));
        testCaseWithAttachments.attachmentsData = attachmentsData;
        testCasesWithAttachments.push(testCaseWithAttachments);
      }

      //populate test object with results
      if (this.includeTestResults) {
        let testCasesWithAttachmentsAndResults = await this.populateTestRunData(testCasesWithAttachments);
        return testCasesWithAttachmentsAndResults;
      }
      return testCasesWithAttachments;
    }
  }
  async populateTestRunData(testCasesWithAttachments: any) {
    await Promise.all(
      testCasesWithAttachments.map(async (testcase, i) => {
        let testDataProvider = await this.dgDataProvider.getTestDataProvider();
        let testPoints = await testDataProvider.GetTestPoint(
          this.teamProject,
          String(this.testPlanId),
          testcase.suit,
          testcase.id
        );
        logger.debug(`fetched ${testPoints.count} points for tescase ${testcase.id} `);
        if (testPoints.count > 0) {
          testPoints.value.forEach(async (testPoint) => {
            if (testPoint.lastTestRun) {
              if (testPoint.lastTestRun.id > 0) {
                try {
                  testCasesWithAttachments[i].lastTestRun = await testDataProvider.GetTestRunById(
                    this.teamProject,
                    testPoint.lastTestRun.id
                  );
                } catch (e) {
                  logger.error(`error fetching last run for test point ${testPoint.id} `);
                }
              } else {
                testCasesWithAttachments[i].lastTestRun = null;
              }
            } else {
              testCasesWithAttachments[i].lastTestRun = null;
            }
          });
        }
      })
    );
    return testCasesWithAttachments;
  }
  async generateAttachmentData(testCaseId) {
    try {
      let attachmentsfactory = new AttachmentsDataFactory(
        this.teamProject,
        testCaseId,
        this.templatePath,
        this.dgDataProvider
      );
      let attachmentsData = await attachmentsfactory.fetchWiAttachments(
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT
      );

      return attachmentsData;
    } catch (e) {
      logger.error(`error fetching attachments data for test case ${testCaseId}`);
    }
  }

  async fetchQueryResults() {
    try {
      const ticketsDataProvider = await this.dgDataProvider.getTicketsDataProvider();
      if (!this.selectedQueries.reqTestQuery?.wiql && !this.selectedQueries.testReqQuery.wiql) {
        throw new Error(`Invalid WIQL for query`);
      }

      if (this.selectedQueries.reqTestQuery) {
        let reqTestQueryResults: any = await ticketsDataProvider.GetQueryResultsFromWiqlHref(
          this.selectedQueries.reqTestQuery.wiql.href,
          this.includeCustomerId
        );
        this.reqTestQueryResults = reqTestQueryResults;
      }

      if (this.selectedQueries.testReqQuery) {
        let testReqQueryResults: any = await ticketsDataProvider.GetQueryResultsFromWiqlHref(
          this.selectedQueries.testReqQuery.wiql.href,
          this.includeCustomerId
        );

        this.testReqQueryResults = testReqQueryResults;
      }

      this.adoptedQueryResults = await this.jsonSkinDataAdpater('query-results');
    } catch (err) {
      logger.error(`Could not fetch query results: ${err.message}`);
    }
  }

  private allValuesAreTarget(array, targetValues) {
    return array.every((obj) => targetValues.includes(obj.value));
  }

  private mapTestResults(testCases: any[]): any[] {
    try {
      // Step 1: Create a lookup map for stepsData
      const stepMap: Map<number, any[]> = new Map();

      // If stepResultDetails is empty, populate all steps with default values
      if (this.stepResultDetails.length === 0) {
        testCases.forEach((testCase) => {
          testCase.steps.forEach((step: any) => {
            step.stepStatus = 'Not Run';
            step.stepComments = 'No Result';
          });
        });
        return testCases; // No need to continue if we are populating defaults
      }

      this.stepResultDetails.forEach((step: any) => {
        if (!stepMap.has(step.testId)) {
          stepMap.set(step.testId, []);
        }
        stepMap.get(step.testId).push(step);
      });

      // Step 2: Iterate over testCases and update steps
      testCases.forEach((testCase) => {
        const matchingSteps = stepMap.get(testCase.id);

        if (matchingSteps) {
          matchingSteps.forEach((stepData) => {
            const stepIndex = stepData.stepNo - 1;
            if (testCase.steps[stepIndex]) {
              testCase.steps[stepIndex].stepStatus = stepData.stepStatus;
              testCase.steps[stepIndex].stepComments = stepData.stepComments;
            }
          });
        } else {
          // No matching steps, set default values for steps
          testCase.steps.forEach((step: any) => {
            step.stepStatus = 'Not Run';
            step.stepComments = 'No Result';
          });
        }
      });
    } catch (error: any) {
      logger.error(`Error occurred while trying to map test results ${error.message}`);
      logger.error(`Error Stack ${error.stack}`);
    }

    return testCases;
  }

  //arranging the test data for json skins package
  async jsonSkinDataAdpater(adapterType: string = null) {
    let adoptedTestData = {} as any;
    try {
      switch (adapterType) {
        case 'test-result-group-summary':
          // let testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          // adoptedTestData = await testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdpater(this.testDataRaw);
          break;
        case 'query-results':
          const configs = [
            {
              queryResults: this.reqTestQueryResults,
              type: 'req-test',
              adoptedDataKey: 'reqTestAdoptedData',
            },
            {
              queryResults: this.testReqQueryResults,
              type: 'test-req',
              adoptedDataKey: 'testReqAdoptedData',
            },
          ];

          for (const { queryResults, type, adoptedDataKey } of configs) {
            if (queryResults) {
              const queryResultSkinAdapter = new QueryResultsSkinAdapter(
                queryResults,
                type,
                this.includeCustomerId
              );
              queryResultSkinAdapter.adoptSkinData();
              const adoptedData = queryResultSkinAdapter.getAdoptedData();
              adoptedTestData[adoptedDataKey] = adoptedData;
            }
          }

          break;
        default:
          //There is a problem when grabbing the data
          adoptedTestData = await Promise.all(
            this.testDataRaw.suites.map(async (suite: any) => {
              let suiteSkinData = {
                fields: [
                  { name: 'Title', value: suite.temp.name + ' - ' },
                  { name: 'ID', value: suite.temp.id, url: suite.temp.url },
                ],
                level: suite.temp.level,
              };
              const mappedTestCases = this.stepResultDetails
                ? this.mapTestResults(suite.testCases)
                : suite.testCases;

              let testCases = await Promise.all(
                mappedTestCases.map(async (testCase) => {
                  try {
                    let Description = testCase.description || 'No description';
                    let cleanedDescription = this.htmlUtils.cleanHtml(Description);
                    let richTextFactory = new RichTextDataFactory(
                      cleanedDescription,
                      this.templatePath,
                      this.teamProject
                    );

                    await richTextFactory.createRichTextContent(
                      this.attachmentsBucketName,
                      this.minioEndPoint,
                      this.minioAccessKey,
                      this.minioSecretKey,
                      this.PAT
                    );
                    richTextFactory.attachmentMinioData.forEach((item) => {
                      let attachmentBucketData = {
                        attachmentMinioPath: item.attachmentPath,
                        minioFileName: item.fileName,
                      };
                      this.attachmentMinioData.push(attachmentBucketData);
                    });
                    let richText = richTextFactory.skinDataContentControls;
                    let testCaseHeaderSkinData = {
                      fields: [
                        { name: 'Title', value: testCase.title + ' - ' },
                        { name: 'ID', value: testCase.id, url: testCase.url },
                        {
                          name: 'Test Description',
                          value: cleanedDescription || 'No description',
                          richText: richText,
                        },
                      ],
                      level: suite.temp.level + 1,
                    };
                    // Helper function to check if all the values in the array are among the target values
                    let testCaseStepsSkinData;

                    try {
                      if (testCase.steps) {
                        testCaseStepsSkinData = await Promise.all(
                          testCase.steps.map(async (testStep: any, i: number) => {
                            let actionText = '';
                            let expectedText = '';
                            if (testStep.action) {
                              actionText = this.htmlUtils.cleanHtml(testStep.action);
                            }
                            if (testStep.expected) {
                              expectedText = this.htmlUtils.cleanHtml(testStep.expected);
                            }

                            let richTextFactoryAction = new RichTextDataFactory(
                              actionText,
                              this.templatePath,
                              this.teamProject
                            );
                            let richTextFactoryExpected = new RichTextDataFactory(
                              expectedText,
                              this.templatePath,
                              this.teamProject
                            );
                            richTextFactoryAction.htmlStrip();
                            richTextFactoryExpected.htmlStrip();
                            // Define target values
                            const targetValues = ['\n', ' ', ''];

                            // Check if all values in both arrays are among the target values
                            if (
                              this.allValuesAreTarget(
                                richTextFactoryAction.contentControlsStrings,
                                targetValues
                              ) &&
                              this.allValuesAreTarget(
                                richTextFactoryExpected.contentControlsStrings,
                                targetValues
                              )
                            ) {
                              // Skip this iteration and move to the next one
                              return null;
                            }
                            let action =
                              richTextFactoryAction.skinDataContentControls[0].data.fields[0].value;
                            let expected =
                              richTextFactoryExpected.skinDataContentControls[0].data.fields[0].value;

                            action = action.replace(/\n/g, '<BR/>');
                            expected = expected.replace(/\n/g, '<BR/>');

                            // checks if there is any step attachment in the current test case
                            let hasAnyStepAttachment = testCase.attachmentsData.some((attachment) => {
                              return attachment.attachmentComment.includes('TestStep=');
                            });

                            let testStepAttachments = testCase.attachmentsData.filter((attachment) => {
                              return attachment.attachmentComment.includes(`TestStep=${i + 2}`);
                            });

                            //If runs status and result are included
                            if (this.stepResultDetails) {
                              return this.includeAttachments && hasAnyStepAttachment
                                ? {
                                    fields: [
                                      { name: '#', value: i + 1, width: '5.5%' },
                                      { name: 'Description', value: action, width: '20.8%' },
                                      {
                                        name: 'Expected Results',
                                        value: expected,
                                        width: '20.8%',
                                      },
                                      {
                                        name: 'Attachments',
                                        value: testStepAttachments,
                                        attachmentType: this.attachmentType,
                                        width: '20.8%',
                                      },
                                      {
                                        name: 'Run Status',
                                        value: testStep?.stepStatus || 'Not Run',
                                        width: '13%',
                                      },
                                      {
                                        name: 'Actual Result',
                                        value:
                                          testStep?.stepComments ||
                                          `${testStep?.stepStatus === 'Not Run' ? 'No Result' : ''}`,
                                      },
                                    ],
                                  }
                                : {
                                    fields: [
                                      { name: '#', value: i + 1, width: '5.5%' },
                                      { name: 'Description', value: action, width: '31%' },
                                      {
                                        name: 'Expected Results',
                                        value: expected,
                                        width: '31%',
                                      },
                                      {
                                        name: 'Run Status',
                                        value: testStep?.stepStatus || 'Not Run',
                                        width: '13%',
                                      },
                                      {
                                        name: 'Actual Result',
                                        value:
                                          testStep?.stepComments ||
                                          `${testStep?.stepStatus === 'Not Run' ? 'No Result' : ''}`,
                                      },
                                    ],
                                  };
                            }

                            return this.includeAttachments && hasAnyStepAttachment
                              ? {
                                  fields: [
                                    { name: '#', value: i + 1, width: '5.5%' },
                                    { name: 'Description', value: action, width: '26.9%' },
                                    {
                                      name: 'Expected Results',
                                      value: expected,
                                      width: '26.9%',
                                    },
                                    {
                                      name: 'Attachments',
                                      value: testStepAttachments,
                                      attachmentType: this.attachmentType,
                                    },
                                  ],
                                }
                              : {
                                  fields: [
                                    { name: '#', value: i + 1, width: '5.5%' },
                                    { name: 'Description', value: action, width: '45.8%' },
                                    {
                                      name: 'Expected Results',
                                      value: expected,
                                    },
                                  ],
                                };
                          })
                        );
                        // Filter out null entries (those iterations that were skipped)
                        testCaseStepsSkinData = testCaseStepsSkinData.filter((entry) => entry !== null);
                      }
                    } catch (err) {
                      logger.warn(
                        `potential error - this could also mean no teststeps property found for testcase - ${testCase.id}`
                      );
                      //return empty array of teststeps
                      testCaseStepsSkinData = [
                        {
                          fields: [
                            { name: '#' },
                            { name: 'description' },
                            { name: 'accepected results' },
                            { name: 'attachments' },
                          ],
                        },
                      ];
                    }
                    let testCaseRequirements = testCase.relations
                      .filter((relation) => relation.type === 'requirement')
                      ?.map((relation, index) => {
                        let fields = [
                          {
                            name: '#',
                            value: index + 1,
                            width: '5.5%',
                          },
                          {
                            name: 'Req ID',
                            value: relation.id,
                            width: '13.6%',
                          },
                          {
                            name: 'Req Title',
                            value: relation.title,
                          },
                        ];

                        // Insert customer ID conditionally between Req ID and Req Title
                        if (this.includeCustomerId && relation.customerId) {
                          fields.splice(2, 0, {
                            // Inserting at index 2, right before Req Title
                            name: 'Customer ID',
                            value: relation.customerId,
                            width: '18%',
                          });
                        }

                        return { fields };
                      });

                    let testCaseBugs = testCase.relations
                      .filter((relation) => relation.type === 'bug')
                      ?.map((relation, index) => {
                        let fields = [
                          {
                            name: '#',
                            value: index + 1,
                            width: '5.5%',
                          },
                          {
                            name: 'Bug ID',
                            value: relation.id,
                            width: '13.6%',
                          },
                          {
                            name: 'Bug Title',
                            value: relation.title,
                          },
                        ];

                        if (this.includeBugs && relation.severity) {
                          fields.push({
                            name: 'Severity',
                            value: relation.severity,
                            width: '19.4%',
                          });
                        }

                        return { fields };
                      });

                    let filteredTestCaseAttachments = testCase.attachmentsData.filter(
                      (attachment) => !attachment.attachmentComment.includes(`TestStep=`)
                    );
                    let testCaseAttachments = await Promise.all(
                      filteredTestCaseAttachments.map(async (attachment, i) => {
                        return {
                          fields: [
                            { name: '#', value: i + 1, width: '5.5%' },
                            { name: 'Attachments', value: [attachment], attachmentType: this.attachmentType },
                          ],
                        };
                      })
                    );

                    let adoptedTestCaseData = {
                      testCaseHeaderSkinData,
                      testCaseStepsSkinData,
                      testCaseAttachments,
                      testCaseRequirements,
                      testCaseBugs,
                    };
                    return adoptedTestCaseData;
                  } catch (error) {
                    logger.error(`Error occurred while mapping test cases: ${error.message}`);
                    logger.error(`Error Stack: ${error.stack}`);
                  }
                })
              );

              return {
                suiteSkinData,
                testCases,
              };
            })
          );
          return adoptedTestData;
      }
      return adoptedTestData;
    } catch (error) {
      logger.error(`error caught in jsonSkinDataAdpater ${error}`);
    }
  }

  async getAdoptedTestData() {
    return this.adoptedTestData;
  }
  async getAttachmentMinioData() {
    return this.attachmentMinioData;
  }
}
