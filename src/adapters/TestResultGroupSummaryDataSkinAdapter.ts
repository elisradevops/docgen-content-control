import logger from '../services/logger';
import { writeFileSync } from 'fs';

export default class TestResultGroupSummaryDataSkinAdapter {
  // async jsonSkinDataAdpater(testDataRaw) {
  //   try {
  //     testDataRaw.suites.sort((obj1, obj2) => {
  //       if (obj1.temp.level == undefined || obj2.temp.level == undefined) {
  //         logger.debug(`FUCK!!!`);
  //       }
  //       if (obj1.temp.level > obj2.temp.level) {
  //         return 1;
  //       }
  //       if (obj1.temp.level < obj2.temp.level) {
  //         return -1;
  //       }
  //       return 0;
  //     });
  //     let adoptedTestData = testDataRaw.suites;
  //     let summaryBysuiteData = await Promise.all(
  //       adoptedTestData.map(async (dataToSum: any) => {
  //         let suiteSumRaw = {
  //           fields: [
  //             {
  //               name: "#",
  //               value: dataToSum.temp.id,
  //               url: dataToSum.temp.url
  //             },
  //             { name: "Test Group", value: dataToSum.temp.name },
  //             { name: "Passed", value: 0 },
  //             { name: "Failed", value: 0 },
  //             { name: "Blocked", value: 0 },
  //             { name: "NA", value: 0 },
  //             { name: "Not Run", value: 0 },
  //             { name: "Total", value: 0 },
  //             { name: "% of Success", value: 0 }
  //           ]
  //         };
  //         //if there are test cases
  //         dataToSum.testCases.map(async testCase => {
  //           if (testCase.lastTestRun) {
  //             if (testCase.lastTestRun.runStatistics[0].outcome) {
  //               logger.debug(
  //                 `for testcase ${testCase.id} outcome :${
  //                   testCase.lastTestRun.runStatistics[0].outcome
  //                 }`
  //               );
  //               //if there was last test get it outcome and check it
  //               switch (testCase.lastTestRun.runStatistics[0].outcome) {
  //                 case "Passed":
  //                   suiteSumRaw.fields[2].value =
  //                     suiteSumRaw.fields[2].value + 1;
  //                   suiteSumRaw.fields[7].value =
  //                     suiteSumRaw.fields[7].value + 1;
  //                   break;
  //                 case "Failed":
  //                   suiteSumRaw.fields[3].value =
  //                     suiteSumRaw.fields[3].value + 1;
  //                   suiteSumRaw.fields[7].value =
  //                     suiteSumRaw.fields[7].value + 1;
  //                   break;
  //                 case "Blocked":
  //                   suiteSumRaw.fields[4].value =
  //                     suiteSumRaw.fields[4].value + 1;
  //                   suiteSumRaw.fields[7].value =
  //                     suiteSumRaw.fields[7].value + 1;
  //                   break;
  //                 case "NA":
  //                   suiteSumRaw.fields[5].value =
  //                     suiteSumRaw.fields[5].value + 1;
  //                   suiteSumRaw.fields[7].value =
  //                     suiteSumRaw.fields[7].value + 1;
  //                   break;
  //               }
  //             } else {
  //               suiteSumRaw.fields[6].value = suiteSumRaw.fields[6].value + 1;
  //               suiteSumRaw.fields[7].value = suiteSumRaw.fields[7].value + 1;
  //             }
  //           } else {
  //             suiteSumRaw.fields[6].value = suiteSumRaw.fields[6].value + 1;
  //             suiteSumRaw.fields[7].value = suiteSumRaw.fields[7].value + 1;
  //           }
  //         });
  //         if (suiteSumRaw.fields[7].value == 0) {
  //           suiteSumRaw.fields[8].value = 0;
  //         } else {
  //           suiteSumRaw.fields[8].value = Math.round(
  //             (suiteSumRaw.fields[2].value / suiteSumRaw.fields[7].value) * 100
  //           );
  //         }

  //         return suiteSumRaw;
  //       })
  //     );
  //     return summaryBysuiteData;
  //   } catch (error) {
  //     logger.error(`The error :  ${error}`);
  //   }
  // }

  public jsonSkinDataAdapter(resultDataRaw: any[]) {
    try {
      let adoptedResultData = resultDataRaw.sort((a, b) => {
        if (a.testGroupName === 'Total') return 1; // Move "Total" to the end
        if (b.testGroupName === 'Total') return -1; // Move "Total" to the end
        return a.testGroupName.localeCompare(b.testGroupName); // Sort alphabetically
      });

      return adoptedResultData.map((item, idx) => {
        return {
          fields: [
            { name: '#', value: item.testGroupName !== 'Total' ? `${idx + 1}` : '' },
            { name: 'Test Group', value: `${item.testGroupName}` },
            { name: 'Passed', value: `${item.passed}` },
            { name: 'Failed', value: `${item.failed}` },
            { name: 'Blocked', value: `${item.blocked}` },
            { name: 'N/A', value: `${item.notApplicable}` },
            { name: 'Not Run', value: `${item.notRun}` },
            { name: 'Total', value: `${item.total}` },
            { name: '% of Success', value: `${item.successPercentage}` },
          ],
        };
      });
    } catch (error) {
      logger.error(`Error occurred while trying to build jsonSkinDataAdapter ${error.message}`);
    }
  }
}
