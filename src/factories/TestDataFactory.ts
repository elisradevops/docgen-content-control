import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import RichTextDataFactory from './RichTextDataFactory';
import AttachmentsDataFactory from './AttachmentsDataFactory';
import TestResultGroupSummaryDataSkinAdapter from '../adapters/TestResultGroupSummaryDataSkinAdapter';
import logger from '../services/logger';
import { JSDOM } from 'jsdom';

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
  templatePath: string;
  includeAttachments: boolean;
  includeRequirements: boolean;
  includeCustomerId: boolean;
  includeBugs: boolean;
  includeSeverity: boolean;
  includeTestResults: boolean;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  attachmentMinioData: any[];
  PAT: string;
  attachmentsBucketName: string;

  constructor(
    attachmentsBucketName,
    teamProject: string = '',
    testPlanId: number = null,
    testSuiteArray: number[] = null,
    includeAttachments: boolean = true,
    includeRequirements: boolean = false,
    includeCustomerId: boolean = false,
    includeBugs: boolean = false,
    includeSeverity: boolean = false,
    includeTestResults: boolean = false,
    dgDataProvider: any,
    templatePath = '',
    minioEndPoint,
    minioAccessKey,
    minioSecretKey,
    PAT
  ) {
    this.teamProject = teamProject;
    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.includeAttachments = includeAttachments;
    this.includeRequirements = includeRequirements;
    this.includeCustomerId = includeCustomerId;
    this.includeBugs = includeBugs;
    this.includeSeverity = includeSeverity;
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
  }
  async fetchTestData() {
    let testfilteredPlan;
    let testDataProvider = await this.dgDataProvider.getTestDataProvider();
    let projectTestPlans: any = await testDataProvider.GetTestPlans(this.teamProject);
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
    if (this.isSuiteSpecific == true && testSuites.length != 0) {
      await Promise.all(
        (testSuites = testSuites.filter((suite) => {
          return this.testSuiteArray.indexOf(suite.id) !== -1;
        }))
      );
    } //end of if
    try {
      let allTestCases: any[] = await testDataProvider.GetTestCasesBySuites(
        this.teamProject,
        `${this.testPlanId}`,
        `${this.testPlanId + 1}`,
        true,
        this.includeRequirements,
        this.includeCustomerId,
        this.includeBugs,
        this.includeSeverity
      );

      logger.debug(`fetched ${allTestCases.length} test cases for test suite ${this.testPlanId}`);

      if (testSuites.length != 0) {
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
      console.log(err);
    }
    return [];
  }

  async generateSuiteObject(suite, allTestCases) {
    let testCases: any = allTestCases.filter((testCase) => testCase.suit === suite.id);

    logger.debug(`filtered ${testCases.length} test cases for test suite ${suite.id}`);

    if (testCases.length != 0) {
      let testCasesWithAttachments: any = [];
      for (let i = 0; i < testCases.length; i++) {
        let attachmentsData = await this.generateAttachmentData(testCases[i].id);
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
        let testCaseWithAttachments: any = JSON.parse(JSON.stringify(testCases[i]));
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
  //arranging the test data for json skins package
  async jsonSkinDataAdpater(adapterType: string = null) {
    let adoptedTestData;

    function addBreakAfterParagraphs(html) {
      const dom = new JSDOM(html);
      const { document } = dom.window;
      const paragraphs = document.querySelectorAll('p');

      paragraphs.forEach((p) => {
        const hasBr = p.innerHTML.includes('<br>');
        const textContent = p.textContent.trim();
        const containsActualText = textContent !== '' && textContent !== '\u00A0'; // '\u00A0' is the non-breaking space character

        if (!hasBr && containsActualText) {
          p.insertAdjacentHTML('afterend', '<br>');
        }
      });

      return document.body.innerHTML;
    }

    switch (adapterType) {
      case 'test-result-group-summary':
        let testResultGroupSummaryDataSkinAdapter = new TestResultGroupSummaryDataSkinAdapter();
        adoptedTestData = await testResultGroupSummaryDataSkinAdapter.jsonSkinDataAdpater(this.testDataRaw);
        break;
      default:
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
                let Description = testCase.description || 'No description';
                let cleanedDescription = addBreakAfterParagraphs(Description);
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
                function allValuesAreTarget(array, targetValues) {
                  return array.every((obj) => targetValues.includes(obj.value));
                }
                try {
                  if (testCase.steps) {
                    testCaseStepsSkinData = await Promise.all(
                      testCase.steps.map(async (testStep: any, i: number) => {
                        let richTextFactoryAction = new RichTextDataFactory(
                          testStep.action || '',
                          this.templatePath,
                          this.teamProject
                        );
                        let richTextFactoryExpected = new RichTextDataFactory(
                          testStep.expected || '',
                          this.templatePath,
                          this.teamProject
                        );
                        await richTextFactoryAction.htmlStrip();
                        await richTextFactoryExpected.htmlStrip();
                        // Define target values
                        const targetValues = ['\n', ' ', ''];

                        // Check if all values in both arrays are among the target values
                        if (
                          allValuesAreTarget(richTextFactoryAction.contentControlsStrings, targetValues) &&
                          allValuesAreTarget(richTextFactoryExpected.contentControlsStrings, targetValues)
                        ) {
                          // Skip this iteration and move to the next one
                          return null;
                        }
                        let action = richTextFactoryAction.skinDataContentControls[0].data.fields[0].value;
                        let expected =
                          richTextFactoryExpected.skinDataContentControls[0].data.fields[0].value;

                        action = action.replace(/\n/g, '<BR/>');
                        expected = expected.replace(/\n/g, '<BR/>');

                        let testStepAttachments = testCase.attachmentsData.filter((attachment) => {
                          return attachment.attachmentComment.includes(`TestStep=${i + 2}`);
                        });

                        return this.includeAttachments
                          ? {
                              fields: [
                                { name: '#', value: i + 1 },
                                { name: 'Description', value: action },
                                {
                                  name: 'Expected Results',
                                  value: expected,
                                },
                                {
                                  name: 'attachments',
                                  value: testStepAttachments,
                                },
                              ],
                            }
                          : {
                              fields: [
                                { name: '#', value: i + 1 },
                                { name: 'Description', value: action },
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
                      },
                      {
                        name: 'Req ID',
                        value: relation.id,
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
                      },
                      {
                        name: 'Bug ID',
                        value: relation.id,
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
                        { name: '#', value: i + 1 },
                        { name: 'Attachments', value: [filteredTestCaseAttachments[i]] },
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
              })
            );
            return {
              suiteSkinData,
              testCases,
            };
          })
        );
        return adoptedTestData;
        break;
    }
    return adoptedTestData;
  }

  async getAdoptedTestData() {
    return this.adoptedTestData;
  }
  async getAttachmentMinioData() {
    return this.attachmentMinioData;
  }
}
