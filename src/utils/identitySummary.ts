// The identity fields the access probe returns to api-gate: the display names and the descriptor (which
// says what kind of identity it is, e.g. a service identity), and nothing else from connectionData: its ids,
// locations and instance data are not something a run record needs.
export interface IdentitySummary {
  providerDisplayName?: string;
  customDisplayName?: string;
  descriptor?: string;
}

export function identitySummary(connectionData: any): IdentitySummary | undefined {
  const user = connectionData?.authenticatedUser;
  if (!user || typeof user !== 'object') return undefined;
  return {
    providerDisplayName: user.providerDisplayName,
    customDisplayName: user.customDisplayName,
    descriptor: user.descriptor,
  };
}
