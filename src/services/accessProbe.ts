import { identitySummary, IdentitySummary } from '../utils/identitySummary';

interface ProbeService {
  checkOrgUrlValidity(token?: string): Promise<any>;
  probeProjectAccess(projectName: string): Promise<any>;
}

/** The request needs an organization URL and a project name; a message when it does not, else undefined. */
export function validateAccessProbeBody(body: any): string | undefined {
  if (typeof body?.orgUrl !== 'string' || !body.orgUrl.trim() || typeof body?.projectName !== 'string' || !body.projectName.trim()) {
    return 'orgUrl and projectName are required';
  }
  return undefined;
}

/**
 * Who the credential is and what it can see in the project. The identity is best effort (the credential was
 * validated elsewhere, so a failed lookup is not an error here); a failing probe read is reported by the
 * provider per area, so this only fails when the provider itself cannot be created.
 */
export async function runAccessProbe(
  svc: ProbeService,
  token: string,
  projectName: string
): Promise<{ identity: IdentitySummary | undefined; access: any }> {
  const [connection, access] = await Promise.all([
    svc.checkOrgUrlValidity(token).catch(() => undefined),
    svc.probeProjectAccess(projectName),
  ]);
  return { identity: identitySummary(connection), access };
}
