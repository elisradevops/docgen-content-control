// The services-JSON feature needs three release variables. Missing ones used to produce two
// context-free warnings ("missing variables in release", "required: ...") that named neither the
// release nor the variables, and treated "feature not configured" like a misconfiguration.
jest.mock('../../services/logger');
jest.mock('axios');

import ChangeDataFactory from '../../factories/ChangeDataFactory';
import logger from '../../services/logger';

const makeFactory = () =>
  new ChangeDataFactory(
    'TestProject', 'repo-123', '', '', 'release', ['Related'], 'main', false, false,
    'https://wiki.example.com/file.md', true, true, {} as any, 'bucket', 'minio.example.com', 'access', 'secret', 'pat'
  ) as any;

const release = (variables: Record<string, { value: string }>, extra: Record<string, unknown> = {}) => ({
  id: 30,
  name: 'Release-30',
  releaseDefinition: { id: 1, name: 'Odeds-test-release-pipeline' },
  variables,
  ...extra,
});

describe('handleServiceJsonFile: release variables', () => {
  beforeEach(() => jest.clearAllMocks());

  test('none of the three set: the feature is not configured — a single info, no warning, skipped', async () => {
    const result = await makeFactory().handleServiceJsonFile(release({}), release({}), 'proj', {}, false);
    expect(result).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("'Release-30'"));
  });

  test('partly configured: one warning naming the release, the pipeline and exactly the missing variables', async () => {
    const to = release({ servicesJson: { value: 'services.json' }, servicesJsonVersion: { value: 'main' } });
    const result = await makeFactory().handleServiceJsonFile(release({}), to, 'proj', {}, false);
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const message = (logger.warn as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain("'Release-30'");
    expect(message).toContain("'Odeds-test-release-pipeline'");
    expect(message).toContain('servicesJsonVersionType');
    expect(message).not.toContain('servicesJsonVersion,'); // only what is actually missing is listed
    expect(message).not.toMatch(/required: servicesJson\.value/); // the old generic message is gone
  });

  test('lists several missing variables, and a blank value counts as missing', async () => {
    const to = release({ servicesJson: { value: '  ' }, servicesJsonVersion: { value: 'main' }, servicesJsonVersionType: { value: 'branch' } });
    await makeFactory().handleServiceJsonFile(release({}), to, 'proj', {}, false);
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain('servicesJson that') ;
  });

  test('copes with a release that has no name, definition or variables at all', async () => {
    await expect(makeFactory().handleServiceJsonFile({}, {}, 'proj', {}, false)).resolves.toBe(false);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("'unknown'"));
  });
});
