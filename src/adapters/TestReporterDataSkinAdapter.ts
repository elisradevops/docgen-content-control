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
          const testCaseObject: any = {};

          // 1. Explicitly map core fields from item.testCase
          testCaseObject.testCaseId = item.testCase.id;
          testCaseObject.testCaseName = item.testCase.title;
          testCaseObject.testCaseUrl = item.testCase.url;
          testCaseObject.testCaseResult = item.testCase.result || null;
          testCaseObject.comment = item.testCase.comment || null;

          // 2. Explicitly map associated items from the top-level item
          testCaseObject.associatedRequirements = item.relatedRequirements || null;
          testCaseObject.associatedBugs = item.relatedBugs || null;
          testCaseObject.associatedCRs = item.relatedCRs || null;

          // 3. Initialize testSteps array (it's populated later in the loop)
          testCaseObject.testSteps = [];
          // 4. Iterate over all properties of the top-level 'item' object.
          //    These include predefined fields like 'priority', 'failureType', etc.,
          //    and any other dynamically selected fields.
          for (const key in item) {
            if (item.hasOwnProperty(key)) {
              // Define keys to skip: those handled above, belong to the suite,
              // are the nested testCase object, or are step-specific details processed later.
              const keysToSkip = [
                'suiteName',
                'testCase', // The entire nested object
                'relatedRequirements', // Handled in step 2
                'relatedBugs', // Handled in step 2
                'relatedCRs', // Handled in step 2
                // Step-specific details are processed later for each step, not for the test case itself
                'stepNo',
                'stepAction',
                'stepExpected',
                'stepStatus',
                'stepComments',
              ];

              if (keysToSkip.includes(key)) {
                continue;
              }

              // Special mapping for configurationName
              if (key === 'configurationName') {
                testCaseObject.configuration = item[key] || null;
              } else {
                // All other properties on 'item' are copied directly.
                // These will be caught by [JsonExtensionData] in the C# model.
                testCaseObject[key] = item[key] || null;
              }
            }
          }
          suite.testCases.set(testCaseId, testCaseObject);
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
