import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import logger from '../services/logger';
import ChangesTableDataSkinAdapter from '../adapters/ChangesTableDataSkinAdapter';
import GitDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/GitDataProvider';
import PipelinesDataProvider from '@elisra-devops/docgen-data-provider/bin/modules/PipelinesDataProvider';
import { Artifact, GitObject } from '../models/contentControl';
import { ArtifactChangesGroup } from '../models/changeModels';
import ReleaseComponentDataSkinAdapter from '../adapters/ReleaseComponentsDataSkinAdapter';
import SystemOverviewDataSkinAdapter from '../adapters/SystemOverviewDataSkinAdapter';
import BugsTableSkinAdapter from '../adapters/BugsTableSkinAdpater';
import NonAssociatedCommitsDataSkinAdapter from '../adapters/NonAssociatedCommitsDataSkinAdapter';

export default class ChangeDataFactory {
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
  attachmentWikiUrl: string = '';
  includeChangeDescription: boolean;
  includeCommittedBy: boolean;
  tocTitle?: string;
  queriesRequest: any;
  includedWorkItemByIdSet: Set<number>;
  private includedCommitIdsByArtifact: Map<string, Set<string>> = new Map();
  linkedWiOptions: any;
  requestedByBuild: boolean;
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
  private pairCompareCache: Map<string, { linked: any[]; unlinked: any[] }> = new Map();
  constructor(
    teamProjectName,
    repoId: string,
    from: string | number,
    to: string | number,
    rangeType: string,
    linkTypeFilterArray: string[],
    branchName: string,
    includePullRequests: boolean,
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
    workItemFilterOptions: any = undefined
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
  } //constructor

  async fetchSvdData() {
    try {
      //1. get release component adoptedData release-components-content-control
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();
      let recentReleaseArtifactInfo = await pipelinesDataProvider.GetRecentReleaseArtifactInfo(
        this.teamProject
      );
      if (recentReleaseArtifactInfo?.length > 0) {
        this.adoptedChangeData.push({
          contentControl: 'release-components-content-control',
          data: await this.jsonSkinDataAdapter('release-components', recentReleaseArtifactInfo),
          skin: 'release-components-skin',
        });
      }

      //2. Get system-overview (by query) need to be displayed in hierarchy system-overview-content-control
      const queryResultData = await this.fetchQueryResults();
      if (queryResultData.systemOverviewQueryData?.length > 0) {
        this.adoptedChangeData.push({
          contentControl: 'system-overview-content-control',
          data: await this.jsonSkinDataAdapter('system-overview', queryResultData),
          skin: 'system-overview-skin',
        });
      }

      //3. get fetch changes data required-states-and-modes
      await this.fetchChangesData();
      this.includedWorkItemByIdSet.clear();
      logger.info(
        `fetchSvdData: After fetchChangesData, rawChangesArray has ${this.rawChangesArray.length} artifacts`
      );
      if (this.rawChangesArray.length > 0) {
        logger.info(`fetchSvdData: Calling jsonSkinDataAdapter for 'changes'`);
        this.adoptedChangeData.push({
          contentControl: 'required-states-and-modes',
          data: await this.jsonSkinDataAdapter('changes', this.rawChangesArray),
          skin: 'required-states-and-modes-skin',
        });
      } else {
        logger.warn(`fetchSvdData: rawChangesArray is empty, skipping changes adaptation`);
      }
      //4.get installation data (via file) installation-instructions-content-control
      if (this.attachmentWikiUrl) {
        this.adoptedChangeData.push({
          contentControl: 'system-installation-content-control',
          data: await this.jsonSkinDataAdapter('installation-instructions', []), //TBD need to add a check box to either include new file or not
          skin: 'installation-instructions-skin',
        });
      }
      //5. get possible errors or change quest by query possible-problems-known-errors-content-control
      if (queryResultData.knownBugsQueryData) {
        this.adoptedChangeData.push({
          contentControl: 'possible-problems-known-errors-content-control',
          data: await this.jsonSkinDataAdapter(
            'possible-problems-known-errors',
            queryResultData.knownBugsQueryData
          ),
          skin: 'possible-problems-known-errors-skin',
        });
      }

      //6. get non associated commits data non-associated-commits-content-control (as appendix)
      if (this.rawChangesArray.length > 0) {
        const adoptedData = await this.jsonSkinDataAdapter('non-associated-commits', this.rawChangesArray);
        if (adoptedData.length > 0) {
          this.adoptedChangeData.push({
            contentControl: 'non-associated-commits-content-control',
            data: adoptedData,
            skin: 'non-associated-commits-skin',
          });
        }
      }
    } catch (error: any) {
      logger.error(`could not fetch svd data:
        ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch query results for both system overview and known bug query
   * @returns
   */
  async fetchQueryResults(): Promise<any> {
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

  /*fetches Change table data and adopts it to json skin format */
  async fetchChangesData() {
    try {
      logger.info(
        `fetchChangesData: rangeType=${this.rangeType}, includeUnlinkedCommits=${this.includeUnlinkedCommits}`
      );
      let focusedArtifact;
      let artifactChanges: any[] = [];
      let artifactChangesNoLink: any[] = [];
      let origin;
      let gitDataProvider = await this.dgDataProviderAzureDevOps.getGitDataProvider();
      let jfrogDataProvider = await this.dgDataProviderAzureDevOps.getJfrogDataProvider();
      let pipelinesDataProvider = await this.dgDataProviderAzureDevOps.getPipelinesDataProvider();

      const handlers: { [key: string]: Function } = {
        Build: this.handleBuildArtifact.bind(this),
        Git: this.handleGitArtifact.bind(this),
        Artifactory: this.handleArtifactoryArtifact.bind(this),
        JFrogArtifactory: this.handleArtifactoryArtifact.bind(this),
      };
      if (this.repoId) {
        focusedArtifact = await gitDataProvider.GetGitRepoFromRepoId(this.repoId);
      }
      switch (this.rangeType) {
        case 'commitSha':
          {
            let commitsInCommitRange = await gitDataProvider.GetCommitsInCommitRange(
              this.teamProject,
              this.repoId,
              String(this.to),
              String(this.from)
            );
            const { commitChangesArray, commitsWithNoRelations } =
              await gitDataProvider.GetItemsInCommitRange(
                this.teamProject,
                this.repoId,
                commitsInCommitRange,
                this.linkedWiOptions,
                this.includeUnlinkedCommits
              );

            this.isChangesReachedMaxSize(this.rangeType, commitChangesArray?.length);
            this.rawChangesArray.push({
              artifact: focusedArtifact,
              changes: commitChangesArray,
              nonLinkedCommits: commitsWithNoRelations,
            });
          }
          break;
        case 'range':
          {
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
          break;
        case 'date':
          {
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
              const { commitChangesArray, commitsWithNoRelations } =
                await gitDataProvider.GetItemsInCommitRange(
                  this.teamProject,
                  this.repoId,
                  commitsInDateRange,
                  this.linkedWiOptions,
                  this.includeUnlinkedCommits
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
          break;

        case 'pipeline':
          {
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
          break;
        case 'release':
          {
            const fromRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
              this.teamProject,
              Number(this.from)
            );
            const toRelease = await pipelinesDataProvider.GetReleaseByReleaseId(
              this.teamProject,
              Number(this.to)
            );

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

            let releasesBetween: any[] = [];
            if (releaseDefinitionId) {
              try {
                const history =
                  typeof (pipelinesDataProvider as any).GetAllReleaseHistory === 'function'
                    ? await (pipelinesDataProvider as any).GetAllReleaseHistory(
                        this.teamProject,
                        String(releaseDefinitionId)
                      )
                    : await pipelinesDataProvider.GetReleaseHistory(
                        this.teamProject,
                        String(releaseDefinitionId)
                      );
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
                logger.warn(
                  `GetReleaseHistory failed: ${e.message}. Will compare only provided from/to releases.`
                );
              }
            }

            // Fallback if history is unavailable or empty
            if (releasesBetween.length === 0) {
              releasesBetween = [fromRelease, toRelease].sort(
                (a: any, b: any) => Number(a.id) - Number(b.id)
              );
            }

            const artifactGroupsByKey = new Map<string, ArtifactChangesGroup>();
            const artifactWiSets = new Map<string, Set<number>>();

            // Helper to get stable artifact display name per type/alias
            const getArtifactDisplayName = (type: string, toArt: any) => {
              const defName = toArt?.definitionReference?.['definition']?.name || toArt?.alias || '';
              if (type === 'Git') return `Repository ${defName}`;
              if (type === 'Build') return `Pipeline ${defName}`;
              if (type === 'Artifactory' || type === 'JFrogArtifactory') return `Artifactory ${defName}`;
              return defName;
            };

            // Iterate all pairs (i -> j) with latest target first, and within same target iterate from newest source down
            for (let j = releasesBetween.length - 1; j >= 1; j--) {
              for (let i = j - 1; i >= 0; i--) {
                try {
                  const fromRelMeta = releasesBetween[i];
                  const toRelMeta = releasesBetween[j];

                  const fromRelease = fromRelMeta?.artifacts
                    ? fromRelMeta
                    : await pipelinesDataProvider.GetReleaseByReleaseId(
                        this.teamProject,
                        Number(fromRelMeta.id)
                      );
                  const toRelease = toRelMeta?.artifacts
                    ? toRelMeta
                    : await pipelinesDataProvider.GetReleaseByReleaseId(
                        this.teamProject,
                        Number(toRelMeta.id)
                      );

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
                      t === 'Git'
                        ? 0
                        : t === 'Artifactory' || t === 'JFrogArtifactory'
                        ? 1
                        : t === 'Build'
                        ? 2
                        : 3;
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
                      fromRelArt.definitionReference['version'].name ===
                      toRelArt.definitionReference['version'].name
                    ) {
                      continue;
                    }

                    const artifactDisplayName = getArtifactDisplayName(artifactType, toRelArt);

                    try {
                      if (artifactType === 'Git') {
                        if (!artifactWiSets.has(key)) artifactWiSets.set(key, new Set<number>());
                        let gitRepo = await gitDataProvider.GetGitRepoFromRepoId(
                          toRelArt.definitionReference['definition'].id
                        );
                        logger.debug(
                          `Release compare [Git ${artifactAlias}]: includeUnlinkedCommits=${this.includeUnlinkedCommits}`
                        );
                        const gitCacheKey =
                          `${key}|Git|${gitRepo.url}|${fromRelArt.definitionReference['version'].id}->${toRelArt.definitionReference['version'].id}`;
                        let allExtendedCommits: any[];
                        let commitsWithNoRelations: any[];
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

                        // Clone before annotation to avoid mutating cached objects
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

                        // annotate with release metadata
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
                      } else if (artifactType === 'Build') {
                        logger.debug(
                          `Release compare [Build ${artifactAlias}]: includeUnlinkedCommits=${this.includeUnlinkedCommits}`
                        );
                        const buildFactory = new ChangeDataFactory(
                          this.teamProject,
                          '',
                          fromRelArt.definitionReference['version'].id,
                          toRelArt.definitionReference['version'].id,
                          'pipeline',
                          null,
                          '',
                          true,
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
                          this.workItemFilterOptions
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
                            (a.changes || []).forEach((c: any) => {
                              mergedChanges.push(c);
                            });
                            (a.nonLinkedCommits || []).forEach((c: any) => {
                              mergedNoLink.push(c);
                            });
                          });
                          this.pairCompareCache.set(buildCacheKey, {
                            linked: mergedChanges,
                            unlinked: mergedNoLink,
                          });
                        }
                        logger.debug(
                          `Release compare [Build ${artifactAlias}]: merged linked=${mergedChanges.length}, merged unlinked=${mergedNoLink.length}`
                        );
                        // Deduplicate by commitId keeping latest pair results; clone before annotation
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
                          this.workItemFilterOptions
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

                  // Handle services.json directly for this pair
                  await this.handleServiceJsonFile(fromRelease, toRelease, this.teamProject, gitDataProvider);
                } catch (e: any) {
                  logger.error(`Failed comparing pair ${i}->${j}: ${e.message}`);
                  logger.debug(`Pair error stack: ${e.stack}`);
                  continue;
                }
              } // end inner from-loop for this target
            } // end all-pairs loop

            // Persist aggregated results
            this.rawChangesArray.push(...Array.from(artifactGroupsByKey.values()));
            Array.from(artifactGroupsByKey.values()).forEach((grp) =>
              logger.info(
                `Aggregated group: ${grp.artifact?.name} -> linked=${grp.changes?.length || 0}, unlinked=${
                  grp.nonLinkedCommits?.length || 0
                }`
              )
            );
          }
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
    from: string | number
  ): Promise<{ artifactChanges: any[]; artifactChangesNoLink: any[] }> {
    const artifactChanges = [];
    const artifactChangesNoLink = [];
    try {
      let targetBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, Number(to));

      //if requested by user and target build is not succeeded throw error
      if (!this.requestedByBuild && targetBuild.result !== 'succeeded') {
        throw new Error(`The selected ${to} build has not been succeeded`);
      }
      //if requested by build and target build is not succeeded throw error
      else {
        if (
          targetBuild.result === 'canceled' ||
          targetBuild.result === 'failed' ||
          targetBuild.result === 'none'
        ) {
          throw new Error(`The selected ${to} build has ${targetBuild.result}`);
        }
      }

      let targetPipelineId = targetBuild.definition.id;
      let sourceBuild = await pipelinesDataProvider.getPipelineBuildByBuildId(teamProject, Number(from));

      if (!sourceBuild) {
        sourceBuild = await pipelinesDataProvider.findPreviousPipeline(
          teamProject,
          targetBuild.id,
          Number(to),
          targetBuild,
          true
        );
        if (!sourceBuild) {
          logger.warn(`Could not find a valid pipeline before build #${to}`);
          return { artifactChanges: [], artifactChangesNoLink: [] };
        }
      }

      let sourcePipelineId = sourceBuild.definition.id;

      let sourcePipelineRun = await pipelinesDataProvider.getPipelineRunDetails(
        teamProject,
        sourcePipelineId,
        Number(from)
      );

      let targetPipelineRun = await pipelinesDataProvider.getPipelineRunDetails(
        teamProject,
        targetPipelineId,
        Number(to)
      );
      const sourcePipelineResourcePipelines =
        await pipelinesDataProvider.getPipelineResourcePipelinesFromObject(sourcePipelineRun);
      const targetPipelineResourcePipelines =
        await pipelinesDataProvider.getPipelineResourcePipelinesFromObject(targetPipelineRun);

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

      for (const targetPipelineRepo of targetResourceRepositories) {
        let gitRepoUrl = this.removeUserFromGitRepoUrl(targetPipelineRepo.url);
        let gitRepoVersion = targetPipelineRepo.repoSha1;
        let gitRepoName = targetPipelineRepo.repoName;
        let toCommit = gitRepoVersion;
        logger.debug(`Repository ${gitRepoUrl} version ${gitRepoVersion.slice(0, 7)}`);
        for (const sourcePipeline of sourceResourceRepositories) {
          let fromGitRepoUrl = this.removeUserFromGitRepoUrl(sourcePipeline.url);
          let fromGitRepoVersion = sourcePipeline.repoSha1;
          let fromGitRepoName = sourcePipeline.repoName;

          if (fromGitRepoName !== gitRepoName) {
            continue;
          }

          logger.debug(`Previous repository ${fromGitRepoUrl} version ${fromGitRepoVersion.slice(0, 7)}`);
          if (fromGitRepoVersion === gitRepoVersion) {
            logger.debug(`Same repository version ${fromGitRepoVersion} nothing to compare`);
            break;
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
            allExtendedCommits.forEach((commit, idx) => {
              logger.debug(
                `  Commit ${idx + 1}: workItem=${
                  commit.workItem?.id
                }, commit=${commit.commit?.commitId?.substring(0, 7)}`
              );
            });
          }

          artifactChanges.push(...allExtendedCommits);
          artifactChangesNoLink.push(...commitsWithNoRelations);
        }
      }

      for (const targetPipeline_pipeline of targetPipelineResourcePipelines) {
        let targetResourcePipelineRunId = targetPipeline_pipeline.buildId;
        let targetResourcePipelineDefinitionId = targetPipeline_pipeline.definitionId;
        let targetResourcePipelineTeamProject = targetPipeline_pipeline.teamProject;
        let targetResourceBuildNumber = targetPipeline_pipeline.buildNumber;
        let targetResourcePipelineName = targetPipeline_pipeline.name;
        let targetResourcePipelineProvider = targetPipeline_pipeline.provider;
        if (targetResourcePipelineProvider !== 'TfsGit') {
          logger.debug(
            `resource pipeline ${targetResourcePipelineProvider} is not based on azure devops git, skipping`
          );
          continue;
        }

        logger.debug(`Processing resource pipeline ${targetResourceBuildNumber}`);
        logger.debug(`Locate the pipeline ${targetResourcePipelineName} ${targetResourceBuildNumber}`);

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

        for (const sourcePipeline_pipeline of sourcePipelineResourcePipelines) {
          let sourceResourcePipelineRunId = sourcePipeline_pipeline.buildId;
          let sourceResourcePipelineDefinitionId = sourcePipeline_pipeline.definitionId;
          let sourceResourcePipelineTeamProject = sourcePipeline_pipeline.teamProject;
          let sourceResourceBuildNumber = sourcePipeline_pipeline.buildNumber;
          let sourceResourcePipelineName = sourcePipeline_pipeline.name;
          let sourceResourcePipelineProvider = sourcePipeline_pipeline.provider;

          if (sourceResourcePipelineProvider !== 'TfsGit') {
            logger.debug(
              `resource pipeline ${sourceResourcePipelineProvider} is not based on azure devops git, skipping`
            );
            continue;
          }

          if (sourceResourcePipelineName !== targetResourcePipelineName) {
            logger.debug(
              `resource pipeline ${sourceResourcePipelineName} is not the same as ${targetResourcePipelineName}, skipping`
            );
            continue;
          }

          if (sourceResourcePipelineRunId === targetResourcePipelineRunId) {
            logger.debug(
              `resource pipeline ${sourceResourcePipelineName} ${sourceResourceBuildNumber} is the same as ${targetResourcePipelineName} ${targetResourceBuildNumber}, skipping`
            );
            break;
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
              sourceResourcePipelineRunId
            );

          if (reportPartsForRepo) {
            logger.debug(`reportPartsForRepo: ${JSON.stringify(reportPartsForRepo)}`);
            logger.debug(`reportPartsForRepoNoLink: ${JSON.stringify(reportPartsForRepoNoLink)}`);
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

  private removeUserFromGitRepoUrl(gitRepoUrl: string) {
    if (!gitRepoUrl.startsWith('https://')) {
      return gitRepoUrl;
    }
    if (!gitRepoUrl.includes('@')) {
      return gitRepoUrl;
    }
    return 'https://' + gitRepoUrl.split('@').pop();
  }

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

      logger.debug(`fetching commits for ${gitRepoName} from ${fromVersion} to ${toVersion}`);
      let extendedCommits = await gitDataProvider.GetCommitBatch(
        gitApisUrl,
        { version: fromVersion, versionType: fromVersionType },
        { version: toVersion, versionType: toVersionType },
        specificItemPath
      );

      logger.debug(`GetCommitBatch returned ${extendedCommits?.length || 0} commits`);

      if (extendedCommits?.length > 0) {
        const { commitChangesArray, commitsWithNoRelations: unrelatedCommits } =
          await gitDataProvider.getItemsForPipelineRange(
            teamProject,
            extendedCommits,
            {
              repoName: gitRepoName,
              gitSubModuleName: gitSubModuleName,
              url: gitApisUrl,
            },
            includedWorkItemByIdSet,
            linkedWiOptions,
            this.includeUnlinkedCommits
          );
        allExtendedCommits.push(...commitChangesArray);
        commitsWithNoRelations.push(...unrelatedCommits);

        const { commitsWithRelatedWi, commitsWithNoRelations: commitsWithNoRelationsSubmodule } =
          await this.parseSubModules(
            gitDataProvider,
            teamProject,
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
      }

      return { allExtendedCommits, commitsWithNoRelations };
    } catch (error: any) {
      logger.error(`Cannot get commits for commit range ${gitRepoName} - ${error.message}`);
      throw error;
    }
  }

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

  private async handleBuildArtifact(
    fromArtifact: Artifact,
    toArtifact: Artifact,
    teamProject: string,
    provider?: any
  ) {
    const pipelineTitle = `Pipeline ${fromArtifact.definitionReference['definition'].name}`;
    const buildChangeFactory = new ChangeDataFactory(
      teamProject,
      '',
      fromArtifact.definitionReference['version'].id,
      toArtifact.definitionReference['version'].id,
      'pipeline',
      null,
      '',
      true,
      '',
      false,
      false,
      this.dgDataProviderAzureDevOps,
      this.attachmentsBucketName,
      this.minioEndPoint,
      this.minioAccessKey,
      this.minioSecretKey,
      this.PAT,
      pipelineTitle,
      undefined,
      this.includedWorkItemByIdSet,
      this.linkedWiOptions,
      this.requestedByBuild,
      this.includeUnlinkedCommits,
      this.formattingSettings,
      this.workItemFilterOptions
    );
    await buildChangeFactory.fetchChangesData();
    const rawData = buildChangeFactory.getRawData();
    this.rawChangesArray.push(...rawData);
  }
  private async handleGitArtifact(
    fromArtifact: Artifact,
    toArtifact: Artifact,
    teamProject: string,
    provider?: any
  ) {
    let gitTitle = `Repository ${toArtifact.definitionReference['definition'].name}`;
    let gitRepo = await provider.GetGitRepoFromRepoId(toArtifact.definitionReference['definition'].id);

    const { allExtendedCommits, commitsWithNoRelations } = await this.getCommitRangeChanges(
      provider,
      teamProject,
      fromArtifact.definitionReference['version'].id,
      'commit',
      toArtifact.definitionReference['version'].id,
      'commit',
      toArtifact.definitionReference['definition'].name,
      gitRepo.url,
      this.includedWorkItemByIdSet,
      undefined,
      undefined,
      this.linkedWiOptions
    );
    this.isChangesReachedMaxSize(this.rangeType, allExtendedCommits?.length);
    this.rawChangesArray.push({
      artifact: { name: gitTitle || '' },
      changes: [...allExtendedCommits],
      nonLinkedCommits: [...commitsWithNoRelations],
    });
  }

  private async handleArtifactoryArtifact(
    fromArtifact: Artifact,
    toArtifact: Artifact,
    teamProject: string,
    provider?: any
  ) {
    logger.debug('---------------Handling Artifactory artifact-----------------');
    // Extract common logic for JFrog/Artifactory here
    let jFrogUrl = await provider.getServiceConnectionUrlByConnectionId(
      teamProject,
      fromArtifact.definitionReference.connection.id
    );

    // Extract build names/versions
    const fromBuildName = fromArtifact.definitionReference['definition'].name;
    const fromBuildVersion = fromArtifact.definitionReference['version'].name;
    const toBuildName = toArtifact.definitionReference['definition'].name;
    const toBuildVersion = toArtifact.definitionReference['version'].name;

    logger.info(`Fetch CI data from JFrog: ${jFrogUrl}`);

    let toCiUrl: string;
    let fromCiUrl: string;

    try {
      logger.debug(`Fetching CI URL for TO artifact: ${toBuildName} version ${toBuildVersion}`);
      toCiUrl = await provider.getCiDataFromJfrog(jFrogUrl, toBuildName, toBuildVersion);
      if (toCiUrl === '') {
        logger.warn(`Cannot find CI URL for TO artifact ${toBuildName} version ${toBuildVersion}`);
        return;
      }
      logger.debug(`TO CI URL: ${toCiUrl}`);
    } catch (error: any) {
      logger.error(
        `Failed to fetch CI URL for TO artifact ${toBuildName} version ${toBuildVersion}: ${error.message}`
      );
      return;
    }

    try {
      logger.debug(`Fetching CI URL for FROM artifact: ${fromBuildName} version ${fromBuildVersion}`);
      fromCiUrl = await provider.getCiDataFromJfrog(jFrogUrl, fromBuildName, fromBuildVersion);
      if (fromCiUrl === '') {
        logger.warn(`Cannot find CI URL for FROM artifact ${fromBuildName} version ${fromBuildVersion}`);
        return;
      }
      logger.debug(`FROM CI URL: ${fromCiUrl}`);
    } catch (error: any) {
      logger.error(
        `Failed to fetch CI URL for FROM artifact ${fromBuildName} version ${fromBuildVersion}: ${error.message}`
      );
      return;
    }

    // Determine if CI or Release
    const toUrlParts = toCiUrl.split('/');
    const fromUrlParts = fromCiUrl.split('/');
    const toUrlSuffix = toUrlParts.pop(); // gets either _release?releaseId={id} or _build?buildId={id}
    const fromUrlSuffix = fromUrlParts.pop(); // gets either _release?releaseId={id} or _build?buildId={id}

    // Extract project info first (needed for both scenarios)
    const toTeamProject = toUrlParts.pop();

    let jfrogUploader = '';
    if (toUrlSuffix.startsWith('_release?releaseId=')) {
      jfrogUploader = 'release';
    } else if (toUrlSuffix.startsWith('_build?buildId=')) {
      jfrogUploader = 'pipeline';
    } else {
      logger.warn(`Unsupported URL suffix: ${toUrlSuffix}`);
      return; // Unsupported suffix
    }
    let toBuildId = toUrlSuffix.split('=').pop();
    let fromBuildId = fromUrlSuffix.split('=').pop();

    logger.debug(`Initial build IDs: from ${fromBuildId}, to ${toBuildId}`);

    // Check if build IDs are in wrong order (from > to means backwards)
    // This can happen when release versions don't match chronological order
    if (Number(fromBuildId) > Number(toBuildId)) {
      logger.warn(`Build IDs are backwards! Swapping: from ${fromBuildId} ↔ to ${toBuildId}`);
      [fromBuildId, toBuildId] = [toBuildId, fromBuildId]; // Swap them
      logger.debug(`After swap: from build ${fromBuildId}, to build ${toBuildId}`);
    } else {
      logger.debug(`Build IDs are in correct order: from ${fromBuildId} → to ${toBuildId}`);
    }

    const tocTitle = `Artifactory ${toBuildName} ${toBuildVersion}`;
    try {
      const buildChangeFactory = new ChangeDataFactory(
        toTeamProject,
        '',
        fromBuildId, // 3rd param = from (older build 58516)
        toBuildId, // 4th param = to (newer build 58518)
        jfrogUploader,
        null,
        '',
        true,
        '',
        false,
        false,
        this.dgDataProviderAzureDevOps,
        this.attachmentsBucketName,
        this.minioEndPoint,
        this.minioAccessKey,
        this.minioSecretKey,
        this.PAT,
        tocTitle,
        undefined,
        this.includedWorkItemByIdSet,
        this.linkedWiOptions,
        this.requestedByBuild,
        this.includeUnlinkedCommits,
        this.formattingSettings,
        this.workItemFilterOptions
      );

      await buildChangeFactory.fetchChangesData();
      const rawData = buildChangeFactory.getRawData();

      // Log artifact names and work item IDs
      logger.info(`handleArtifactoryArtifact: Received ${rawData.length} artifacts from nested factory`);
      rawData.forEach((item) => {
        const workItemIds =
          item.changes?.map((change: any) => change.workItem?.id).filter((id: any) => id !== undefined) || [];
        logger.debug(
          `  Artifact: "${item.artifact?.name || 'N/A'}" | Changes: ${
            item.changes?.length || 0
          } | Work Item IDs: [${workItemIds.join(', ')}]`
        );
      });

      this.rawChangesArray.push(...rawData);
      logger.info(
        `handleArtifactoryArtifact: After push, parent rawChangesArray has ${this.rawChangesArray.length} total artifacts`
      );
    } catch (error: any) {
      logger.error(`could not handle ${tocTitle}: ${error.message}`);
      logger.debug(`Error stack: ${error.stack}`);
      // Don't throw - allow other artifacts to be processed
      // The artifact will simply not be included in the final output
    }
  }

  private async handleServiceJsonFile(fromRelease, toRelease, projectId, provider): Promise<boolean> {
    logger.debug('---------------Handling service json file-----------------');
    const vars = toRelease?.variables;
    const servicesJsonVar = vars?.servicesJson?.value?.trim();
    const servicesJsonVersion = vars?.servicesJsonVersion?.value?.trim();
    const servicesJsonVersionType = vars?.servicesJsonVersionType?.value?.trim();
    const tagPrefix = vars?.servicesJsonTagPrefix?.value?.trim() || '';
    const fb = this.resolveBranch(fromRelease);
    const tb = this.resolveBranch(toRelease);
    const fromBranchVal = fb.v;
    const toBranchVal = tb.v;
    logger.debug(
      `services.json: branch sources resolved: from=${fb.src} ('${fromBranchVal}'), to=${tb.src} ('${toBranchVal}')`
    );

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
    logger.debug(
      `services.json: repo=${servicesJsonFileGitRepoName}, path=${servicesJsonFileName}, version=${servicesJsonVersion}, versionType=${servicesJsonVersionType}, mode=${modeChosen}`
    );
    logger.debug(
      `services.json: tagPrefix='${tagPrefix}', fromBranch='${fromBranchVal}', toBranch='${toBranchVal}', useTagMode=${useTagMode}, useBranchMode=${useBranchMode}, hasBranches=${hasBranches}`
    );

    // fetch the serviceJson file
    const serviceJsonFile: any = await this.fetchAndParseServicesJson(
      provider,
      projectId,
      servicesJsonFileGitRepoName,
      servicesJsonFileName,
      servicesJsonVersion,
      servicesJsonVersionType,
      servicesJsonFileGitRepoApiUrl,
      servicesJsonFileGitPath
    );
    if (!serviceJsonFile) return false;

    const services = serviceJsonFile.services;
    logger.debug(`Found ${services.length} services in ${servicesJsonFileName}`);
    for (const service of services) {
      logger.debug('---------------Iterating service-----------------');
      logger.debug(`Processing service: ${service.serviceName}`);
      let repoName = service.serviceLocation.gitRepoUrl.split('/').pop();
      repoName = repoName?.replace(/%20/g, ' ');
      let serviceGitRepoApiUrl = service.serviceLocation.gitRepoUrl.replace(
        '/_git/',
        '/_apis/git/repositories/'
      );
      logger.debug(
        `Processing service: ${service.serviceName} | Repo: ${repoName} | API URL: ${serviceGitRepoApiUrl}`
      );
      const range = await this.resolveServiceRange(
        provider,
        service,
        tagPrefix,
        fromRelease,
        toRelease,
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
        continue;
      }

      const { fromVersion, toVersion, fromVersionType, toVersionType } = range;

      let itemPaths = service.serviceLocation.pathInGit.split(',');
      logger.debug(`Service ${service.serviceName}: evaluating paths: ${itemPaths.join(',')}`);
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
      // Deduplicate per service across all its paths, keeping latest-pair commits
      const uniqueLinked = this.takeNewCommits(artifactKey, aggLinked);
      const uniqueUnlinked = this.takeNewCommits(artifactKey, aggUnlinked);
      // annotate with release metadata for UI columns
      const relVersion = toRelease?.name;
      const relRunDate = toRelease?.createdOn || toRelease?.created || toRelease?.createdDate;
      uniqueLinked.forEach((c: any) => {
        c.releaseVersion = relVersion;
        c.releaseRunDate = relRunDate;
      });
      uniqueUnlinked.forEach((c: any) => {
        c.releaseVersion = relVersion;
        c.releaseRunDate = relRunDate;
      });
      logger.info(
        `Service ${service.serviceName}: Aggregated ${uniqueLinked?.length || 0} linked and ${
          uniqueUnlinked?.length || 0
        } unlinked commits across ${itemPaths.length} path(s)`
      );
      // Always push one entry per service (so non-associated commits can be displayed), even if linked is 0
      this.rawChangesArray.push({
        artifact: { name: service.serviceName },
        changes: [...uniqueLinked],
        nonLinkedCommits: [...uniqueUnlinked],
      });
    }
    return true;
  }

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
      if (!fromTagData || !fromTagData.value || fromTagData?.count == 0) {
        logger.warn(
          `Service ${service.serviceName}: Source tag '${fromTag}' does not exist in repository ${repoName}`
        );
        if (hasBranches) {
          logger.info(`Tag '${fromTag}' missing; falling back to BRANCH mode: ${fromBranch} → ${toBranch}`);
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
        const toTagData = await provider.GetTag(serviceGitRepoApiUrl, toTag);
        if (!toTagData || !toTagData.value || toTagData?.count == 0) {
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
    logger.debug(`Checking path '${itemPath}' exists in source ${fromVersionType} '${fromVersion}'`);
    const srcKey = `${serviceGitRepoApiUrl}|${itemPath}|${fromVersionType}|${fromVersion}`;
    let itemExistingInVersion: boolean;
    if (this.pathExistenceCache.has(srcKey)) {
      itemExistingInVersion = this.pathExistenceCache.get(srcKey)!;
    } else {
      itemExistingInVersion = await provider.CheckIfItemExist(serviceGitRepoApiUrl, itemPath, {
        version: fromVersion,
        versionType: fromVersionType,
      });
      this.pathExistenceCache.set(srcKey, !!itemExistingInVersion);
    }
    if (!itemExistingInVersion) {
      logger.warn(
        `Service ${serviceName}: Path '${itemPath}' does not exist in source ${fromVersionType.toLowerCase()} '${fromVersion}'`
      );
      return null;
    }
    logger.debug(`Checking path '${itemPath}' exists in target ${toVersionType} '${toVersion}'`);
    const dstKey = `${serviceGitRepoApiUrl}|${itemPath}|${toVersionType}|${toVersion}`;
    if (this.pathExistenceCache.has(dstKey)) {
      itemExistingInVersion = this.pathExistenceCache.get(dstKey)!;
    } else {
      itemExistingInVersion = await provider.CheckIfItemExist(serviceGitRepoApiUrl, itemPath, {
        version: toVersion,
        versionType: toVersionType,
      });
      this.pathExistenceCache.set(dstKey, !!itemExistingInVersion);
    }
    if (!itemExistingInVersion) {
      logger.warn(
        `Service ${serviceName}: Path '${itemPath}' does not exist in target ${toVersionType.toLowerCase()} '${toVersion}'`
      );
      return null;
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
      itemPath,
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

  private parseServicesJsonLocation(servicesJsonVar: string) {
    const servicesJsonFileGitPath = servicesJsonVar;
    let servicesJsonFileName: any = servicesJsonFileGitPath.split(`?`).pop();
    servicesJsonFileName = servicesJsonFileName.replace('path=', '');
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

  private async getCachedBranchExists(provider: any, repoApiUrl: string, branch: string): Promise<boolean> {
    const key = `${repoApiUrl}|branch|${branch}`;
    if (this.branchExistenceCache.has(key)) return this.branchExistenceCache.get(key)!;
    const data = await provider.GetBranch(repoApiUrl, branch);
    const exists = !!(data && data.value && data.count !== 0);
    this.branchExistenceCache.set(key, exists);
    return exists;
  }

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

  private takeNewCommits(artifactKey: string, arr: any[]): any[] {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    let set = this.includedCommitIdsByArtifact.get(artifactKey);
    if (!set) {
      set = new Set<string>();
      this.includedCommitIdsByArtifact.set(artifactKey, set);
    }
    const out: any[] = [];
    for (const item of arr) {
      let id: string | undefined = undefined;
      if (item?.commit?.commitId) id = item.commit.commitId;
      else if (item?.commitId) id = item.commitId;
      if (id) {
        if (set.has(id)) continue;
        set.add(id);
      }
      out.push(item);
    }
    return out;
  }

  /*arranging the test data for json skins package*/
  async jsonSkinDataAdapter(adapterType: string, rawData: any, allowBiggerThan500: boolean = false) {
    logger.info(`adapting ${adapterType} data`);
    let adoptedData = undefined;
    try {
      switch (adapterType) {
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
          logger.info(
            `jsonSkinDataAdapter: Processing 'changes' - rawChangesArray has ${this.rawChangesArray.length} artifacts`
          );
          this.rawChangesArray.forEach((item: any, index: number) => {
            logger.debug(
              `  Artifact #${index + 1}: "${item.artifact?.name || 'N/A'}" with ${
                item.changes?.length || 0
              } changes`
            );
          });

          const filteredChangesArray = this.rawChangesArray.map((item: any) => {
            const originalCount = item?.changes?.length || 0;
            const filteredChanges = this.filterChangesByWorkItemOptions(item?.changes || []);
            const filteredCount = filteredChanges.length;
            if (originalCount !== filteredCount) {
              logger.info(
                `  Filtered artifact "${item.artifact?.name}": ${originalCount} → ${filteredCount} changes`
              );
            }
            return {
              ...item,
              changes: filteredChanges,
            };
          });

          logger.info(
            `jsonSkinDataAdapter: After filtering, passing ${filteredChangesArray.length} artifacts to adapter`
          );
          // Exclude artifacts that have zero linked changes from the 'changes' table display
          const displayChangesArray = filteredChangesArray.filter((a: any) => (a.changes?.length || 0) > 0);
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

  getRawData() {
    return this.rawChangesArray;
  } //getRawData

  getAdoptedData() {
    return this.adoptedChangeData;
  } //getAdoptedData

  getAttachmentMinioData(): any[] {
    return this.attachmentMinioData;
  }
}
