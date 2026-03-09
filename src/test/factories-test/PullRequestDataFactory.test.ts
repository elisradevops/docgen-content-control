import PullRequestDataFactory from '../../factories/PullRequestDataFactory';
import ChangesTableDataSkinAdapter from '../../adapters/ChangesTableDataSkinAdapter';

jest.mock('../../adapters/ChangesTableDataSkinAdapter');
jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('PullRequestDataFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createFactory(params: Partial<any> = {}) {
    const gitDataProvider = {
      GetGitRepoFromRepoId: jest.fn().mockResolvedValue({ id: 'repo-1', name: 'Repo 1' }),
      GetItemsInPullRequestRange: jest.fn().mockResolvedValue([
        {
          workItem: {
            id: 10,
            fields: { 'System.WorkItemType': 'Bug', 'System.State': 'Active' },
          },
        },
        {
          workItem: {
            id: 11,
            fields: { 'System.WorkItemType': 'Task', 'System.State': 'Closed' },
          },
        },
        {},
      ]),
    };
    const dgDataProvider = {
      getGitDataProvider: jest.fn().mockResolvedValue(gitDataProvider),
    };
    const factory = new PullRequestDataFactory(
      'MEWP',
      'repo-1',
      [100, 101],
      ['System.LinkTypes.Related'],
      dgDataProvider as any,
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      {},
      params.workItemFilterOptions
    );
    return { factory, gitDataProvider };
  }

  it('fetches and filters PR changes by type/state when filter is enabled', async () => {
    const { factory, gitDataProvider } = createFactory({
      workItemFilterOptions: {
        isEnabled: true,
        workItemTypes: ['Bug'],
        workItemStates: ['Active'],
      },
    });

    await factory.fetchData();
    expect(gitDataProvider.GetGitRepoFromRepoId).toHaveBeenCalledWith('repo-1');
    expect(gitDataProvider.GetItemsInPullRequestRange).toHaveBeenCalled();

    const raw = factory.getRawData();
    expect(raw).toHaveLength(1);
    expect(raw[0].changes).toHaveLength(1);
    expect(raw[0].changes[0].workItem.id).toBe(10);
  });

  it('adopts skin data through ChangesTableDataSkinAdapter and collects attachments', async () => {
    (ChangesTableDataSkinAdapter as unknown as jest.Mock).mockImplementation(() => ({
      adoptSkinData: jest.fn().mockResolvedValue(undefined),
      getAdoptedData: jest.fn().mockReturnValue([{ fields: [{ name: 'x', value: 'y' }] }]),
      attachmentMinioData: [{ attachmentMinioPath: 'p', minioFileName: 'f' }],
    }));

    const { factory } = createFactory({
      workItemFilterOptions: {
        isEnabled: false,
      },
    });

    await factory.fetchData();
    await factory.jsonSkinDataAdpater();

    expect(factory.getAdoptedData()).toEqual([{ fields: [{ name: 'x', value: 'y' }] }]);
    expect(factory.attachmentMinioData).toEqual([
      { attachmentMinioPath: 'p', minioFileName: 'f' },
    ]);
  });

  it('supports scalar filter options and excludes by state mismatch', async () => {
    const { factory } = createFactory({
      workItemFilterOptions: {
        isEnabled: true,
        workItemTypes: 'Bug',
        workItemStates: 'Closed',
      },
    });

    await factory.fetchData();
    const raw = factory.getRawData();
    expect(raw).toHaveLength(1);
    expect(raw[0].changes).toHaveLength(0);
  });
});
