import NonAssociatedCommitsDataSkinAdapter from '../../adapters/NonAssociatedCommitsDataSkinAdapter';

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('NonAssociatedCommitsDataSkinAdapter', () => {
  it('adopts only non-linked commits, sanitizes text and includes release columns', async () => {
    const adapter = new NonAssociatedCommitsDataSkinAdapter(
      [
        {
          nonLinkedCommits: [
            {
              commitId: 'abcde12345',
              url: 'http://example/commit',
              comment: 'Fix\u000bcontrol-char',
              commitDate: '2026-01-01T10:00:00.000Z',
              committer: 'Alice',
              releaseVersion: 'Rel-9',
              releaseRunDate: '2026-01-02T11:00:00.000Z',
            },
          ],
        },
        { nonLinkedCommits: [] },
      ] as any,
      true
    );

    const rows = await adapter.adoptSkinData();
    expect(rows).toHaveLength(1);
    const fields = rows[0].fields;
    expect(fields.find((f: any) => f.name === 'Commit #').value).toBe('abcde');
    expect(fields.find((f: any) => f.name === 'Comment').value).toBe('Fixcontrol-char');
    expect(fields.find((f: any) => f.name === 'Committed by').value).toBe('Alice');
    expect(fields.find((f: any) => f.name === 'Release').value).toBe('Rel-9');
    expect(fields.find((f: any) => f.name === 'Created').value).toContain('/');
  });

  it('keeps columns without release metadata when commit is not linked to release', async () => {
    const adapter = new NonAssociatedCommitsDataSkinAdapter(
      [
        {
          nonLinkedCommits: [
            {
              commitId: 'fffff12345',
              url: 'http://example/commit2',
              comment: 'No release',
              commitDate: '2026-02-01T10:00:00.000Z',
              committer: 'Bob',
            },
          ],
        },
      ] as any,
      false
    );
    const rows = await adapter.adoptSkinData();
    expect(rows).toHaveLength(1);
    const fieldNames = rows[0].fields.map((f: any) => f.name);
    expect(fieldNames).not.toContain('Committed by');
    expect(fieldNames).not.toContain('Release');
    expect(fieldNames).not.toContain('Created');
  });

  it('sorts multiple commits and handles nullable text values', async () => {
    const adapter = new NonAssociatedCommitsDataSkinAdapter(
      [
        {
          nonLinkedCommits: [
            {
              commitId: 'aaaaa11111',
              url: 'http://example/c1',
              comment: null,
              commitDate: '2026-01-01T10:00:00.000Z',
              committer: null,
              releaseVersion: 'Rel-10',
              releaseRunDate: '2026-01-03T10:00:00.000Z',
            },
            {
              commitId: 'bbbbb22222',
              url: 'http://example/c2',
              comment: 'second',
              commitDate: '2026-01-01T09:00:00.000Z',
              committer: 'Dev',
              releaseVersion: 'Rel-9',
              releaseRunDate: '2026-01-01T10:00:00.000Z',
            },
          ],
        },
      ] as any,
      true
    );

    const rows = await adapter.adoptSkinData();
    // Ensure comparator path is exercised and latest release appears first.
    expect(rows).toHaveLength(2);
    expect(rows[0].fields.find((f: any) => f.name === 'Commit #')?.value).toBe('aaaaa');
    expect(rows[0].fields.find((f: any) => f.name === 'Comment')?.value).toBe('');
    expect(adapter.getAdoptedData()).toHaveLength(2);
  });

  it('covers comparator run-date and commit-date fallback branches', async () => {
    const adapter = new NonAssociatedCommitsDataSkinAdapter(
      [
        {
          nonLinkedCommits: [
            {
              commitId: 'ccccc11111',
              url: 'http://example/c3',
              comment: 'x',
              commitDate: '2026-01-01T10:00:00.000Z',
              committer: 'Dev 1',
              releaseVersion: 'Rel-10',
              releaseRunDate: '2026-01-01T10:00:00.000Z',
            },
            {
              commitId: 'ddddd22222',
              url: 'http://example/c4',
              comment: 'y',
              commitDate: '2026-01-01T11:00:00.000Z',
              committer: 'Dev 2',
              releaseVersion: 'Rel-10',
              releaseRunDate: '2026-01-01T10:00:00.000Z',
            },
          ],
        },
      ] as any,
      false
    );

    const rows = await adapter.adoptSkinData();
    expect(rows[0].fields.find((f: any) => f.name === 'Commit #')?.value).toBe('ddddd');
  });
});
