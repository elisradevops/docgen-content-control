import DgContentControls from '../../controllers';
import RequirementsDataFactory from '../../factories/RequirementsDataFactory';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../factories/RequirementsDataFactory');

describe('DgContentControls SysRS generation', () => {
  const mockedRequirementsDataFactory = RequirementsDataFactory as unknown as jest.Mock;

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

    const addNewContentToDocumentSkin = jest.fn(async (...args: any[]) => {
      const title = args[0];
      if (title === 'subsystem-to-system-trace' || title === 'system-to-subsystem-trace') {
        return [{ type: 'trace', title }];
      }
      return [{ type: 'paragraph', title }];
    });

    (controller as any).skins = {
      SKIN_TYPE_SYSTEM_OVERVIEW: 'system-overview',
      SKIN_TYPE_TABLE: 'table',
      SKIN_TYPE_TRACE: 'trace',
      addNewContentToDocumentSkin,
    };

    (controller as any).dgDataProviderAzureDevOps = { mocked: true };

    return { controller, addNewContentToDocumentSkin };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds mandatory SysRS controls and fallback rows when optional data is empty', async () => {
    mockedRequirementsDataFactory.mockImplementation(() => ({
      fetchRequirementsData: jest.fn().mockResolvedValue(undefined),
      getAdoptedData: jest.fn().mockReturnValue({
        systemRequirementsData: [{ fields: [{ name: 'Title', value: 'REQ-1' }] }],
        criticalRequirementsData: [],
        vcrmData: [],
      }),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
    }));

    const { controller, addNewContentToDocumentSkin } = createController();

    const controls = await controller.addSysRSContent(
      {
        systemRequirements: { wiql: { href: 'sys-req-url' } },
      },
      'sysrs-document',
      4,
      'hierarchical'
    );

    expect(controls.map((c: any) => c.title)).toEqual([
      'system-requirements',
      'critical-requirements',
      'vcrm',
    ]);

    const criticalCall = addNewContentToDocumentSkin.mock.calls.find(
      (call: any[]) => call[0] === 'critical-requirements'
    ) as any[];
    expect(criticalCall).toBeDefined();
    expect(criticalCall[1]).toBe('table');
    expect(criticalCall[2][0].fields[1].value).toBe('No priority 1 requirements found');

    const vcrmCall = addNewContentToDocumentSkin.mock.calls.find(
      (call: any[]) => call[0] === 'vcrm'
    ) as any[];
    expect(vcrmCall).toBeDefined();
    expect(vcrmCall[1]).toBe('table');
    expect(vcrmCall[2][0].fields[2].value).toBe('No requirements available');

    expect(
      addNewContentToDocumentSkin.mock.calls.some((call: any[]) => call[0] === 'subsystem-to-system-trace')
    ).toBe(false);
    expect(
      addNewContentToDocumentSkin.mock.calls.some((call: any[]) => call[0] === 'system-to-subsystem-trace')
    ).toBe(false);
  });

  test('adds SysRS trace controls only when trace queries are requested', async () => {
    mockedRequirementsDataFactory.mockImplementation(() => ({
      fetchRequirementsData: jest.fn().mockResolvedValue(undefined),
      getAdoptedData: jest.fn().mockReturnValue({
        systemRequirementsData: [{ fields: [{ name: 'Title', value: 'REQ-1' }] }],
        criticalRequirementsData: [{ fields: [{ name: 'ID', value: 1 }] }],
        vcrmData: [{ fields: [{ name: 'ID', value: 1 }] }],
        subsystemToSystemTraceAdoptedData: { adoptedData: [{ fields: [{ name: 'x', value: 'y' }] }] },
        systemToSubsystemTraceAdoptedData: { adoptedData: [{ fields: [{ name: 'x', value: 'y' }] }] },
      }),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
    }));

    const { controller, addNewContentToDocumentSkin } = createController();

    const controls = await controller.addSysRSContent(
      {
        systemRequirements: { wiql: { href: 'sys-req-url' } },
        subsystemToSystemRequirements: { wiql: { href: 'trace-fwd-url' } },
        systemToSubsystemRequirements: { wiql: { href: 'trace-rev-url' } },
      },
      'sysrs-document',
      4,
      'hierarchical'
    );

    expect(controls.map((c: any) => c.title)).toEqual([
      'system-requirements',
      'critical-requirements',
      'vcrm',
      'subsystem-to-system-trace',
      'system-to-subsystem-trace',
    ]);

    const subsystemToSystemCall = addNewContentToDocumentSkin.mock.calls.find(
      (call: any[]) => call[0] === 'subsystem-to-system-trace'
    ) as any[];
    expect(subsystemToSystemCall).toBeDefined();
    expect(subsystemToSystemCall[1]).toBe('trace');
    expect(subsystemToSystemCall[2].errorMessage).toBeNull();

    const systemToSubsystemCall = addNewContentToDocumentSkin.mock.calls.find(
      (call: any[]) => call[0] === 'system-to-subsystem-trace'
    ) as any[];
    expect(systemToSubsystemCall).toBeDefined();
    expect(systemToSubsystemCall[1]).toBe('trace');
    expect(systemToSubsystemCall[2].errorMessage).toBeNull();
  });

  test('adds trace error messages when requested SysRS trace queries return no adopted rows', async () => {
    mockedRequirementsDataFactory.mockImplementation(() => ({
      fetchRequirementsData: jest.fn().mockResolvedValue(undefined),
      getAdoptedData: jest.fn().mockReturnValue({
        systemRequirementsData: [{ fields: [{ name: 'Title', value: 'REQ-1' }] }],
        criticalRequirementsData: [{ fields: [{ name: 'ID', value: 1 }] }],
        vcrmData: [{ fields: [{ name: 'ID', value: 1 }] }],
        subsystemToSystemTraceAdoptedData: { adoptedData: [] },
        systemToSubsystemTraceAdoptedData: { adoptedData: [] },
      }),
      getAttachmentMinioData: jest.fn().mockReturnValue([]),
    }));

    const { controller, addNewContentToDocumentSkin } = createController();

    await controller.addSysRSContent(
      {
        systemRequirements: { wiql: { href: 'sys-req-url' } },
        subsystemToSystemRequirements: { wiql: { href: 'trace-fwd-url' } },
        systemToSubsystemRequirements: { wiql: { href: 'trace-rev-url' } },
      },
      'sysrs-document',
      4,
      'hierarchical'
    );

    const subsystemToSystemCall = addNewContentToDocumentSkin.mock.calls.find(
      (call: any[]) => call[0] === 'subsystem-to-system-trace'
    ) as any[];
    expect(subsystemToSystemCall).toBeDefined();
    expect(subsystemToSystemCall[2].errorMessage).toBe('No Sub-System to System traceability data');

    const systemToSubsystemCall = addNewContentToDocumentSkin.mock.calls.find(
      (call: any[]) => call[0] === 'system-to-subsystem-trace'
    ) as any[];
    expect(systemToSubsystemCall).toBeDefined();
    expect(systemToSubsystemCall[2].errorMessage).toBe('No System to Sub-System traceability data');
  });

  test('generateContentControl routes sysrs-document to addSysRSContent', async () => {
    const { controller } = createController();

    const addSysRSContentSpy = jest
      .spyOn(controller, 'addSysRSContent')
      .mockResolvedValue([{ title: 'system-requirements', wordObjects: [] }] as any);
    jest.spyOn(controller as any, 'writeToJson').mockResolvedValue('/tmp/sysrs.json');
    jest.spyOn(controller as any, 'uploadToMinio').mockResolvedValue({
      bucketName: 'content-controls',
      objectName: 'sysrs.json',
    });
    jest.spyOn(controller as any, 'deleteFile').mockImplementation(() => undefined);

    const payload = {
      type: 'sysrs-document',
      title: 'sysrs-document-content-control',
      headingLevel: 4,
      data: {
        displayMode: 'hierarchical',
        queriesRequest: {
          systemRequirements: { wiql: { href: 'sys-req-url' } },
        },
      },
    };

    await controller.generateContentControl(payload as any);

    expect(addSysRSContentSpy).toHaveBeenCalledWith(
      payload.data.queriesRequest,
      payload.title,
      payload.headingLevel,
      payload.data.displayMode
    );
  });
});
