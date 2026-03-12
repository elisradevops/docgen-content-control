import DgContentControls from '../../controllers';
import TestDataFactory from '../../factories/TestDataFactory';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../factories/TestDataFactory');

describe('DgContentControls STP generation', () => {
  const mockedTestDataFactory = TestDataFactory as unknown as jest.Mock;
  const extractFactoryFlags = (callArgs: any[] = []) => ({
    includeHardCopyRun: callArgs[6],
    flatSuiteTestCases: callArgs[22],
    includeTestSteps: callArgs[23],
    includeTestPhase: callArgs[24],
  });
  const extractAddDescriptionFlags = (callArgs: any[] = []) => ({
    includeHardCopyRun: callArgs[6],
    isStpMode: callArgs[13],
  });

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

    const addNewContentToDocumentSkin = jest.fn(async (title: string) => {
      if (title === 'tests-description-content-control') {
        return [
          { type: 'paragraph', runs: [{ text: 'keep paragraph' }] },
          { type: 'paragraph', runs: [{ text: 'Test Description:' }] },
        ];
      }
      return [{ type: 'paragraph', runs: [{ text: title }] }];
    });

    (controller as any).skins = {
      SKIN_TYPE_TEST_PLAN: 'test-plan',
      SKIN_TYPE_TABLE: 'table',
      SKIN_TYPE_TRACE: 'trace',
      addNewContentToDocumentSkin,
    };

    (controller as any).dgDataProviderAzureDevOps = { mocked: true };

    return { controller, addNewContentToDocumentSkin };
  };

  const buildFactoryInstance = () => ({
    adoptedTestData: { adoptedData: [{ id: 1 }] },
    adoptedQueryResults: {
      reqTestAdoptedData: { adoptedData: [{ id: 'r1' }] },
      testReqAdoptedData: { adoptedData: [{ id: 't1' }] },
    },
    fetchQueryResults: jest.fn().mockResolvedValue(undefined),
    fetchLinkedMomResults: jest.fn().mockResolvedValue(undefined),
    fetchTestData: jest.fn().mockResolvedValue(undefined),
    fetchLinkedRequirementsTrace: jest.fn().mockResolvedValue(undefined),
    getAttachmentMinioData: jest.fn().mockReturnValue([]),
    getSuiteOverviewAdoptedData: jest.fn().mockReturnValue([
      {
        fields: [
          { name: '#', value: 1, width: '8%' },
          { name: 'Items to Be Tested', value: 'Suite 1' },
          { name: 'Description', value: 'No description' },
        ],
        Source: 1,
        level: 1,
        url: '',
      },
    ]),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates STP chapter 4 and chapter 6 content controls when traceability is enabled', async () => {
    const { controller, addNewContentToDocumentSkin } = createController();
    const factoryInstance = buildFactoryInstance();
    mockedTestDataFactory.mockImplementation(() => factoryInstance);

    const controls = await controller.addTestDescriptionContent(
      100,
      [10, 20],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      true,
      false,
      true,
      false,
      { linkedMomMode: 'query' },
      { traceAnalysisMode: 'query' },
      [10, 20],
      true
    );

    expect(factoryInstance.fetchQueryResults).toHaveBeenCalledTimes(1);
    expect(factoryInstance.fetchLinkedMomResults).toHaveBeenCalledTimes(1);
    expect(factoryInstance.fetchTestData).toHaveBeenCalledWith(true);

    expect(controls.map((c: any) => c.title)).toEqual([
      'suite-description-content-control',
      'tests-description-content-control',
      'requirements-to-test-cases-content-control',
      'test-cases-to-requirements-content-control',
    ]);

    expect(controls[1].wordObjects).toEqual([{ type: 'paragraph', runs: [{ text: 'keep paragraph' }] }]);

    expect(addNewContentToDocumentSkin).toHaveBeenCalledWith(
      'suite-description-content-control',
      'table',
      expect.any(Array),
      expect.any(Object),
      expect.any(Object),
      4
    );
    expect(addNewContentToDocumentSkin).toHaveBeenCalledWith(
      'requirements-to-test-cases-content-control',
      'trace',
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      4
    );
    expect(addNewContentToDocumentSkin).toHaveBeenCalledWith(
      'test-cases-to-requirements-content-control',
      'trace',
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      4
    );
  });

  test('omits trace controls when traceability mode is none', async () => {
    const { controller } = createController();
    const factoryInstance = buildFactoryInstance();
    mockedTestDataFactory.mockImplementation(() => factoryInstance);

    const controls = await controller.addTestDescriptionContent(
      100,
      [10],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      false,
      false,
      false,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      [10],
      true
    );

    expect(controls.map((c: any) => c.title)).toEqual([
      'suite-description-content-control',
      'tests-description-content-control',
    ]);
  });

  test('forces STP options: disables hard-copy, enables test phase field, disables steps', async () => {
    const { controller } = createController();
    const factoryInstance = buildFactoryInstance();
    mockedTestDataFactory.mockImplementation(() => factoryInstance);

    await controller.addTestDescriptionContent(
      100,
      [10],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      true,
      false,
      true,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      [10],
      true
    );

    const constructorArgs = mockedTestDataFactory.mock.calls[0];
    const ctorFlags = extractFactoryFlags(constructorArgs);
    expect(ctorFlags.includeHardCopyRun).toBe(false);
    expect(ctorFlags.flatSuiteTestCases).toBe(true);
    expect(ctorFlags.includeTestSteps).toBe(false);
    expect(ctorFlags.includeTestPhase).toBe(true);
  });

  test('generateContentControl routes test-stp-description with STP flags', async () => {
    const { controller } = createController();

    const addTestDescriptionContentSpy = jest
      .spyOn(controller, 'addTestDescriptionContent')
      .mockResolvedValue([{ title: 'tests-description-content-control', wordObjects: [] }] as any);
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/stp.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'stp.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'test-stp-description',
      title: 'tests-description-content-control',
      headingLevel: 4,
      data: {
        testPlanId: 100,
        testSuiteArray: [10],
        includeAttachments: true,
        attachmentType: 'asEmbedded',
        includeHardCopyRun: true,
        includeAttachmentContent: false,
        includeRequirements: true,
        includeCustomerId: false,
        linkedMomRequest: { linkedMomMode: 'none' },
        traceAnalysisRequest: { traceAnalysisMode: 'none' },
        flatSuiteTestCases: false,
        nonRecursiveTestSuiteIdList: [10],
      },
    };

    await controller.generateContentControl(payload as any);

    const routedArgs = addTestDescriptionContentSpy.mock.calls[0];
    const routeFlags = extractAddDescriptionFlags(routedArgs);
    expect(routeFlags.includeHardCopyRun).toBe(false);
    expect(routeFlags.isStpMode).toBe(true);
  });

  test('auto-resolves flatten for STD from selected suites count (single -> true, multiple -> false)', async () => {
    const { controller } = createController();

    const singleSuiteFactory = buildFactoryInstance();
    mockedTestDataFactory.mockImplementationOnce(() => singleSuiteFactory);

    await controller.addTestDescriptionContent(
      100,
      [10, 11],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      false,
      false,
      true,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      [10],
      false
    );

    const singleSuiteArgs = mockedTestDataFactory.mock.calls[0];
    expect(extractFactoryFlags(singleSuiteArgs).flatSuiteTestCases).toBe(true);

    const multipleSuitesFactory = buildFactoryInstance();
    mockedTestDataFactory.mockImplementationOnce(() => multipleSuitesFactory);

    await controller.addTestDescriptionContent(
      100,
      [10, 11],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      false,
      false,
      true,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      [10, 20],
      false
    );

    const multipleSuitesArgs = mockedTestDataFactory.mock.calls[1];
    expect(extractFactoryFlags(multipleSuitesArgs).flatSuiteTestCases).toBe(false);
  });

  test('auto-resolves flatten when suite IDs are strings and non-recursive list is missing', async () => {
    const { controller } = createController();

    const fromExpandedScopeFactory = buildFactoryInstance();
    mockedTestDataFactory.mockImplementationOnce(() => fromExpandedScopeFactory);

    await controller.addTestDescriptionContent(
      100,
      ['10'] as any,
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      false,
      false,
      true,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      undefined,
      false
    );

    const fromExpandedScopeArgs = mockedTestDataFactory.mock.calls[0];
    expect(extractFactoryFlags(fromExpandedScopeArgs).flatSuiteTestCases).toBe(true);

    const fromSelectedScopeFactory = buildFactoryInstance();
    mockedTestDataFactory.mockImplementationOnce(() => fromSelectedScopeFactory);

    await controller.addTestDescriptionContent(
      100,
      [10, 11],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      false,
      false,
      true,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      ['10'] as any,
      false
    );

    const fromSelectedScopeArgs = mockedTestDataFactory.mock.calls[1];
    expect(extractFactoryFlags(fromSelectedScopeArgs).flatSuiteTestCases).toBe(true);
  });

  test('ignores blank suite IDs when resolving flatten scope', async () => {
    const { controller } = createController();

    const factoryInstance = buildFactoryInstance();
    mockedTestDataFactory.mockImplementationOnce(() => factoryInstance);

    await controller.addTestDescriptionContent(
      100,
      [10, 11],
      'tests-description-content-control',
      4,
      true,
      'asEmbedded',
      false,
      false,
      true,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      ['   '] as any,
      false
    );

    const ctorArgs = mockedTestDataFactory.mock.calls[0];
    expect(extractFactoryFlags(ctorArgs).flatSuiteTestCases).toBe(false);
  });
});
