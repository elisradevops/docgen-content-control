import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';

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

export default class TraceDataFactory {
  dgDataProvider: DgDataProviderAzureDevOps;
  teamProject: string;

  /*test plan base params*/
  testPlanId: number;
  isSuiteSpecific = false;
  testSuiteArray: number[];
  /*query base params*/
  queryId: string;

  linkTypeFilterArray: string[];
  testDataRaw: any;
  adoptedData: any;
  templatePath: string;
  constructor(
    teamProject: string,
    testPlanId: number,
    testSuiteArray: number[],
    queryId: string,
    linkTypeFilterArray: string[],
    dgDataProvider: any
  ) {
    this.dgDataProvider = dgDataProvider;
    this.teamProject = teamProject;

    this.testPlanId = testPlanId;
    this.testSuiteArray = testSuiteArray;
    this.queryId = queryId;
    this.linkTypeFilterArray = linkTypeFilterArray;
    if (testSuiteArray) {
      this.isSuiteSpecific = true;
    }
  }

  /*fetches trace table data and adopts it to json skin format */
  async fetchData() {
    let ids;
    let traceData;
    try {
      if (this.testPlanId || this.testSuiteArray) {
        await this.fetchTestData();
        let allPlanIds: any[] = await Promise.all(
          this.testDataRaw.suites.map(async (suite) => {
            return await Promise.all(suite.testCases.map((testCase) => testCase.id));
          })
        );
        ids = [].concat.apply([], allPlanIds);
      }
      if (this.queryId) {
        let ticketsDataProvider = await this.dgDataProvider.getTicketsDataProvider();
        this.testDataRaw = await ticketsDataProvider.GetQueryResultById(this.queryId, this.teamProject);
        ids = await Promise.all(this.testDataRaw.map((wi) => wi.fields[0].value));
      }
    } catch (e) {
      logger.error(`error fetching trace data from azure devops server`);
      console.error(e);
      ids = [];
    }
    try {
      let ticketsDataProvider = await this.dgDataProvider.getTicketsDataProvider();
      traceData = await ticketsDataProvider.GetLinksByIds(this.teamProject, ids);
      logger.debug(`fetched trace data for ${ids.length} work items`);
    } catch (e) {
      logger.error(`error fetching trcae data`);
      console.error(e);
    }
    try {
      await this.jsonSkinDataAdpater(traceData);
    } catch (e) {
      logger.error(`error adopting to skin data`);
      console.error(e);
    }
  }
  /*
  fetches a test plan data adopts it to content data format
  stores the data in this.adoptedTestData 
  */
  async fetchTestData() {
    let filteredPlan;
    let testDataProvider = await this.dgDataProvider.getTestDataProvider();
    let projectTestPlans: any = await testDataProvider.GetTestPlans(this.teamProject);
    filteredPlan = projectTestPlans.value.filter((testPlan) => {
      return testPlan.id === this.testPlanId;
    });
    let testSuites: any[] = await testDataProvider.GetTestSuitesByPlan(
      this.teamProject,
      `${this.testPlanId}`,
      true
    );
    logger.debug(`fetched ${testSuites.length} testSuites for test plan ${this.testPlanId}`);
    // check if reccurse fetching by plan or per suite
    if (this.isSuiteSpecific == true) {
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
        true,
        true
      );

      logger.debug(`fetched ${allTestCases.length} test cases for test suite ${this.testPlanId}`);
      let SuitesAndTestCases: any[] = [];
      testSuites.forEach((suite) => {
        let testCases = allTestCases.filter((testCase) => testCase.suit === suite.id);
        logger.debug(`filtered ${testCases.length} test cases for test suite ${suite.id}`);
        SuitesAndTestCases.push({ suite, testCases });
      });

      this.testDataRaw = {
        plan: filteredPlan,
        suites: SuitesAndTestCases,
      };
    } catch (err) {
      console.log(err);
    }

    return [];
  }

  /*arranging the test data for json skins package*/
  async jsonSkinDataAdpater(data: any[] = [], isCustomerIdEnabled = false) {
    let allWiRows = await Promise.all(
      data.map(async (wi) => {
        let wiRows = await Promise.all(
          wi.links.map((link) => {
            try {
              let rowSkin;
              if (this.linkTypeFilterArray.includes(link.type)) {
                rowSkin = {
                  fields: [
                    { name: '#', value: wi.id, url: wi.url },
                    { name: 'Title', value: wi.title },
                    { name: '#', value: link.id, url: wi.url },
                    { name: 'Title', value: link.title },
                  ],
                };
                if (isCustomerIdEnabled) {
                  rowSkin.fields['customer requirement'] = wi.customerRequirmentId;
                }
              } else {
                return null;
              }
              return rowSkin;
            } catch (e) {
              return null;
            }
          })
        );
        return wiRows;
      })
    );
    allWiRows = [].concat.apply([], allWiRows);
    allWiRows = await Promise.all(allWiRows.filter((wi) => (wi ? true : false)));
    logger.debug(`trace table data adopted for json skin conataing -${allWiRows.length} items`);
    this.adoptedData = allWiRows;
  }
}
