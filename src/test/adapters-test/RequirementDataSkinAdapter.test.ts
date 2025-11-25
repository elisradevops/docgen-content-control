import RequirementDataSkinAdapter from '../../adapters/RequirementDataSkinAdapter';
import logger from '../../services/logger';

jest.mock('../../services/htmlUtils', () => {
  return jest.fn().mockImplementation(() => ({
    cleanHtml: jest.fn((html: string) => html),
  }));
});

jest.mock('../../factories/RichTextDataFactory', () => {
  return jest.fn().mockImplementation(() => ({
    factorizeRichTextData: jest.fn().mockResolvedValue('<p>rich</p>'),
    attachmentMinioData: [
      { attachmentPath: 'path1', fileName: 'file1' },
      { attachmentPath: 'path2', fileName: 'file2' },
    ],
  }));
});

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('RequirementDataSkinAdapter', () => {
  const baseArgs: [string, string, string, string, string, string, string, any] = [
    'test-project',
    '/template',
    'bucket',
    'endpoint',
    'access-key',
    'secret-key',
    'pat',
    { trimAdditionalSpacingInDescriptions: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('adapts hierarchical tree under size limit with TFS links', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true);

    const roots = [
      {
        id: 1,
        title: 'Root Req',
        description: 'Root desc',
        htmlUrl: 'http://root',
        children: [
          {
            id: 2,
            title: 'Child Req',
            description: 'Child desc',
            htmlUrl: 'http://child',
            children: [],
          },
        ],
      },
    ];

    const result = await adapter.jsonSkinAdapter({ requirementQueryData: roots });

    expect(result.length).toBe(2);
    expect(result[0].fields[0].value).toBe('Root Req - ');
    expect(result[0].fields[1].value).toBe(1);
    expect(result[0].fields[1].url).toBe('http://root');
    expect(result[1].fields[1].value).toBe(2);
    expect(result[1].fields[1].url).toBe('http://child');

    const attachments = adapter.getAttachmentMinioData();
    expect(attachments.length).toBeGreaterThan(0);
  });

  test('throws when node count exceeds limit with allowBiggerThan500 = false', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true);

    const largeRoots = Array.from({ length: 501 }, (_, i) => ({
      id: i + 1,
      title: `Req ${i + 1}`,
      description: 'desc',
      children: [],
    }));

    await expect(adapter.jsonSkinAdapter({ requirementQueryData: largeRoots })).rejects.toThrow(
      'Too many results to process'
    );

    expect((logger as any).error).toHaveBeenCalled();
  });

  test('throws when link-driven node count exceeds limit with allowBiggerThan500 = false', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true);

    const allItems: any = {
      1: { id: 1, title: 'Root', description: 'root', htmlUrl: 'http://root', children: [] },
      2: { id: 2, title: 'Child', description: 'child', htmlUrl: 'http://child', children: [] },
    };

    // Create more than 500 link pairs using explicit sourceIds/targetIds
    const sourceIds = Array.from({ length: 501 }, () => 1);
    const targetIds = Array.from({ length: 501 }, (_, i) => i + 2);

    const linksDebug = { allItems, sourceIds, targetIds };

    await expect(
      adapter.jsonSkinAdapter({ requirementQueryData: [], workItemLinksDebug: linksDebug })
    ).rejects.toThrow('Too many results to process');

    expect((logger as any).error).toHaveBeenCalled();
  });

  test('uses higher node limit when allowBiggerThan500 is true', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, true, true);

    const roots = Array.from({ length: 800 }, (_, i) => ({
      id: i + 1,
      title: `Req ${i + 1}`,
      description: 'desc',
      children: [],
      htmlUrl: `http://req/${i + 1}`,
    }));

    const result = await adapter.jsonSkinAdapter({ requirementQueryData: roots });

    expect(result.length).toBe(800);
  });

  test('throws when node count exceeds 1000 with allowBiggerThan500 = true', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, true, true);

    const largeRoots = Array.from({ length: 1001 }, (_, i) => ({
      id: i + 1,
      title: `Req ${i + 1}`,
      description: 'desc',
      children: [],
    }));

    await expect(adapter.jsonSkinAdapter({ requirementQueryData: largeRoots })).rejects.toThrow(
      'Too many results to process'
    );

    expect((logger as any).error).toHaveBeenCalled();
  });

  test('adapts using link-driven workItemRelations and respects includeTFSLinks = false', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, false);

    const allItems = {
      1: { id: 1, title: 'Root', description: 'root', htmlUrl: 'http://root', children: [] },
      2: { id: 2, title: 'Child', description: 'child', htmlUrl: 'http://child', children: [] },
    } as any;

    const workItemRelations = [
      { rel: null, source: null, target: { id: 1 } },
      { source: { id: 1 }, target: { id: 2 }, rel: { name: 'Child' } },
    ];

    const linksDebug = { allItems, workItemRelations };

    const result = await adapter.jsonSkinAdapter({
      requirementQueryData: [],
      workItemLinksDebug: linksDebug,
    });

    expect(result.length).toBe(2);
    expect(result[0].fields[1].value).toBe(1);
    expect(result[0].fields[1].url).toBeUndefined();
    expect(result[1].fields[1].value).toBe(2);
    expect(result[1].fields[1].url).toBeUndefined();
  });

  test('adaptDataFromLinks with explicit sourceIds/targetIds handles missing stack source as new root', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true);

    const allItems: any = {
      1: { id: 1, title: 'Root1', description: 'root1', htmlUrl: 'http://1', children: [] },
      2: { id: 2, title: 'Child1', description: 'c1', htmlUrl: 'http://2', children: [] },
      3: { id: 3, title: 'Root2', description: 'root2', htmlUrl: 'http://3', children: [] },
      4: { id: 4, title: 'Child2', description: 'c2', htmlUrl: 'http://4', children: [] },
    };

    // Pairs: 0->1 (root1), 1->2 (child of 1), 3->4 where 3 is not on stack, forcing fallback root branch
    const sourceIds = [0, 1, 3];
    const targetIds = [1, 2, 4];
    const linksDebug = { allItems, sourceIds, targetIds };

    const result = await adapter.jsonSkinAdapter({
      requirementQueryData: [],
      workItemLinksDebug: linksDebug,
    });

    const ids = result.map((r: any) => r.fields[1].value);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
  });

  test('adaptDataRecursively dedupes duplicate siblings and skips cycles', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true);

    const child = {
      id: 2,
      title: 'Child',
      description: 'child',
      htmlUrl: 'http://child',
      children: [],
    };

    const cycleNode: any = {
      id: 3,
      title: 'Cycle',
      description: 'cycle',
      htmlUrl: 'http://cycle',
      children: [],
    };

    const root: any = {
      id: 1,
      title: 'Root',
      description: 'root',
      htmlUrl: 'http://root',
      children: [child, child, cycleNode],
    };

    // Create a cycle: cycleNode.children points back to root
    cycleNode.children = [root];

    const result = await adapter.jsonSkinAdapter({ requirementQueryData: [root] });

    const ids = result.map((r: any) => r.fields[1].value);
    // Root, one Child (deduped), and Cycle
    expect(ids.filter((id: any) => id === 2).length).toBe(1);
    expect(ids).toContain(3);
  });

  test('logs critical error when links reference missing nodes', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true);

    const requirementQueryData = [
      { id: 1, title: 'Only Root', description: 'desc', htmlUrl: 'http://root', children: [] },
    ];

    const workItemRelations = [
      { rel: null, source: null, target: { id: 1 } },
      { source: { id: 1 }, target: { id: 2 }, rel: { name: 'Missing child' } },
      // Relation with missing source as well
      { source: { id: 3 }, target: { id: 4 }, rel: { name: 'Missing both' } },
    ];

    const linksDebug = { workItemRelations };

    const result = await adapter.jsonSkinAdapter({
      requirementQueryData,
      workItemLinksDebug: linksDebug,
    });

    // Only the existing root node is emitted; missing child is logged but not rendered.
    expect(result.length).toBe(1);
    expect((logger as any).error).toHaveBeenCalled();
  });

  test('countFromLinks returns 0 when deriveLinkPairs throws', () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true) as any;

    const spy = jest.spyOn(adapter, 'deriveLinkPairs').mockImplementation(() => {
      throw new Error('boom');
    });

    const total = adapter.countFromLinks({});
    expect(total).toBe(0);
    spy.mockRestore();
  });

  test('deriveLinkPairs returns empty array when no arrays or relations are present', () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true) as any;
    const pairs = adapter.deriveLinkPairs({});
    expect(pairs).toEqual([]);
  });

  test('jsonSkinAdapter logs and rethrows when inner processing fails', async () => {
    const adapter = new RequirementDataSkinAdapter(...baseArgs, false, true) as any;

    const roots = [
      {
        id: 1,
        title: 'Root Req',
        description: 'Root desc',
        htmlUrl: 'http://root',
        children: [],
      },
    ];

    // Force htmlUtils.cleanHtml to throw, triggering the catch in jsonSkinAdapter
    adapter.htmlUtils.cleanHtml.mockImplementation(() => {
      throw new Error('clean failed');
    });

    await expect(adapter.jsonSkinAdapter({ requirementQueryData: roots })).rejects.toThrow('clean failed');
    expect((logger as any).error).toHaveBeenCalledWith(
      expect.stringContaining('could not create the adopted data for requirements')
    );
  });
});
