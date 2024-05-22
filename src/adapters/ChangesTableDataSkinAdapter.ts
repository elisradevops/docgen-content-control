import logger from "../services/logger";
import { writeFileSync } from "fs";

export default class ChangesTableDataSkinAdapter {
  rawChangesArray: any = [];
  adoptedData: any = [];

  constructor(rawChangesArray: any[]) {
    this.rawChangesArray = rawChangesArray;
    console.log('Constructor: Initialized ChangesTableDataSkinAdapter with rawChangesArray', rawChangesArray);
  }

  getAdoptedData() {
    console.log('getAdoptedData: Returning adopted data', this.adoptedData);
    return this.adoptedData;
  }

  async adoptSkinData() {
    console.log('adoptSkinData: Started adopting skin data');
    let i = 0;
    this.rawChangesArray.forEach((artifact) => {
      let artifactTitle: any = [
        {
          fields: [{ name: "Artifact name", value: artifact.artifact.name }],
        },
      ];
      let artifactChanges: any = [];
      artifact.changes.forEach((change) => {
        let changeTableRow;
        if (change.workItem) {
          changeTableRow = {
            fields: [
              { name: "#", value: i + 1 },
              {
                name: "Change #",
                value: "commit sha / pr id",
                url: null,
              },
              {
                name: "Related WI",
                value: `${change.workItem.fields["System.Title"]} - ${change.workItem.fields["System.WorkItemType"]} ${change.workItem.id}`,
                url: change.workItem._links.html.href,
              },
              {
                name: "Change description",
                value: change.workItem.fields["System.Description"],
              },
              { name: "Committed Date & Time", value: "date time" },
              { name: "Commited by", value: "commited by" },
            ],
          };
        } else //if include Pull Requests is True
        {
          changeTableRow = {
            fields: [
              { name: "#", value: i + 1 },
              {
                name: "Pull Request Title",
                value: change.title,
              },
              {
                name: "Pull Request Description",
                value: change.description,
              },
              { name: "Creation date", value: change.creationDate },
              { name: "Created by", value: change.createdBy },
            ],
          };
        }

        if (change.build) {
          changeTableRow.fields[1].value = change.build;
          changeTableRow.fields[1].url = change.workItem.url;
          changeTableRow.fields[4].value = change.workItem.fields["Microsoft.VSTS.Common.ClosedDate"] || "This item hasn't been Closed yet";
          changeTableRow.fields[5].value = change.workItem.fields["Microsoft.VSTS.Common.ClosedBy"] ? change.workItem.fields["Microsoft.VSTS.Common.ClosedBy"].displayName : "This item hasn't been Closed yet";
        }

        if (change.pullrequest) {
          changeTableRow.fields[1].value = change.pullrequest.description;
          changeTableRow.fields[1].url = change.pullrequest.url;
          changeTableRow.fields[4].value = change.pullrequest.closedDate;
          changeTableRow.fields[5].value = change.pullrequest.createdBy.displayName;
        }

        if (change.commit) {
          changeTableRow.fields[1].value = change.commit.commitId.substring(0, 5);
          changeTableRow.fields[1].url = change.commit.remoteUrl;
          changeTableRow.fields[4].value = change.commit.author.date;
          changeTableRow.fields[5].value = change.commit.committer.name;
        }

        artifactChanges.push(changeTableRow);
        i++;
      });

      this.adoptedData.push({
        artifact: artifactTitle,
        artifactChanges: artifactChanges,
      });
    });

    console.log('adoptSkinData: Completed adopting skin data', this.adoptedData);
  }
}
