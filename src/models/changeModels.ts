export interface ArtifactDescriptor {
  name: string;
}

export interface TargetRepoInfo {
  repoName?: string;
  gitSubModuleName?: string;
  url?: string;
  projectId?: string;
}

export interface CommitIdentity {
  name?: string;
  date?: string;
}

export interface CommitInfo {
  commitId: string;
  committer?: CommitIdentity;
  author?: CommitIdentity;
  comment?: string;
  remoteUrl?: string;
}

export interface PullRequestInfo {
  pullRequestId: number;
  description?: string;
  url?: string;
  createdBy?: string;
  creationDate?: string;
  closedDate?: string;
  title?: string;
}

export interface WorkItemLink {
  href?: string;
}

export interface WorkItemInfo {
  id: number;
  fields?: { [k: string]: any };
  _links?: { html?: WorkItemLink };
}

export interface LinkedItemRelation {
  id?: number;
  title?: string;
  wiType?: string;
  url?: string;
  relationType?: string;
}

export interface ChangeEntry {
  workItem?: WorkItemInfo;
  commit?: CommitInfo;
  pullrequest?: PullRequestInfo;
  linkedItems?: LinkedItemRelation[];
  targetRepo?: TargetRepoInfo;
  build?: number | string;
  releaseVersion?: string;
  releaseRunDate?: string | Date;
}

export interface NonLinkedCommit {
  commitId: string;
  commitDate?: string;
  committer?: string;
  comment?: string;
  url?: string;
  releaseVersion?: string;
  releaseRunDate?: string | Date;
}

export interface ArtifactChangesGroup {
  artifact: ArtifactDescriptor;
  changes: ChangeEntry[];
  nonLinkedCommits: NonLinkedCommit[];
}
