import SystemOverviewDataSkinAdapter from '../../adapters/SystemOverviewDataSkinAdapter';
import HtmlUtils from '../../services/htmlUtils';
import RichTextDataFactory from '../../factories/RichTextDataFactory';
import logger from '../../services/logger';

jest.mock('../../services/htmlUtils');
jest.mock('../../factories/RichTextDataFactory');
jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('SystemOverviewDataSkinAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (HtmlUtils as jest.Mock).mockImplementation(() => ({
      cleanHtml: jest.fn().mockResolvedValue('cleaned-description'),
    }));
    (RichTextDataFactory as jest.Mock).mockImplementation(() => ({
      factorizeRichTextData: jest.fn().mockResolvedValue('rich-description'),
      attachmentMinioData: [{ attachmentPath: 'minio/path', fileName: 'file.png' }],
    }));
  });

  it('adapts nodes in explicit link order (sourceIds/targetIds)', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false }
    );

    const rows = await adapter.jsonSkinAdapter({
      systemOverviewQueryData: [
        { id: 1, title: 'Root', description: '<p>r</p>', htmlUrl: 'u1' },
        { id: 2, title: 'Child', description: '<p>c</p>', htmlUrl: 'u2' },
      ],
      systemOverviewLinksDebug: {
        sourceIds: [0, 1],
        targetIds: [1, 2],
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ level: 3 });
    expect(rows[1]).toMatchObject({ level: 4 });
    expect(rows[0].fields[0].value).toContain('Root');
    expect(rows[1].fields[0].value).toContain('Child');
    expect(adapter.getAttachmentMinioData()).toEqual(
      expect.arrayContaining([{ attachmentMinioPath: 'minio/path', minioFileName: 'file.png' }])
    );
  });

  it('adapts recursively when links debug is not provided', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false }
    );

    const rows = await adapter.jsonSkinAdapter({
      systemOverviewQueryData: [
        {
          id: 1,
          title: 'Root',
          description: '<p>root</p>',
          htmlUrl: 'u1',
          children: [{ id: 2, title: 'Child', description: '<p>child</p>', htmlUrl: 'u2' }, { id: 2 }],
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ level: 3 });
    expect(rows[1]).toMatchObject({ level: 4 });
  });

  it('throws when result size exceeds configured maximum', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false },
      false
    );

    const sourceIds = new Array(501).fill(0);
    const targetIds = new Array(501).fill(1);

    await expect(
      adapter.jsonSkinAdapter({
        systemOverviewQueryData: [{ id: 1, title: 'Root', description: 'd', htmlUrl: 'u1' }],
        systemOverviewLinksDebug: { sourceIds, targetIds },
      })
    ).rejects.toThrow('Too many results to process');

    expect((logger as any).error).toHaveBeenCalled();
  });

  it('supports workItemRelations debug shape and recovers when parent is missing from stack', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false }
    );

    const rows = await adapter.jsonSkinAdapter({
      systemOverviewQueryData: [
        { id: 1, title: 'Root', description: 'r', htmlUrl: 'u1' },
        { id: 9, title: 'Detached Parent', description: 'p', htmlUrl: 'u9' },
        { id: 2, title: 'Child', description: 'c', htmlUrl: 'u2' },
      ],
      systemOverviewLinksDebug: {
        workItemRelations: [
          { rel: null, target: { id: 1 } },
          { source: { id: 9 }, target: { id: 2 } },
        ],
      },
    });

    expect(rows.map((r: any) => r.fields[0].value)).toEqual(
      expect.arrayContaining(['Root - ', 'Detached Parent - ', 'Child - '])
    );
  });

  it('enforces recursive mode size limit when links debug is absent', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false }
    );

    const largeTree = Array.from({ length: 501 }, (_, i) => ({
      id: i + 1,
      title: `Node ${i + 1}`,
      description: 'd',
      htmlUrl: `u${i + 1}`,
    }));

    await expect(adapter.jsonSkinAdapter({ systemOverviewQueryData: largeTree })).rejects.toThrow(
      'Too many results to process'
    );
  });

  it('handles missing link nodes and defensive link parsing branches', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false }
    );

    // Missing target node should hit emitNodeById early-return branch.
    const rows = await adapter.jsonSkinAdapter({
      systemOverviewQueryData: [{ id: 1, title: 'Only', description: 'd', htmlUrl: 'u1' }],
      systemOverviewLinksDebug: { sourceIds: [0], targetIds: [999] },
    });
    expect(rows).toEqual([]);

    // Empty/unsupported shape should return [] from deriveLinkPairs.
    expect((adapter as any).deriveLinkPairs({})).toEqual([]);

    // Getter throw should be swallowed in countFromLinks catch branch.
    const brokenLinksDebug = {};
    Object.defineProperty(brokenLinksDebug, 'sourceIds', {
      get() {
        throw new Error('broken');
      },
    });
    expect((adapter as any).countFromLinks(brokenLinksDebug)).toBe(0);
  });

  it('skips recursive emission when current node is already in ancestry (cycle guard)', async () => {
    const adapter = new SystemOverviewDataSkinAdapter(
      'MEWP',
      '/tmp/template',
      'bucket',
      'minio',
      'key',
      'secret',
      'pat',
      { trimAdditionalSpacingInDescriptions: false }
    );
    await (adapter as any).adaptDataRecursively(
      [{ id: 1, title: 'Cyclic', description: 'd', htmlUrl: 'u1' }],
      3,
      new Set([1])
    );
    expect(adapter.getAttachmentMinioData()).toEqual([]);
  });
});
