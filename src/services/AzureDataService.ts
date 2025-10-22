import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';

export default class AzureDataService {
  private dg: any;

  constructor(orgUrl: string, token: string) {
    this.dg = new DgDataProviderAzureDevOps(orgUrl, token, undefined, undefined);
  }

  // Management
  async getProjects() {
    const management = (await this.dg.getMangementDataProvider?.()) || null;
    return management.GetProjects();
  }

  async getUserProfile() {
    const management = (await this.dg.getMangementDataProvider?.()) || null;
    return management.GetUserProfile();
  }

  async getCollectionLinkTypes() {
    const management = (await this.dg.getMangementDataProvider?.()) || null;
    return management.GetCllectionLinkTypes();
  }

  async checkOrgUrlValidity(token?: string) {
    const management = (await this.dg.getMangementDataProvider?.()) || null;
    return management.CheckOrgUrlValidity(token);
  }

  // Queries & Fields
  async getSharedQueries(teamProjectId = '', docType = '', path = '') {
    const tickets = await this.dg.getTicketsDataProvider();
    return tickets.GetSharedQueries(teamProjectId, path, docType);
  }

  async getFieldsByType(teamProjectId = '', type = '') {
    const tickets = await this.dg.getTicketsDataProvider();
    return tickets.GetFieldsByType(teamProjectId, type);
  }

  async getQueryResults(queryId: string, teamProjectId = '') {
    const tickets = await this.dg.getTicketsDataProvider();
    return tickets.GetQueryResultById(queryId, teamProjectId);
  }

  // Tests
  async getTestPlans(teamProjectId = '') {
    const test = await this.dg.getTestDataProvider();
    return test.GetTestPlans(teamProjectId);
  }

  async getTestSuitesByPlan(teamProjectId = '', testPlanId: string, includeChildren = true) {
    const test = await this.dg.getTestDataProvider();
    return test.GetTestSuitesByPlan(teamProjectId, String(testPlanId), Boolean(includeChildren));
  }

  // Git
  async getGitRepos(teamProjectId = '') {
    const git = await this.dg.getGitDataProvider();
    return git.GetTeamProjectGitReposList(teamProjectId);
  }

  async getRepoBranches(teamProjectId = '', repoId: string) {
    const git = await this.dg.getGitDataProvider();
    return git.GetRepoBranches(teamProjectId, repoId);
  }

  async getRepoCommits(teamProjectId = '', repoId: string, versionIdentifier = '') {
    const git = await this.dg.getGitDataProvider();
    return git.GetCommitsForRepo(teamProjectId, repoId, versionIdentifier);
  }

  async getRepoPullRequests(teamProjectId = '', repoId: string) {
    const git = await this.dg.getGitDataProvider();
    return git.GetPullRequestsForRepo(teamProjectId, repoId);
  }

  async getRepoRefs(teamProjectId = '', repoId: string, type = '') {
    const git = await this.dg.getGitDataProvider();
    return git.GetRepoReferences(teamProjectId, repoId, type);
  }

  // Pipelines & Releases
  async getPipelines(teamProjectId = '') {
    const pipelines = await this.dg.getPipelinesDataProvider();
    return pipelines.GetAllPipelines(teamProjectId);
  }

  async getPipelineRunHistory(teamProjectId = '', pipelineId: string) {
    const pipelines = await this.dg.getPipelinesDataProvider();
    return pipelines.GetPipelineRunHistory(teamProjectId, String(pipelineId));
  }

  async getReleaseDefinitionList(teamProjectId = '') {
    const pipelines = await this.dg.getPipelinesDataProvider();
    return pipelines.GetAllReleaseDefenitions(teamProjectId);
  }

  async getReleaseDefinitionHistory(teamProjectId = '', definitionId: string) {
    const pipelines = await this.dg.getPipelinesDataProvider();
    return pipelines.GetReleaseHistory(teamProjectId, String(definitionId));
  }

  async getWorkItemTypeList(teamProjectId = '') {
    const tickets = await this.dg.getTicketsDataProvider();
    return tickets.GetWorkItemTypeList(teamProjectId);
  }
}
