import DgContentControls from '../../controllers';
import ChangeDataFactory from '../../factories/ChangeDataFactory';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../factories/ChangeDataFactory');

describe('DgContentControls SVD release-file-content-control generation', () => {
  const mockedChangeDataFactory = ChangeDataFactory as unknown as jest.Mock;

  const createController = () => {
    const controller = new DgContentControls(
      'https://dev.azure.com/org/',
      'pat',
      'attachments',
      'MEWP',
      'json',
      '',
      'http://minio:9000',
      'ak',
      'sk'
    );

    (controller as any).skins = {
      SKIN_TYPE_TABLE: 'table',
      SKIN_TYPE_SYSTEM_OVERVIEW: 'system-overview',
      SKIN_TYPE_INSTALLATION: 'installation',
      SKIN_TYPE_COVER_PAGE: 'cover-page',
      SKIN_TYPE_PARAGRAPH: 'paragraph',
      addNewContentToDocumentSkin: jest.fn(async (...args: any[]) => {
        const skinType = args[1];
        const data = args[2];
        if (skinType === 'paragraph') {
          const paragraphText = Array.isArray(data)
            ? String(data?.[0]?.fields?.[0]?.value || '')
            : String(data || '');
          return [{ type: 'paragraph', runs: [{ text: paragraphText }] }];
        }
        return [];
      }),
    };

    return controller;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedChangeDataFactory.mockImplementation(() => ({
      fetchSvdData: jest.fn().mockResolvedValue(undefined),
      getAdoptedData: jest.fn().mockReturnValue([]),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
      getResolvedContextName: jest.fn().mockReturnValue(''),
      getResolvedRange: jest.fn().mockReturnValue(undefined),
      getFunnel: jest.fn().mockReturnValue(undefined),
      getResolvedTo: jest.fn().mockReturnValue('17'),
    }));
  });

  test('adds <release-name>-<release-version>.zip for SVD release range', async () => {
    const controller = createController();
    (controller as any).dgDataProviderAzureDevOps = {
      getPipelinesDataProvider: jest.fn().mockResolvedValue({
        GetReleaseByReleaseId: jest.fn().mockResolvedValue({
          name: 'Release-17',
          releaseDefinition: { name: 'test-release' },
        }),
      }),
    };

    const controls = await controller.addChangeDescriptionTable(
      'repo-1',
      '16',
      '17',
      'release',
      [],
      'required-states-and-modes',
      4
    );

    const releaseFileControl = controls.find((c: any) => c.title === 'release-file-content-control');
    expect(releaseFileControl).toBeTruthy();
    expect(releaseFileControl.wordObjects[0].runs[0].text).toBe('test-release-Release-17.zip');
  });

  const range = {
    rangeType: 'release',
    definition: { id: 1, name: 'MyRelease' },
    to: { id: 17, name: 'Release-17', source: 'auto' },
    from: { id: 16, source: 'auto' },
  };
  const funnel = { artifacts: 1, linkedChanges: 0, unlinkedCommits: 0, knownBugs: 0 };

  test('keeps the resolved range and funnel on the controller after a successful SVD', async () => {
    mockedChangeDataFactory.mockImplementation(() => ({
      fetchSvdData: jest.fn().mockResolvedValue(undefined),
      getAdoptedData: jest.fn().mockReturnValue([]),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
      getResolvedContextName: jest.fn().mockReturnValue(''),
      getResolvedRange: jest.fn().mockReturnValue(range),
      getFunnel: jest.fn().mockReturnValue(funnel),
      getResolvedTo: jest.fn().mockReturnValue('17'),
    }));
    const controller = createController();
    (controller as any).dgDataProviderAzureDevOps = { getPipelinesDataProvider: jest.fn() };

    await controller.addChangeDescriptionTable('repo-1', '16', '17', 'pipeline', [], 'required-states-and-modes', 4);

    expect(controller.resolvedRange).toEqual(range);
    expect(controller.funnel).toEqual(funnel);
  });

  test('keeps the resolved range when the SVD fails after discovery, and still throws', async () => {
    mockedChangeDataFactory.mockImplementation(() => ({
      fetchSvdData: jest.fn().mockRejectedValue(new Error('artifact lookup failed')),
      getAdoptedData: jest.fn().mockReturnValue([]),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
      getResolvedContextName: jest.fn().mockReturnValue(''),
      getResolvedRange: jest.fn().mockReturnValue(range),
      getFunnel: jest.fn().mockReturnValue(undefined),
      getResolvedTo: jest.fn().mockReturnValue('17'),
    }));
    const controller = createController();
    (controller as any).dgDataProviderAzureDevOps = { getPipelinesDataProvider: jest.fn() };

    await expect(
      controller.addChangeDescriptionTable('repo-1', '', '', 'release', [], 'required-states-and-modes', 4)
    ).rejects.toThrow('artifact lookup failed');

    expect(controller.resolvedRange).toEqual(range);
  });

  test('adds empty release-file-content-control for SVD non-release range', async () => {
    const controller = createController();
    (controller as any).dgDataProviderAzureDevOps = {
      getPipelinesDataProvider: jest.fn(),
    };

    const controls = await controller.addChangeDescriptionTable(
      'repo-1',
      '16',
      '17',
      'pipeline',
      [],
      'required-states-and-modes',
      4
    );

    const releaseFileControl = controls.find((c: any) => c.title === 'release-file-content-control');
    expect(releaseFileControl).toBeTruthy();
    expect(releaseFileControl.wordObjects[0].runs[0].text).toBe('');
  });

  test('does not add release-file-content-control outside SVD primary control flow', async () => {
    const controller = createController();
    (controller as any).dgDataProviderAzureDevOps = {
      getPipelinesDataProvider: jest.fn(),
    };

    const controls = await controller.addChangeDescriptionTable('repo-1', '16', '17', 'release', [], 'other-title', 4);

    const releaseFileControl = controls.find((c: any) => c.title === 'release-file-content-control');
    expect(releaseFileControl).toBeFalsy();
  });
});
