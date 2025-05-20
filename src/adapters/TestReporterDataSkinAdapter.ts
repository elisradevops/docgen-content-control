import RichTextDataFactory from '../factories/RichTextDataFactory';
import HtmlUtils from '../services/htmlUtils';
import logger from '../services/logger';

export default class TestReporterDataSkinAdapter {
  htmlUtils: HtmlUtils;
  templatePath: string;
  teamProject: string;
  constructor(templatePath: string, teamProject: string) {
    this.htmlUtils = new HtmlUtils();
    this.templatePath = templatePath;
    this.teamProject = teamProject;
  }

  private async htmlStrip(text): Promise<any> {
    const richTextFactory = new RichTextDataFactory(
      text,
      this.templatePath,
      this.teamProject,
      '',
      '',
      '',
      '',
      '',
      true
    );
    const richText = await richTextFactory.factorizeRichTextData();
    return richText;
  }

  public async jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      // Group by test suite
      const suiteMap = new Map();

      for (const item of resultDataRaw) {
        const suiteName = item.suiteName;

        // Create or get test suite
        if (!suiteMap.has(suiteName)) {
          suiteMap.set(suiteName, {
            suiteName,
            testCases: new Map(),
          });
        }

        const suite = suiteMap.get(suiteName);
        const testCaseId = item.testCase.id;
        // Create or get test case
        if (!suite.testCases.has(testCaseId)) {
          suite.testCases.set(testCaseId, {
            testCaseId: testCaseId,
            testCaseName: item.testCase.title,
            testCaseUrl: item.testCase.url,
            priority: item.priority || null,
            failureType: item.failureType || null,
            testCaseResult: item.testCase.result || null,
            comment: item.testCase.comment || null,
            runBy: item.runBy || null,
            configuration: item.configurationName || null,
            state: item.state || null,
            executionDate: item.executionDate || null,
            assignedTo: item.assignedTo || null,
            subSystem: item.subSystem || null,
            automationStatus: item.automationStatus || null,
            associatedRequirements: item.relatedRequirements || null,
            associatedBugs: item.relatedBugs || null,
            associatedCRs: item.relatedCRs || null,
            testSteps: [],
          });
        }

        // Process test step if present
        const testCase = suite.testCases.get(testCaseId);

        // Clean HTML content
        let action = null;
        let expected = null;

        if (item.stepAction) {
          const cleanedActionHtml = await this.htmlUtils.cleanHtml(`${item.stepAction}`, true);
          action = await this.htmlStrip(cleanedActionHtml);
        }

        if (item.stepExpected) {
          const cleanedExpectedHtml = await this.htmlUtils.cleanHtml(`${item.stepExpected}`, true);
          expected = await this.htmlStrip(cleanedExpectedHtml);
        }

        const testStep = {
          stepNo: item.stepNo || '',
          stepAction: action || '',
          stepExpected: expected || '',
          stepRunStatus: item.stepStatus || '',
          stepErrorMessage: item.stepComments || '',
        };

        testCase.testSteps.push(testStep);
      }

      // Transform maps to arrays for final output
      const result = [];

      suiteMap.forEach((suite) => {
        const testCases = [];

        suite.testCases.forEach((testCase) => {
          testCases.push({
            ...testCase,
          });
        });

        result.push({
          suiteName: suite.suiteName,
          testCases,
        });
      });

      return result;
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter ${error.message}`);
    }
  }
}
