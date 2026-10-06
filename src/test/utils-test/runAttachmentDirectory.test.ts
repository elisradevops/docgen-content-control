import { runAttachmentDirectory, runAttachmentPath } from '../../utils/runAttachmentDirectory';
import { runContextStore } from '../../services/runContext';

describe('runAttachmentDirectory', () => {
  test('is "run-<runId>" for a run id', () => {
    expect(runAttachmentDirectory('req-1a2b')).toBe('run-req-1a2b');
  });

  test('reads the run id from the ambient run context', () => {
    runContextStore.run({ runId: 'ses-abc' }, () => {
      expect(runAttachmentDirectory()).toBe('run-ses-abc');
      expect(runAttachmentPath('guid.png')).toBe('run-ses-abc/guid.png');
    });
  });

  test('is empty without a run id, so the name stays flat', () => {
    expect(runAttachmentDirectory(undefined)).toBe('');
    expect(runAttachmentDirectory('')).toBe('');
    expect(runAttachmentPath('guid.png', '')).toBe('guid.png');
    expect(runAttachmentPath('guid.png')).toBe('guid.png'); // no ambient context
  });

  test('can never produce a path that leaves its directory', () => {
    for (const hostile of ['../../etc', '/abs/path', 'a/b', '..', '.', 'x\\y', 'a b', 'é']) {
      const directory = runAttachmentDirectory(hostile);
      expect(directory).toMatch(/^run-[A-Za-z0-9._-]*$/);
      expect(directory).not.toContain('/');
      expect(directory).not.toBe('..');
    }
  });

  test('caps the length of the directory name', () => {
    expect(runAttachmentDirectory('a'.repeat(500)).length).toBe('run-'.length + 64);
  });

  describe('ATTACHMENT_RUN_DIRECTORY', () => {
    const previous = process.env.ATTACHMENT_RUN_DIRECTORY;
    afterEach(() => {
      if (previous === undefined) delete process.env.ATTACHMENT_RUN_DIRECTORY;
      else process.env.ATTACHMENT_RUN_DIRECTORY = previous;
    });

    test('"off" writes the flat names as before, so a rollback needs no release', () => {
      process.env.ATTACHMENT_RUN_DIRECTORY = 'off';
      expect(runAttachmentDirectory('req-1a2b')).toBe('');
      expect(runAttachmentPath('guid.png', 'req-1a2b')).toBe('guid.png');
      process.env.ATTACHMENT_RUN_DIRECTORY = ' OFF ';
      expect(runAttachmentDirectory('req-1a2b')).toBe('');
    });

    test('anything else (unset, on, a typo) keeps the run directory', () => {
      delete process.env.ATTACHMENT_RUN_DIRECTORY;
      expect(runAttachmentDirectory('req-1a2b')).toBe('run-req-1a2b');
      process.env.ATTACHMENT_RUN_DIRECTORY = 'on';
      expect(runAttachmentDirectory('req-1a2b')).toBe('run-req-1a2b');
      process.env.ATTACHMENT_RUN_DIRECTORY = 'of';
      expect(runAttachmentDirectory('req-1a2b')).toBe('run-req-1a2b');
    });
  });
});

