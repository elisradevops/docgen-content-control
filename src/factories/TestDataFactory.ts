import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import RichTextDataFactory from './RichTextDataFactory';
import AttachmentsDataFactory from './AttachmentsDataFactory';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import logger from '../services/logger';
import HtmlUtils from '../services/htmlUtils';
import QueryResultsSkinAdapter from '../adapters/QueryResultsSkinAdapter';
import TraceByLinkedRequirementAdapter from '../adapters/TraceByLinkedRequirementAdapter';

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
  traceAnalysisRequest: any;
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
  requirementToTestCaseTraceMap: Map<string, string[]>;
  testCaseToRequirementsTraceMap: Map<string, string[]>;
  testCaseToRequirementsLookup: Map<number, Set<any>>;
  stepResultDetailsMap: Map<string, any>;

  constructor(
    attachmentsBucketName,
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    includeAttachments: boolean = true,
    attachmentType: string = 'asEmbedded',
    includeRequirements: boolean = false,
    includeCustomerId: boolean = false,
    traceAnalysisRequest: any = undefined,
    includeTestResults: boolean = false,
    dgDataProvider: any,
    templatePath = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT,
    stepResultDetailsMap?: Map<string, any>
  ) {
    this.teamProject = teamProject;
    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.includeAttachments = includeAttachments;
    this.attachmentType = attachmentType;
    this.includeRequirements = includeRequirements;
    this.includeCustomerId = includeCustomerId;
    this.traceAnalysisRequest = traceAnalysisRequest;
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
    this.stepResultDetailsMap = stepResultDetailsMap;
  }
  async fetchTestData(isByQuery: boolean = false) {
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
      let {
        testCasesList: allTestCases,
        requirementToTestCaseTraceMap,
        testCaseToRequirementsTraceMap,
      }: any = await testDataProvider.GetTestCasesBySuites(
        this.teamProject,
        `${this.testPlanId}`,
        `${this.testPlanId + 1}`,
        true,
        this.includeRequirements,
        this.includeCustomerId,
        this.stepResultDetailsMap
      );

      logger.debug(`fetched ${allTestCases.length} test cases for test suite ${this.testPlanId}`);
      if (requirementToTestCaseTraceMap) {
        this.requirementToTestCaseTraceMap = requirementToTestCaseTraceMap;
      }
      if (testCaseToRequirementsTraceMap) {
        this.testCaseToRequirementsTraceMap = testCaseToRequirementsTraceMap;
      }
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
        this.adoptedTestData = await this.jsonSkinDataAdpater(null, isByQuery);
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
      const testCaseToRequirementMap = new Map<number, Set<any>>();
      if (this.traceAnalysisRequest.reqTestQuery) {
        logger.info('starting to fetch query results');

        logger.info('fetching requirement - test results');
        let reqTestQueryResults: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.traceAnalysisRequest.reqTestQuery.wiql.href,
          true,
          testCaseToRequirementMap
        );

        logger.info(`requirement - test results are ${reqTestQueryResults ? 'ready' : 'not found'}`);

        this.reqTestQueryResults = reqTestQueryResults;
      }
      if (this.traceAnalysisRequest.testReqQuery) {
        logger.info('starting to fetch query results');

        logger.info('fetching test - requirement results');
        let testReqQueryResults: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.traceAnalysisRequest.testReqQuery.wiql.href,
          true,
          testCaseToRequirementMap
        );
        logger.info(`test - requirement results are ${testReqQueryResults ? 'ready' : 'not found'}`);
        this.testReqQueryResults = testReqQueryResults;
      }

      this.adoptedQueryResults = await this.jsonSkinDataAdpater('query-results');
      this.testCaseToRequirementsLookup = testCaseToRequirementMap;
    } catch (err) {
      logger.error(`Could not fetch query results: ${err.message}`);
    }
  }

  async fetchLinkedRequirementsTrace() {
    try {
      this.adoptedQueryResults = await this.jsonSkinDataAdpater('linked-requirements-trace');
    } catch (err) {
      logger.error(`Could not fetch linked requirements trace: ${err.message}`);
    }
  }

  private allValuesAreTarget(array, targetValues) {
    return array.every((obj) => targetValues.includes(obj.value));
  }

  //arranging the test data for json skins package
  async jsonSkinDataAdpater(adapterType: string = null, isByQuery: boolean = false) {
    let adoptedTestData = {} as any;
    try {
      switch (adapterType) {
        case 'test-result-group-summary':
          // let testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          // adoptedTestData = await testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdpater(this.testDataRaw);
          break;
        case 'linked-requirements-trace':
          const configs2 = [
            {
              mapData: this.requirementToTestCaseTraceMap,
              type: 'req-test',
              adoptedDataKey: 'reqTestAdoptedData',
            },
            {
              mapData: this.testCaseToRequirementsTraceMap,
              type: 'test-req',
              adoptedDataKey: 'testReqAdoptedData',
            },
          ];

          for (const { mapData, type, adoptedDataKey } of configs2) {
            const title = {
              fields: [
                {
                  name: 'Title',
                  value: `${
                    type === 'req-test'
                      ? 'Trace Analysis Table: Requirements to Test cases'
                      : 'Trace Analysis Table : Test cases to Requirement'
                  }`,
                },
              ],
              level: 2,
            };
            if (mapData) {
              const linkedRequirementTraceSkinAdapter = new TraceByLinkedRequirementAdapter(mapData, type);

              linkedRequirementTraceSkinAdapter.adoptSkinData();
              const adoptedData = linkedRequirementTraceSkinAdapter.getAdoptedData();
              adoptedTestData[adoptedDataKey] = { title, adoptedData };
            } else {
              adoptedTestData[adoptedDataKey] = { title, adoptedData: null };
            }
          }

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
            const title = {
              fields: [
                {
                  name: 'Title',
                  value: `${
                    type === 'req-test'
                      ? 'Trace Analysis Table: Requirements to Test cases'
                      : 'Trace Analysis Table: Test cases to Requirement'
                  }`,
                },
              ],
              level: 2,
            };
            if (queryResults) {
              const queryResultSkinAdapter = new QueryResultsSkinAdapter(
                queryResults,
                type,
                this.includeCustomerId
              );

              queryResultSkinAdapter.adoptSkinData();
              const adoptedData = queryResultSkinAdapter.getAdoptedData();
              adoptedTestData[adoptedDataKey] = { title, adoptedData };
            } else {
              adoptedTestData[adoptedDataKey] = { title, adoptedData: null };
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

              let testCases = await Promise.all(
                suite.testCases.map(async (testCase) => {
                  try {
                    let Description = testCase.description || 'No description';
                    let cleanedDescription = this.htmlUtils.cleanHtml(Description);
                    let richTextFactory = new RichTextDataFactory(
                      cleanedDescription,
                      this.templatePath,
                      this.teamProject,
                      this.attachmentsBucketName,
                      this.minioEndPoint,
                      this.minioAccessKey,
                      this.minioSecretKey,
                      this.PAT
                    );

                    await richTextFactory.createRichTextContent();
                    richTextFactory.attachmentMinioData.forEach((item) => {
                      let attachmentBucketData = {
                        attachmentMinioPath: item.attachmentPath,
                        minioFileName: item.fileName,
                      };
                      this.attachmentMinioData.push(attachmentBucketData);
                    });
                    let richTextNodes = richTextFactory.skinDataContentControls;
                    let testCaseHeaderSkinData = {
                      fields: [
                        { name: 'Title', value: testCase.title + ' - ' },
                        { name: 'ID', value: testCase.id, url: testCase.url },
                        {
                          name: 'Test Description',
                          value: cleanedDescription || 'No description',
                          richTextNodes,
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
                              this.teamProject,
                              this.attachmentsBucketName,
                              this.minioEndPoint,
                              this.minioAccessKey,
                              this.minioSecretKey,
                              this.PAT
                            );
                            let richTextFactoryExpected = new RichTextDataFactory(
                              expectedText,
                              this.templatePath,
                              this.teamProject,
                              this.attachmentsBucketName,
                              this.minioEndPoint,
                              this.minioAccessKey,
                              this.minioSecretKey,
                              this.PAT
                            );
                            await richTextFactoryAction.createRichTextContent();
                            await richTextFactoryExpected.createRichTextContent();

                            let richTextAction = richTextFactoryAction.skinDataContentControls;
                            let richTextExpected = richTextFactoryExpected.skinDataContentControls;

                            // If there is no action and expected text, skip this step
                            if (richTextAction?.length === 0 && richTextExpected?.length === 0) {
                              return null;
                            }

                            // checks if there is any step attachment in the current test case
                            let hasAnyStepAttachment = testCase.attachmentsData.some((attachment) => {
                              return attachment.attachmentComment.includes('TestStep=');
                            });

                            let testStepAttachments = testCase.attachmentsData.filter((attachment) => {
                              return attachment.attachmentComment.includes(`TestStep=${i + 2}`);
                            });

                            //If runs status and result are included
                            if (this.stepResultDetailsMap) {
                              return this.includeAttachments && hasAnyStepAttachment
                                ? {
                                    fields: [
                                      { name: '#', value: `${testStep.stepPosition}`, width: '8.3%' },
                                      {
                                        name: 'Description',
                                        value: actionText,
                                        richTextNodes: richTextAction,
                                        width: '20.8%',
                                      },
                                      {
                                        name: 'Expected Results',
                                        value: expectedText,
                                        richTextNodes: richTextExpected,
                                        width: '20.8%',
                                      },
                                      {
                                        name: 'Attachments',
                                        value: testStepAttachments,
                                        attachmentType: this.attachmentType,
                                        width: '20.8%',
                                      },
                                      {
                                        name: 'Actual Result',
                                        value: this.extractStepComment(testStep),
                                      },
                                      {
                                        name: 'Run Status',
                                        value: this.extractStepStatus(testStep),
                                        width: '13%',
                                      },
                                    ],
                                  }
                                : {
                                    fields: [
                                      { name: '#', value: `${testStep.stepPosition}`, width: '8.3%' },
                                      {
                                        name: 'Description',
                                        value: actionText,
                                        richTextNodes: richTextAction,
                                        width: '31%',
                                      },
                                      {
                                        name: 'Expected Results',
                                        value: expectedText,
                                        richTextNodes: richTextExpected,
                                        width: '31%',
                                      },
                                      {
                                        name: 'Actual Result',
                                        value: this.extractStepComment(testStep),
                                      },
                                      {
                                        name: 'Run Status',
                                        value: this.extractStepStatus(testStep),
                                        width: '13%',
                                      },
                                    ],
                                  };
                            }

                            return this.includeAttachments && hasAnyStepAttachment
                              ? {
                                  fields: [
                                    { name: '#', value: `${testStep.stepPosition}`, width: '8.3%' },
                                    {
                                      name: 'Description',
                                      value: actionText,
                                      richTextNodes: richTextAction,
                                      width: '26.9%',
                                    },
                                    {
                                      name: 'Expected Results',
                                      value: expectedText,
                                      richTextNodes: richTextExpected,
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
                                    { name: '#', value: `${testStep.stepPosition}`, width: '8.3%' },
                                    {
                                      name: 'Description',
                                      value: actionText,
                                      richTextNodes: richTextAction,
                                      width: '45.8%',
                                    },
                                    {
                                      name: 'Expected Results',
                                      value: expectedText,
                                      richTextNodes: richTextExpected,
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
                    let testCaseRequirements = this.includeRequirements
                      ? this.AdaptTestCaseRequirements(testCase, isByQuery)
                      : undefined;

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
      logger.error(`error stack ${error.stack}`);
    }
  }

  private AdaptTestCaseRequirements(testCase: any, isByQuery: boolean = false) {
    return isByQuery
      ? this.adaptTestCaseRequirementsByQuery(testCase)
      : this.adaptTestCaseRequirementsByRelations(testCase);
  }

  /**
   * Handle the scenario where the test case requirements come from
   * `this.testCaseToRequirementsLookup`.
   */
  private adaptTestCaseRequirementsByQuery(testCase: any) {
    const requirements = Array.from(this.testCaseToRequirementsLookup.get(testCase.id) || []);

    return requirements.map((requirement: any, index: number) => {
      // Get the basic fields
      let fields = this.buildRequirementFields({
        index,
        requirementId: requirement.id,
        requirementTitle: requirement.fields['System.Title'],
        requirementUrl: requirement._links?.html?.href,
      });

      // Optionally insert the "Customer ID" field
      if (this.includeCustomerId) {
        const customerValue = this.findCustomerValue(requirement.fields);
        if (customerValue) {
          this.insertCustomerField(fields, customerValue);
        }
      }

      return { fields };
    });
  }

  /**
   * Handle the scenario where the test case requirements are derived
   * from `testCase.relations`.
   */
  private adaptTestCaseRequirementsByRelations(testCase: any) {
    return testCase.relations
      .filter((relation: any) => relation.type === 'requirement')
      .map((relation: any, index: number) => {
        let fields = this.buildRequirementFields({
          index,
          requirementId: relation.id,
          requirementTitle: relation.title,
          requirementUrl: '', // no URL in relations, unless you add it
        });

        // Optionally insert the "Customer ID" field
        if (this.includeCustomerId && relation.customerId) {
          this.insertCustomerField(fields, relation.customerId);
        }

        return { fields };
      });
  }

  /**
   * Build the array of `fields` for a single requirement row.
   */
  private buildRequirementFields(params: {
    index: number;
    requirementId: number;
    requirementTitle: string;
    requirementUrl?: string;
  }) {
    const { index, requirementId, requirementTitle, requirementUrl } = params;

    // Common fields
    return [
      {
        name: '#',
        value: index + 1,
        width: '5.5%',
      },
      {
        name: 'Req ID',
        value: requirementId,
        width: '13.6%',
        url: requirementUrl,
      },
      {
        name: 'Req Title',
        value: requirementTitle || '',
      },
    ];
  }

  /**
   * Find the 'customer' property (case-insensitive) in the given `fields` object
   * and return its value, or `null` if not found.
   */
  private findCustomerValue(fieldsObj: any): string | null {
    const customerKey = Object.keys(fieldsObj).find((key) => key.toLowerCase().includes('customer'));
    return customerKey ? fieldsObj[customerKey] : null;
  }

  /**
   * Insert a "Customer ID" field between the "Req ID" and "Req Title" fields.
   */
  private insertCustomerField(fields: any[], customerValue: string) {
    // Insert at index 2, right before "Req Title"
    fields.splice(2, 0, {
      name: 'Customer ID',
      value: customerValue,
      width: '18%',
    });
  }

  private extractStepStatus(testStep: any) {
    if (testStep?.isSharedStepTitle) {
      return '';
    }

    return testStep?.stepStatus || 'Not Run';
  }

  private extractStepComment(testStep: any) {
    if (testStep?.isSharedStepTitle && !testStep?.stepComments) {
      return '';
    }
    if (testStep?.stepComments) {
      return testStep?.stepComments;
    }
    return !testStep?.stepStatus || testStep?.stepStatus === 'Not Run' ? 'No Result' : '';
  }

  async getAdoptedTestData() {
    return this.adoptedTestData;
  }
  getAttachmentMinioData() {
    return this.attachmentMinioData;
  }
}
