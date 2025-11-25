import ChangesTableDataSkinAdapter from '../../adapters/ChangesTableDataSkinAdapter';
import logger from '../../services/logger';

jest.mock('../../services/htmlUtils', () => {
  return jest.fn().mockImplementation(() => ({
    cleanHtml: jest.fn((html: string) => html),
  }));
});

jest.mock('../../factories/RichTextDataFactory', () => {
  return jest.fn().mockImplementation(() => ({
    factorizeRichTextData: jest.fn().mockResolvedValue('<p>rich</p>'),
    attachmentMinioData: [{ attachmentPath: 'path1', fileName: 'file1' }],
  }));
});

jest.mock('../../services/adapterUtils', () => ({
  // Keep original signature but ignore sort keys and keep order stable
  buildReleaseRunChangeComparator:
    <T>(_v: (c: T) => string, _d: (c: T) => any, _t: (c: T) => any) =>
    (a: T, _b: T) =>
      0,
}));

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('ChangesTableDataSkinAdapter', () => {
  const baseFormatting = { trimAdditionalSpacingInDescriptions: false };

  const makeWorkItemChange = (overrides: any = {}) => ({
    workItem: {
      id: 1,
      _links: { html: { href: 'http://wi/1' } },
      fields: {
        'System.WorkItemType': 'Bug',
        'System.Title': 'Fix bug',
        'System.Description': '<p>desc</p>',
        'Microsoft.VSTS.Common.ClosedDate': '2024-01-01T00:00:00Z',
        'Microsoft.VSTS.Common.ClosedBy': { displayName: 'Alice' },
      },
    },
    targetRepo: {
      gitSubModuleName: 'sub',
      repoName: 'repo',
      url: 'http://repo',
    },
    build: 'B1',
    releaseVersion: '1.0',
    releaseRunDate: '2024-01-02T00:00:00Z',
    linkedItems: [],
    ...overrides,
  });

  const makeArtifactGroup = (changes: any[], name = 'Artifact-1') => ({
    artifact: { name },
    changes,
    nonLinkedCommits: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds error entry when artifact has no changes', async () => {
    const groups = [makeArtifactGroup([], 'EmptyArtifact')];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    expect(data[0].errorMessage[0].fields[0].value).toContain('No changes found for the requested artifact');
  });

  test('builds single work item row without linked items and collects attachments', async () => {
    const change = makeWorkItemChange();
    const groups = [makeArtifactGroup([change])];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    expect(data.length).toBe(1);
    const section = data[0];
    expect(section.artifact).toBeDefined();
    expect(section.artifactChanges.length).toBe(1);

    const row = section.artifactChanges[0];
    const fields = row.fields;

    const wiIdField = fields.find((f: any) => f.name === 'WI ID');
    expect(wiIdField.value).toBe('1');
    expect(wiIdField.url).toBe('http://wi/1');

    const changeDescField = fields.find((f: any) => f.name === 'Change description');
    expect(changeDescField.value).toBe('<p>rich</p>');

    const committedByField = fields.find((f: any) => f.name === 'Committed by');
    expect(committedByField.value).toBe('Alice');

    // attachmentMinioData should be populated via RichTextDataFactory
    expect((adapter as any).attachmentMinioData.length).toBeGreaterThan(0);
  });

  test('expands linked items into multiple rows and empties base fields for subsequent rows', async () => {
    const linkedChange = makeWorkItemChange({
      linkedItems: [
        { id: 10, title: 'L1', wiType: 'Task', relationType: 'Related', url: 'http://wi/10' },
        { id: 11, title: 'L2', wiType: 'Task', relationType: 'Related', url: 'http://wi/11' },
      ],
    });

    const groups = [makeArtifactGroup([linkedChange])];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const rows = data[0].artifactChanges;

    expect(rows.length).toBe(2);

    const firstRowFields = rows[0].fields;
    const secondRowFields = rows[1].fields;

    const firstLinkedId = firstRowFields.find((f: any) => f.name === 'Linked WI ID');
    const secondLinkedId = secondRowFields.find((f: any) => f.name === 'Linked WI ID');

    expect(firstLinkedId.value).toBe(10);
    expect(secondLinkedId.value).toBe(11);

    const secondWiIdField = secondRowFields.find((f: any) => f.name === 'WI ID');
    expect(secondWiIdField.value).toBe('');
    expect(secondWiIdField.url).toBeUndefined();
  });

  test('adds empty linked columns when some changes have linked items but this one does not', async () => {
    const changeWithLinks = makeWorkItemChange({
      linkedItems: [{ id: 10, title: 'L1', wiType: 'Task', relationType: 'Related', url: 'http://wi/10' }],
    });
    const changeWithoutLinks = makeWorkItemChange({ linkedItems: [] });

    const groups = [makeArtifactGroup([changeWithLinks, changeWithoutLinks])];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const rows = data[0].artifactChanges;

    // Second row corresponds to changeWithoutLinks but should still have linked columns with empty values
    const secondRowFields = rows[1].fields;
    const linkedIdField = secondRowFields.find((f: any) => f.name === 'Linked WI ID');
    expect(linkedIdField.value).toBe('');
  });

  test('uses pull request fields for Change #, date, and committer when work item has attached pull request', async () => {
    const prChange = makeWorkItemChange({
      build: undefined,
      pullrequest: {
        description: 'PR-desc',
        url: 'http://pr/url',
        closedDate: '2024-01-05T00:00:00Z',
        createdBy: { displayName: 'Bob PR' },
      },
    });

    const groups = [makeArtifactGroup([prChange])];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    const anyAdapter = adapter as any;
    const dateSpy = jest.spyOn(anyAdapter, 'convertDateToLocalTime').mockReturnValue('LOC-PR');

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].artifactChanges[0].fields;

    const changeNumField = fields.find((f: any) => f.name === 'Change #');
    expect(changeNumField.value).toBe('PR-desc');
    expect(changeNumField.url).toBe('http://pr/url');

    const dateField = fields.find((f: any) => f.name === 'Committed Date & Time');
    expect(dateField.value).toBe('LOC-PR');

    const committerField = fields.find((f: any) => f.name === 'Committed by');
    expect(committerField.value).toBe('Bob PR');

    dateSpy.mockRestore();
  });

  test('uses commit fields for Change #, date, and committer when work item has attached commit', async () => {
    const commitChange = makeWorkItemChange({
      build: undefined,
      commit: {
        commitId: 'abcdef12345',
        remoteUrl: 'http://commit/abcdef',
        author: { date: '2024-01-06T00:00:00Z' },
        committer: { name: 'Carol Commit' },
      },
    });

    const groups = [makeArtifactGroup([commitChange])];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    const anyAdapter = adapter as any;
    const dateSpy = jest.spyOn(anyAdapter, 'convertDateToLocalTime').mockReturnValue('LOC-COMMIT');

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();
    const fields = data[0].artifactChanges[0].fields;

    const changeNumField = fields.find((f: any) => f.name === 'Change #');
    expect(changeNumField.value).toBe('abcde');
    expect(changeNumField.url).toBe('http://commit/abcdef');

    const dateField = fields.find((f: any) => f.name === 'Committed Date & Time');
    expect(dateField.value).toBe('LOC-COMMIT');

    const committerField = fields.find((f: any) => f.name === 'Committed by');
    expect(committerField.value).toBe('Carol Commit');

    dateSpy.mockRestore();
  });

  test('builds pull request change row respecting description and committer flags', async () => {
    const prChange = {
      title: 'PR 1',
      description: 'Some PR',
      creationDate: '2024-01-03T00:00:00Z',
      createdBy: 'Bob',
      releaseVersion: '2.0',
      releaseRunDate: '2024-01-04T00:00:00Z',
    };

    const groups = [
      {
        artifact: { name: '' },
        changes: [prChange],
        nonLinkedCommits: [],
      },
    ];

    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    // Artifact name is empty so no artifact header
    expect(data[0].artifact).toBeUndefined();

    const row = data[0].artifactChanges[0];
    const fields = row.fields;

    const prTitle = fields.find((f: any) => f.name === 'Pull Request Title');
    const prDesc = fields.find((f: any) => f.name === 'Pull Request Description');
    const prCreatedBy = fields.find((f: any) => f.name === 'Created by');

    expect(prTitle.value).toBe('PR 1');
    expect(prDesc.value).toBe('Some PR');
    expect(prCreatedBy.value).toBe('Bob');
  });

  test('continues processing other artifacts when one artifact fails during adoption', async () => {
    const badChange = makeWorkItemChange();
    const goodChange = makeWorkItemChange({
      workItem: {
        id: 2,
        _links: { html: { href: 'http://wi/2' } },
        fields: {
          'System.WorkItemType': 'Bug',
          'System.Title': 'Good change',
          'System.Description': '<p>good</p>',
          'Microsoft.VSTS.Common.ClosedDate': '2024-01-01T00:00:00Z',
          'Microsoft.VSTS.Common.ClosedBy': { displayName: 'Alice' },
        },
      },
    });

    const groups = [
      makeArtifactGroup([badChange], 'BadArtifact'),
      makeArtifactGroup([goodChange], 'GoodArtifact'),
    ];
    const adapter = new ChangesTableDataSkinAdapter(
      groups,
      true,
      true,
      'proj',
      '/template',
      'bucket',
      'endpoint',
      'access',
      'secret',
      'pat',
      baseFormatting
    );

    const anyAdapter = adapter as any;
    const originalBuildRow = anyAdapter.buildWorkItemChangeRow.bind(adapter);
    const spy = jest
      .spyOn(anyAdapter, 'buildWorkItemChangeRow')
      .mockImplementationOnce(() => {
        throw new Error('boom-artifact');
      })
      .mockImplementation(originalBuildRow);

    await adapter.adoptSkinData();
    const data = adapter.getAdoptedData();

    // Only the good artifact should be present
    expect(data.length).toBe(1);
    const artifactHeader = data[0].artifact[0].fields[0].value;
    expect(artifactHeader).toContain('GoodArtifact');

    expect((logger as any).error).toHaveBeenCalledWith(
      expect.stringContaining('adoptSkinData: Failed processing artifact "BadArtifact"')
    );

    spy.mockRestore();
  });
});
