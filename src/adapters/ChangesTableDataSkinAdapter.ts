import logger from '../services/logger';
import HtmlUtils from '../services/htmlUtils';
import { writeFileSync } from 'fs';

export default class ChangesTableDataSkinAdapter {
  rawChangesArray: any = [];
  adoptedData: any = [];
  includeChangeDescription: boolean = false;
  includeCommittedBy: boolean = false;
  htmlUtils: HtmlUtils;

  constructor(rawChangesArray: any[], includeChangeDescription: boolean, includeCommittedBy: boolean) {
    this.rawChangesArray = rawChangesArray;
    this.includeChangeDescription = includeChangeDescription;
    this.includeCommittedBy = includeCommittedBy;
    this.htmlUtils = new HtmlUtils();
    console.log(
      'Constructor: Initialized ChangesTableDataSkinAdapter with rawChangesArray',
      JSON.stringify(rawChangesArray)
    );
  }

  getAdoptedData() {
    console.log('getAdoptedData: Returning adopted data', this.adoptedData);
    return this.adoptedData;
  }

  private applyChangeNumber = (change: any) => {
    if (change.build) {
      return { value: change.build, url: change.workItem.url };
    }

    if (change.pullrequest) {
      return { value: change.pullrequest.description, url: change.pullrequest.url };
    }

    if (change.commit) {
      return { value: change.commit.commitId.substring(0, 5), url: change.commit.remoteUrl };
    }
  };

  private applyClosedDateData = (change: any) => {
    if (change.build) {
      return {
        value:
          change.workItem.fields['Microsoft.VSTS.Common.ClosedDate'] || "This item hasn't been Closed yet",
      };
    }

    if (change.pullrequest) {
      return {
        value: change.pullrequest.closedDate,
      };
    }

    if (change.commit) {
      return {
        value: change.commit.author.date,
      };
    }
  };

  private applyCommitterData = (change: any) => {
    if (change.build) {
      return {
        value: change.workItem.fields['Microsoft.VSTS.Common.ClosedBy']
          ? change.workItem.fields['Microsoft.VSTS.Common.ClosedBy'].displayName
          : "This item hasn't been Closed yet",
      };
    }

    if (change.pullrequest) {
      return {
        value: change.pullrequest.createdBy.displayName,
      };
    }

    if (change.commit) {
      return {
        value: change.commit.committer.name,
      };
    }
  };

  async adoptSkinData() {
    console.log('adoptSkinData: Started adopting skin data');
    let i = 0;
    this.rawChangesArray.forEach((artifact) => {
      let artifactObject = {};
      if (artifact.artifact.name !== '') {
        let artifactTitle: any = [
          {
            fields: [{ name: 'Description', value: `Artifact name: ${artifact.artifact.name}` }],
          },
        ];
        artifactObject['artifact'] = artifactTitle;
      }

      let artifactChanges: any = [];
      if (artifact.changes?.length > 0) {
        artifact.changes?.forEach((change) => {
          let changeTableRow;
          if (change.workItem) {
            //TODO: add toggle for adding system description
            //TODO: add toggle for adding committed by
            const description: string = change.workItem.fields['System.Description'];
            changeTableRow = {
              fields: [
                { name: '#', value: i + 1, width: '3.8%' },
                change.targetRepo
                  ? {
                      name: 'Repository',
                      value: change.targetRepo.repoName,
                      url: change.targetRepo.url,
                      width: '9.8%',
                    }
                  : null,
                {
                  name: 'Change #',
                  ...this.applyChangeNumber(change),
                  width: '7.6%',
                },
                {
                  name: 'WI ID',
                  value: `${change.workItem.id}`,
                  url: change.workItem._links.html.href,
                  width: '6.8%',
                },
                {
                  name: 'WI Type',
                  value: `${change.workItem.fields['System.WorkItemType']}`,
                  width: '11.9%',
                },
                {
                  name: 'WI Title',
                  value: `${change.workItem.fields['System.Title']}`,
                },
                {
                  name: 'Change description',
                  condition: this.includeChangeDescription,
                  value: description ? this.htmlUtils.cleanHtml(description) : '',
                  width: '20.8%',
                },
                { name: 'Committed Date & Time', ...this.applyClosedDateData(change), width: '10%' },
                {
                  name: 'Committed by',
                  ...this.applyCommitterData(change),
                  width: '11.4%',
                  condition: this.includeCommittedBy,
                },
              ]
                .filter((field) => field !== null) // Remove null fields
                .filter((field) => field.condition === undefined || field.condition === true), // Filter by condition
            };
          } //if include Pull Requests is True
          else {
            changeTableRow = {
              fields: [
                { name: '#', value: i + 1, width: '7.6%' },
                {
                  name: 'Pull Request Title',
                  value: change.title,
                },
                {
                  name: 'Pull Request Description',
                  value: change.description,
                  condition: this.includeChangeDescription,
                },
                {
                  name: 'Creation date',
                  value: change.creationDate,
                  width: '10%',
                },
                { name: 'Created by', value: change.createdBy, condition: this.includeCommittedBy },
              ].filter((field) => field.condition === undefined || field.condition === true),
            };
          }
          artifactChanges.push(changeTableRow);
          i++;
        });
        artifactObject['artifactChanges'] = artifactChanges;
      } else {
        artifactObject['errorMessage'] = [
          {
            fields: [{ name: 'Title', value: 'No data found for the requested parameters' }],
          },
        ];
      }

      this.adoptedData.push(artifactObject);
    });

    console.log('adoptSkinData: Completed adopting skin data', this.adoptedData);
  }
}
