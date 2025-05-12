import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import RichTextDataFactory from './RichTextDataFactory';
import AttachmentsDataFactory from './AttachmentsDataFactory';
import logger from '../services/logger';
import HtmlUtils from '../services/htmlUtils';
import QueryResultsSkinAdapter from '../adapters/QueryResultsSkinAdapter';
import TraceByLinkedRequirementAdapter from '../adapters/TraceByLinkedRequirementAdapter';

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
  includeHardCopyRun: boolean;
  includeAttachmentContent: boolean;
  runAttachmentMode: string;
  includeRequirements: boolean;
  includeCustomerId: boolean;
  includeLinkedMom: boolean;
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
    includeHardCopyRun: boolean = false,
    includeAttachmentContent: boolean = false,
    runAttachmentMode: string = 'both',
    includeRequirements: boolean = false,
    includeCustomerId: boolean = false,
    includeLinkedMom: boolean = false,
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
    this.includeHardCopyRun = includeHardCopyRun;
    this.includeAttachmentContent = includeAttachmentContent;
    this.runAttachmentMode = runAttachmentMode;
    this.includeRequirements = includeRequirements;
    this.includeCustomerId = includeCustomerId;
    this.includeLinkedMom = includeLinkedMom;
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
    this.testCaseToRequirementsTraceMap = new Map<string, string[]>();
    this.requirementToTestCaseTraceMap = new Map<string, string[]>();
    this.testCaseToRequirementsLookup = new Map<number, Set<any>>();
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
        throw new Error(`Warning: No test suites for plan id ${this.testPlanId} were found`);
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
        this.includeLinkedMom,
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
        testDataProvider.clearCache();
      }
    } catch (err) {
      logger.error(`Error occurred during fetching data: ${err.message}`);
      throw err;
    }
  }

  async generateSuiteObject(suite, allTestCases) {
    let testCases: any = allTestCases.filter((testCase) => testCase.suit === suite.id);

    logger.debug(`filtered ${testCases.length} test cases for test suite ${suite.id}`);

    if (testCases.length != 0) {
      let testCasesWithAttachments: any = [];
      for (const testCase of testCases) {
        let planAttachmentData = [];
        let runAttachmentData = [];

        // Fetch plan attachments if needed
        if (
          (this.runAttachmentMode === 'both' || this.runAttachmentMode === 'planOnly') &&
          this.includeAttachments
        ) {
          planAttachmentData = await this.fetchAttachmentData(testCase);
        }

        // Fetch run attachments if needed and available
        if (
          (this.runAttachmentMode === 'both' || this.runAttachmentMode === 'runOnly') &&
          testCase.caseEvidenceAttachments?.length > 0
        ) {
          runAttachmentData = await this.fetchAttachmentData(testCase, testCase.caseEvidenceAttachments);
        }

        // Clone and add attachment data to test case
        const testCaseWithAttachments = JSON.parse(JSON.stringify(testCase));
        testCaseWithAttachments.attachmentsData = [...planAttachmentData, ...runAttachmentData];
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
  private async fetchAttachmentData(testCase: any, additionalAttachments: any[] = []) {
    let structuredAttachmentData = await this.generateAttachmentData(testCase.id, additionalAttachments);
    structuredAttachmentData.forEach((item) => {
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
    return structuredAttachmentData;
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
  async generateAttachmentData(testCaseId, runAttachments: any[] = []) {
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
        this.PAT,
        runAttachments
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

      const includeCommonColumnsMode = this.traceAnalysisRequest.includeCommonColumnsMode;

      this.adoptedQueryResults = await this.jsonSkinDataAdpater(
        'query-results',
        false,
        includeCommonColumnsMode
      );
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

  //arranging the test data for json skins package
  async jsonSkinDataAdpater(
    adapterType: string = null,
    isByQuery: boolean = false,
    includeCommonColumnsMode: string = 'both'
  ) {
    let adoptedTestData = {} as any;
    try {
      switch (adapterType) {
        case 'test-result-group-summary':
          // let testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
          // adoptedTestData = await testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdpater(this.testDataRaw);
          break;
        case 'linked-requirements-trace':
          const linkedRequirementConfigs = [
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

          for (const { mapData, type, adoptedDataKey } of linkedRequirementConfigs) {
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
          const queryConfigs = [
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

          for (const { queryResults, type, adoptedDataKey } of queryConfigs) {
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
                this.includeCustomerId,
                includeCommonColumnsMode
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
                  { name: 'Title', value: suite.temp.name?.trim() + ' - ' },
                  { name: 'ID', value: suite.temp.id, url: suite.temp.url },
                ],
                level: suite.temp.level,
              };
              let testCaseAmount = suite.testCases?.length;
              let testCases = await Promise.all(
                suite.testCases.map(async (testCase) => {
                  // Check if the test case is just a title with no content
                  let titleOnly =
                    (!testCase.description || testCase.description.trim() === '') &&
                    (!testCase.steps || testCase.steps.length === 0) &&
                    (!testCase.attachmentsData || testCase.attachmentsData.length === 0) &&
                    (!testCase.relations || testCase.relations.length === 0);

                  // Check if the test case has any attachments, steps, or requirements
                  let insertPageBreak = testCaseAmount > 1 && !titleOnly;
                  try {
                    let Description = testCase.description || 'No description';
                    let cleanedDescription = await this.htmlUtils.cleanHtml(Description);
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
                    const descriptionRichText = await richTextFactory.factorizeRichTextData();
                    richTextFactory.attachmentMinioData.forEach((item) => {
                      let attachmentBucketData = {
                        attachmentMinioPath: item.attachmentPath,
                        minioFileName: item.fileName,
                      };
                      this.attachmentMinioData.push(attachmentBucketData);
                    });
                    let testCaseHeaderSkinData = {
                      fields: [
                        { name: 'Title', value: testCase.title + ' - ' },
                        { name: 'ID', value: testCase.id, url: testCase.url },
                        {
                          name: 'Test Description',
                          value: descriptionRichText || 'No description',
                        },
                      ],
                      level: suite.temp.level + 1,
                    };

                    // Helper function to check if all the values in the array are among the target values
                    let testCaseStepsSkinData: any[] = [];
                    let testCaseDocAttachmentsAdoptedData: { testCaseLevel: any[]; stepLevel: any[] } = {
                      testCaseLevel: [],
                      stepLevel: [],
                    };
                    try {
                      if (testCase.steps && testCase.steps.length > 0) {
                        testCaseStepsSkinData = await Promise.all(
                          testCase.steps.map(async (testStep: any, i: number) => {
                            let actionText = '';
                            let expectedText = '';
                            if (testStep.action) {
                              actionText = await this.htmlUtils.cleanHtml(testStep.action);
                            }
                            if (testStep.expected) {
                              expectedText = await this.htmlUtils.cleanHtml(testStep.expected);
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

                            const richTextHtmlAction = await richTextFactoryAction.factorizeRichTextData();
                            richTextFactoryAction.attachmentMinioData.forEach((item) => {
                              let attachmentBucketData = {
                                attachmentMinioPath: item.attachmentPath,
                                minioFileName: item.fileName,
                              };
                              this.attachmentMinioData.push(attachmentBucketData);
                            });
                            const richTextHtmlExpected =
                              await richTextFactoryExpected.factorizeRichTextData();

                            richTextFactoryExpected.attachmentMinioData.forEach((item) => {
                              let attachmentBucketData = {
                                attachmentMinioPath: item.attachmentPath,
                                minioFileName: item.fileName,
                              };
                              this.attachmentMinioData.push(attachmentBucketData);
                            });

                            if (!richTextFactoryAction.hasValues && !richTextFactoryExpected.hasValues) {
                              // Skip this iteration and move to the next one
                              return null;
                            }
                            // checks if there is any step attachment in the current test case
                            let hasAnyStepAttachment = testCase.attachmentsData.some((attachment) => {
                              return (
                                attachment.attachmentStepNo !== '' ||
                                attachment.attachmentComment.includes('TestStep=')
                              );
                            });

                            let testStepAttachments = testCase.attachmentsData.filter((attachment) => {
                              return (
                                attachment.attachmentStepNo === `${testStep.stepPosition}` ||
                                attachment.attachmentComment.includes(`[TestStep=${testStep.stepId || ''}]`)
                              );
                            });

                            if (this.includeAttachmentContent) {
                              // Extract .doc and .docx files into a separate list
                              let docAttachments: any[] =
                                testStepAttachments?.filter((attachment) =>
                                  attachment.attachmentFileName.match(/\.(docx?|DOCX?)$/)
                                ) || [];

                              // Remove .doc and .docx files from testStepAttachments
                              testStepAttachments = testStepAttachments.filter(
                                (attachment) => !attachment.attachmentFileName.match(/\.(docx?|DOCX?)$/)
                              );

                              //Insert the title of the test step attachments

                              if (docAttachments?.length > 0) {
                                this.adaptStepAttachmentContent(
                                  testCaseDocAttachmentsAdoptedData.stepLevel,
                                  testStep,
                                  docAttachments
                                );
                              }
                            }

                            const columnWidth = this.calculateColumnWidth(
                              this.stepResultDetailsMap?.size > 0,
                              this.includeAttachments && hasAnyStepAttachment,
                              this.includeHardCopyRun
                            );

                            const fields: any[] = [
                              { name: '#', value: `${testStep.stepPosition}`, width: '8.3%' },
                              {
                                name: 'Description',
                                value: richTextHtmlAction,
                                width: columnWidth,
                              },
                              {
                                name: 'Expected Results',
                                value: richTextHtmlExpected,
                                //In the 3rd from calculateColumnWidth case the column width is not set
                                width: columnWidth === '45.8%' ? undefined : columnWidth,
                              },
                            ];

                            if (this.includeAttachments && hasAnyStepAttachment) {
                              fields.push({
                                name: 'Attachments',
                                value: testStepAttachments,
                                attachmentType: this.attachmentType,
                                includeAttachmentContent: false,
                                width: columnWidth,
                              });
                            }

                            if (this.includeHardCopyRun) {
                              fields.push({
                                name: 'Actual Result',
                                value: '',
                              });
                              fields.push({
                                name: 'Run Status',
                                value: '',
                                width: '13%',
                              });
                            } else if (this.stepResultDetailsMap) {
                              fields.push({
                                name: 'Actual Result',
                                value: this.extractStepComment(testStep),
                              });
                              fields.push({
                                name: 'Run Status',
                                value: this.extractStepStatus(testStep),
                                width: '13%',
                              });
                            }

                            return { fields: fields };
                          })
                        );
                        // Filter out null entries (those iterations that were skipped)
                        testCaseStepsSkinData = testCaseStepsSkinData.filter((entry) => entry !== null);
                      }
                    } catch (err) {
                      logger.error(
                        `Error occurred while mapping test steps for test case ${testCase.id} - ${err.message}`
                      );
                      logger.warn(
                        `potential error - this could also mean no test steps property found for testcase - ${testCase.id}`
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

                    let testCaseLinkedMom = this.includeLinkedMom
                      ? this.adaptTestCaseMomRelation(testCase)
                      : undefined;

                    let filteredTestCaseAttachments = testCase.attachmentsData.filter((attachment) => {
                      return (
                        attachment.attachmentStepNo === '' &&
                        !attachment.attachmentComment.includes('TestStep=')
                      );
                    });

                    if (this.includeAttachmentContent) {
                      // Extract .doc and .docx files into a separate list
                      let docAttachments: any[] =
                        filteredTestCaseAttachments.filter((attachment) =>
                          attachment.attachmentFileName.match(/\.(docx?|DOCX?)$/)
                        ) || [];

                      // Remove .doc and .docx files from testStepAttachments
                      filteredTestCaseAttachments = filteredTestCaseAttachments.filter(
                        (attachment) => !attachment.attachmentFileName.match(/\.(docx?|DOCX?)$/)
                      );

                      this.adaptTestCaseAttachmentContent(
                        docAttachments,
                        testCaseDocAttachmentsAdoptedData.testCaseLevel
                      );
                    }

                    let testCaseAttachments = await Promise.all(
                      filteredTestCaseAttachments.map(async (attachment, i) => {
                        return {
                          fields: [
                            { name: '#', value: i + 1, width: '5.5%' },
                            {
                              name: 'Attachments',
                              value: [attachment],
                              attachmentType: this.attachmentType,
                              includeAttachmentContent: this.includeAttachmentContent,
                            },
                          ],
                        };
                      })
                    );
                    let adoptedTestCaseData = {
                      testCaseHeaderSkinData,
                      testCaseStepsSkinData,
                      testCaseAttachments,
                      testCaseRequirements,
                      testCaseLinkedMom,
                      testCaseDocAttachmentsAdoptedData,
                      //Insert page break only if it's not the first test case
                      insertPageBreak: insertPageBreak,
                    };
                    return adoptedTestCaseData;
                  } catch (error) {
                    logger.error(
                      `Error occurred while mapping test suite ${suite.temp.id} test case ${testCase.id} - ${error.message}`
                    );
                    logger.error(`error stack ${error.stack}`);
                    throw error;
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
      logger.error(`Cannot adapt data of Test Data - ${error.message}`);
      throw error;
    }
  }

  /**
   * Adapts the content of test case attachments and appends them to the test case level items.
   *
   * @param docAttachments - An array of document attachments, each containing an attachment file name and link.
   * @param testCaseLevelItems - An array to which the adapted test case attachment content will be pushed.
   */
  private adaptTestCaseAttachmentContent(docAttachments: any[], testCaseLevelItems: any[]) {
    docAttachments.forEach((docAttachment, idx) => {
      const attachmentName = docAttachment.attachmentFileName.replace(/\.[^/.]+$/, '');
      testCaseLevelItems.push({
        field: {
          name: 'Title',
          type: 'SubHeader',
          value: `Attachment #${idx + 1} Content - ${attachmentName}`,
        },
        type: 'SubHeader',
      });

      testCaseLevelItems.push({
        type: 'File',
        attachmentLink: docAttachment.attachmentLink,
        attachmentFileName: docAttachment.attachmentFileName,
        attachmentType: this.attachmentType,
        includeAttachmentContent: this.includeAttachmentContent,
      });
    });
  }

  /**
   * Adapts the step attachment content by adding step-level items and document attachments.
   *
   * @param stepLevelAdaptedItems - The array to which step-level items will be added.
   * @param testStep - The test step object containing step details.
   * @param docAttachments - The array of document attachments to be processed.
   */
  private adaptStepAttachmentContent(stepLevelAdaptedItems: any[], testStep: any, docAttachments: any[]) {
    stepLevelAdaptedItems.push({
      field: {
        name: 'Title',
        type: 'SubHeader',
        value: `Step #${testStep.stepPosition} Attachments:`,
      },
      type: 'SubHeader',
    });

    docAttachments.forEach((docAttachment) => {
      const attachmentName = docAttachment.attachmentFileName.replace(/\.[^/.]+$/, '');
      stepLevelAdaptedItems.push({
        field: {
          name: 'Title',
          type: 'SubHeader',
          value: `${attachmentName}`,
        },
        type: 'SubHeader',
      });

      stepLevelAdaptedItems.push({
        type: 'File',
        attachmentLink: docAttachment.attachmentLink,
        attachmentFileName: docAttachment.attachmentFileName,
        attachmentType: this.attachmentType,
        includeAttachmentContent: this.includeAttachmentContent,
      });
    });
  }

  /**
   * Adapt the test case requirements.
   */
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
   * Determines the appropriate column width based on step result details, attachments,
   * and soft copy run settings
   *
   * @param hasStepResultDetail Whether there is a step result detail
   * @param hasAttachment Whether there is an attachment
   * @param includeSoftCopyRun Whether soft copy run is included
   * @returns The appropriate column width as a string with percentage
   */
  private calculateColumnWidth(
    hasStepResultDetail: boolean,
    hasAttachment: boolean,
    includeSoftCopyRun: boolean
  ): string {
    // Case 1: Step result detail exists or soft copy run is included
    if (hasStepResultDetail || includeSoftCopyRun) {
      // Sub-case: No attachment but has step result detail or soft copy is included
      if (!hasAttachment) {
        return '31%';
      }
      // Sub-case: Has step result detail or soft copy run is included (with attachment)
      return '20.8%';
    }

    // Case 2: No step result detail and soft copy run is not included, but has attachment
    if (hasAttachment) {
      return '26.9%';
    }

    // Case 3: Default case - no step result detail, no soft copy run, no attachment
    return '45.8%';
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

  private adaptTestCaseMomRelation(testCase: any) {
    return testCase.relations
      .filter(
        (relation: any) => relation.type.toLowerCase() === 'bug' || relation.type.toLowerCase() === 'task'
      )
      .map((relation: any, index: number) => {
        let fields = this.buildMomFields({
          index,
          itemId: relation.id,
          witType: relation.type,
          itemTitle: relation.title,
          url: relation.url,
          status: relation.status,
        });
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

  private buildMomFields(params: {
    index: number;
    itemId: number;
    witType: string;
    itemTitle: string;
    url: string;
    status: string;
  }) {
    const { index, itemId, witType, itemTitle, url, status } = params;

    // Common fields
    return [
      {
        name: '#',
        value: index + 1,
        width: '5.5%',
      },
      {
        name: 'WI ID',
        value: itemId,
        width: '13.6%',
        url: url,
      },
      { name: 'Type', value: witType, width: '8.6%' },
      {
        name: 'Title',
        value: itemTitle || '',
      },
      {
        name: 'Status',
        value: status || '',
        width: '12.4%',
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
