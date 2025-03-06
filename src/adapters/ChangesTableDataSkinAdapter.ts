import logger from '../services/logger';
import HtmlUtils from '../services/htmlUtils';
import { writeFileSync } from 'fs';
import RichTextDataFactory from '../factories/RichTextDataFactory';

export default class ChangesTableDataSkinAdapter {
  rawChangesArray: any = [];
  adoptedData: any = [];
  includeChangeDescription: boolean = false;
  includeCommittedBy: boolean = false;
  htmlUtils: HtmlUtils;
  templatePath: string;
  teamProject: string;
  attachmentsBucketName: string;
  minioEndPoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  attachmentMinioData: any[];
  PAT: string;

  constructor(
    rawChangesArray: any[],
    includeChangeDescription: boolean,
    includeCommittedBy: boolean,
    teamProject: string,
    templatePath: string,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string
  ) {
    this.rawChangesArray = rawChangesArray;
    this.includeChangeDescription = includeChangeDescription;
    this.includeCommittedBy = includeCommittedBy;
    this.htmlUtils = new HtmlUtils();
    this.templatePath = templatePath;
    this.teamProject = teamProject;
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentMinioData = [];
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

    this.adoptedData = [];
    let changeCounter = 0;

    for (const rawChange of this.rawChangesArray) {
      // If no changes exist for this artifact, push an error message and move on.
      if (!rawChange.changes || rawChange.changes.length === 0) {
        this.adoptedData.push(this.buildNoChangesError(rawChange.artifact.name));
        continue;
      }

      const artifactObject: any = {};

      // Include artifact title only if artifact name is not empty.
      if (rawChange.artifact.name !== '') {
        artifactObject.artifact = this.buildArtifactTitle(rawChange.artifact.name);
      }

      const artifactChanges = [];
      for (const change of rawChange.changes) {
        let changeRow;
        if (change.workItem) {
          // Changes that have a work item
          changeRow = await this.buildWorkItemChangeRow(change, changeCounter);
        } else {
          // Changes that are pull requests
          changeRow = this.buildPullRequestChangeRow(change, changeCounter);
        }

        artifactChanges.push(changeRow);
        changeCounter++;
      }

      artifactObject.artifactChanges = artifactChanges;
      this.adoptedData.push(artifactObject);
    }

    console.log('adoptSkinData: Completed adopting skin data', this.adoptedData);
  }

  // Helper function to build the error object when no changes are found
  private buildNoChangesError(artifactName: string) {
    return {
      errorMessage: [
        {
          fields: [
            {
              name: 'Title',
              value: `No changes found for the requested artifact ${artifactName}`,
            },
          ],
        },
      ],
    };
  }

  // Helper function to build the artifact title object
  private buildArtifactTitle(artifactName: string) {
    return [
      {
        fields: [
          {
            name: 'Description',
            value: `Artifact name: ${artifactName}`,
          },
        ],
      },
    ];
  }

  // Helper function to build a work item change row
  private async buildWorkItemChangeRow(change: any, index: number) {
    const description: string = change.workItem.fields['System.Description'];
    let cleanedDescription = '';
    if (description) {
      cleanedDescription = await this.htmlUtils.cleanHtml(description);
    }
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

    const fields = [
      { name: '#', value: index + 1, width: '3.8%' },
      change.targetRepo
        ? {
            name: 'Repository',
            value: `${change.targetRepo.gitSubModuleName || change.targetRepo.repoName}`,
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
        width: '8.3%',
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
        value: descriptionRichText ?? '',
        width: '20.8%',
      },
      { name: 'Committed Date & Time', ...this.applyClosedDateData(change), width: '10%' },
      {
        name: 'Committed by',
        ...this.applyCommitterData(change),
        width: '11.4%',
        condition: this.includeCommittedBy,
      },
    ].filter((field: any) => field !== null && (field.condition === undefined || field.condition === true));

    return { fields };
  }

  // Helper function to build a pull request change row
  private buildPullRequestChangeRow(change: any, index: number) {
    const fields = [
      { name: '#', value: index + 1, width: '7.6%' },
      { name: 'Pull Request Title', value: change.title },
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
      {
        name: 'Created by',
        value: change.createdBy,
        condition: this.includeCommittedBy,
      },
    ].filter((field) => field.condition === undefined || field.condition === true);

    return { fields };
  }
}
