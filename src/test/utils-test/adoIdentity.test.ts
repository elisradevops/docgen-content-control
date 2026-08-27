import { extractWindowsIdentityHint } from '../../utils/adoIdentity';

describe('extractWindowsIdentityHint', () => {
  test('accepts a real on-prem AD-backed identity (values confirmed live against a Windows-auth Azure DevOps Server)', () => {
    const raw = {
      count: 1,
      value: [
        {
          id: '69c3a88a-e668-4ed9-b9e8-9c2eb96fc30e',
          isContainer: false,
          properties: {
            SchemaClassName: { $type: 'System.String', $value: 'User' },
            Domain: { $type: 'System.String', $value: 'GALAXY' },
            Account: { $type: 'System.String', $value: 'EdenS' },
          },
        },
      ],
    };

    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: 'GALAXY', account: 'EdenS' });
  });

  test('REGRESSION: trims whitespace-padded Domain/Account values before returning them', () => {
    const raw = {
      count: 1,
      value: [{ id: 'x', isContainer: false, properties: { Domain: { $value: '  GALAXY  ' }, Account: { $value: '  EdenS  ' } } }],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: 'GALAXY', account: 'EdenS' });
  });

  test('REGRESSION: rejects a cloud/Entra-backed identity even though Domain/Account keys ARE present (verbatim from Microsoft Learn IMS docs sample) — a naive presence-only check would wrongly accept this', () => {
    const raw = {
      count: 1,
      value: [
        {
          id: 'aad-id-1',
          isContainer: false,
          properties: {
            Domain: { $type: 'System.String', $value: '7a394543-62fd-4274-a7d2-8fac775942b6' }, // AAD tenant GUID
            Account: { $type: 'System.String', $value: 'jtseng@vscsi.us' }, // UPN, not a sAMAccountName
          },
        },
      ],
    };

    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('REGRESSION: rejects a GUID FRAGMENT (partial tenant GUID, not just the full 36-char form) — a validator that only checked the full GUID shape would wrongly accept this', () => {
    const raw = {
      count: 1,
      value: [
        {
          id: 'aad-id-fragment',
          isContainer: false,
          properties: {
            Domain: { $type: 'System.String', $value: '7a394543-62fd' }, // GUID prefix fragment, 13 chars — under the 15-char NetBIOS cap
            Account: { $type: 'System.String', $value: 'jtseng' },
          },
        },
      ],
    };

    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('REGRESSION: rejects a domain with a trailing hyphen (GUID-fragment boundary case)', () => {
    const raw = {
      count: 1,
      value: [{ id: 'x', isContainer: false, properties: { Domain: { $value: '7a394543-' }, Account: { $value: 'jtseng' } } }],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('REGRESSION: rejects a domain with a leading hyphen', () => {
    const raw = {
      count: 1,
      value: [{ id: 'x', isContainer: false, properties: { Domain: { $value: '-62fd4274' }, Account: { $value: 'jtseng' } } }],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('REGRESSION: rejects a domain with a doubled hyphen', () => {
    const raw = {
      count: 1,
      value: [{ id: 'x', isContainer: false, properties: { Domain: { $value: '7a394543--62fd' }, Account: { $value: 'jtseng' } } }],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('a real domain name with a hyphen (not hex-only) is still correctly accepted', () => {
    const raw = {
      count: 1,
      value: [{ id: 'x', isContainer: false, properties: { Domain: { $value: 'CONTOSO-HQ' }, Account: { $value: 'jtseng' } } }],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: 'CONTOSO-HQ', account: 'jtseng' });
  });

  test('rejects a group identity (isContainer: true), even with a Domain-shaped value', () => {
    const raw = {
      count: 1,
      value: [
        {
          id: 'group-1',
          isContainer: true,
          properties: {
            Domain: { $value: 'vstfs:///Framework/IdentityDomain/abcd1234-abcd-1234-abcd-1234abcd1234' },
            Account: { $value: 'SomeGroup' },
          },
        },
      ],
    };

    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('rejects when properties is an empty object', () => {
    const raw = { count: 1, value: [{ id: 'x', isContainer: false, properties: {} }] };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('rejects when properties has no Domain/Account keys at all', () => {
    const raw = { count: 1, value: [{ id: 'x', isContainer: false, properties: { SomeOtherKey: { $value: 'z' } } }] };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('rejects an empty value array', () => {
    expect(extractWindowsIdentityHint({ count: 0, value: [] })).toEqual({ domain: null, account: null });
  });

  test('rejects a domain that is valid but paired with an account that is a UPN (all-or-nothing pairing)', () => {
    const raw = {
      count: 1,
      value: [
        {
          id: 'x',
          isContainer: false,
          properties: { Domain: { $value: 'GALAXY' }, Account: { $value: 'eden@galaxy.local' } },
        },
      ],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('rejects an over-length domain string (real NetBIOS domains are <=15 chars)', () => {
    const raw = {
      count: 1,
      value: [
        {
          id: 'x',
          isContainer: false,
          properties: { Domain: { $value: 'THISDOMAINNAMEISWAYTOOLONG' }, Account: { $value: 'EdenS' } },
        },
      ],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('rejects a dotted DNS-style domain', () => {
    const raw = {
      count: 1,
      value: [{ id: 'x', isContainer: false, properties: { Domain: { $value: 'corp.contoso.com' }, Account: { $value: 'EdenS' } } }],
    };
    expect(extractWindowsIdentityHint(raw)).toEqual({ domain: null, account: null });
  });

  test('never throws — handles null, undefined, a string body, and a malformed shape gracefully', () => {
    expect(extractWindowsIdentityHint(null)).toEqual({ domain: null, account: null });
    expect(extractWindowsIdentityHint(undefined)).toEqual({ domain: null, account: null });
    expect(extractWindowsIdentityHint('<html>sign in</html>')).toEqual({ domain: null, account: null });
    expect(extractWindowsIdentityHint({})).toEqual({ domain: null, account: null });
    expect(extractWindowsIdentityHint({ value: [{ properties: { Domain: 'GALAXY' } }] })).toEqual({
      domain: null,
      account: null,
    }); // Domain not wrapped in {$value: ...} — malformed, must not throw or misread
  });
});
