/**
 * Test suite verification specification for SIAKAD PKBM ANNUR KARISMA Firestore Rules.
 * Covers all "Dirty Dozen" adversarial payloads from security_spec.md.
 */
export interface RuleTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  description: string;
}

export const dirtyDozenTests: RuleTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Read/Write',
    collection: '/students/s1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects anonymous or unauthenticated requests at global safety net.'
  },
  {
    id: 2,
    name: 'Self-Privilege Escalation',
    collection: '/users/u_murid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Non-admin user attempting to self-assign role: "admin" is blocked.'
  },
  {
    id: 3,
    name: 'Unverified Email Write',
    collection: '/announcements/a1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Requires request.auth.token.email_verified == true on write operations.'
  },
  {
    id: 4,
    name: 'Shadow Field Injection',
    collection: '/students/s1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects unknown fields like isSuperUser via data.keys().hasOnly().'
  },
  {
    id: 5,
    name: 'Cross-Student PII Scraping',
    collection: '/students/s_other',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Blocks Student A from reading Student B record where ownerUid differs.'
  },
  {
    id: 6,
    name: 'ID Poisoning',
    collection: '/subjects/' + 'x'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'isValidId() rejects document IDs > 128 chars or invalid characters.'
  },
  {
    id: 7,
    name: 'Timestamp Spoofing',
    collection: '/classes/c1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Requires createdAt == request.time and updatedAt == request.time.'
  },
  {
    id: 8,
    name: 'Immutable Field Tampering',
    collection: '/classes/c1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Prevents altering createdBy or createdAt on update.'
  },
  {
    id: 9,
    name: 'String Exhaustion (DoW)',
    collection: '/teachers/t1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects oversized fullName string > 120 chars.'
  },
  {
    id: 10,
    name: 'Non-Admin School Settings Tampering',
    collection: '/school_settings/main',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Only verified Admin can update letterhead or headmaster settings.'
  },
  {
    id: 11,
    name: 'Terminal Status Bypass',
    collection: '/assignments/as1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Teacher cannot update an assignment whose status is already Selesai.'
  },
  {
    id: 12,
    name: 'Teacher Assignment Spoofing',
    collection: '/assignments/as_new',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Non-admin teacher cannot create assignments on behalf of another teacher.'
  }
];
