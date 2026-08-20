export interface WindowsIdentityHint {
  domain: string | null;
  account: string | null;
}

const EMPTY: WindowsIdentityHint = { domain: null, account: null };

// Reads ADO's `{ $type, $value }` property-bag encoding for one key.
function readIdentityProperty(identity: any, key: string): string | null {
  const raw = identity?.properties?.[key];
  if (raw && typeof raw === 'object' && typeof raw.$value === 'string') {
    return raw.$value;
  }
  return null;
}

// True only for a plausible NetBIOS-style AD domain name: max 15 chars
// (the real NetBIOS length limit), no dots/@/backslash/forward-slash, and
// explicitly not a GUID (which is what a cloud/Entra tenant ID looks like).
function isNetbiosDomain(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 15) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return false; // GUID
  // Also reject any hyphen-joined run of hex-only segments — catches a
  // GUID FRAGMENT of any length (e.g. "7a394543-62fd"), not just the full
  // 36-char canonical form the check above already catches. A real NetBIOS
  // domain name essentially never looks like pure hex digits joined by
  // hyphens, so this is safe to reject outright.
  if (trimmed.includes('-') && /^[0-9a-f-]+$/i.test(trimmed)) return false;
  return /^[A-Za-z0-9_-]{1,15}$/.test(trimmed);
}

// True only for a bare sAMAccountName: non-empty, reasonable length, no
// @ (rejects a UPN/email), no \ or / (rejects a DOMAIN\user or path-shaped value).
function isSamAccountName(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return false;
  return !/[@\\/]/.test(trimmed);
}

/**
 * Extracts a Windows-integrated-auth hint from a raw `_apis/identities`
 * response. Returns { domain: null, account: null } for anything that is
 * not an unambiguously AD-backed on-prem USER identity — including a
 * cloud/Entra identity, which returns a *plausible-looking but wrong*
 * payload (tenant GUID as "domain", UPN as "account"), not an empty one.
 * Never throws.
 */
export function extractWindowsIdentityHint(raw: any): WindowsIdentityHint {
  try {
    const identity = raw?.value?.[0];
    if (!identity || identity.isContainer === true) {
      return EMPTY;
    }

    const domain = readIdentityProperty(identity, 'Domain');
    const account = readIdentityProperty(identity, 'Account');

    if (!isNetbiosDomain(domain) || !isSamAccountName(account)) {
      return EMPTY; // all-or-nothing: a half-valid pair is worse than blank
    }

    return { domain: (domain as string).trim(), account: (account as string).trim() };
  } catch {
    return EMPTY;
  }
}
