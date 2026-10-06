import { identitySummary } from '../../utils/identitySummary';

describe('identitySummary', () => {
  test('keeps only the display names and the descriptor', () => {
    const connection = {
      instanceId: 'secret-instance',
      authenticatedUser: {
        id: 'guid-1',
        providerDisplayName: 'Project Collection Build Service (Org)',
        customDisplayName: 'Build Service',
        descriptor: 'Microsoft.TeamFoundation.ServiceIdentity;abc',
        properties: { Account: { $value: 'svc@corp' } },
      },
    };

    expect(identitySummary(connection)).toEqual({
      providerDisplayName: 'Project Collection Build Service (Org)',
      customDisplayName: 'Build Service',
      descriptor: 'Microsoft.TeamFoundation.ServiceIdentity;abc',
    });
    expect(JSON.stringify(identitySummary(connection))).not.toContain('svc@corp');
    expect(JSON.stringify(identitySummary(connection))).not.toContain('guid-1');
  });

  test('is undefined when there is no authenticated user', () => {
    expect(identitySummary(undefined)).toBeUndefined();
    expect(identitySummary({})).toBeUndefined();
    expect(identitySummary({ authenticatedUser: 'x' })).toBeUndefined();
  });
});
