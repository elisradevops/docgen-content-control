import DgContentControls from '../../controllers';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../factories/TestDataFactory', () =>
  jest.fn().mockImplementation(() => ({
    adoptedTestData: [],
    adoptedQueryResults: {},
    fetchQueryResults: jest.fn().mockResolvedValue(undefined),
    fetchLinkedMomResults: jest.fn().mockResolvedValue(undefined),
    fetchTestData: jest.fn().mockResolvedValue(undefined),
    fetchLinkedRequirementsTrace: jest.fn().mockResolvedValue(undefined),
    getAttachmentMinioData: jest.fn().mockReturnValue([]),
    getSuiteOverviewAdoptedData: jest.fn().mockResolvedValue([]),
  }))
);

describe('DgContentControls STP heading behavior', () => {
  const createController = () =>
    new DgContentControls(
      'https://dev.azure.com/org/',
      'pat',
      'attachments',
      'Project',
      'json',
      '',
      'http://minio:9000',
      'ak',
      'sk'
    );

  test('adds +1 heading level for detailed STP test descriptions', async () => {
    const controller = createController();
    const addNewContentToDocumentSkin = jest
      .fn()
      .mockResolvedValue([{ type: 'paragraph', runs: [{ text: 'content' }] }]);

    (controller as any).skins = {
      SKIN_TYPE_TEST_PLAN: 'test-plan',
      SKIN_TYPE_TABLE: 'table',
      SKIN_TYPE_TRACE: 'trace-table',
      addNewContentToDocumentSkin,
    };

    await controller.addTestDescriptionContent(
      1,
      [10],
      'tests-description-content-control',
      1,
      false,
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

    const suiteOverviewCall = addNewContentToDocumentSkin.mock.calls.find(
      (call) => call[0] === 'suite-description-content-control'
    );
    const detailedCall = addNewContentToDocumentSkin.mock.calls.find(
      (call) => call[0] === 'tests-description-content-control'
    );

    expect(suiteOverviewCall).toBeDefined();
    expect(suiteOverviewCall[5]).toBe(1);
    expect(detailedCall).toBeDefined();
    expect(detailedCall[5]).toBe(2);
  });

  test('keeps original heading level for STD detailed test descriptions', async () => {
    const controller = createController();
    const addNewContentToDocumentSkin = jest
      .fn()
      .mockResolvedValue([{ type: 'paragraph', runs: [{ text: 'content' }] }]);

    (controller as any).skins = {
      SKIN_TYPE_TEST_PLAN: 'test-plan',
      SKIN_TYPE_TABLE: 'table',
      SKIN_TYPE_TRACE: 'trace-table',
      addNewContentToDocumentSkin,
    };

    await controller.addTestDescriptionContent(
      1,
      [10],
      'tests-description-content-control',
      1,
      false,
      'asEmbedded',
      false,
      false,
      false,
      false,
      { linkedMomMode: 'none' },
      { traceAnalysisMode: 'none' },
      [10],
      false
    );

    const suiteOverviewCall = addNewContentToDocumentSkin.mock.calls.find(
      (call) => call[0] === 'suite-description-content-control'
    );
    const detailedCall = addNewContentToDocumentSkin.mock.calls.find(
      (call) => call[0] === 'tests-description-content-control'
    );

    expect(suiteOverviewCall).toBeUndefined();
    expect(detailedCall).toBeDefined();
    expect(detailedCall[5]).toBe(1);
  });
});

