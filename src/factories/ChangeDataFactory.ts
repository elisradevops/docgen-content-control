import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';
import GitDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/GitDataProvider';
import PipelinesDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/PipelinesDataProvider';
import { Artifact, GitObject } from '../models/contentControl';
import {
  ArtifactChangesGroup,
  RepoTagInfo,
  TagCommitMeta,
  ServiceBucket,
  PairCompareCacheEntry,
  ServiceReleaseInfo,
  ReleaseSuffixInfo,
  ServiceGroupingEntry,
} from '../models/changeModels';
import ReleaseComponentDataSkinAdapter from '../adapters/ReleaseComponentsDataSkinAdapter';
import SystemOverviewDataSkinAdapter from '../adapters/SystemOverviewDataSkinAdapter';
import BugsTableSkinAdapter from '../adapters/BugsTableSkinAdpater';
import NonAssociatedCommitsDataSkinAdapter from '../adapters/NonAssociatedCommitsDataSkinAdapter';

export default class ChangeDataFactory {
  //#region properties
  dgDataProviderAzureDevOps: DgDataProviderAzureDevOps;
  teamProject: string;
  templatePath: string;
  repoId: string;
  from: any;
  to: any;
  rangeType: string;
  linkTypeFilterArray: string[];
  contentControlTitle: string;
  headingLevel?: number;
  rawChangesArray: ArtifactChangesGroup[] = [];
  linkedWiItems: any[] = [];
  adoptedChangeData: any[] = [];
  branchName: string;
  includePullRequests: boolean;
  includePullRequestWorkItems: boolean;
  attachmentWikiUrl: string = '';
  includeChangeDescription: boolean;
  includeCommittedBy: boolean;
  tocTitle?: string;
  queriesRequest: any;
  includedWorkItemByIdSet: Set<number>;
  linkedWiOptions: any;
  requestedByBuild: boolean;
  private includedCommitIdsByArtifact: Map<string, Set<string>> = new Map();
  private attachmentMinioData: any[]; //attachment data
  private attachmentsBucketName: string;
  private minioEndPoint: string;
  private minioAccessKey: string;
  private minioSecretKey: string;
  private PAT: string;
  private includeUnlinkedCommits: boolean;
  private formattingSettings: any;
  private workItemFilterOptions: any;
  private pathExistenceCache: Map<string, boolean> = new Map();
  private branchExistenceCache: Map<string, boolean> = new Map();
  private jfrogCiUrlCache: Map<string, string> = new Map();
  private pairCompareCache: Map<string, PairCompareCacheEntry> = new Map();
  private compareMode: 'consecutive' | 'allPairs';
  private serviceGroupsByKey: Map<string, ArtifactChangesGroup> = new Map();
  private serviceReleaseByCommitId: Map<string, ServiceReleaseInfo> = new Map();
  private releasesBySuffix: Map<string, ReleaseSuffixInfo> = new Map();
  private releasesSeq: any[] = [];
  private releaseIndexByName: Map<string, number> = new Map();
  private replaceTaskWithParent: boolean = false;
  //#endregion properties

  //#region constructor
  constructor(
    teamProjectName,
    repoId: string,
    from: string | number,
    to: string | number,
    rangeType: string,
    linkTypeFilterArray: string[],
    branchName: string,
    includePullRequests: boolean,
    includePullRequestWorkItems: boolean,
    attachmentWikiUrl: string,
    includeChangeDescription: boolean,
    includeCommittedBy: boolean,
    dgDataProvider: any,
    attachmentsBucketName: string,
    minioEndPoint: string,
    minioAccessKey: string,
    minioSecretKey: string,
    PAT: string,
    tocTitle?: string,
    queriesRequest: any = undefined,
    includedWorkItemByIdSet: Set<number> = undefined,
    linkedWiOptions: any = undefined,
    requestedByBuild: boolean = false,
    includeUnlinkedCommits: boolean = false,
    formattingSettings: any = {},
    workItemFilterOptions: any = undefined,
    compareMode: 'consecutive' | 'allPairs' = 'consecutive',
    replaceTaskWithParent: boolean = false
  ) {
    this.dgDataProviderAzureDevOps = dgDataProvider;
    this.teamProject = teamProjectName;
    this.from = from;
    this.to = to;
    this.repoId = repoId;
    this.rangeType = rangeType;
    this.linkTypeFilterArray = linkTypeFilterArray;
    this.branchName = branchName;
    this.includePullRequests = includePullRequests;
    this.includePullRequestWorkItems = includePullRequestWorkItems;
    this.attachmentWikiUrl = attachmentWikiUrl;
    this.includeChangeDescription = includeChangeDescription;
    this.includeCommittedBy = includeCommittedBy;
    this.tocTitle = tocTitle;
    this.queriesRequest = queriesRequest;
    this.includedWorkItemByIdSet = includedWorkItemByIdSet ?? new Set();
    this.includedCommitIdsByArtifact = new Map<string, Set<string>>();
    this.attachmentsBucketName = attachmentsBucketName;
    this.minioEndPoint = minioEndPoint;
    this.minioAccessKey = minioAccessKey;
    this.minioSecretKey = minioSecretKey;
    this.PAT = PAT;
    this.attachmentMinioData = [];
    this.linkedWiOptions = linkedWiOptions;
    this.requestedByBuild = requestedByBuild;
    this.includeUnlinkedCommits = includeUnlinkedCommits;
    this.formattingSettings = formattingSettings;
    this.workItemFilterOptions = workItemFilterOptions;
    this.pathExistenceCache = new Map();
    this.branchExistenceCache = new Map();
    this.jfrogCiUrlCache = new Map();
    this.pairCompareCache = new Map();
    this.compareMode = compareMode || 'consecutive';
    this.replaceTaskWithParent = !!replaceTaskWithParent;
  } //constructor
  // #endregion constructor

  // #region public methods

  /**
   * High-level orchestrator for building SVD (System Version Description) content.
   *
   * Workflow:
   * 1. Fetch recent release artifacts and add release range / release components sections.
   * 2. Fetch system overview / known bugs query results and adapt them into skins.
   * 3. Fetch core change data (commits, PRs, builds, JFrog artifacts) into `rawChangesArray`.
   * 4. Adapt the raw changes into the main changes table, installation instructions, bugs table,
   *    and non-associated commits appendix, populating `adoptedChangeData`.
   */
  public async fetchSvdData() {
    try {
      if (this.serviceGroupsByKey === undefined) {
        this.serviceGroupsByKey = new Map<string, ArtifactChangesGroup>();
      }

      const svdId = Math.random().toString(36).slice(2, 8);
      const svdStart = Date.now();
      logger.info(
        `[SVD ${svdId}] start teamProject=${this.teamProject}, rangeType=${this.rangeType}, from=${this.from}, to=${this.to}, compareMode=${this.compareMode}, includeUnlinkedCommits=${this.includeUnlinkedCommits}`
      );
      // 1) Get release component adoptedData for release-components content control
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();
      let recentReleaseArtifactInfo = await pipelinesDataProvider.GetRecentReleaseArtifactInfo(
        this.teamProject
      );
      const releaseComponentsCount = recentReleaseArtifactInfo?.length || 0;
      logger.info(
        `[SVD ${svdId}] release-components: items=${releaseComponentsCount}${
          releaseComponentsCount > 0 ? '' : ' (skipped)'
        }`
      );
      const releaseRangeData = await this.jsonSkinDataAdapter('release-range', {
        pipelinesDataProvider,
      });
      if (releaseRangeData && releaseRangeData.length > 0) {
        this.adoptedChangeData.push({
          contentControl: 'release-range-content-control',
          data: releaseRangeData,
          skin: 'release-range-skin',
        });
      }
      if (releaseComponentsCount > 0) {
        this.adoptedChangeData.push({
          contentControl: 'release-components-content-control',
          data: await this.jsonSkinDataAdapter('release-components', recentReleaseArtifactInfo),
          skin: 'release-components-skin',
        });
      }

      // 2) Fetch System Overview data (by WIQL) for system-overview content control
      const queryResultData = await this.fetchQueryResults();
      const sysOverviewCount = queryResultData.systemOverviewQueryData?.length || 0;
      logger.info(
        `[SVD ${svdId}] system-overview: items=${sysOverviewCount}${sysOverviewCount > 0 ? '' : ' (skipped)'}`
      );
      if (sysOverviewCount > 0) {
        this.adoptedChangeData.push({
          contentControl: 'system-overview-content-control',
          data: await this.jsonSkinDataAdapter('system-overview', queryResultData),
          skin: 'system-overview-skin',
        });
      }

      // 3) Gather change data for the selected range (core of SVD)
      await this.fetchChangesData();
      this.serviceGroupsByKey.clear();
      this.includedWorkItemByIdSet.clear();
      const artifactsCount = this.rawChangesArray.length;
      const linkedTotal = this.rawChangesArray.reduce(
        (acc: number, a: any) => acc + (a.changes?.length || 0),
        0
      );
      const unlinkedTotal = this.rawChangesArray.reduce(
        (acc: number, a: any) => acc + (a.nonLinkedCommits?.length || 0),
        0
      );
      logger.info(
        `[SVD ${svdId}] changes fetched: artifacts=${artifactsCount}, linked=${linkedTotal}, unlinked=${unlinkedTotal}`
      );
      if (this.rawChangesArray.length > 0) {
        this.adoptedChangeData.push({
          contentControl: 'required-states-and-modes',
          data: await this.jsonSkinDataAdapter('changes', this.rawChangesArray),
          skin: 'required-states-and-modes-skin',
        });
      } else {
        logger.warn(`fetchSvdData: rawChangesArray is empty, skipping changes adaptation`);
      }
      // 4) Installation instructions (optional attachment)
      if (this.attachmentWikiUrl) {
        logger.info(`[SVD ${svdId}] installation-instructions: included`);
        this.adoptedChangeData.push({
          contentControl: 'system-installation-content-control',
          data: await this.jsonSkinDataAdapter('installation-instructions', []), //TBD need to add a check box to either include new file or not
          skin: 'installation-instructions-skin',
        });
      }
      // 5) Possible problems / known errors
      if (queryResultData.knownBugsQueryData) {
        const bugsCount = Array.isArray(queryResultData.knownBugsQueryData)
          ? queryResultData.knownBugsQueryData.length
          : 0;
        logger.info(`[SVD ${svdId}] known-bugs: items=${bugsCount}${bugsCount > 0 ? '' : ' (skipped)'}`);
        this.adoptedChangeData.push({
          contentControl: 'possible-problems-known-errors-content-control',
          data: await this.jsonSkinDataAdapter(
            'possible-problems-known-errors',
            queryResultData.knownBugsQueryData
          ),
          skin: 'possible-problems-known-errors-skin',
        });
      }

      // 6) Non-associated commits (appendix)
      if (this.rawChangesArray.length > 0) {
        const adoptedData = await this.jsonSkinDataAdapter('non-associated-commits', this.rawChangesArray);
        if (adoptedData.length > 0) {
          logger.info(`[SVD ${svdId}] non-associated-commits: groups=${adoptedData.length}`);
          this.adoptedChangeData.push({
            contentControl: 'non-associated-commits-content-control',
            data: adoptedData,
            skin: 'non-associated-commits-skin',
          });
        }
      }
      logger.info(
        `[SVD ${svdId}] done in ${Date.now() - svdStart}ms, contentControls=${this.adoptedChangeData.length}`
      );
    } catch (error: any) {
      logger.error(`could not fetch svd data:
        ${error.message}`);
      throw error;
    } finally {
      // Clear long-lived maps/sets to avoid leaking state between SVD runs
      try {
        if (this.serviceGroupsByKey) {
          this.serviceGroupsByKey.clear();
        }
        this.serviceReleaseByCommitId.clear();
        this.releasesBySuffix.clear();
        this.pathExistenceCache.clear();
        this.branchExistenceCache.clear();
        this.jfrogCiUrlCache.clear();
        this.pairCompareCache.clear();
        this.includedWorkItemByIdSet.clear();
      } catch (cleanupErr: any) {
        logger.debug(`fetchSvdData cleanup failed: ${cleanupErr?.message}`);
      }
    }
  }

  /**
   * Fetch query results used by SVD (System Overview, Known Bugs).
   * Returns an object with optional properties: systemOverviewQueryData, systemOverviewLinksDebug, knownBugsQueryData.
   */
  public async fetchQueryResults(): Promise<any> {
    try {
      const ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      let queryResults = {};
      if (this.queriesRequest.sysOverviewQuery) {
        logger.debug('starting to fetch system overview query results');

        logger.debug('fetching results');
        let systemOverviewQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.sysOverviewQuery.wiql.href,
          false,
          null
        );
        logger.debug(`system overview are ${systemOverviewQueryData ? 'ready' : 'not found'}`);
        // Pass roots array when present; also expose workItemRelations for link-driven rendering
        queryResults['systemOverviewQueryData'] = systemOverviewQueryData?.roots ?? systemOverviewQueryData;
        if (systemOverviewQueryData?.workItemRelations) {
          queryResults['systemOverviewLinksDebug'] = {
            workItemRelations: systemOverviewQueryData.workItemRelations,
          };
        }
      }

      if (this.queriesRequest.knownBugsQuery) {
        logger.debug('starting to fetch known bugs query results');

        logger.debug('fetching results');
        let knownBugsQueryData: any = await ticketsDataProvider.GetQueryResultsFromWiql(
          this.queriesRequest.knownBugsQuery.wiql.href,
          true,
          null
        );
        logger.debug(`known bugs query results are ${knownBugsQueryData ? 'ready' : 'not found'}`);
        queryResults['knownBugsQueryData'] = knownBugsQueryData;
      }
      return queryResults;
    } catch (err) {
      logger.error(`Could not fetch query results: ${err.message}`);
    }
    return [];
  }

  /*arranging the test data for json skins package*/
  public async jsonSkinDataAdapter(adapterType: string, rawData: any, allowBiggerThan500: boolean = false) {
    logger.info(`adapting ${adapterType} data`);
    let adoptedData = undefined;
    try {
      switch (adapterType) {
        case 'release-range':
          {
            let fromReleaseName = '';
            let toReleaseName = '';

            if (this.rangeType === 'release') {
              try {
                const pipelinesDataProvider =
                  rawData?.pipelinesDataProvider ||
                  (await this.dgDataProviderAzureDevOps.getPipelinesDataProvider());
                const fromRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
                  this.teamProject,
                  Number(this.from)
                );
                const toRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
                  this.teamProject,
                  Number(this.to)
                );
                fromReleaseName = fromRelease?.name || '';
                toReleaseName = toRelease?.name || '';
              } catch (e: any) {
                logger.warn(
                  `jsonSkinDataAdapter: 'release-range' failed to resolve release names: ${e.message}`
                );
              }
            }

            // For release-based ranges, show the Version range text.
            if (this.rangeType === 'release' && (fromReleaseName || toReleaseName)) {
              const value = `Version\nv${fromReleaseName} to v${toReleaseName}`;
              adoptedData = [
                {
                  // Use an empty name so this field is treated as a regular paragraph
                  // (JSONParagraph) rather than a rich-text Description field.
                  // This prevents it from being filtered out and lets the
                  // Version range text render as normal runs.
                  name: '',
                  value,
                },
              ];
            } else {
              // For non-release range types (or if names could not be resolved),
              // emit a single empty field so the content control is still
              // processed and effectively removed from the document.
              adoptedData = [
                {
                  name: '',
                  value: '',
                },
              ];
            }
          }
          break;
        case 'release-components':
          const releaseComponentDataRawAdapter = new ReleaseComponentDataSkinAdapter();
          adoptedData = releaseComponentDataRawAdapter.jsonSkinAdapter(rawData);
          break;
        case 'system-overview':
          logger.info('adapting system overview data');
          const systemOverviewDataAdapter = new SystemOverviewDataSkinAdapter(
            this.teamProject,
            this.templatePath,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT,
            this.formattingSettings,
            allowBiggerThan500
          );
          adoptedData = await systemOverviewDataAdapter.jsonSkinAdapter(rawData);
          logger.debug(
            `attachment data ${JSON.stringify(systemOverviewDataAdapter.getAttachmentMinioData())}`
          );
          this.attachmentMinioData.push(...systemOverviewDataAdapter.getAttachmentMinioData());
          break;
        case 'changes':
          const artifactsCount = this.rawChangesArray.length;
          const totalChangesBefore = this.rawChangesArray.reduce(
            (acc: number, item: any) => acc + (item.changes?.length || 0),
            0
          );
          const sampleNames = this.rawChangesArray
            .slice(0, 10)
            .map((i: any) => `${i.artifact?.name || 'N/A'}(${i.changes?.length || 0})`)
            .join(', ');
          logger.info(
            `jsonSkinDataAdapter: 'changes' input summary: artifacts=${artifactsCount}, totalChanges=${totalChangesBefore}`
          );
          if (artifactsCount <= 50) {
            logger.debug(
              `jsonSkinDataAdapter: 'changes' sample: ${sampleNames}${artifactsCount > 10 ? ', ...' : ''}`
            );
          }

          let affectedArtifacts = 0;
          let removedChangesTotal = 0;
          let dedupeAffectedArtifacts = 0;
          let dedupeRemovedTotal = 0;
          // Optionally replace Task with parent Requirement (1 level) before filtering
          const baseArray = this.replaceTaskWithParent
            ? await this.applyTaskParentReplacement(this.rawChangesArray)
            : this.rawChangesArray;

          const filteredChangesArray = baseArray.map((item: any) => {
            const originalCount = item?.changes?.length || 0;
            const filteredChanges = this.filterChangesByWorkItemOptions(item?.changes || []);
            const filteredCount = filteredChanges.length;
            if (originalCount !== filteredCount) {
              affectedArtifacts++;
              removedChangesTotal += originalCount - filteredCount;
            }
            const dedupedChanges = this.dedupeChangesByWorkItemLatest(filteredChanges);
            const dedupedCount = dedupedChanges.length;
            if (filteredCount !== dedupedCount) {
              dedupeAffectedArtifacts++;
              dedupeRemovedTotal += filteredCount - dedupedCount;
            }
            return {
              ...item,
              changes: dedupedChanges,
            };
          });

          const { groups: globallyDedupedChangesArray, removedChanges: crossArtifactDedupeRemoved } =
            this.dedupeChangesAcrossArtifactsFirstOccurrence(filteredChangesArray);

          const totalChangesAfter = globallyDedupedChangesArray.reduce(
            (acc: number, i: any) => acc + (i.changes?.length || 0),
            0
          );
          logger.info(
            `jsonSkinDataAdapter: 'changes' after filter/dedupe: artifacts=${globallyDedupedChangesArray.length}, totalChanges=${totalChangesAfter}, filterAffected=${affectedArtifacts}, filterRemoved=${removedChangesTotal}, dedupeAffected=${dedupeAffectedArtifacts}, dedupeRemoved=${dedupeRemovedTotal}, crossArtifactDedupeRemoved=${crossArtifactDedupeRemoved}`
          );
          // Exclude artifacts that have zero linked changes from the 'changes' table display
          const displayChangesArray = globallyDedupedChangesArray.filter(
            (a: any) => (a.changes?.length || 0) > 0
          );
          logger.info(
            `jsonSkinDataAdapter: Displaying ${displayChangesArray.length} artifacts with non-empty changes`
          );
          let changesTableDataSkinAdapter = new ChangesTableDataSkinAdapter(
            displayChangesArray,
            this.includeChangeDescription,
            this.includeCommittedBy,
            this.teamProject,
            this.templatePath,
            this.attachmentsBucketName,
            this.minioEndPoint,
            this.minioAccessKey,
            this.minioSecretKey,
            this.PAT,
            this.formattingSettings
          );
          await changesTableDataSkinAdapter.adoptSkinData();
          this.attachmentMinioData.push(...changesTableDataSkinAdapter.attachmentMinioData);
          adoptedData = changesTableDataSkinAdapter.getAdoptedData();
          break;
        case 'non-associated-commits':
          let notAssociatedCommits = this.rawChangesArray.filter(
            (change) => change.nonLinkedCommits?.length > 0
          );
          let nonAssociatedCommitsSkinAdapter = new NonAssociatedCommitsDataSkinAdapter(
            notAssociatedCommits,
            this.includeCommittedBy
          );
          await nonAssociatedCommitsSkinAdapter.adoptSkinData();
          adoptedData = nonAssociatedCommitsSkinAdapter.getAdoptedData();
          break;
        case 'installation-instructions':
          try {
            logger.debug(`Processing installation instructions from ${this.attachmentWikiUrl}`);

            if (!this.attachmentWikiUrl) {
              logger.warn('No attachment wiki URL provided for installation instructions');
              break;
            }
            logger.debug(`Attachment wiki URL: ${this.attachmentWikiUrl}`);
            // Extract file name from URL
            const encodedFileName = this.attachmentWikiUrl.substring(
              this.attachmentWikiUrl.lastIndexOf('/') + 1,
              this.attachmentWikiUrl.length
            );
            const fileName = decodeURIComponent(encodedFileName);
            logger.debug(`File name extracted: ${fileName}`);

            // Add to attachment tracking
            this.attachmentMinioData.push({
              attachmentMinioPath: this.attachmentWikiUrl,
              minioFileName: fileName,
            });

            // Format data for the skin adapter
            const localPath = `TempFiles/${fileName}`;

            adoptedData = [
              {
                title: 'Installation Instructions',
                attachment: {
                  attachmentFileName: fileName,
                  attachmentLink: localPath,
                  relativeAttachmentLink: localPath,
                  attachmentMinioPath: this.attachmentWikiUrl,
                  minioFileName: fileName,
                },
              },
            ];

            logger.debug(`Installation instructions processed successfully`);
          } catch (error) {
            logger.error(`Error processing installation instructions: ${error.message}`);
            logger.error(error.stack);
          }
          break;
        case 'possible-problems-known-errors':
          let bugsDataSkinAdapter = new BugsTableSkinAdapter(rawData);
          bugsDataSkinAdapter.adoptSkinData();
          adoptedData = bugsDataSkinAdapter.getAdoptedData();
          break;
        default:
          break;
      }
    } catch (err: any) {
      logger.error(`Failed adapting data for type ${adapterType}: ${err.message}`);
      throw err;
    }
    return adoptedData;
  } //jsonSkinDataAdpater

  public getRawData() {
    return this.rawChangesArray;
  } //getRawData

  public getAdoptedData() {
    return this.adoptedChangeData;
  } //getAdoptedData

  public getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }

  //#endregion public methods

  //#region private methods
  /**
   * Fetches changes for a specific commit range (by SHA) and pushes the result into `rawChangesArray`.
   *
   * @param gitDataProvider Git data provider instance used to query commits and linked work items.
   * @param focusedArtifact Artifact metadata describing the target (used as the group key in `rawChangesArray`).
   */
  private async fetchCommitShaChanges(gitDataProvider: GitDataProvider, focusedArtifact: any): Promise<void> {
    let commitsInCommitRange = await gitDataProvider.GetCommitsInCommitRange(
      this.teamProject,
      this.repoId,
      String(this.to),
      String(this.from)
    );
    const { commitChangesArray, commitsWithNoRelations } = await gitDataProvider.GetItemsInCommitRange(
      this.teamProject,
      this.repoId,
      commitsInCommitRange,
      this.linkedWiOptions,
      this.includeUnlinkedCommits,
      this.includePullRequestWorkItems
    );

    this.isChangesReachedMaxSize(this.rangeType, commitChangesArray?.length);
    this.rawChangesArray.push({
      artifact: focusedArtifact,
      changes: commitChangesArray,
      nonLinkedCommits: commitsWithNoRelations,
    });
  }

  /**
   * Fetches changes within a date range from Git and augments them with submodule changes when applicable.
   *
   * The method normalizes `from`/`to` to cover whole minutes, queries commits in the date range, and then builds
   * artifact-level change groups with both linked and non-linked commits.
   *
   * @param gitDataProvider Git data provider instance used to query commits and linked work items.
   */
  private async fetchDateChanges(gitDataProvider: GitDataProvider): Promise<void> {
    let artifactChanges: any[] = [];
    let artifactChangesNoLink: any[] = [];
    // Adjust 'from' to the start of the day
    const fromDate = new Date(this.from);
    fromDate.setSeconds(0); // set to the start of the minute
    this.from = fromDate.toISOString();

    // Adjust 'to' to the end of the day
    const toDate = new Date(this.to);
    toDate.setSeconds(59);
    this.to = toDate.toISOString();

    let commitsInDateRange = await gitDataProvider.GetCommitsInDateRange(
      this.teamProject,
      this.repoId,
      String(this.from),
      String(this.to),
      this.branchName
    );
    let repo = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
    if (!repo) {
      throw new Error(`Could not find repository with id ${this.repoId}`);
    }
    if (this.includePullRequests) {
      artifactChanges = await gitDataProvider.GetPullRequestsInCommitRangeWithoutLinkedItems(
        this.teamProject,
        this.repoId,
        commitsInDateRange
      );
    } else {
      const { commitChangesArray, commitsWithNoRelations } = await gitDataProvider.GetItemsInCommitRange(
        this.teamProject,
        this.repoId,
        commitsInDateRange,
        this.linkedWiOptions,
        this.includeUnlinkedCommits,
        this.includePullRequestWorkItems
      );
      artifactChanges = [...commitChangesArray];
      artifactChangesNoLink = [...commitsWithNoRelations];

      let repoName = repo.name;

      if (commitsInDateRange.count > 0) {
        const { value: commits } = commitsInDateRange;
        let firstCommitObject = commits[commits.length - 1]; // last commit is the oldest
        let lastCommitObject = commits[0]; // first commit is the latest
        let fromCommit = firstCommitObject.commitId;
        let toCommit = lastCommitObject.commitId;
        const { commitsWithRelatedWi, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
          await this.parseSubModules(
            gitDataProvider,
            this.teamProject,
            repoName,
            toCommit,
            fromCommit,
            'commit',
            'commit',
            commits,
            this.includedWorkItemByIdSet
          );

        //add targetRepo property for each item
        if (artifactChanges.length > 0 && commitsWithRelatedWi.length > 0) {
          for (const item of artifactChanges) {
            item.targetRepo = {
              repoName: repoName,
              gitSubModuleName: item.gitSubModuleName || '',
              url: repo.url,
              projectId: repo.project.id,
            };
          }
          artifactChanges.push(...commitsWithRelatedWi);
          artifactChangesNoLink.push(...commitsWithNoRelationsSubmodule);
        }
      }
    }

    this.isChangesReachedMaxSize(this.rangeType, artifactChanges?.length);
    this.rawChangesArray.push({
      artifact: { name: '' },
      changes: artifactChanges,
      nonLinkedCommits: artifactChangesNoLink,
    });
  }

  /**
   * Fetches changes between two Git objects (branches/tags/commits) and stores them in `rawChangesArray`.
   *
   * The method normalizes Git refs, resolves the repository, computes the commit range (including submodules),
   * and pushes a grouped artifact with linked and non-linked commits.
   *
   * @param gitDataProvider Git data provider instance used to query commits and linked work items.
   * @param focusedArtifact Artifact metadata describing the target (used as the group key in `rawChangesArray`).
   */
  private async fetchRangeChanges(gitDataProvider: GitDataProvider, focusedArtifact: any): Promise<void> {
    let artifactChanges: any[] = [];
    let artifactChangesNoLink: any[] = [];
    const fromGitObject: GitObject = this.from;
    const toGitObject: GitObject = this.to;
    // Check if fromGitObject and toGitObject are valid GitObjects
    if (fromGitObject.ref) {
      fromGitObject.ref = fromGitObject.ref.split('/').pop();
    }
    if (toGitObject.ref) {
      toGitObject.ref = toGitObject.ref.split('/').pop();
    }
    let gitRepo = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
    const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
      gitDataProvider,
      this.teamProject,
      fromGitObject.ref,
      fromGitObject.type,
      toGitObject.ref,
      toGitObject.type,
      gitRepo.name,
      gitRepo.url,
      this.includedWorkItemByIdSet,
      undefined,
      undefined,
      this.linkedWiOptions
    );
    artifactChanges.push(...allExtendedCommits);
    artifactChangesNoLink.push(...commitsWithNoRelations);
    this.isChangesReachedMaxSize(this.rangeType, artifactChanges?.length);
    this.rawChangesArray.push({
      artifact: focusedArtifact,
      changes: artifactChanges,
      nonLinkedCommits: artifactChangesNoLink,
    });
  }

  /**
   * Fetches changes associated with a pipeline run range and appends a grouped artifact entry to `rawChangesArray`.
   *
   * This uses the pipelines data provider to resolve the pipeline context and `GetPipelineChanges` to
   * retrieve both linked and non-linked commits.
   *
   * @param pipelinesDataProvider Pipelines data provider instance for release/pipeline metadata.
   * @param gitDataProvider Git data provider instance for commit-level information.
   */
  private async fetchPipelineChanges(
    pipelinesDataProvider: PipelinesDataProvider,
    gitDataProvider: GitDataProvider
  ): Promise<void> {
    const { artifactChanges, artifactChangesNoLink } = await this.GetPipelineChanges(
      pipelinesDataProvider,
      gitDataProvider,
      this.teamProject,
      this.to,
      this.from
    );

    this.isChangesReachedMaxSize(this.rangeType, artifactChanges?.length);

    logger.info(
      `Pipeline case: Pushing artifact with ${artifactChanges.length} changes, ${artifactChangesNoLink.length} unlinked`
    );

    this.rawChangesArray.push({
      artifact: { name: this.tocTitle || '' },
      changes: [...artifactChanges],
      nonLinkedCommits: [...artifactChangesNoLink],
    });

    logger.debug(
      `After push, rawChangesArray[${this.rawChangesArray.length - 1}].changes.length = ${
        this.rawChangesArray[this.rawChangesArray.length - 1].changes.length
      }`
    );
  }

  /**
   * Resolves the ordered list of releases between two release IDs for a given definition.
   *
   * If full history is available, this returns all releases from `fromId` to `toId` (inclusive), sorted by time.
   * If not, it falls back to using only the provided `fromRelease` and `toRelease`.
   *
   * @param pipelinesDataProvider Pipelines data provider used to query release history.
   * @param fromId                ID of the starting release.
   * @param toId                  ID of the ending release.
   * @param releaseDefinitionId   Release definition identifier (may be undefined).
   * @param fromRelease           Fallback release object for the `from` side.
   * @param toRelease             Fallback release object for the `to` side.
   */
  private async getReleasesBetween(
    pipelinesDataProvider: PipelinesDataProvider,
    fromId: number,
    toId: number,
    releaseDefinitionId: any,
    fromRelease: any,
    toRelease: any
  ): Promise<any[]> {
    let releasesBetween: any[] = [];
    if (releaseDefinitionId) {
      try {
        const history =
          typeof (pipelinesDataProvider as any).GetAllReleaseHistory === 'function'
            ? await (pipelinesDataProvider as any).GetAllReleaseHistory(
                this.teamProject,
                String(releaseDefinitionId)
              )
            : await pipelinesDataProvider.GetReleaseHistory(this.teamProject, String(releaseDefinitionId));
        const list: any[] = ((history as any)?.value ?? []).sort((a: any, b: any) => {
          const ad = new Date(a.createdOn || a.createdDate || a.created || 0).getTime();
          const bd = new Date(b.createdOn || b.createdDate || b.created || 0).getTime();
          return ad - bd;
        });
        const fromIdx = list.findIndex((r: any) => Number(r.id) === fromId);
        const toIdx = list.findIndex((r: any) => Number(r.id) === toId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const start = Math.min(fromIdx, toIdx);
          const end = Math.max(fromIdx, toIdx);
          releasesBetween = list.slice(start, end + 1);
        } else {
          logger.warn(
            `Could not locate both from (${fromId}) and to (${toId}) in release history; falling back to direct compare`
          );
        }
      } catch (e: any) {
        logger.warn(`GetReleaseHistory failed: ${e.message}. Will compare only provided from/to releases.`);
      }
    }

    // Fallback if history is unavailable or empty
    if (releasesBetween.length === 0) {
      releasesBetween = [fromRelease, toRelease].sort((a: any, b: any) => Number(a.id) - Number(b.id));
    }
    return releasesBetween;
  }

  /**
   * Fetches and aggregates changes between two releases, including Git, Build, and JFrog artifacts.
   *
   * This method:
   * - Loads the `from` and `to` releases.
   * - Builds an ordered list of releases between them.
   * - Iterates over release artifacts and, depending on type, delegates to Git/build/JFrog comparison helpers.
   * - Populates `rawChangesArray` and `serviceGroupsByKey` with aggregated change groups.
   *
   * @param pipelinesDataProvider Pipelines data provider for release metadata.
   * @param gitDataProvider       Git data provider for commit/branch details.
   * @param jfrogDataProvider     JFrog/Artifactory data provider used for build artifact comparisons.
   */
  private async fetchReleaseChanges(
    pipelinesDataProvider: PipelinesDataProvider,
    gitDataProvider: GitDataProvider,
    jfrogDataProvider: any
  ): Promise<void> {
    const fromRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
      this.teamProject,
      Number(this.from)
    );
    const toRelease = await pipelinesDataProvider.GetReleaseByReleaseId(this.teamProject, Number(this.to));

    logger.info(`retrieved release artifacts for releases: ${this.from} - ${this.to}`);

    // Determine release definition and fetch history
    const releaseDefinitionId =
      toRelease?.releaseDefinition?.id ?? toRelease?.releaseDefinitionId ?? toRelease?.definitionId;
    if (!releaseDefinitionId) {
      logger.warn(
        'Could not determine release definition id from target release, falling back to direct compare'
      );
    }

    // Build the ordered list of releases between from and to (inclusive), then create consecutive pairs
    const fromId = Number(this.from);
    const toId = Number(this.to);
    const releasesBetween = await this.getReleasesBetween(
      pipelinesDataProvider,
      fromId,
      toId,
      releaseDefinitionId,
      fromRelease,
      toRelease
    );

    const artifactGroupsByKey = new Map<string, ArtifactChangesGroup>();
    const artifactWiSets = new Map<string, Set<number>>();

    // Prefetch releases and build presence timelines
    const releasesList: any[] = await this.buildReleasesList(releasesBetween, pipelinesDataProvider);

    // Cache ordered releases list and index-by-name for per-service range resolution
    this.releasesSeq = releasesList;
    this.releaseIndexByName.clear();

    // Cache releases by their full name (suffix after tag prefix) for later tag-to-release mapping
    this.releasesBySuffix.clear();
    for (let idx = 0; idx < releasesList.length; idx++) {
      const rel = releasesList[idx];
      const name = (rel?.name || '').trim();
      if (!name) continue;
      const date = rel?.createdOn || rel?.created || rel?.createdDate;
      this.releasesBySuffix.set(name, { name, date });
      this.releaseIndexByName.set(name, idx);
    }
    logger.info(
      `SVD services: releasesList between ${fromId}->${toId}: ${releasesList
        .map((r: any) => `${r?.id}:${r?.name}`)
        .join(', ')}`
    );

    const artifactPresence = this.buildArtifactPresence(releasesList);
    const servicesPresentIdx: number[] = this.getServicesEligibleIndices(releasesList);

    // Global services.json compare: aggregate commits strictly between the selected from/to releases.
    // Tags are used only to determine per-service effective from/to releases and to resolve
    // release metadata (version/date) from the tagged commits.
    try {
      logger.info(
        `SVD services: global services.json compare from ${fromRelease?.id}:${fromRelease?.name} to ${toRelease?.id}:${toRelease?.name}`
      );
      await this.handleServiceJsonFile(fromRelease, toRelease, this.teamProject, gitDataProvider, false);
    } catch (e: any) {
      logger.error(`Failed handling services.json for releases ${fromId}->${toId}: ${e.message}`);
      logger.debug(`Services.json error stack: ${e.stack}`);
    }

    // Edge pass: in 'consecutive' mode process only adjacent pairs; in 'allPairs' process every i<j
    await this.compareConsecutiveReleases(
      releasesList,
      gitDataProvider,
      jfrogDataProvider,
      artifactGroupsByKey,
      artifactWiSets
    );

    // Long-hop fallbacks are only needed in optimized mode; skip when running full all-pairs
    if (this.compareMode !== 'allPairs') {
      for (const [k, arr] of artifactPresence.entries()) {
        const sorted = [...arr].sort((a, b) => a.idx - b.idx);
        for (let t = 0; t < sorted.length - 1; t++) {
          const a = sorted[t].idx;
          const b = sorted[t + 1].idx;
          if (b > a + 1) {
            await this.processGap(
              a,
              b,
              k,
              releasesList,
              artifactGroupsByKey,
              artifactWiSets,
              gitDataProvider,
              jfrogDataProvider,
              pipelinesDataProvider
            );
          }
        }
      }

      await this.processServicesGaps(servicesPresentIdx, releasesList, gitDataProvider);
    }

    // Persist aggregated results
    this.rawChangesArray.push(...Array.from(artifactGroupsByKey.values()));
    this.rawChangesArray.push(...Array.from(this.serviceGroupsByKey.values()));
    Array.from(artifactGroupsByKey.values()).forEach((grp) =>
      logger.info(
        `Aggregated group: ${grp.artifact?.name} -> linked=${grp.changes?.length || 0}, unlinked=${
          grp.nonLinkedCommits?.length || 0
        }`
      )
    );
  }

  private async compareConsecutiveReleases(
    releasesList: any[],
    gitDataProvider: GitDataProvider,
    jfrogDataProvider: any,
    artifactGroupsByKey: Map<string, ArtifactChangesGroup>,
    artifactWiSets: Map<string, Set<number>>
  ): Promise<void> {
    // In 'consecutive' mode, compares only adjacent release pairs; in 'allPairs', compares every i<j pair.
    for (let j = 1; j < releasesList.length; j++) {
      for (let i = j - 1; i >= 0; i--) {
        try {
          if (this.compareMode !== 'allPairs' && i !== j - 1) {
            continue;
          }
          const fromRelease = releasesList[i];
          const toRelease = releasesList[j];

          const releaseVersion = toRelease?.name;
          const releaseRunDate = toRelease?.createdOn || toRelease?.created || toRelease?.createdDate;

          logger.debug(`Comparing releases: ${fromRelease.id} -> ${toRelease.id}`);

          // Map from-release artifacts by type+alias for quick match
          const fromArtifactMap = new Map<string, Artifact>();
          for (const fa of fromRelease.artifacts) {
            fromArtifactMap.set(this.buildArtifactKey(fa), fa);
          }

          const artifactsToProcess = [...toRelease.artifacts].sort((a: any, b: any) => {
            const prio = (t: string) =>
              t === 'Git' ? 0 : t === 'Artifactory' || t === 'JFrogArtifactory' ? 1 : t === 'Build' ? 2 : 3;
            return prio(a.type) - prio(b.type);
          });

          for (const toRelArt of artifactsToProcess) {
            const artifactType = toRelArt.type;
            const artifactAlias = toRelArt.alias;

            if (!['Build', 'Git', 'Artifactory', 'JFrogArtifactory'].includes(artifactType)) {
              continue;
            }

            if (
              artifactType === 'Build' &&
              !['TfsGit', 'TfsVersionControl'].includes(
                toRelArt.definitionReference['repository.provider']?.id
              )
            ) {
              continue;
            }

            // Build a stable, unique key per artifact group (type + definition id + alias when possible)
            const key = this.buildArtifactKey(toRelArt);
            let fromRelArt = fromArtifactMap.get(key);
            if (!fromRelArt) {
              const fallbackKey = `${artifactType}|${artifactAlias}`;
              fromRelArt = fromArtifactMap.get(fallbackKey);
            }
            if (!fromRelArt) {
              continue;
            }

            if (
              fromRelArt.definitionReference['version'].name === toRelArt.definitionReference['version'].name
            ) {
              continue;
            }

            const artifactDisplayName = this.getArtifactDisplayName(artifactType, toRelArt);

            try {
              if (artifactType === 'Git') {
                logger.debug(
                  `Release compare [Git ${artifactAlias}]: includeUnlinkedCommits=${this.includeUnlinkedCommits}`
                );
                await this.processGitArtifactPair(
                  key,
                  artifactAlias,
                  artifactDisplayName,
                  fromRelease,
                  toRelease,
                  fromRelArt,
                  toRelArt,
                  releaseVersion,
                  releaseRunDate,
                  gitDataProvider,
                  artifactGroupsByKey,
                  artifactWiSets
                );
              } else if (artifactType === 'Build') {
                logger.debug(
                  `Release compare [Build ${artifactAlias}]: includeUnlinkedCommits=${this.includeUnlinkedCommits}`
                );
                await this.processBuildArtifactPair(
                  key,
                  artifactAlias,
                  artifactDisplayName,
                  fromRelease,
                  toRelease,
                  fromRelArt,
                  toRelArt,
                  releaseVersion,
                  releaseRunDate,
                  gitDataProvider,
                  artifactGroupsByKey
                );
              } else if (artifactType === 'Artifactory' || artifactType === 'JFrogArtifactory') {
                logger.debug(
                  `Release compare [Artifactory ${artifactAlias}]: includeUnlinkedCommits=${this.includeUnlinkedCommits}`
                );
                let jFrogUrl = await jfrogDataProvider.getServiceConnectionUrlByConnectionId(
                  this.teamProject,
                  fromRelArt.definitionReference.connection.id
                );

                const toBuildName = toRelArt.definitionReference['definition'].name;
                const toBuildVersion = toRelArt.definitionReference['version'].name;
                const fromBuildName = fromRelArt.definitionReference['definition'].name;
                const fromBuildVersion = fromRelArt.definitionReference['version'].name;

                let toCiUrl: string = '';
                let fromCiUrl: string = '';
                try {
                  toCiUrl = await this.getCachedJfrogCiUrl(
                    jfrogDataProvider,
                    jFrogUrl,
                    toBuildName,
                    toBuildVersion
                  );
                  if (toCiUrl === '') {
                    continue;
                  }
                } catch (e: any) {
                  continue;
                }
                try {
                  fromCiUrl = await this.getCachedJfrogCiUrl(
                    jfrogDataProvider,
                    jFrogUrl,
                    fromBuildName,
                    fromBuildVersion
                  );
                  if (fromCiUrl === '') {
                    continue;
                  }
                } catch (e: any) {
                  continue;
                }

                const toParts = toCiUrl.split('/');
                const fromParts = fromCiUrl.split('/');
                const toSuffix = toParts.pop() as string;
                const fromSuffix = fromParts.pop() as string;
                const toTeamProject = toParts.pop();

                let jfrogUploader = '';
                if (toSuffix.startsWith('_release?releaseId=')) jfrogUploader = 'release';
                else if (toSuffix.startsWith('_build?buildId=')) jfrogUploader = 'pipeline';
                else continue;

                let toBuildId = toSuffix.split('=').pop();
                let fromBuildId = fromSuffix.split('=').pop();
                if (Number(fromBuildId) > Number(toBuildId)) {
                  [fromBuildId, toBuildId] = [toBuildId, fromBuildId];
                }

                const artFactory = new ChangeDataFactory(
                  toTeamProject,
                  '',
                  fromBuildId,
                  toBuildId,
                  jfrogUploader,
                  null,
                  '',
                  true,
                  this.includePullRequestWorkItems,
                  '',
                  false,
                  false,
                  this.dgDataProviderAzureDevOps,
                  this.attachmentsBucketName,
                  this.minioEndPoint,
                  this.minioAccessKey,
                  this.minioSecretKey,
                  this.PAT,
                  `Artifactory ${toBuildName}`,
                  undefined,
                  new Set<number>(),
                  this.linkedWiOptions,
                  this.requestedByBuild,
                  this.includeUnlinkedCommits,
                  this.formattingSettings,
                  this.workItemFilterOptions,
                  this.compareMode,
                  this.replaceTaskWithParent
                );
                const jfrogCacheKey = `${key}|JFrog|${toTeamProject}|${fromBuildId}->${toBuildId}`;
                let mergedChanges: any[] = [];
                let mergedNoLink: any[] = [];
                const jfrogCached = this.pairCompareCache.get(jfrogCacheKey);
                if (jfrogCached) {
                  mergedChanges = jfrogCached.linked;
                  mergedNoLink = jfrogCached.unlinked;
                } else {
                  await artFactory.fetchChangesData();
                  const rawData = artFactory.getRawData();
                  rawData.forEach((a: any) => {
                    (a.changes || []).forEach((c: any) => {
                      mergedChanges.push(c);
                    });
                    (a.nonLinkedCommits || []).forEach((c: any) => {
                      mergedNoLink.push(c);
                    });
                  });
                  this.pairCompareCache.set(jfrogCacheKey, {
                    linked: mergedChanges,
                    unlinked: mergedNoLink,
                  });
                }
                logger.debug(
                  `Release compare [Artifactory ${artifactAlias}]: merged linked=${mergedChanges.length}, merged unlinked=${mergedNoLink.length}`
                );

                if (!artifactGroupsByKey.has(key)) {
                  artifactGroupsByKey.set(key, {
                    artifact: { name: artifactDisplayName },
                    changes: [],
                    nonLinkedCommits: [],
                  });
                }

                // Clone before annotation to avoid mutating cached objects
                const agg = artifactGroupsByKey.get(key)!;
                const clonedLinked = mergedChanges.map((c) => ({ ...c }));
                const clonedNoLink = mergedNoLink.map((c) => ({ ...c }));
                clonedLinked.forEach((c: any) => {
                  c.releaseVersion = releaseVersion;
                  c.releaseRunDate = releaseRunDate;
                });
                clonedNoLink.forEach((c: any) => {
                  c.releaseVersion = releaseVersion;
                  c.releaseRunDate = releaseRunDate;
                });
                agg.changes.push(...this.takeNewCommits(key, clonedLinked));
                agg.nonLinkedCommits.push(...this.takeNewCommits(key, clonedNoLink));
              }
            } catch (error: any) {
              logger.error(
                `Failed to process artifact ${artifactAlias} (${artifactType}) for releases ${fromRelease.id} -> ${toRelease.id}: ${error.message}`
              );
              logger.debug(`Error stack: ${error.stack}`);
            }
          } // end for each artifact
        } catch (e: any) {
          logger.error(`Failed comparing pair ${i}->${j}: ${e.message}`);
          logger.debug(`Pair error stack: ${e.stack}`);
          continue;
        }
      } // end inner from-loop for this target
    } // end all-pairs loop
  }

  /**
   * Fetches change data for the configured range and aggregates it into `rawChangesArray`.
   *
   * Modes:
   * - 'consecutive': process only adjacent edges (O(R)).
   * - 'allPairs': optimized to O(R) by processing adjacent edges and scheduling minimal long‑hop
   *   comparisons for presence gaps where an artifact exists at two releases but not in between.
   *
   * For each artifact key, results are deduplicated via `takeNewCommits` and annotated with the
   * target release version and run date where the change is first observed.
   */
  async fetchChangesData() {
    try {
      logger.info(
        `fetchChangesData: rangeType=${this.rangeType}, includeUnlinkedCommits=${this.includeUnlinkedCommits}`
      );
      // Reset commit ID tracking to avoid carryover between runs
      this.includedCommitIdsByArtifact?.clear();
      let focusedArtifact;
      let gitDataProvider = await this.dgDataProviderAzureDevOps.getGitDataProvider();
      let jfrogDataProvider = await this.dgDataProviderAzureDevOps.getJfrogDataProvider();
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();

      if (this.repoId) {
        focusedArtifact = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
      }
      switch (this.rangeType) {
        case 'commitSha':
          await this.fetchCommitShaChanges(gitDataProvider, focusedArtifact);
          break;
        case 'range':
          await this.fetchRangeChanges(gitDataProvider, focusedArtifact);
          break;
        case 'date':
          await this.fetchDateChanges(gitDataProvider);
          break;
        case 'pipeline':
          await this.fetchPipelineChanges(pipelinesDataProvider, gitDataProvider);
          break;
        case 'release':
          await this.fetchReleaseChanges(pipelinesDataProvider, gitDataProvider, jfrogDataProvider);
          break;
        default:
          break;
      }

      logger.info(`fetch ${this.rawChangesArray.length} changes for range`);
      //Clear the set after finishing
    } catch (error: any) {
      if (error.message?.includes('The number of changes is too large')) {
        throw error;
      }
      logger.error(error.message);
    }
  } //fetchChangesData

  /**
   * Checks if the number of artifact changes exceeds the maximum allowed limit.
   *
   * @param artifactChanges - An array of artifact changes to validate
   * @throws {Error} When the number of changes exceeds 500
   */
  private isChangesReachedMaxSize(rangeType: string = '', artifactsChangesLength?: number) {
    if (artifactsChangesLength && artifactsChangesLength > 500) {
      throw new Error(
        `Range type ${rangeType} error:
         The number of changes is too large (${artifactsChangesLength}) but the maximum is 500. Consider narrowing the range.`
      );
    }
  }

  /**
   * Retrieves the changes between two pipeline builds.
   *
   * @param pipelinesDataProvider - The provider for pipeline data.
   * @param gitDataProvider - The provider for git data.
   * @param teamProject - The team project name.
   * @param to - The target build ID or version.
   * @param from - The source build ID or version.
   * @returns A promise that resolves to an array of changes between the specified builds.
   * @throws Will throw an error if the target build has not succeeded.
   */
  private async GetPipelineChanges(
    pipelinesDataProvider: PipelinesDataProvider,
    gitDataProvider: GitDataProvider,
    teamProject: string,
    to: string | number,
    from: string | number,
    visitedTargetRuns: Set<string> = new Set()
  ): Promise<{ artifactChanges: any[]; artifactChangesNoLink: any[] }> {
    const artifactChanges = [];
    const artifactChangesNoLink = [];
    try {
      const targetBuildId = Number(to);
      let resolvedFromRunId = Number(from);

      let targetBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, targetBuildId);

      const targetPipelineId = targetBuild.definition.id;

      const targetRunKey = `${teamProject}:${targetPipelineId}:${targetBuildId}`;
      if (visitedTargetRuns.has(targetRunKey)) {
        logger.warn(`Detected cyclic pipeline resource dependency at ${targetRunKey}, skipping recursion`);
        return { artifactChanges: [], artifactChangesNoLink: [] };
      }
      visitedTargetRuns.add(targetRunKey);

      const targetPipelineRun = await pipelinesDataProvider.getPipelineRunDetails(
        teamProject,
        targetPipelineId,
        targetBuildId
      );

      let sourceBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, resolvedFromRunId);

      if (!sourceBuild) {
        const prevRunId = await pipelinesDataProvider.findPreviousPipeline(
          teamProject,
          String(targetPipelineId),
          targetBuildId,
          targetPipelineRun,
          true
        );

        if (!prevRunId) {
          logger.warn(`Could not find a valid pipeline before run #${to}`);
          return { artifactChanges: [], artifactChangesNoLink: [] };
        }

        resolvedFromRunId = Number(prevRunId);
        sourceBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, resolvedFromRunId);
        if (!sourceBuild) {
          logger.warn(`Could not load previous build details for run #${resolvedFromRunId}`);
          return { artifactChanges: [], artifactChangesNoLink: [] };
        }
      }

      const sourcePipelineId = sourceBuild.definition.id;

      const sourcePipelineRun = await pipelinesDataProvider.getPipelineRunDetails(
        teamProject,
        sourcePipelineId,
        resolvedFromRunId
      );

      const sourcePipelineResourcePipelines =
        await pipelinesDataProvider.getPipelineResourcePipelinesFromObject(sourcePipelineRun);
      const targetPipelineResourcePipelines =
        await pipelinesDataProvider.getPipelineResourcePipelinesFromObject(targetPipelineRun);

      const sourcePipelineResourcePipelinesArr: any[] = this.coerceIterableToArray<any>(
        sourcePipelineResourcePipelines
      );
      const targetPipelineResourcePipelinesArr: any[] = this.coerceIterableToArray<any>(
        targetPipelineResourcePipelines
      );

      const sourceResourceRepositories =
        await pipelinesDataProvider.getPipelineResourceRepositoriesFromObject(
          sourcePipelineRun,
          gitDataProvider
        );
      const targetResourceRepositories =
        await pipelinesDataProvider.getPipelineResourceRepositoriesFromObject(
          targetPipelineRun,
          gitDataProvider
        );

      const sourceReposByName: Map<string, any> = new Map();
      for (const r of sourceResourceRepositories as any[]) {
        const name = String(r?.repoName || '');
        if (!name) continue;
        // Preserve the previous behavior: the first matching repo wins.
        if (!sourceReposByName.has(name)) {
          sourceReposByName.set(name, r);
        }
      }

      for (const targetPipelineRepo of targetResourceRepositories) {
        let gitRepoUrl = this.removeUserFromGitRepoUrl(targetPipelineRepo.url);
        let gitRepoVersion = targetPipelineRepo.repoSha1;
        let gitRepoName = targetPipelineRepo.repoName;
        let toCommit = gitRepoVersion;
        logger.debug(`Repository ${gitRepoUrl} version ${gitRepoVersion.slice(0, 7)}`);

        const sourceRepo = sourceReposByName.get(String(gitRepoName || ''));
        if (!sourceRepo) {
          continue;
        }

        let fromGitRepoUrl = this.removeUserFromGitRepoUrl(sourceRepo.url);
        let fromGitRepoVersion = sourceRepo.repoSha1;

        logger.debug(`Previous repository ${fromGitRepoUrl} version ${fromGitRepoVersion.slice(0, 7)}`);
        if (fromGitRepoVersion === gitRepoVersion) {
          logger.debug(`Same repository version ${fromGitRepoVersion} nothing to compare`);
          continue;
        }

        let fromCommit = fromGitRepoVersion;
        logger.debug(`fromCommit ${fromCommit} toCommit ${toCommit}`);
        const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
          gitDataProvider,
          teamProject,
          fromCommit,
          'commit',
          toCommit,
          'commit',
          gitRepoName,
          gitRepoUrl,
          this.includedWorkItemByIdSet,
          undefined,
          undefined,
          this.linkedWiOptions
        );

        logger.debug(
          `getCommitRangeChanges returned: ${allExtendedCommits.length} commits with work items, ${commitsWithNoRelations.length} without`
        );
        if (allExtendedCommits.length > 0) {
          const sampleSize = Math.min(allExtendedCommits.length, 5);
          const sample = allExtendedCommits.slice(0, sampleSize).map((commit) => {
            const workItemId = commit.workItem?.id ?? 'none';
            const commitId = commit.commit?.commitId?.substring(0, 7) || 'unknown';
            return `${workItemId}:${commitId}`;
          });
          logger.debug(`  Commit sample (${sampleSize}/${allExtendedCommits.length}): ${sample.join(', ')}`);
        }

        artifactChanges.push(...allExtendedCommits);
        artifactChangesNoLink.push(...commitsWithNoRelations);
      }

      const sourcePipelinesByKey: Map<string, any[]> = new Map();
      for (const p of sourcePipelineResourcePipelinesArr) {
        const key = this.buildResourcePipelineKey(p);
        if (!key) continue;
        const arr = sourcePipelinesByKey.get(key);
        if (arr) arr.push(p);
        else sourcePipelinesByKey.set(key, [p]);
      }

      for (const targetPipeline_pipeline of targetPipelineResourcePipelinesArr) {
        let targetResourcePipelineRunId = targetPipeline_pipeline.buildId;
        let targetResourcePipelineDefinitionId = targetPipeline_pipeline.definitionId;
        let targetResourcePipelineTeamProject = targetPipeline_pipeline.teamProject;
        let targetResourceBuildNumber = targetPipeline_pipeline.buildNumber;
        let targetResourcePipelineName = targetPipeline_pipeline.name;
        let targetResourcePipelineProvider = targetPipeline_pipeline.provider;
        if (
          targetResourcePipelineProvider &&
          !['TfsGit', 'azureReposGit'].includes(targetResourcePipelineProvider)
        ) {
          logger.debug(
            `resource pipeline ${targetResourcePipelineProvider} is not based on azure devops git, skipping`
          );
          continue;
        }

        logger.debug(`Processing resource pipeline ${targetResourceBuildNumber}`);
        logger.debug(`Locate the pipeline ${targetResourcePipelineName} ${targetResourceBuildNumber}`);

        const matchKey = this.buildResourcePipelineKey({
          teamProject: targetResourcePipelineTeamProject,
          definitionId: targetResourcePipelineDefinitionId,
        });
        const matchingSourcePipelines = matchKey ? sourcePipelinesByKey.get(matchKey) || [] : [];

        // Resource pipeline is present only on the target run (added dependency):
        // compare it against its previous successful run so its changes/WIs are included.
        if (matchingSourcePipelines.length === 0) {
          const targetResourcePipeline = await pipelinesDataProvider.getPipelineRunDetails(
            targetResourcePipelineTeamProject,
            targetResourcePipelineDefinitionId,
            targetResourcePipelineRunId
          );

          if (!targetResourcePipeline) {
            logger.debug(
              `Could not find pipeline ${targetResourcePipelineName} ${targetResourceBuildNumber}, skipping`
            );
            continue;
          }

          logger.debug(
            `resource pipeline ${targetResourcePipelineName} (${targetResourcePipelineTeamProject}/${targetResourcePipelineDefinitionId}) is new in target run, resolving previous run`
          );
          try {
            const prevRunId = await pipelinesDataProvider.findPreviousPipeline(
              targetResourcePipelineTeamProject,
              String(targetResourcePipelineDefinitionId),
              Number(targetResourcePipelineRunId),
              targetResourcePipeline,
              true
            );
            if (!prevRunId) {
              logger.warn(
                `Could not find previous run for newly-added resource pipeline ${targetResourcePipelineName} (${targetResourcePipelineTeamProject}/${targetResourcePipelineDefinitionId}) before run ${targetResourcePipelineRunId}`
              );
              continue;
            }
            if (Number(prevRunId) === Number(targetResourcePipelineRunId)) {
              continue;
            }

            const { artifactChanges: reportPartsForRepo, artifactChangesNoLink: reportPartsForRepoNoLink } =
              await this.GetPipelineChanges(
                pipelinesDataProvider,
                gitDataProvider,
                targetResourcePipelineTeamProject,
                targetResourcePipelineRunId,
                Number(prevRunId),
                visitedTargetRuns
              );
            if (reportPartsForRepo) {
              artifactChanges.push(...reportPartsForRepo);
              artifactChangesNoLink.push(...reportPartsForRepoNoLink);
            }
          } catch (e: any) {
            logger.error(
              `Failed handling newly-added resource pipeline ${targetResourcePipelineName}: ${
                e?.message || e
              }`
            );
          }
          continue;
        }

        for (const sourcePipeline_pipeline of matchingSourcePipelines) {
          let sourceResourcePipelineRunId = sourcePipeline_pipeline.buildId;
          let sourceResourcePipelineDefinitionId = sourcePipeline_pipeline.definitionId;
          let sourceResourcePipelineTeamProject = sourcePipeline_pipeline.teamProject;
          let sourceResourceBuildNumber = sourcePipeline_pipeline.buildNumber;
          let sourceResourcePipelineName = sourcePipeline_pipeline.name;
          let sourceResourcePipelineProvider = sourcePipeline_pipeline.provider;

          if (
            sourceResourcePipelineProvider &&
            !['TfsGit', 'azureReposGit'].includes(sourceResourcePipelineProvider)
          ) {
            logger.debug(
              `resource pipeline ${sourceResourcePipelineProvider} is not based on azure devops git, skipping`
            );
            continue;
          }

          if (sourceResourcePipelineRunId === targetResourcePipelineRunId) {
            logger.debug(
              `resource pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber} is the same as ${targetResourcePipelineName} ${targetResourceBuildNumber}, skipping`
            );
            break;
          }

          const targetResourceRunKey = `${String(targetResourcePipelineTeamProject)}:${Number(
            targetResourcePipelineDefinitionId
          )}:${Number(targetResourcePipelineRunId)}`;
          if (visitedTargetRuns.has(targetResourceRunKey)) {
            await this.GetPipelineChanges(
              pipelinesDataProvider,
              gitDataProvider,
              targetResourcePipelineTeamProject,
              targetResourcePipelineRunId,
              sourceResourcePipelineRunId,
              visitedTargetRuns
            );
            continue;
          }

          logger.debug(
            `Locate the previous pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber}`
          );

          const sourceResourcePipeline = await pipelinesDataProvider.getPipelineRunDetails(
            sourceResourcePipelineTeamProject,
            sourceResourcePipelineDefinitionId,
            sourceResourcePipelineRunId
          );

          if (!sourceResourcePipeline) {
            logger.info(
              `Could not find pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber}, skipping`
            );
            break;
          }
          //Recursive call
          const { artifactChanges: reportPartsForRepo, artifactChangesNoLink: reportPartsForRepoNoLink } =
            await this.GetPipelineChanges(
              pipelinesDataProvider,
              gitDataProvider,
              targetResourcePipelineTeamProject,
              targetResourcePipelineRunId,
              sourceResourcePipelineRunId,
              visitedTargetRuns
            );

          if (reportPartsForRepo) {
            const linkedCount = reportPartsForRepo?.length || 0;
            const unlinkedCount = reportPartsForRepoNoLink?.length || 0;
            logger.debug(`reportPartsForRepo summary: linked=${linkedCount}, unlinked=${unlinkedCount}`);
            artifactChanges.push(...reportPartsForRepo);
            artifactChangesNoLink.push(...reportPartsForRepoNoLink);
          }
        }
      }
    } catch (error: any) {
      logger.error(`could not handle pipeline ${error.message}`);
    }

    logger.info(
      `GetPipelineChanges returning: ${artifactChanges.length} changes, ${artifactChangesNoLink.length} unlinked`
    );
    if (artifactChanges.length > 0) {
      logger.debug(
        `First change has workItem: ${!!artifactChanges[0].workItem}, commit: ${!!artifactChanges[0].commit}`
      );
    }

    return { artifactChanges, artifactChangesNoLink };
  }

  /**
   * Remove embedded user credentials from a Git URL if present.
   * Example: https://user@server/_git/repo -> https://server/_git/repo
   */
  private removeUserFromGitRepoUrl(gitRepoUrl: string) {
    if (!gitRepoUrl.startsWith('https://')) {
      return gitRepoUrl;
    }
    if (!gitRepoUrl.includes('@')) {
      return gitRepoUrl;
    }
    return 'https://' + gitRepoUrl.split('@').pop();
  }

  private resolveProjectNameFromGitApiUrl(gitApiUrl: string, fallback: string): string {
    if (!gitApiUrl) return fallback;
    const resolveFromPath = (pathname: string) => {
      const segments = pathname.split('/').filter(Boolean);
      const apiIndex = segments.indexOf('_apis');
      return apiIndex > 0 ? segments[apiIndex - 1] : '';
    };
    const pathOnly = gitApiUrl.split('?')[0];
    try {
      const parsed = new URL(pathOnly);
      const projectFromUrl = resolveFromPath(parsed.pathname);
      if (projectFromUrl) return projectFromUrl;
    } catch {
      // Ignore URL parsing errors and fall back to raw path parsing.
    }
    const projectFromPath = resolveFromPath(pathOnly);
    return projectFromPath || fallback;
  }

  /**
   * Compute commit-range changes (linked and unlinked) for a repository or submodule path.
   * Wraps provider calls to GetCommitBatch and getItemsForPipelineRange, and also invokes submodule parsing.
   */
  private async getCommitRangeChanges(
    gitDataProvider: GitDataProvider,
    teamProject: string,
    fromVersion: any,
    fromVersionType: any,
    toVersion: any,
    toVersionType: any,
    gitRepoName: any,
    gitRepoUrl: any,
    includedWorkItemByIdSet: Set<number> = undefined,
    gitSubModuleName: string = '',
    specificItemPath: string = '',
    linkedWiOptions: any = undefined
  ) {
    const allExtendedCommits: any[] = [];
    const commitsWithNoRelations: any[] = [];
    try {
      let gitApisUrl = gitRepoUrl.includes('/_git/')
        ? gitRepoUrl.replace('/_git/', '/_apis/git/repositories/')
        : gitRepoUrl;
      const projectForRepo = this.resolveProjectNameFromGitApiUrl(gitApisUrl, teamProject);

      logger.debug(`fetching commits for ${gitRepoName} from ${fromVersion} to ${toVersion}`);
      let extendedCommits = await gitDataProvider.GetCommitBatch(
        gitApisUrl,
        { version: fromVersion, versionType: fromVersionType },
        { version: toVersion, versionType: toVersionType },
        specificItemPath
      );

      logger.debug(`GetCommitBatch returned ${extendedCommits?.length || 0} commits`);

      if (extendedCommits?.length > 0) {
        const workItemCommitIds = new Map<number, Set<string>>();
        for (const entry of extendedCommits) {
          const commit = entry?.commit;
          const commitId = commit?.commitId;
          if (!commitId || !Array.isArray(commit?.workItems)) continue;
          for (const wi of commit.workItems) {
            const workItemId = wi?.id;
            if (typeof workItemId !== 'number') continue;
            const ids = workItemCommitIds.get(workItemId) || new Set<string>();
            ids.add(commitId);
            workItemCommitIds.set(workItemId, ids);
          }
        }
        const targetRepo = {
          repoName: gitRepoName,
          gitSubModuleName: gitSubModuleName,
          url: gitApisUrl,
        };
        const { commitChangesArray, commitsWithNoRelations: unrelatedCommits } =
          await gitDataProvider.getItemsForPipelineRange(
            teamProject,
            extendedCommits,
            targetRepo,
            includedWorkItemByIdSet,
            linkedWiOptions,
            this.includeUnlinkedCommits
          );
        allExtendedCommits.push(...commitChangesArray);
        commitsWithNoRelations.push(...unrelatedCommits);

        const { commitsWithRelatedWi, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
          await this.parseSubModules(
            gitDataProvider,
            projectForRepo,
            gitRepoName,
            toVersion,
            fromVersion,
            toVersionType,
            fromVersionType,
            extendedCommits,
            includedWorkItemByIdSet,
            linkedWiOptions
          );
        allExtendedCommits.push(...commitsWithRelatedWi);
        commitsWithNoRelations.push(...commitsWithNoRelationsSubmodule);

        if (this.includePullRequestWorkItems) {
          const repoIdForPr = gitRepoName || gitApisUrl?.split('/').filter(Boolean).pop() || this.repoId;
          if (repoIdForPr) {
            const commits = extendedCommits
              .map((entry: any) => entry?.commit)
              .filter((commit: any) => commit && commit.commitId);
            if (commits.length > 0) {
              const commitById = new Map(commits.map((commit: any) => [commit.commitId, commit]));
              const prLinkedItems = await gitDataProvider.GetPullRequestsLinkedItemsInCommitRange(
                projectForRepo,
                repoIdForPr,
                { value: commits }
              );
              this.markPrOnlyOnMergeCommit(allExtendedCommits, workItemCommitIds, prLinkedItems);
              for (const item of prLinkedItems || []) {
                const workItemId = item?.workItem?.id;
                if (typeof workItemId !== 'number') continue;
                if (includedWorkItemByIdSet?.has(workItemId)) continue;
                includedWorkItemByIdSet?.add(workItemId);
                const mergeCommitId = item?.pullrequest?.lastMergeCommit?.commitId;
                const mergeCommit = mergeCommitId ? commitById.get(mergeCommitId) : undefined;
                allExtendedCommits.push({
                  ...item,
                  commit: mergeCommit ?? item.commit,
                  targetRepo,
                  pullRequestWorkItemOnly: true,
                });
              }
            }
          } else {
            logger.debug('getCommitRangeChanges: repo identifier missing for PR work items');
          }
        }
      }

      return { allExtendedCommits, commitsWithNoRelations };
    } catch (error: any) {
      logger.error(`Cannot get commits for commit range ${gitRepoName} - ${error.message}`);
      throw error;
    }
  }

  private markPrOnlyOnMergeCommit(
    changes: any[],
    workItemCommitIds: Map<number, Set<string>>,
    prLinkedItems: any[]
  ) {
    const prWorkItemIds = new Set(
      (prLinkedItems || [])
        .map((item: any) => item?.workItem?.id)
        .filter((workItemId: any) => typeof workItemId === 'number')
    );
    if (prWorkItemIds.size === 0) return;

    const prMergeCommitIds = new Set(
      (prLinkedItems || [])
        .map((item: any) => item?.pullrequest?.lastMergeCommit?.commitId)
        .filter((commitId: any) => typeof commitId === 'string' && commitId !== '')
    );
    if (prMergeCommitIds.size === 0) return;

    for (const change of changes || []) {
      const workItemId = change?.workItem?.id;
      const commitId = change?.commit?.commitId;
      if (typeof workItemId !== 'number' || !commitId) {
        continue;
      }
      const commitIds = workItemCommitIds.get(workItemId);
      if (
        commitIds &&
        commitIds.size === 1 &&
        prWorkItemIds.has(workItemId) &&
        prMergeCommitIds.has(commitId)
      ) {
        change.pullRequestWorkItemOnly = true;
      }
    }
  }

  /**
   * Parse submodules across a commit range and collect their related and unrelated commits.
   */
  private async parseSubModules(
    gitDataProvider: GitDataProvider,
    teamProject: string,
    gitRepoName: any,
    toCommit: any,
    fromCommit: any,
    toVersionType: string,
    fromVersionType: string,
    allCommitsExtended: any[],
    includedWorkItemByIdSet: Set<number>,
    subModuleName: string = '',
    linkedWiOptions: any = undefined
  ) {
    const commitsWithRelatedWi: any[] = [];
    const commitsWithNoRelations: any[] = [];
    try {
      const submodules = await gitDataProvider.getSubmodulesData(
        teamProject,
        gitRepoName,
        { version: toCommit, versionType: toVersionType },
        { version: fromCommit, versionType: fromVersionType },
        allCommitsExtended
      );

      for (const subModule of submodules) {
        let gitSubRepoUrl = subModule.gitSubRepoUrl;
        let gitSubRepoName = subModule.gitSubRepoName;
        let gitSubModuleName = subModule.gitSubModuleName;
        let sourceSha1 = subModule.sourceSha1;
        let targetSha1 = subModule.targetSha1;
        const { allExtendedCommits, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
          await this.getCommitRangeChanges(
            gitDataProvider,
            teamProject,
            sourceSha1,
            'commit',
            targetSha1,
            'commit',
            gitSubRepoName,
            gitSubRepoUrl,
            includedWorkItemByIdSet,
            gitSubModuleName,
            undefined,
            linkedWiOptions
          );

        commitsWithRelatedWi.push(...allExtendedCommits);
        commitsWithNoRelations.push(...commitsWithNoRelationsSubmodule);
      }
    } catch (error: any) {
      logger.error(`could not handle submodules ${error.message}`);
    }
    return { commitsWithRelatedWi, commitsWithNoRelations };
  }

  /**
   * When enabled, replaces change.workItem of type Task with its immediate Requirement or Change Request parent (if any).
   * Adds a marker field 'replacedFromTaskId' so UI can indicate the substitution.
   */
  private async applyTaskParentReplacement(rawGroups: any[]): Promise<any[]> {
    try {
      const ticketsDataProvider = await this.dgDataProviderAzureDevOps.getTicketsDataProvider();
      const transform = async (change: any) => {
        const wi = change?.workItem;
        const wiType = wi?.fields?.['System.WorkItemType'];
        // Non-Task items are passed through unchanged
        if (!wi || wiType !== 'Task') return change;
        // For Task: require a hierarchy parent that is a Requirement; otherwise drop the item
        if (!Array.isArray(wi.relations)) return null;
        try {
          const parentRel = wi.relations.find(
            (r: any) => typeof r?.rel === 'string' && r.rel.toLowerCase().includes('hierarchy-reverse')
          );
          if (!parentRel?.url) return null;
          const parent = await ticketsDataProvider.GetWorkItemByUrl(parentRel.url);
          const parentType = parent?.fields?.['System.WorkItemType'].toLowerCase();
          if (parent && (parentType === 'requirement' || parentType === 'change request')) {
            return { ...change, workItem: parent, replacedFromTaskId: wi.id };
          }
        } catch (e: any) {
          logger.debug(`applyTaskParentReplacement: ${e.message}`);
        }
        return null;
      };

      const out: any[] = [];
      for (const group of rawGroups || []) {
        const changes = Array.isArray(group?.changes) ? group.changes : [];
        const processed: any[] = (await Promise.all(changes.map(transform))).filter(Boolean);
        // Deduplicate by resulting workItem.id; keep the item with the latest commit metadata
        const others: any[] = [];
        const bestByWid = new Map<number, any>();
        for (const item of processed) {
          const wid = item?.workItem?.id;
          if (typeof wid !== 'number') {
            others.push(item);
            continue;
          }
          const prev = bestByWid.get(wid);
          const ts = new Date(item?.commit?.committer?.date || item?.commitDate || 0).getTime() || -Infinity;
          const prevTs =
            new Date(prev?.commit?.committer?.date || prev?.commitDate || 0).getTime() || -Infinity;
          if (!prev || ts >= prevTs) {
            bestByWid.set(wid, item);
          }
        }
        const deduped: any[] = [...others, ...bestByWid.values()];
        out.push({ ...group, changes: deduped });
      }
      return out;
    } catch (e: any) {
      logger.debug(`applyTaskParentReplacement failed: ${e.message}`);
      return rawGroups;
    }
  }

  private getChangeCommitTimestamp(change: any): number {
    const raw =
      change?.commit?.committer?.date || change?.commit?.author?.date || change?.commitDate || undefined;
    const ts = new Date(raw || 0).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  /**
   * Resolves a comparable occurrence timestamp for a change.
   *
   * Order of preference is commit timestamps, then PR timestamps, then work item close date.
   * Returns null when no valid timestamp is available.
   */
  private getChangeOccurrenceTimestamp(change: any): number | null {
    const raw =
      change?.commit?.committer?.date ||
      change?.commit?.author?.date ||
      change?.commitDate ||
      change?.pullrequest?.closedDate ||
      change?.pullrequest?.creationDate ||
      change?.workItem?.fields?.['Microsoft.VSTS.Common.ClosedDate'] ||
      undefined;
    if (!raw) return null;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  /**
   * Normalizes work item identifiers to a canonical string key.
   *
   * Numeric-like values are normalized by trimming leading zeros (e.g. "00042" -> "42").
   * Non-numeric values are lowercased.
   */
  private normalizeWorkItemId(value: any): string | null {
    if (value === undefined || value === null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      return raw.replace(/^0+(?=\d)/, '');
    }
    return raw.toLowerCase();
  }

  /**
   * Extracts a work item ID from common Azure DevOps work item URL patterns.
   *
   * Supports both UI edit URLs and REST-like workitems URLs.
   */
  private extractWorkItemIdFromUrl(url: any): string | null {
    const raw = String(url || '').trim();
    if (!raw) return null;
    const match = raw.match(/\/_workitems\/edit\/(\d+)\b/i) || raw.match(/workitems\/(\d+)\b/i);
    if (!match) return null;
    return this.normalizeWorkItemId(match[1]);
  }

  /**
   * Builds a stable deduplication key for a change's work item.
   *
   * Fallback chain:
   * 1) workItem.id
   * 2) workItem.fields["System.Id"]
   * 3) workItem._links.html.href
   * 4) workItem.url
   */
  private getWorkItemDedupeKey(change: any): string | null {
    const workItem = change?.workItem;
    const directId = this.normalizeWorkItemId(workItem?.id);
    if (directId) return directId;

    const systemId = this.normalizeWorkItemId(workItem?.fields?.['System.Id']);
    if (systemId) return systemId;

    const fromHtmlLink = this.extractWorkItemIdFromUrl(workItem?._links?.html?.href);
    if (fromHtmlLink) return fromHtmlLink;

    return this.extractWorkItemIdFromUrl(workItem?.url);
  }

  /**
   * Determines whether a candidate occurrence should replace the current chosen occurrence.
   *
   * Selection rules:
   * - Prefer entries that have timestamps over entries without timestamps.
   * - When both have timestamps, prefer the later (newer) timestamp.
   * - On exact tie, prefer the earlier sequence position for deterministic behavior.
   */
  private shouldPreferLaterOccurrence(
    candidate: { hasTimestamp: boolean; timestamp: number; sequence: number },
    current: { hasTimestamp: boolean; timestamp: number; sequence: number }
  ): boolean {
    if (candidate.hasTimestamp && !current.hasTimestamp) return true;
    if (!candidate.hasTimestamp && current.hasTimestamp) return false;
    if (candidate.hasTimestamp && current.hasTimestamp) {
      if (candidate.timestamp > current.timestamp) return true;
      if (candidate.timestamp < current.timestamp) return false;
    }
    return candidate.sequence < current.sequence;
  }

  private dedupeChangesByWorkItemLatest(changes: any[] = []): any[] {
    if (!Array.isArray(changes) || changes.length === 0) {
      return changes;
    }

    const latestByWorkItem = new Map<number, any>();
    const passthrough: any[] = [];

    for (const change of changes) {
      const wid = change?.workItem?.id;
      if (typeof wid !== 'number') {
        passthrough.push(change);
        continue;
      }
      const prev = latestByWorkItem.get(wid);
      if (!prev) {
        latestByWorkItem.set(wid, change);
        continue;
      }
      const ts = this.getChangeCommitTimestamp(change);
      const prevTs = this.getChangeCommitTimestamp(prev);
      if (ts >= prevTs) {
        latestByWorkItem.set(wid, change);
      }
    }

    return [...passthrough, ...latestByWorkItem.values()];
  }

  /**
   * Deduplicates work items across all artifact groups and keeps a single best occurrence per WI.
   *
   * The selected occurrence is based on `shouldPreferLaterOccurrence`, i.e. newest timestamp wins.
   * Items that do not expose a resolvable work-item key are kept as-is.
   *
   * @returns The transformed groups and a count of removed duplicate entries.
   */
  private dedupeChangesAcrossArtifactsFirstOccurrence(
    groups: any[] = []
  ): { groups: any[]; removedChanges: number } {
    if (!Array.isArray(groups) || groups.length === 0) {
      return { groups, removedChanges: 0 };
    }

    const bestByWorkItemKey = new Map<
      string,
      {
        groupIndex: number;
        changeIndex: number;
        hasTimestamp: boolean;
        timestamp: number;
        sequence: number;
      }
    >();

    let sequence = 0;
    groups.forEach((group, groupIndex) => {
      const changes = Array.isArray(group?.changes) ? group.changes : [];
      changes.forEach((change, changeIndex) => {
        const key = this.getWorkItemDedupeKey(change);
        if (!key) {
          sequence++;
          return;
        }

        const occurrenceTs = this.getChangeOccurrenceTimestamp(change);
        const candidate = {
          groupIndex,
          changeIndex,
          hasTimestamp: occurrenceTs !== null,
          timestamp: occurrenceTs ?? 0,
          sequence,
        };

        const current = bestByWorkItemKey.get(key);
        if (!current || this.shouldPreferLaterOccurrence(candidate, current)) {
          bestByWorkItemKey.set(key, candidate);
        }
        sequence++;
      });
    });

    let removedChanges = 0;

    const dedupedGroups = groups.map((group, groupIndex) => {
      const changes = Array.isArray(group?.changes) ? group.changes : [];
      const dedupedChanges = changes.filter((change, changeIndex) => {
        const key = this.getWorkItemDedupeKey(change);
        if (!key) {
          return true;
        }

        const best = bestByWorkItemKey.get(key);
        const shouldKeep =
          !!best && best.groupIndex === groupIndex && best.changeIndex === changeIndex;
        if (!shouldKeep) {
          removedChanges++;
        }
        return shouldKeep;
      });

      return {
        ...group,
        changes: dedupedChanges,
      };
    });

    return { groups: dedupedGroups, removedChanges };
  }

  private filterChangesByWorkItemOptions(changes: any[] = []): any[] {
    if (!this.workItemFilterOptions?.isEnabled) {
      return changes;
    }

    const filteredChanges = changes.filter((change) => {
      const workItem = change?.workItem;
      if (!workItem) {
        return false;
      }

      const workItemType = String(workItem.fields?.['System.WorkItemType'] ?? '').toLowerCase();
      const workItemState = String(workItem.fields?.['System.State'] ?? '').toLowerCase();

      // if no filters are set, return all changes
      const isValidType =
        this.workItemFilterOptions.workItemTypes.length === 0 ||
        this.workItemFilterOptions.workItemTypes.includes(workItemType);
      const isValidState =
        this.workItemFilterOptions.workItemStates.length === 0 ||
        this.workItemFilterOptions.workItemStates.includes(workItemState);

      return isValidType && isValidState;
    });

    return filteredChanges;
  }

  /**
   * Handle services.json comparison for a release pair.
   *
   * This method:
   *  - Resolves the services.json artifact location and fetch strategy (tag/branch).
   *  - Iterates all declared services, resolving an effective release range per service.
   *  - Collects commits for each service path using getCommitRangeChanges.
   *  - Deduplicates commits per service and across services for the same repo+commitId.
   *  - Applies reverse-order tag-based release grouping to annotate commits with
   *    `releaseVersion` and `releaseRunDate`.
   *  - Aggregates results into `serviceGroupsByKey`.
   */
  private async handleServiceJsonFile(
    fromRelease,
    toRelease,
    projectId,
    provider,
    attributionOnly: boolean = false
  ): Promise<boolean> {
    const vars = toRelease?.variables;
    const servicesJsonVar = vars?.servicesJson?.value?.trim();
    const servicesJsonVersion = vars?.servicesJsonVersion?.value?.trim();
    const servicesJsonVersionType = vars?.servicesJsonVersionType?.value?.trim();
    const tagPrefix = vars?.servicesJsonTagPrefix?.value?.trim() || '';
    const fb = this.resolveBranch(fromRelease);
    const tb = this.resolveBranch(toRelease);
    const fromBranchVal = fb.v;
    const toBranchVal = tb.v;

    if (!servicesJsonVar || !servicesJsonVersion || !servicesJsonVersionType) {
      logger.warn(`missing variables in release`);
      logger.warn(`required: servicesJson.value, servicesJsonVersion.value, servicesJsonVersionType.value`);
      return false;
    }

    const useTagMode = tagPrefix.length > 0;
    const useBranchMode = !useTagMode && !!fromBranchVal && !!toBranchVal;
    const hasBranches = !!fromBranchVal && !!toBranchVal;
    if (!useTagMode && !useBranchMode) {
      logger.warn(`services.json: Neither Tag nor Branch parameters available; skipping for this pair`);
      return false;
    }

    const {
      servicesJsonFileGitPath,
      servicesJsonFileName,
      servicesJsonFileGitRepoName,
      servicesJsonFileGitRepoApiUrl,
    } = this.parseServicesJsonLocation(servicesJsonVar);

    let fromBranch = fromBranchVal;
    let toBranch = toBranchVal;
    // ARGOS releases

    /* We search for servicesJsonTagPrefix in variables. it will be "ARGOS-"
    Then we build tag name, from tag prefix + ARGOS release number. it will be ARGOS-1.0.64 for example
    we use tag name for current release and for previous release we run this from tag to tag

    MEWP Releases
    We search for branch in variables.
    We use branch name for current release and for previous release we run this from branch to branch
    */

    const modeChosen = useTagMode ? 'Tag' : 'Branch';

    // fetch the services.json file with fallbacks if the configured version/type is invalid
    // primary attempt uses the configured servicesJsonVersion/servicesJsonVersionType from the target release
    const candidates: Array<{ version: string; versionType: string; why: string }> = [];
    if (servicesJsonVersion && servicesJsonVersionType) {
      candidates.push({
        version: servicesJsonVersion,
        versionType: servicesJsonVersionType,
        why: 'configured variables',
      });
    }
    // Prefer target branch if available
    if (toBranchVal) {
      candidates.push({ version: toBranchVal, versionType: 'Branch', why: 'target release branch' });
    }
    // Fallback to source branch if available
    if (fromBranchVal) {
      candidates.push({ version: fromBranchVal, versionType: 'Branch', why: 'source release branch' });
    }
    // Generic fallbacks
    candidates.push({ version: 'main', versionType: 'Branch', why: 'default main branch' });
    candidates.push({ version: 'master', versionType: 'Branch', why: 'legacy master branch' });

    let serviceJsonFile: any = null;
    for (const cand of candidates) {
      serviceJsonFile = await this.fetchAndParseServicesJson(
        provider,
        projectId,
        servicesJsonFileGitRepoName,
        servicesJsonFileName,
        cand.version,
        cand.versionType,
        servicesJsonFileGitRepoApiUrl,
        servicesJsonFileGitPath
      );
      if (serviceJsonFile) break;
    }
    if (!serviceJsonFile) return false;

    const repoTagsCache = new Map<string, RepoTagInfo[]>();
    const services = serviceJsonFile.services;
    const seenCommitsAcrossServices = new Set<string>();

    for (const service of services) {
      const serviceName = service?.serviceName || '<unknown>';
      logger.info('================================================================');
      logger.info(
        `services.json: BEGIN service='${serviceName}' (mode=${modeChosen}) for releases ${fromRelease?.name} -> ${toRelease?.name}`
      );

      try {
        let repoName = service.serviceLocation.gitRepoUrl.split('/').pop();
        repoName = repoName?.replace(/%20/g, ' ');
        let serviceGitRepoApiUrl = service.serviceLocation.gitRepoUrl.replace(
          '/_git/',
          '/_apis/git/repositories/'
        );

        // For aggregation (attributionOnly=false) in TAG mode, choose an effective per-service
        // from/to release based on which tagged releases actually exist in this repo within
        // the selected global range.
        let effectiveFromRelease = fromRelease;
        let effectiveToRelease = toRelease;

        if (!attributionOnly && useTagMode && this.releasesSeq && this.releasesSeq.length > 0) {
          const globalFromIdx = this.releasesSeq.findIndex((r: any) => r?.id === fromRelease?.id);
          const globalToIdx = this.releasesSeq.findIndex((r: any) => r?.id === toRelease?.id);

          if (globalFromIdx >= 0 && globalToIdx >= globalFromIdx) {
            try {
              if (!repoTagsCache.has(repoName)) {
                const tagList: any = await provider.GetRepoTagsWithCommits(serviceGitRepoApiUrl);
                const arr: Array<{ name: string; commitId: string; date?: string }> = Array.isArray(tagList)
                  ? tagList
                  : [];
                repoTagsCache.set(repoName, arr);
              }
              const rawTags = repoTagsCache.get(repoName) || [];
              const suffixes = new Set<string>();
              rawTags.forEach((t: any) => {
                if (!t?.name) return;
                const full = String(t.name);
                if (tagPrefix && !full.startsWith(tagPrefix)) return;
                const raw = full.substring(tagPrefix.length).trim();
                if (raw) suffixes.add(raw);
              });

              let minIdx = Number.POSITIVE_INFINITY;
              let maxIdx = -1;
              suffixes.forEach((suffix) => {
                const idx = this.releaseIndexByName.has(suffix) ? this.releaseIndexByName.get(suffix)! : -1;
                if (idx < 0) return;
                if (idx < globalFromIdx || idx > globalToIdx) return;
                if (idx < minIdx) minIdx = idx;
                if (idx > maxIdx) maxIdx = idx;
              });

              if (minIdx !== Number.POSITIVE_INFINITY && maxIdx >= 0) {
                effectiveFromRelease = this.releasesSeq[minIdx];
                effectiveToRelease = this.releasesSeq[maxIdx];
              } else {
                // leave effectiveFromRelease/effectiveToRelease as the original global range and
                // allow resolveServiceRange to apply its existing tag/branch fallback logic
              }
            } catch (e: any) {
              logger.debug(
                `services.json: failed to resolve effective release range for service ${serviceName}, repo ${repoName}: ${e.message}`
              );
            }
          }
        }

        const range = await this.resolveServiceRange(
          provider,
          service,
          tagPrefix,
          effectiveFromRelease,
          effectiveToRelease,
          fromBranch,
          toBranch,
          hasBranches,
          serviceGitRepoApiUrl,
          repoName,
          useTagMode,
          useBranchMode,
          fromBranchVal,
          toBranchVal
        );

        if (!range) {
          logger.info(
            `services.json: service='${serviceName}' SKIPPED (no comparable version range could be resolved)`
          );
          continue;
        }

        const { fromVersion, toVersion, fromVersionType, toVersionType } = range;

        const rawPathInGit = (service.serviceLocation?.pathInGit ?? '').trim();
        let itemPaths = rawPathInGit
          .split(',')
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0);
        if (itemPaths.length === 0) {
          itemPaths = [''];
        }
        const artifactKey = `Service|${repoName}|${service.serviceName}`;
        const aggLinked: any[] = [];
        const aggUnlinked: any[] = [];
        for (const itemPath of itemPaths) {
          const pathResult = await this.collectPathChangesForService(
            provider,
            projectId,
            service.serviceName,
            repoName,
            serviceGitRepoApiUrl,
            itemPath,
            fromVersion,
            fromVersionType,
            toVersion,
            toVersionType
          );
          if (!pathResult) continue;
          aggLinked.push(...pathResult.allExtendedCommits);
          aggUnlinked.push(...pathResult.commitsWithNoRelations);
        }

        // Build a per-service tag lookup (commitId -> tag info) for tag-based attribution
        const tagsByCommitId = await this.buildServiceTagMap(
          provider,
          serviceGitRepoApiUrl,
          repoName,
          tagPrefix,
          repoTagsCache
        );

        // Log raw counts before deduplication
        logger.info(
          `services.json: service='${serviceName}' RAW counts before dedup: aggLinked=${aggLinked.length}, aggUnlinked=${aggUnlinked.length}`
        );

        // Deduplicate per service across all its paths, keeping latest-pair commits
        const uniqueLinked = this.takeNewCommits(artifactKey, aggLinked);
        const uniqueUnlinked = this.takeNewCommits(artifactKey, aggUnlinked);

        logger.info(
          `services.json: service='${serviceName}' after takeNewCommits: uniqueLinked=${uniqueLinked.length}, uniqueUnlinked=${uniqueUnlinked.length}`
        );

        // Further dedupe across services for the same repo+commitId to avoid
        // showing the same commit under multiple services (e.g. shared files like README.md).
        const crossLinked = this.filterServiceCommitsAcrossServices(
          uniqueLinked,
          repoName,
          seenCommitsAcrossServices,
          serviceName
        );
        const crossUnlinked = this.filterServiceCommitsAcrossServices(
          uniqueUnlinked,
          repoName,
          seenCommitsAcrossServices,
          serviceName
        );

        logger.info(
          `services.json: service='${serviceName}' after filterServiceCommitsAcrossServices: crossLinked=${crossLinked.length}, crossUnlinked=${crossUnlinked.length}`
        );

        // Annotate with release metadata using per-service reverse tag grouping.
        this.applyServiceReleaseGrouping(
          crossLinked,
          crossUnlinked,
          tagPrefix,
          fromRelease,
          toRelease,
          effectiveFromRelease,
          effectiveToRelease,
          tagsByCommitId
        );

        let grp = this.serviceGroupsByKey.get(artifactKey);
        if (!grp) {
          grp = {
            artifact: { name: `Service ${service.serviceName}` },
            changes: [],
            nonLinkedCommits: [],
          } as any;
          this.serviceGroupsByKey.set(artifactKey, grp);
        }
        grp.changes.push(...crossLinked);
        grp.nonLinkedCommits.push(...crossUnlinked);

        const linkedCount = crossLinked.length;
        const unlinkedCount = crossUnlinked.length;
        const versionsSet = new Set<string>();
        for (const c of [...crossLinked, ...crossUnlinked]) {
          const v = (c as any).releaseVersion;
          if (v) {
            versionsSet.add(String(v));
          }
        }
        const versionsList = Array.from(versionsSet);

        logger.info(
          `services.json: service='${serviceName}' PASSED; repo='${repoName}', linkedCommits=${linkedCount}, unlinkedCommits=${unlinkedCount}, releaseVersions=[${versionsList.join(
            ', '
          )}]`
        );
      } catch (e: any) {
        logger.error(
          `services.json: service='${serviceName}' FAILED during processing: ${e?.message || e}`,
          e
        );
        throw e;
      } finally {
        logger.info(`services.json: END service='${serviceName}'`);
        logger.info('================================================================');
      }
    }

    // Clear caches to avoid stale data in subsequent runs
    this.pathExistenceCache.clear();

    return true;
  }

  /**
   * Filters a list of service commits so that a given repository+commitId+workItemId
   * combination is only attributed to the first service that encounters it in the current
   * services.json processing pass.
   *
   * For linked commits (with a workItem), the key includes the work item ID so that
   * multiple work items on the same commit are preserved as separate rows.
   * For unlinked commits (no workItem), the key is just repoName|commitId.
   *
   * Commits that do not expose a stable commit identifier are passed through
   * unchanged.
   *
   * @param commits             Deduplicated commits for a single service.
   * @param repoName            Git repository name used as part of the global key.
   * @param seenRepoCommitIds   Global set of `${repoName}|${commitId}` or `${repoName}|${commitId}|wi:${workItemId}` combinations.
   * @returns                   A filtered array containing only commits unique to this service.
   */
  private filterServiceCommitsAcrossServices(
    commits: any[],
    repoName: string,
    seenRepoCommitIds: Set<string>,
    serviceName?: string
  ): any[] {
    if (!Array.isArray(commits) || commits.length === 0) {
      logger.debug(
        `filterServiceCommitsAcrossServices: repo='${repoName}', service='${
          serviceName || 'N/A'
        }' - input is empty`
      );
      return [];
    }

    logger.debug(
      `filterServiceCommitsAcrossServices: repo='${repoName}', service='${
        serviceName || 'N/A'
      }' - processing ${commits.length} commits, seenKeys=${seenRepoCommitIds.size}`
    );

    const result: any[] = [];
    let keptCount = 0;
    let droppedCount = 0;
    const droppedKeys: string[] = [];

    for (const c of commits) {
      const commitId: string | undefined = c?.commit?.commitId || c?.commitId || c?.id;
      if (!commitId) {
        result.push(c);
        keptCount++;
        continue;
      }
      // For linked commits (with a workItem), include the work item ID in the key
      // so that multiple work items on the same commit are preserved as separate rows.
      const wid = c?.workItem?.id;
      const key = typeof wid === 'number' ? `${repoName}|${commitId}|wi:${wid}` : `${repoName}|${commitId}`;
      if (seenRepoCommitIds.has(key)) {
        droppedCount++;
        if (droppedKeys.length < 10) {
          droppedKeys.push(key);
        }
        continue;
      }
      seenRepoCommitIds.add(key);
      result.push(c);
      keptCount++;
    }

    logger.debug(
      `filterServiceCommitsAcrossServices: repo='${repoName}', service='${
        serviceName || 'N/A'
      }' - kept=${keptCount}, dropped=${droppedCount}${
        droppedKeys.length > 0
          ? `, droppedSample=[${droppedKeys.slice(0, 5).join(', ')}${droppedKeys.length > 5 ? '...' : ''}]`
          : ''
      }`
    );

    return result;
  }

  /**
   * Builds a per-repository map from commitId to tag metadata for services.json
   * processing. Tags are fetched once per repository and cached in
   * repoTagsCache. Only tags whose names start with the configured prefix are
   * included in the resulting map.
   *
   * @param gitProvider    Git data provider used to query repository tags.
   * @param repoApiUrl     Repository API URL (/_apis/git/repositories/<name>).
   * @param repoName       Logical repository name used as cache key.
   * @param tagPrefix      Tag name prefix configured for services.json (may be empty).
   * @param repoTagsCache  Shared cache of raw tag lists per repository.
   * @returns              A map from commitId to `{ name, date }` for matching tags, or undefined on error.
   */
  private async buildServiceTagMap(
    gitProvider: any,
    repoApiUrl: string,
    repoName: string,
    tagPrefix: string,
    repoTagsCache: Map<string, RepoTagInfo[]>
  ): Promise<Map<string, TagCommitMeta> | undefined> {
    try {
      if (!repoTagsCache.has(repoName)) {
        const tagList: any = await gitProvider.GetRepoTagsWithCommits(repoApiUrl);
        const arr: RepoTagInfo[] = Array.isArray(tagList) ? tagList : [];
        repoTagsCache.set(repoName, arr);
      }
      const rawTags = repoTagsCache.get(repoName) || [];
      const tagMap = new Map<string, TagCommitMeta>();
      rawTags.forEach((t: any) => {
        if (!t?.name || !t?.commitId) {
          return;
        }
        if (tagPrefix && !String(t.name).startsWith(tagPrefix)) {
          return;
        }
        tagMap.set(String(t.commitId), { name: String(t.name), date: t.date });
      });
      return tagMap;
    } catch {
      return undefined;
    }
  }

  /**
   * Applies the reverse-order tag-based release grouping algorithm to the
   * linked and unlinked commit lists of a single service. Commits are sorted
   * newest-first and then assigned to release buckets derived from tag
   * suffixes, constrained by the effective release window. The method mutates
   * the provided commit objects in-place by setting `releaseVersion` and
   * `releaseRunDate`.
   *
   * @param linkedCommits        Linked commits (with work items) for the service.
   * @param unlinkedCommits      Unlinked commits for the service.
   * @param tagPrefix            Tag prefix used for services.json (may be empty).
   * @param fromRelease          Global from release of the comparison window.
   * @param toRelease            Global to release of the comparison window.
   * @param effectiveFromRelease Per-service effective from release (may equal fromRelease).
   * @param effectiveToRelease   Per-service effective to release (may equal toRelease).
   * @param tagMap               Optional map from commitId to tag metadata filtered by prefix.
   */
  private applyServiceReleaseGrouping(
    linkedCommits: any[],
    unlinkedCommits: any[],
    tagPrefix: string,
    fromRelease: any,
    toRelease: any,
    effectiveFromRelease: any,
    effectiveToRelease: any,
    tagMap?: Map<string, TagCommitMeta>
  ): void {
    const releaseVersionDefault = effectiveToRelease?.name ?? toRelease?.name;
    const releaseRunDateDefault =
      effectiveToRelease?.createdOn ||
      effectiveToRelease?.created ||
      effectiveToRelease?.createdDate ||
      toRelease?.createdOn ||
      toRelease?.created ||
      toRelease?.createdDate;

    const fromReleaseName = effectiveFromRelease?.name ?? fromRelease?.name;
    const toReleaseName = effectiveToRelease?.name ?? toRelease?.name;
    const fromIdx = fromReleaseName ? this.releaseIndexByName.get(fromReleaseName) : undefined;
    const toIdx = toReleaseName ? this.releaseIndexByName.get(toReleaseName) : undefined;

    const bucketsByRelease = new Map<string, ServiceBucket>();

    const allForGrouping: ServiceGroupingEntry[] = [
      ...linkedCommits.map((c) => ({ kind: 'linked' as const, item: c })),
      ...unlinkedCommits.map((c) => ({ kind: 'unlinked' as const, item: c })),
    ];

    allForGrouping.sort((a, b) => {
      const da =
        a.kind === 'linked'
          ? new Date(a.item?.commit?.committer?.date || a.item?.commitDate || 0).getTime()
          : new Date(a.item?.commitDate || a.item?.commit?.committer?.date || 0).getTime();
      const db =
        b.kind === 'linked'
          ? new Date(b.item?.commit?.committer?.date || b.item?.commitDate || 0).getTime()
          : new Date(b.item?.commitDate || b.item?.commit?.committer?.date || 0).getTime();
      return db - da; // newest first
    });

    let currentBucketName: string | undefined;
    let currentBucketIdx: number | undefined;

    const isIdxInWindow = (idx: number | undefined): boolean => {
      if (typeof idx !== 'number') return false;
      if (typeof fromIdx === 'number' && idx < fromIdx) return false;
      if (typeof toIdx === 'number' && idx > toIdx) return false;
      return true;
    };

    for (const entry of allForGrouping) {
      const obj = entry.item;
      const commitId: string | undefined = obj?.commit?.commitId || obj?.commitId || obj?.id;
      if (!commitId) continue;

      let tagReleaseName: string | undefined;
      let tagReleaseIdx: number | undefined;
      let tagReleaseDate: any;

      if (tagMap && tagMap.has(commitId)) {
        const tagInfo = tagMap.get(commitId)!;
        const raw = String(tagInfo.name).substring(tagPrefix.length).trim();
        const relMeta = this.releasesBySuffix.get(raw);
        if (relMeta) {
          tagReleaseName = relMeta.name;
          tagReleaseDate = relMeta.date ?? tagInfo.date;
        } else {
          tagReleaseName = raw;
          tagReleaseDate = tagInfo.date;
        }
        if (tagReleaseName && this.releaseIndexByName.has(tagReleaseName)) {
          tagReleaseIdx = this.releaseIndexByName.get(tagReleaseName)!;
        }
      }

      if (tagReleaseName && isIdxInWindow(tagReleaseIdx)) {
        if (
          typeof currentBucketIdx !== 'number' ||
          (typeof tagReleaseIdx === 'number' && tagReleaseIdx <= currentBucketIdx)
        ) {
          currentBucketName = tagReleaseName;
          currentBucketIdx = tagReleaseIdx;
          if (!bucketsByRelease.has(currentBucketName)) {
            bucketsByRelease.set(currentBucketName, {
              commitIds: new Set<string>(),
              runDate: tagReleaseDate,
            });
          } else {
            const bucket = bucketsByRelease.get(currentBucketName)!;
            if (!bucket.runDate && tagReleaseDate) {
              bucket.runDate = tagReleaseDate;
            }
          }
        }
      }

      if (!currentBucketName) {
        continue;
      }
      const bucket = bucketsByRelease.get(currentBucketName);
      if (!bucket) continue;
      bucket.commitIds.add(commitId);
    }

    const assignFromBuckets = (list: any[]) => {
      for (const c of list) {
        const id: string | undefined = c?.commit?.commitId || c?.commitId || c?.id;
        if (!id) {
          c.releaseVersion = releaseVersionDefault;
          c.releaseRunDate = releaseRunDateDefault;
          continue;
        }
        let chosenVersion: string | undefined;
        let chosenDate: any;
        for (const [relName, bucket] of bucketsByRelease.entries()) {
          if (bucket.commitIds.has(id)) {
            chosenVersion = relName;
            chosenDate = bucket.runDate;
            break;
          }
        }
        c.releaseVersion = chosenVersion || releaseVersionDefault;
        c.releaseRunDate = chosenDate || releaseRunDateDefault;
      }
    };

    assignFromBuckets(linkedCommits);
    assignFromBuckets(unlinkedCommits);
  }

  /**
   * Resolve the version range to compare for a specific service based on tag prefix or branch variables.
   * Supports fallback from Tag to Branch when tags are missing and branches are available.
   */
  private async resolveServiceRange(
    provider: any,
    service: any,
    tagPrefix: string,
    fromRelease: any,
    toRelease: any,
    fromBranch: string,
    toBranch: string,
    hasBranches: boolean,
    serviceGitRepoApiUrl: string,
    repoName: string,
    useTagMode: boolean,
    useBranchMode: boolean,
    fromBranchVal: string,
    toBranchVal: string
  ) {
    let fromVersion = '';
    let toVersion = '';
    let fromVersionType = '';
    let toVersionType = '';
    if (useTagMode) {
      const fromTag = `${tagPrefix}${fromRelease.name}`;
      const toTag = `${tagPrefix}${toRelease.name}`;
      logger.info(`Using TAG mode: ${fromTag} → ${toTag}`);
      const fromTagData = await provider.GetTag(serviceGitRepoApiUrl, fromTag);
      if (!fromTagData) {
        logger.warn(
          `Service ${service.serviceName}: Source tag '${fromTag}' does not exist in repository ${repoName}`
        );
        if (hasBranches) {
          logger.info(`Tag '${fromTag}' missing; falling back to BRANCH mode: ${fromBranch} → ${toBranch}`);
          const fromBranchData = await provider.GetBranch(serviceGitRepoApiUrl, fromBranch);
          if (!fromBranchData) {
            logger.warn(
              `Service ${service.serviceName}: Source branch '${fromBranch}' does not exist in repository ${repoName}`
            );
            return null;
          }
          const toBranchData = await provider.GetBranch(serviceGitRepoApiUrl, toBranch);
          if (!toBranchData) {
            logger.warn(
              `Service ${service.serviceName}: Target branch '${toBranch}' does not exist in repository ${repoName}`
            );
            return null;
          }
          fromVersion = fromBranch;
          toVersion = toBranch;
          fromVersionType = 'Branch';
          toVersionType = 'Branch';
          logger.debug(
            `Fallback resolved to BRANCH mode for ${service.serviceName}: from ${fromVersionType} '${fromVersion}' to ${toVersionType} '${toVersion}'`
          );
        } else {
          logger.debug(
            `No branches available for fallback on ${service.serviceName}: fromBranch='${fromBranchVal}', toBranch='${toBranchVal}'`
          );
          return null;
        }
      } else {
        const toTagData = await provider.GetTag(serviceGitRepoApiUrl, toTag);
        if (!toTagData) {
          logger.warn(
            `Service ${service.serviceName}: Target tag '${toTag}' does not exist in repository ${repoName}`
          );
          if (hasBranches) {
            logger.info(`Tag '${toTag}' missing; falling back to BRANCH mode: ${fromBranch} → ${toBranch}`);
            const fromBranchData = await provider.GetBranch(serviceGitRepoApiUrl, fromBranch);
            if (!fromBranchData || !fromBranchData.value || fromBranchData?.count == 0) {
              logger.warn(
                `Service ${service.serviceName}: Source branch '${fromBranch}' does not exist in repository ${repoName}`
              );
              return null;
            }
            const toBranchData = await provider.GetBranch(serviceGitRepoApiUrl, toBranch);
            if (!toBranchData || !toBranchData.value || toBranchData?.count == 0) {
              logger.warn(
                `Service ${service.serviceName}: Target branch '${toBranch}' does not exist in repository ${repoName}`
              );
              return null;
            }
            fromVersion = fromBranch;
            toVersion = toBranch;
            fromVersionType = 'Branch';
            toVersionType = 'Branch';
            logger.debug(
              `Fallback resolved to BRANCH mode for ${service.serviceName}: from ${fromVersionType} '${fromVersion}' to ${toVersionType} '${toVersion}'`
            );
          } else {
            logger.debug(
              `No branches available for fallback on ${service.serviceName}: fromBranch='${fromBranchVal}', toBranch='${toBranchVal}'`
            );
            return null;
          }
        } else {
          fromVersion = fromTag;
          toVersion = toTag;
          fromVersionType = 'Tag';
          toVersionType = 'Tag';
          logger.debug(
            `Resolved to TAG mode for ${service.serviceName}: from ${fromVersionType} '${fromVersion}' to ${toVersionType} '${toVersion}'`
          );
        }
      }
    } else if (useBranchMode) {
      logger.info(`Using BRANCH mode: ${fromBranch} → ${toBranch}`);
      const fromExists = await this.getCachedBranchExists(provider, serviceGitRepoApiUrl, fromBranch);
      if (!fromExists) {
        logger.warn(
          `Service ${service.serviceName}: Source branch '${fromBranch}' does not exist in repository ${repoName}`
        );
        return null;
      }
      const toExists = await this.getCachedBranchExists(provider, serviceGitRepoApiUrl, toBranch);
      if (!toExists) {
        logger.warn(
          `Service ${service.serviceName}: Target branch '${toBranch}' does not exist in repository ${repoName}`
        );
        return null;
      }
      fromVersion = fromBranch;
      toVersion = toBranch;
      fromVersionType = 'Branch';
      toVersionType = 'Branch';
      logger.debug(
        `Resolved to BRANCH mode for ${service.serviceName}: from ${fromVersionType} '${fromVersion}' to ${toVersionType} '${toVersion}'`
      );
    }
    return { fromVersion, toVersion, fromVersionType, toVersionType };
  }

  /**
   * For a single service path, verify existence at both endpoints and collect commit-range changes.
   * Respects caches for path existence and enforces the 500-changes cap via upstream guard.
   */
  private async collectPathChangesForService(
    provider: any,
    projectId: string,
    serviceName: string,
    repoName: string,
    serviceGitRepoApiUrl: string,
    itemPath: string,
    fromVersion: string,
    fromVersionType: string,
    toVersion: string,
    toVersionType: string
  ) {
    if (!itemPath) {
      logger.info(`Service ${serviceName}: Empty pathInGit treated as repo root; using repo-level diff`);
      const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
        provider,
        projectId,
        fromVersion,
        fromVersionType,
        toVersion,
        toVersionType,
        repoName,
        serviceGitRepoApiUrl,
        new Set<number>(),
        undefined,
        '',
        this.linkedWiOptions
      );
      this.isChangesReachedMaxSize(this.rangeType, allExtendedCommits?.length);
      return { allExtendedCommits, commitsWithNoRelations };
    }
    logger.debug(`Checking path '${itemPath}' exists in source ${fromVersionType} '${fromVersion}'`);
    const srcKey = `${serviceGitRepoApiUrl}|${itemPath}|${fromVersionType}|${fromVersion}`;
    let srcExists: boolean;
    if (this.pathExistenceCache.has(srcKey)) {
      srcExists = this.pathExistenceCache.get(srcKey)!;
    } else {
      srcExists = await provider.CheckIfItemExist(serviceGitRepoApiUrl, itemPath, {
        version: fromVersion,
        versionType: fromVersionType,
      });
      this.pathExistenceCache.set(srcKey, !!srcExists);
    }

    logger.debug(`Checking path '${itemPath}' exists in target ${toVersionType} '${toVersion}'`);
    const dstKey = `${serviceGitRepoApiUrl}|${itemPath}|${toVersionType}|${toVersion}`;
    let dstExists: boolean;
    if (this.pathExistenceCache.has(dstKey)) {
      dstExists = this.pathExistenceCache.get(dstKey)!;
    } else {
      dstExists = await provider.CheckIfItemExist(serviceGitRepoApiUrl, itemPath, {
        version: toVersion,
        versionType: toVersionType,
      });
      this.pathExistenceCache.set(dstKey, !!dstExists);
    }

    if (!srcExists && !dstExists) {
      logger.warn(
        `Service ${serviceName}: Path '${itemPath}' does not exist in either source ${fromVersionType.toLowerCase()} '${fromVersion}' or target ${toVersionType.toLowerCase()} '${toVersion}'; skipping path`
      );
      return null;
    }

    // Decide how to query commits. When the path exists in the source, we can safely
    // use itemPath in the commitsbatch request. When it only exists in the target,
    // Azure DevOps will return 404 if we specify itemPath against a source version
    // that never contained it. In that case, fall back to a repo-level diff and rely
    // on the service-level scoping (pathInGit) to keep things reasonably tight.
    let effectiveItemPath = itemPath;
    if (!srcExists && dstExists) {
      logger.warn(
        `Service ${serviceName}: Path '${itemPath}' does not exist in source ${fromVersionType.toLowerCase()} '${fromVersion}' but exists in target ${toVersionType.toLowerCase()} '${toVersion}'; treating as newly added path in range and falling back to repo-level diff (no itemPath) to avoid 404`
      );
      effectiveItemPath = '';
    } else if (srcExists && !dstExists) {
      logger.warn(
        `Service ${serviceName}: Path '${itemPath}' exists in source ${fromVersionType.toLowerCase()} '${fromVersion}' but not in target ${toVersionType.toLowerCase()} '${toVersion}'; treating as deleted path in range`
      );
    }

    logger.info(
      `Service ${serviceName}: Getting commit changes for path '${itemPath}' from ${fromVersionType.toLowerCase()} '${fromVersion}' to ${toVersionType.toLowerCase()} '${toVersion}'`
    );
    const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
      provider,
      projectId,
      fromVersion,
      fromVersionType,
      toVersion,
      toVersionType,
      repoName,
      serviceGitRepoApiUrl,
      new Set<number>(),
      undefined,
      effectiveItemPath,
      this.linkedWiOptions
    );
    this.isChangesReachedMaxSize(this.rangeType, allExtendedCommits?.length);
    return { allExtendedCommits, commitsWithNoRelations };
  }

  private resolveBranch(rel: any) {
    let src = 'none';
    let v = rel?.environments?.[0]?.variables?.branch?.value;
    if (v) src = 'env';
    if (!v && rel?.variables?.branch?.value) {
      v = rel.variables.branch.value;
      src = 'release.branch';
    }
    if (!v && rel?.variables?.Branch?.value) {
      v = rel.variables.Branch.value;
      src = 'release.Branch';
    }
    v = (v || '').trim();
    return { v, src };
  }

  /**
   * Resolve the services.json file location components from the configured URL.
   */
  private parseServicesJsonLocation(servicesJsonVar: string) {
    const servicesJsonFileGitPath = servicesJsonVar;
    let servicesJsonFileName: any = servicesJsonFileGitPath.split(`?`).pop()?.replace('path=', '');
    const servicesJsonFileGitRepo = servicesJsonFileGitPath.split(`?`)[0];
    const servicesJsonFileGitRepoName = servicesJsonFileGitRepo.split('/').pop();
    const servicesJsonFileGitRepoApiUrl = servicesJsonFileGitRepo.replace(
      '/_git/',
      '/_apis/git/repositories/'
    );
    return {
      servicesJsonFileGitPath,
      servicesJsonFileName,
      servicesJsonFileGitRepoName,
      servicesJsonFileGitRepoApiUrl,
    };
  }

  /**
   * Cached branch existence lookup to avoid repeated provider calls.
   */
  private async getCachedBranchExists(provider: any, repoApiUrl: string, branch: string): Promise<boolean> {
    const key = `${repoApiUrl}|branch|${branch}`;
    if (this.branchExistenceCache.has(key)) return this.branchExistenceCache.get(key)!;
    const data = await provider.GetBranch(repoApiUrl, branch);
    const exists = !!(data && data.value && data.count !== 0);
    this.branchExistenceCache.set(key, exists);
    return exists;
  }

  /**
   * Cached JFrog CI URL resolution for a given build name/version.
   */
  private async getCachedJfrogCiUrl(
    provider: any,
    jFrogUrl: string,
    buildName: string,
    buildVersion: string
  ): Promise<string> {
    const key = `${jFrogUrl}|${buildName}|${buildVersion}`;
    if (this.jfrogCiUrlCache.has(key)) return this.jfrogCiUrlCache.get(key)!;
    const url = await provider.getCiDataFromJfrog(jFrogUrl, buildName, buildVersion);
    this.jfrogCiUrlCache.set(key, url || '');
    return url || '';
  }

  private async fetchAndParseServicesJson(
    provider: any,
    projectId: string,
    repoName: string,
    fileName: string,
    version: string,
    versionType: string,
    repoApiUrl: string,
    originalPath: string
  ) {
    let serviceJsonFile: any = await provider.GetFileFromGitRepo(
      projectId,
      repoName,
      fileName,
      { version, versionType },
      repoApiUrl
    );
    if (!serviceJsonFile) {
      logger.warn(`file ${originalPath} could not be fetched`);
      return null;
    }
    return JSON.parse(serviceJsonFile);
  }

  /**
   * Build a hydrated list of releases for the provided history items.
   */
  private async buildReleasesList(releasesBetween: any[], pipelinesDataProvider: any): Promise<any[]> {
    const out: any[] = [];
    for (const r of releasesBetween) {
      if (r?.artifacts) out.push(r);
      else {
        const full = await pipelinesDataProvider.GetReleaseByReleaseId(this.teamProject, Number(r.id));
        if (full) out.push(full);
      }
    }
    return out;
  }

  /**
   * Construct artifact presence timeline across releases.
   * Keyed by stable artifact key (type|defId|alias).
   */
  private buildArtifactPresence(releasesList: any[]): Map<string, Array<{ idx: number; art: any }>> {
    const artifactPresence = new Map<string, Array<{ idx: number; art: any }>>();
    const allowedTypes = new Set(['Build', 'Git', 'Artifactory', 'JFrogArtifactory']);
    for (let idx = 0; idx < releasesList.length; idx++) {
      const rel = releasesList[idx];
      for (const a of rel.artifacts || []) {
        if (!allowedTypes.has(a.type)) continue;
        if (
          a.type === 'Build' &&
          !['TfsGit', 'TfsVersionControl'].includes(a?.definitionReference?.['repository.provider']?.id)
        )
          continue;
        const k = this.buildArtifactKey(a);
        if (!artifactPresence.has(k)) artifactPresence.set(k, []);
        artifactPresence.get(k)!.push({ idx, art: a });
      }
    }
    return artifactPresence;
  }

  /**
   * Find releases that are eligible for services.json processing (vars present).
   */
  private getServicesEligibleIndices(releasesList: any[]): number[] {
    const indices: number[] = [];
    for (let idx = 0; idx < releasesList.length; idx++) {
      const rel = releasesList[idx];
      const vars = rel?.variables;
      const sj = vars?.servicesJson?.value?.trim();
      const sjv = vars?.servicesJsonVersion?.value?.trim();
      const sjvt = vars?.servicesJsonVersionType?.value?.trim();
      if (sj && sjv && sjvt) indices.push(idx);
    }
    return indices;
  }

  /**
   * Get stable artifact display name per type/alias.
   */
  private getArtifactDisplayName(type: string, toArt: any): string {
    const defName = toArt?.definitionReference?.['definition']?.name || toArt?.alias || '';
    if (type === 'Git') return `Repository ${defName}`;
    if (type === 'Build') return `Pipeline ${defName}`;
    if (type === 'Artifactory' || type === 'JFrogArtifactory') return `Artifactory ${defName}`;
    return defName;
  }

  /**
   * Process a single presence gap by running a long-hop compare fromIdx -> toIdx for the given artifact key.
   */
  private async processGap(
    fromIdx: number,
    toIdx: number,
    key: string,
    releasesList: any[],
    artifactGroupsByKey: Map<string, any>,
    artifactWiSets: Map<string, Set<number>>,
    gitDataProvider: any,
    jfrogDataProvider: any,
    _pipelinesDataProvider?: any
  ): Promise<void> {
    const fromRelease = releasesList[fromIdx];
    const toRelease = releasesList[toIdx];
    const releaseVersion = toRelease?.name;
    const releaseRunDate = toRelease?.createdOn || toRelease?.created || toRelease?.createdDate;
    const fromArtifactMap = new Map<string, any>();
    for (const fa of fromRelease.artifacts) fromArtifactMap.set(this.buildArtifactKey(fa), fa);
    const toRelArt = (toRelease.artifacts || []).find((a: any) => this.buildArtifactKey(a) === key);
    if (!toRelArt) return;
    const artifactType = toRelArt.type;
    const artifactAlias = toRelArt.alias;
    let fromRelArt = fromArtifactMap.get(key);
    if (!fromRelArt) return;
    if (fromRelArt.definitionReference['version'].name === toRelArt.definitionReference['version'].name)
      return;
    const artifactDisplayName = this.getArtifactDisplayName(artifactType, toRelArt);
    try {
      if (artifactType === 'Git') {
        await this.processGitArtifactPair(
          key,
          artifactAlias,
          artifactDisplayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          releaseVersion,
          releaseRunDate,
          gitDataProvider,
          artifactGroupsByKey,
          artifactWiSets
        );
      } else if (artifactType === 'Build') {
        await this.processBuildArtifactPair(
          key,
          artifactAlias,
          artifactDisplayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          releaseVersion,
          releaseRunDate,
          gitDataProvider,
          artifactGroupsByKey
        );
      } else if (artifactType === 'Artifactory' || artifactType === 'JFrogArtifactory') {
        await this.processArtifactoryArtifactPair(
          key,
          artifactAlias,
          artifactDisplayName,
          fromRelease,
          toRelease,
          fromRelArt,
          toRelArt,
          releaseVersion,
          releaseRunDate,
          jfrogDataProvider,
          artifactGroupsByKey
        );
      }
    } catch (err: any) {
      logger.error(
        `Gap compare failed for ${artifactAlias} (${artifactType}) ${fromRelease.id}->${toRelease.id}: ${err.message}`
      );
    }
  }

  private async processGitArtifactPair(
    key: string,
    artifactAlias: string,
    artifactDisplayName: string,
    fromRelease: any,
    toRelease: any,
    fromRelArt: any,
    toRelArt: any,
    releaseVersion: any,
    releaseRunDate: any,
    gitDataProvider: any,
    artifactGroupsByKey: Map<string, any>,
    artifactWiSets: Map<string, Set<number>>
  ): Promise<void> {
    if (!artifactWiSets.has(key)) artifactWiSets.set(key, new Set<number>());
    let gitRepo = await gitDataProvider.GetGitRepoFromRepoId(toRelArt.definitionReference['definition'].id);
    const gitCacheKey = `${key}|Git|${gitRepo.url}|${fromRelArt.definitionReference['version'].id}->${toRelArt.definitionReference['version'].id}`;
    let allExtendedCommits: any[] = [];
    let commitsWithNoRelations: any[] = [];
    const gitCached = this.pairCompareCache.get(gitCacheKey);
    if (gitCached) {
      allExtendedCommits = gitCached.linked;
      commitsWithNoRelations = gitCached.unlinked;
    } else {
      const res = await this.getCommitRangeChanges(
        gitDataProvider,
        this.teamProject,
        fromRelArt.definitionReference['version'].id,
        'commit',
        toRelArt.definitionReference['version'].id,
        'commit',
        toRelArt.definitionReference['definition'].name,
        gitRepo.url,
        artifactWiSets.get(key)!,
        undefined,
        undefined,
        this.linkedWiOptions
      );
      allExtendedCommits = res.allExtendedCommits || [];
      commitsWithNoRelations = res.commitsWithNoRelations || [];
      this.pairCompareCache.set(gitCacheKey, {
        linked: allExtendedCommits,
        unlinked: commitsWithNoRelations,
      });
    }

    const uniqueLinked = this.takeNewCommits(
      key,
      allExtendedCommits.map((c) => ({ ...c }))
    );
    const uniqueUnlinked = this.takeNewCommits(
      key,
      commitsWithNoRelations.map((c) => ({ ...c }))
    );

    logger.debug(
      `Release compare [Git ${artifactAlias}]: linked=${uniqueLinked.length} (filtered from ${allExtendedCommits.length}), unlinked=${uniqueUnlinked.length} (filtered from ${commitsWithNoRelations.length})`
    );

    uniqueLinked.forEach((c: any) => {
      c.releaseVersion = releaseVersion;
      c.releaseRunDate = releaseRunDate;
    });
    uniqueUnlinked.forEach((c: any) => {
      c.releaseVersion = releaseVersion;
      c.releaseRunDate = releaseRunDate;
    });

    if (!artifactGroupsByKey.has(key)) {
      artifactGroupsByKey.set(key, {
        artifact: { name: artifactDisplayName },
        changes: [],
        nonLinkedCommits: [],
      });
    }
    const agg = artifactGroupsByKey.get(key)!;
    agg.changes.push(...uniqueLinked);
    agg.nonLinkedCommits.push(...uniqueUnlinked);
    logger.info(
      `Aggregated add [Git ${artifactAlias}] ${fromRelease.id}->${toRelease.id} key=${key}: +linked=${uniqueLinked.length}, +unlinked=${uniqueUnlinked.length} | totals linked=${agg.changes.length}, unlinked=${agg.nonLinkedCommits.length}`
    );
  }

  private async processBuildArtifactPair(
    key: string,
    artifactAlias: string,
    artifactDisplayName: string,
    fromRelease: any,
    toRelease: any,
    fromRelArt: any,
    toRelArt: any,
    releaseVersion: any,
    releaseRunDate: any,
    gitDataProvider: any,
    artifactGroupsByKey: Map<string, any>
  ): Promise<void> {
    const buildFactory = new ChangeDataFactory(
      this.teamProject,
      '',
      fromRelArt.definitionReference['version'].id,
      toRelArt.definitionReference['version'].id,
      'pipeline',
      null,
      '',
      true,
      this.includePullRequestWorkItems,
      '',
      false,
      false,
      this.dgDataProviderAzureDevOps,
      this.attachmentsBucketName,
      this.minioEndPoint,
      this.minioAccessKey,
      this.minioSecretKey,
      this.PAT,
      `Pipeline ${toRelArt.definitionReference['definition'].name}`,
      undefined,
      new Set<number>(),
      this.linkedWiOptions,
      this.requestedByBuild,
      this.includeUnlinkedCommits,
      this.formattingSettings,
      this.workItemFilterOptions,
      this.compareMode,
      this.replaceTaskWithParent
    );
    const buildCacheKey = `${key}|Build|${this.teamProject}|${fromRelArt.definitionReference['version'].id}->${toRelArt.definitionReference['version'].id}`;
    let mergedChanges: any[] = [];
    let mergedNoLink: any[] = [];
    const buildCached = this.pairCompareCache.get(buildCacheKey);
    if (buildCached) {
      mergedChanges = buildCached.linked;
      mergedNoLink = buildCached.unlinked;
    } else {
      await buildFactory.fetchChangesData();
      const rawData = buildFactory.getRawData();
      rawData.forEach((a: any) => {
        (a.changes || []).forEach((c: any) => mergedChanges.push(c));
        (a.nonLinkedCommits || []).forEach((c: any) => mergedNoLink.push(c));
      });
      this.pairCompareCache.set(buildCacheKey, { linked: mergedChanges, unlinked: mergedNoLink });
    }
    const uniqueMergedChanges = this.takeNewCommits(
      key,
      mergedChanges.map((c) => ({ ...c, releaseVersion, releaseRunDate }))
    );
    const uniqueMergedNoLink = this.takeNewCommits(
      key,
      mergedNoLink.map((c) => ({ ...c, releaseVersion, releaseRunDate }))
    );
    if (!artifactGroupsByKey.has(key)) {
      artifactGroupsByKey.set(key, {
        artifact: { name: artifactDisplayName },
        changes: [],
        nonLinkedCommits: [],
      });
    }
    const agg = artifactGroupsByKey.get(key)!;
    agg.changes.push(...uniqueMergedChanges);
    agg.nonLinkedCommits.push(...uniqueMergedNoLink);
    logger.info(
      `Aggregated add [Build ${artifactAlias}] ${fromRelease.id}->${toRelease.id} key=${key}: +linked=${uniqueMergedChanges.length}, +unlinked=${uniqueMergedNoLink.length} | totals linked=${agg.changes.length}, unlinked=${agg.nonLinkedCommits.length}`
    );
  }

  private async processArtifactoryArtifactPair(
    key: string,
    artifactAlias: string,
    artifactDisplayName: string,
    fromRelease: any,
    toRelease: any,
    fromRelArt: any,
    toRelArt: any,
    releaseVersion: any,
    releaseRunDate: any,
    jfrogDataProvider: any,
    artifactGroupsByKey: Map<string, any>
  ): Promise<void> {
    let jFrogUrl = await jfrogDataProvider.getServiceConnectionUrlByConnectionId(
      this.teamProject,
      fromRelArt.definitionReference.connection.id
    );
    const toBuildName = toRelArt.definitionReference['definition'].name;
    const toBuildVersion = toRelArt.definitionReference['version'].name;
    const fromBuildName = fromRelArt.definitionReference['definition'].name;
    const fromBuildVersion = fromRelArt.definitionReference['version'].name;
    let toCiUrl: string = '';
    let fromCiUrl: string = '';
    try {
      toCiUrl = await this.getCachedJfrogCiUrl(jfrogDataProvider, jFrogUrl, toBuildName, toBuildVersion);
      if (toCiUrl === '') return;
    } catch (e: any) {
      return;
    }
    try {
      fromCiUrl = await this.getCachedJfrogCiUrl(
        jfrogDataProvider,
        jFrogUrl,
        fromBuildName,
        fromBuildVersion
      );
      if (fromCiUrl === '') return;
    } catch (e: any) {
      return;
    }
    const toParts = toCiUrl.split('/');
    const fromParts = fromCiUrl.split('/');
    const toSuffix = toParts.pop() as string;
    const fromSuffix = fromParts.pop() as string;
    const toTeamProject = toParts.pop();
    let jfrogUploader = '';
    if (toSuffix.startsWith('_release?releaseId=')) jfrogUploader = 'release';
    else if (toSuffix.startsWith('_build?buildId=')) jfrogUploader = 'pipeline';
    else return;
    let toBuildId = toSuffix.split('=').pop();
    let fromBuildId = fromSuffix.split('=').pop();
    if (Number(fromBuildId) > Number(toBuildId)) [fromBuildId, toBuildId] = [toBuildId, fromBuildId];
    const artFactory = new ChangeDataFactory(
      toTeamProject,
      '',
      fromBuildId,
      toBuildId,
      jfrogUploader,
      null,
      '',
      true,
      this.includePullRequestWorkItems,
      '',
      false,
      false,
      this.dgDataProviderAzureDevOps,
      this.attachmentsBucketName,
      this.minioEndPoint,
      this.minioAccessKey,
      this.minioSecretKey,
      this.PAT,
      `Artifactory ${toBuildName}`,
      undefined,
      new Set<number>(),
      this.linkedWiOptions,
      this.requestedByBuild,
      this.includeUnlinkedCommits,
      this.formattingSettings,
      this.workItemFilterOptions,
      this.compareMode,
      this.replaceTaskWithParent
    );
    const jfrogCacheKey = `${key}|JFrog|${toTeamProject}|${fromBuildId}->${toBuildId}`;
    let mergedChanges: any[] = [];
    let mergedNoLink: any[] = [];
    const jfrogCached = this.pairCompareCache.get(jfrogCacheKey);
    if (jfrogCached) {
      mergedChanges = jfrogCached.linked;
      mergedNoLink = jfrogCached.unlinked;
    } else {
      await artFactory.fetchChangesData();
      const rawData = artFactory.getRawData();
      rawData.forEach((a: any) => {
        (a.changes || []).forEach((c: any) => mergedChanges.push(c));
        (a.nonLinkedCommits || []).forEach((c: any) => mergedNoLink.push(c));
      });
      this.pairCompareCache.set(jfrogCacheKey, { linked: mergedChanges, unlinked: mergedNoLink });
    }
    if (!artifactGroupsByKey.has(key)) {
      artifactGroupsByKey.set(key, {
        artifact: { name: artifactDisplayName },
        changes: [],
        nonLinkedCommits: [],
      });
    }
    const agg = artifactGroupsByKey.get(key)!;
    const clonedLinked = mergedChanges.map((c) => ({ ...c }));
    const clonedNoLink = mergedNoLink.map((c) => ({ ...c }));
    clonedLinked.forEach((c: any) => {
      c.releaseVersion = releaseVersion;
      c.releaseRunDate = releaseRunDate;
    });
    clonedNoLink.forEach((c: any) => {
      c.releaseVersion = releaseVersion;
      c.releaseRunDate = releaseRunDate;
    });
    agg.changes.push(...this.takeNewCommits(key, clonedLinked));
    agg.nonLinkedCommits.push(...this.takeNewCommits(key, clonedNoLink));
    logger.info(
      `Aggregated add [Artifactory ${artifactAlias}] ${fromRelease.id}->${toRelease.id} key=${key}: +linked=${clonedLinked.length}, +unlinked=${clonedNoLink.length} | totals linked=${agg.changes.length}, unlinked=${agg.nonLinkedCommits.length}`
    );
  }

  /**
   * Process services gaps by invoking handleServiceJsonFile for non-adjacent eligible releases.
   */
  private async processServicesGaps(
    servicesPresentIdx: number[],
    releasesList: any[],
    gitDataProvider: any
  ): Promise<void> {
    if (servicesPresentIdx.length > 1) {
      for (let s = 0; s < servicesPresentIdx.length - 1; s++) {
        const a = servicesPresentIdx[s];
        const b = servicesPresentIdx[s + 1];
        if (b > a + 1) {
          await this.handleServiceJsonFile(
            releasesList[a],
            releasesList[b],
            this.teamProject,
            gitDataProvider
          );
        }
      }
    }
  }

  /**
   * Coerces common "collection" shapes into an array.
   *
   * This project historically used `Set` in a few provider methods; some call sites still treat the result
   * as `T[] | Set<T>`. This helper keeps the call sites readable and makes iteration predictable.
   */
  private coerceIterableToArray<T>(value: unknown): T[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as T[];
    if (value instanceof Set) return Array.from(value.values()) as T[];
    const maybeIterable: any = value as any;
    if (typeof maybeIterable?.[Symbol.iterator] === 'function') {
      try {
        return Array.from(maybeIterable as Iterable<T>);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Builds a stable match key for a pipeline resource entry.
   *
   * We match resource pipelines by `(teamProject, definitionId)` rather than alias, because alias can change
   * while the underlying pipeline definition remains the same.
   */
  private buildResourcePipelineKey(pipelineResource: any): string {
    const teamProject = String(pipelineResource?.teamProject || '').trim();
    const definitionId = Number(pipelineResource?.definitionId);
    if (!teamProject || !Number.isFinite(definitionId)) return '';
    return `${teamProject}|${definitionId}`;
  }

  /**
   * Build a stable artifact key string from an Azure DevOps release artifact definition.
   * Format: `${type}|${definitionId}|${alias}` when available; otherwise `${type}|${alias or definitionName}`.
   */
  private buildArtifactKey(art: any): string {
    const type = art?.type || '';
    const alias = art?.alias || '';
    // Azure DevOps release artifact structure may expose definition under ['definition'] or .definition
    const def = art?.definitionReference?.['definition'] || art?.definitionReference?.definition;
    const defId = def?.id;
    const defName = def?.name;
    if ((type === 'Git' || type === 'Build') && defId) {
      return `${type}|${defId}|${alias}`;
    }
    // Fallback: type with alias or definition name
    return `${type}|${alias || defName || ''}`;
  }

  /**
   * Deduplicate commits for an artifact key. Only the first time a commit ID is seen is it kept.
   * Used to ensure earliest-introduction semantics across edges and long-hop fallbacks.
   */
  private takeNewCommits(artifactKey: string, arr: any[]): any[] {
    if (!Array.isArray(arr) || arr.length === 0) {
      logger.debug(`takeNewCommits: artifactKey='${artifactKey}' - input is empty`);
      return [];
    }

    const initialSetSize = this.includedCommitIdsByArtifact.get(artifactKey)?.size || 0;
    let set = this.includedCommitIdsByArtifact.get(artifactKey);
    if (!set) {
      set = new Set<string>();
      this.includedCommitIdsByArtifact.set(artifactKey, set);
    }

    logger.debug(
      `takeNewCommits: artifactKey='${artifactKey}' - processing ${arr.length} items, existingKeys=${initialSetSize}`
    );

    const out: any[] = [];
    let keptCount = 0;
    let droppedCount = 0;
    const droppedIds: string[] = [];

    for (const item of arr) {
      let id: string | undefined = undefined;
      // For linked changes (with a workItem), dedupe by commitId+workItem.id so that
      // multiple work items on the same commit are preserved as separate rows.
      // For unlinked commits (no workItem), dedupe by commitId only.
      if (item?.commit?.commitId) {
        const wid = item?.workItem?.id;
        id = typeof wid === 'number' ? `${item.commit.commitId}|wi:${wid}` : item.commit.commitId;
      } else if (item?.commitId) {
        id = item.commitId;
      }
      if (id) {
        if (set.has(id)) {
          droppedCount++;
          if (droppedIds.length < 10) {
            droppedIds.push(id);
          }
          continue;
        }
        set.add(id);
      }
      out.push(item);
      keptCount++;
    }

    logger.debug(
      `takeNewCommits: artifactKey='${artifactKey}' - kept=${keptCount}, dropped=${droppedCount}${
        droppedIds.length > 0
          ? `, droppedSample=[${droppedIds.slice(0, 5).join(', ')}${droppedIds.length > 5 ? '...' : ''}]`
          : ''
      }`
    );

    return out;
  }
  //#endregion
}
