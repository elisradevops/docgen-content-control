import logger from '../services/logger';
import HtmlUtils from '../services/htmlUtils';
import RichTextDataFactory from '../factories/RichTextDataFactory';
import { ArtifactChangesGroup, ChangeEntry } from '../models/changeModels';
import { buildReleaseRunChangeComparator } from '../services/adapterUtils';

export default class ChangesTableDataSkinAdapter {
  rawChangesArray: ArtifactChangesGroup[] = [];
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
  hasAnyLinkedItems: boolean = false; // Track if any change has linked items
  formattingSettings: any;

  /**
   * Creates an adapter that builds Changes table rows from aggregated artifact changes.
   * @param rawChangesArray Aggregated artifact groups to render
   * @param includeChangeDescription Whether to include change description column
   * @param includeCommittedBy Whether to include committer column
   * @param teamProject Azure DevOps project name
   * @param templatePath Path to rich-text template for descriptions
   * @param attachmentsBucketName MinIO bucket for attachments
   * @param minioEndPoint MinIO endpoint
   * @param minioAccessKey MinIO access key
   * @param minioSecretKey MinIO secret key
   * @param PAT Personal access token for fetching resources
   * @param formattingSettings Formatting toggles for trimming/spacing
   */
  constructor(
    rawChangesArray: ArtifactChangesGroup[],
    includeChangeDescription: boolean,
    includeCommittedBy: boolean,
    teamProject: string,
    templatePath: string,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string,
    formattingSettings: any
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
    this.formattingSettings = formattingSettings;
  }

  /**
   * Returns the last adopted data structure built by adoptSkinData().
   */
  getAdoptedData() {
    logger.debug('getAdoptedData: Returning adopted data');
    return this.adoptedData;
  }

  /**
   * Converts a UTC date string to 'en-IL' localized date-time in Asia/Jerusalem time zone.
   * @param utcDateString UTC date string to convert
   * @returns Localized date-time string
   */
  private convertDateToLocalTime(utcDateString: string): string {
    const date = new Date(utcDateString);
    return date.toLocaleString('en-IL', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  /**
   * Builds the value/url for the Change # cell based on the change type.
   */
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

  /**
   * Returns the appropriate date field for the Committed Date & Time column.
   */
  private applyClosedDateData = (change: any) => {
    if (change.build) {
      return {
        value:
          this.convertDateToLocalTime(change.workItem.fields['Microsoft.VSTS.Common.ClosedDate']) ||
          "This item hasn't been Closed yet",
      };
    }

    if (change.pullrequest) {
      return {
        value: this.convertDateToLocalTime(change.pullrequest.closedDate),
      };
    }

    if (change.commit) {
      return {
        value: this.convertDateToLocalTime(change.commit.author.date),
      };
    }
  };

  /**
   * Returns the appropriate identity field for the Committed by column.
   */
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

  /**
   * Builds the adopted JSON structure for the Changes table skin.
   * Sorts changes per artifact by Release Version, Release Run Date, and Change timestamp (desc).
   */
  async adoptSkinData() {
    logger.debug('adoptSkinData: Started adopting skin data');
    logger.info(`adoptSkinData: Processing ${this.rawChangesArray.length} artifacts`);

    this.adoptedData = [];
    let changeCounter = 0;

    // Check if any change has linked items first
    this.hasAnyLinkedItems = this.rawChangesArray.some(
      (rawChange) =>
        rawChange.changes &&
        rawChange.changes.some((change) => change.linkedItems && change.linkedItems.length > 0)
    );

    for (const artifactGroup of this.rawChangesArray) {
      const artifactName = artifactGroup.artifact?.name || 'N/A';
      const changesCount = artifactGroup.changes?.length || 0;
      const nonLinkedCount = artifactGroup.nonLinkedCommits?.length || 0;
      try {
        logger.debug(
          `adoptSkinData: Processing artifact "${artifactName}" (changes=${changesCount}, nonLinked=${nonLinkedCount})`
        );
        // If no changes exist for this artifact, push an error message and move on.
        if (!artifactGroup.changes || artifactGroup.changes.length === 0) {
          logger.warn(`No changes found for artifact: "${artifactName}"`);
          logger.warn(
            `  - rawChange.changes is ${
              artifactGroup.changes === undefined
                ? 'undefined'
                : artifactGroup.changes === null
                ? 'null'
                : 'empty array'
            }`
          );
          this.adoptedData.push(this.buildNoChangesError(artifactGroup.artifact.name));
          continue;
        }

        logger.debug(`adoptSkinData: Building rows for "${artifactName}"`);

        const artifactSection: any = {};

        // Include artifact title only if artifact name is not empty.
        if (artifactGroup.artifact.name !== '') {
          artifactSection.artifact = this.buildArtifactTitle(artifactGroup.artifact.name);
        }

        const artifactChanges: any[] = [];
        const sortedChanges: ChangeEntry[] = [...artifactGroup.changes].sort(
          buildReleaseRunChangeComparator<ChangeEntry>(
            (c) => c?.releaseVersion || '',
            (c) => c?.releaseRunDate,
            (c) =>
              c?.commit
                ? c.commit.committer?.date || c.commit.author?.date
                : c?.pullrequest
                ? c.pullrequest.closedDate || c.pullrequest.creationDate
                : c?.workItem
                ? c.workItem.fields?.['Microsoft.VSTS.Common.ClosedDate']
                : undefined
          )
        );
        for (const change of sortedChanges) {
          if (change.workItem) {
            // Changes that have a work item
            const workItemRows = await this.buildWorkItemChangeRow(change, changeCounter);
            if (Array.isArray(workItemRows)) {
              // Multiple rows due to linked items
              artifactChanges.push(...workItemRows);
            } else {
              // Single row
              artifactChanges.push(workItemRows);
            }
          } else {
            // Changes that are pull requests
            const pullRequestRow = this.buildPullRequestChangeRow(change, changeCounter);
            artifactChanges.push(pullRequestRow);
          }
          changeCounter++;
        }
        // non-linked commits are handled exclusively by NonAssociatedCommitsDataSkinAdapter
        logger.debug(`adoptSkinData: Built ${artifactChanges.length} rows for "${artifactName}"`);
        artifactSection.artifactChanges = artifactChanges;
        this.adoptedData.push(artifactSection);
      } catch (err) {
        logger.error(
          `adoptSkinData: Failed processing artifact "${artifactGroup.artifact?.name || 'N/A'}" - ${err}`
        );
        // Continue processing next artifacts without interruption
        continue;
      }
    }

    logger.info(`adoptSkinData: Completed. Total adopted artifacts: ${this.adoptedData.length}`);
    this.adoptedData.forEach((item, index) => {
      if (item.errorMessage) {
        logger.warn(`  Artifact #${index + 1}: ERROR - ${item.errorMessage[0]?.fields[0]?.value}`);
      } else {
        logger.debug(`  Artifact #${index + 1}: ${item.artifactChanges?.length || 0} changes`);
      }
    });
    logger.debug('adoptSkinData: Completed adopting skin data');
  }

  // Helper function to build the error object when no changes are found
  /**
   * Builds an error block when an artifact has no changes to display.
   */
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
  /**
   * Builds the artifact section header row.
   */
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
  /**
   * Builds one or more rows for a work item change (expands linked items to multiple rows).
   * @param change ChangeEntry with a work item
   * @param index Row index used for numbering
   */
  private async buildWorkItemChangeRow(change: any, index: number) {
    const description: string = change.workItem.fields['System.Description'];
    let hasLinkedItems = change.linkedItems && change.linkedItems.length > 0;
    let cleanedDescription = '';
    if (description) {
      cleanedDescription = await this.htmlUtils.cleanHtml(
        description,
        false,
        this.formattingSettings.trimAdditionalSpacingInDescriptions
      );
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

    // Create the base fields for the work item
    const baseFields = [
      { name: '#', value: index + 1, width: '3.8%' },
      change.targetRepo
        ? {
            name: 'Repository',
            value: `${change.targetRepo.gitSubModuleName || change.targetRepo.repoName}`,
            url: change.targetRepo.url,
            width: `${this.hasAnyLinkedItems ? '8.7%' : '9.8%'}`,
          }
        : null,
      {
        name: 'Change #',
        ...this.applyChangeNumber(change),
        width: '7.7%',
      },
      {
        name: 'WI ID',
        value: `${change.workItem.id}`,
        url: change.workItem._links.html.href,
        width: `${this.hasAnyLinkedItems ? '6.8%' : '8.3%'}`,
      },
      {
        name: 'WI Type',
        value: `${change.workItem.fields['System.WorkItemType']}`,
        width: `${this.hasAnyLinkedItems ? '9.7%' : '11.9%'}`,
      },
      {
        name: 'WI Title',
        value: `${change.workItem.fields['System.Title']}`,
      },
      {
        name: 'Change description',
        condition: this.includeChangeDescription && !this.hasAnyLinkedItems,
        value: descriptionRichText ?? '',
        width: '20.8%',
      },

      {
        name: 'Committed Date & Time',
        ...this.applyClosedDateData(change),
        width: `${this.hasAnyLinkedItems ? '9.7%' : '17.2%'}`,
      },
      {
        name: 'Committed by',
        ...this.applyCommitterData(change),
        width: '11.4%',
        condition: this.includeCommittedBy && !this.hasAnyLinkedItems,
      },
      change.releaseVersion && change.releaseRunDate
        ? {
            name: 'Release',
            value: change.releaseVersion || '',
            width: '9.0%',
          }
        : null,
      change.releaseVersion && change.releaseRunDate
        ? {
            name: 'Created',
            value: this.convertDateToLocalTime(change.releaseRunDate),
            width: `${this.hasAnyLinkedItems ? '9.0%' : '10.0%'}`,
          }
        : null,
    ].filter((field: any) => field !== null && (field.condition === undefined || field.condition === true));

    // Check if there are linked items
    const rows = [];
    if (hasLinkedItems) {
      // First linked item - add to the original row
      const firstLinkedItem = change.linkedItems[0];
      const linkedFields = this.buildLinkedItemFields(firstLinkedItem);

      // Add first linked item to the base row
      rows.push({ fields: [...baseFields, ...linkedFields] });

      // Create additional rows for each additional linked item
      for (let i = 1; i < change.linkedItems.length; i++) {
        const linkedItem = change.linkedItems[i];
        const linkedFields = this.buildLinkedItemFields(linkedItem);

        // Create empty fields for the base row data
        const emptyBaseFields = baseFields.map((field) => ({
          ...field,
          value: '',
          url: undefined,
        }));

        rows.push({ fields: [...emptyBaseFields, ...linkedFields] });
      }
    } else {
      // No linked items for this change, but we might need to add empty linked item fields
      if (this.hasAnyLinkedItems) {
        // Add empty linked item fields
        const emptyLinkedFields = this.buildLinkedItemFields({});
        rows.push({ fields: [...baseFields, ...emptyLinkedFields] });
      } else {
        // No linked items anywhere, just return the base row
        rows.push({ fields: baseFields });
      }
    }

    return rows.length === 1 ? rows[0] : rows;
  }
  /**
   * Builds the linked WI columns set used when linked items exist.
   */
  private buildLinkedItemFields(linkedItem: any) {
    return [
      {
        name: 'Linked WI ID',
        value: linkedItem.id || '',
        url: linkedItem.url,
        width: '6.8%',
      },
      {
        name: 'Linked WI Title',
        value: linkedItem.title || '',
      },
      {
        name: 'Linked WI Type',
        value: linkedItem.wiType || '',
        width: '9.7%',
      },
      {
        name: 'Relation Type',
        value: linkedItem.relationType || '',
        width: '8.5%',
      },
    ];
  }
  /**
   * Builds a single row for a pull request change.
   * @param change ChangeEntry with pull request info
   * @param index Row index used for numbering
   */
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
        value: this.convertDateToLocalTime(change.creationDate),
        width: '10%',
      },
      {
        name: 'Created by',
        value: change.createdBy,
        condition: this.includeCommittedBy,
      },
      {
        name: 'Release',
        value: change.releaseVersion || '',
        width: '10%',
      },
      {
        name: 'Created',
        value: change.releaseRunDate ? this.convertDateToLocalTime(change.releaseRunDate) : '',
        width: '12%',
      },
    ].filter((field) => field.condition === undefined || field.condition === true);

    return { fields };
  }
}
