import { runAccessProbe, validateAccessProbeBody } from '../../services/accessProbe';

describe('validateAccessProbeBody', () => {
  test('needs an organization URL and a project name', () => {
    expect(validateAccessProbeBody({ orgUrl: 'https://org/', projectName: 'MEWP' })).toBeUndefined();
    expect(validateAccessProbeBody({ orgUrl: 'https://org/' })).toMatch(/required/);
    expect(validateAccessProbeBody({ projectName: 'MEWP' })).toMatch(/required/);
    expect(validateAccessProbeBody({ orgUrl: '  ', projectName: 'MEWP' })).toMatch(/required/);
    expect(validateAccessProbeBody({ orgUrl: 'https://org/', projectName: 42 })).toMatch(/required/);
    expect(validateAccessProbeBody(undefined)).toMatch(/required/);
  });
});

describe('runAccessProbe', () => {
  const access = { repositories: { status: 'ok', count: 3 }, releases: { status: 'denied', httpStatus: 403 } };

  test('returns the identity summary and the access result, and passes the token and project on', async () => {
    const svc = {
      checkOrgUrlValidity: jest.fn().mockResolvedValue({
        instanceId: 'secret',
        authenticatedUser: { providerDisplayName: 'Build Service', descriptor: 'Microsoft.TeamFoundation.ServiceIdentity;x', id: 'guid' },
      }),
      probeProjectAccess: jest.fn().mockResolvedValue(access),
    };

    const result = await runAccessProbe(svc, 'the-token', 'MEWP');

    expect(svc.checkOrgUrlValidity).toHaveBeenCalledWith('the-token');
    expect(svc.probeProjectAccess).toHaveBeenCalledWith('MEWP');
    expect(result).toEqual({
      identity: { providerDisplayName: 'Build Service', customDisplayName: undefined, descriptor: 'Microsoft.TeamFoundation.ServiceIdentity;x' },
      access,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('guid');
  });

  test('a failed identity lookup is not an error: the access result is still returned', async () => {
    const svc = {
      checkOrgUrlValidity: jest.fn().mockRejectedValue(new Error('401')),
      probeProjectAccess: jest.fn().mockResolvedValue(access),
    };

    await expect(runAccessProbe(svc, 't', 'P')).resolves.toEqual({ identity: undefined, access });
  });

  test('a provider failure is an error for the caller (the route answers 500)', async () => {
    const svc = {
      checkOrgUrlValidity: jest.fn().mockResolvedValue(undefined),
      probeProjectAccess: jest.fn().mockRejectedValue(new Error('Management data provider unavailable')),
    };

    await expect(runAccessProbe(svc, 't', 'P')).rejects.toThrow('Management data provider unavailable');
  });
});
