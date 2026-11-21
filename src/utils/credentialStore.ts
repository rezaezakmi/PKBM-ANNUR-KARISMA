import { SessionIssuedCredential } from '../types/siakad';

const STORAGE_KEY = 'siakad_issued_credentials_v1';

interface StoredCredentialMap {
  byUid: Record<string, SessionIssuedCredential>;
  byUsername: Record<string, SessionIssuedCredential>;
}

function readRawStore(): StoredCredentialMap {
  if (typeof window === 'undefined') {
    return { byUid: {}, byUsername: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byUid: {}, byUsername: {} };
    const parsed = JSON.parse(raw) as
      | Partial<StoredCredentialMap>
      | Record<string, SessionIssuedCredential>;
    if (parsed && typeof parsed === 'object' && 'byUid' in parsed && parsed.byUid) {
      return {
        byUid: parsed.byUid as Record<string, SessionIssuedCredential>,
        byUsername: ((parsed as StoredCredentialMap).byUsername || {}) as Record<
          string,
          SessionIssuedCredential
        >,
      };
    }
    // Migrasi jika format flat
    const byUid: Record<string, SessionIssuedCredential> = {};
    const byUsername: Record<string, SessionIssuedCredential> = {};
    Object.entries(parsed || {}).forEach(([k, val]) => {
      if (val && typeof val === 'object' && 'password' in val && typeof val.password === 'string') {
        byUid[k] = val as SessionIssuedCredential;
        if (val.username) {
          byUsername[val.username.trim().toLowerCase()] = val as SessionIssuedCredential;
        }
      }
    });
    return { byUid, byUsername };
  } catch {
    return { byUid: {}, byUsername: {} };
  }
}

function writeRawStore(store: StoredCredentialMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Abaikan kuota storage penuh
  }
}

export function loadStoredCredentials(): Record<string, SessionIssuedCredential> {
  const store = readRawStore();
  return { ...store.byUid };
}

/**
 * Menggabungkan kredensial lokal dan sinkronisasi Firestore tanpa menimpa sandi terbaru
 * dengan entri lama (stale) yang mungkin masih tersisa di browser.
 */
export function mergeCredentialsMaps(
  primaryMap: Record<string, SessionIssuedCredential>,
  secondaryMap: Record<string, SessionIssuedCredential>
): Record<string, SessionIssuedCredential> {
  const merged: Record<string, SessionIssuedCredential> = { ...secondaryMap };
  Object.entries(primaryMap).forEach(([uid, cred]) => {
    if (!cred?.password) return;
    const existing = merged[uid];
    if (!existing || !existing.password) {
      merged[uid] = cred;
      return;
    }
    const primaryTs = Date.parse(cred.issuedAt || '') || 0;
    const existingTs = Date.parse(existing.issuedAt || '') || 0;
    if (primaryTs >= existingTs) {
      merged[uid] = cred;
    }
  });
  return merged;
}

export function findStoredCredentialForAccount(
  map: Record<string, SessionIssuedCredential>,
  uid?: string,
  username?: string
): SessionIssuedCredential | undefined {
  if (uid && map[uid]?.password) return map[uid];
  const normUname = (username || '').trim().toLowerCase();
  if (!normUname) return undefined;
  const matches = Object.values(map).filter(
    (c) => c?.password && c.username.trim().toLowerCase() === normUname
  );
  if (matches.length > 0) {
    matches.sort((a, b) => (Date.parse(b.issuedAt || '') || 0) - (Date.parse(a.issuedAt || '') || 0));
    return matches[0];
  }
  const store = readRawStore();
  return store.byUsername[normUname];
}

export function saveStoredCredentials(
  creds: SessionIssuedCredential[]
): Record<string, SessionIssuedCredential> {
  const store = readRawStore();
  creds.forEach((cred) => {
    if (!cred || !cred.uid || !cred.password) return;
    const normUname = cred.username ? cred.username.trim().toLowerCase() : '';
    if (normUname) {
      // Bersihkan UID lama yang memakai username sama (mis. pasca reset password) agar tidak bentrok
      Object.entries(store.byUid).forEach(([existingUid, existingCred]) => {
        if (
          existingUid !== cred.uid &&
          existingCred?.username?.trim().toLowerCase() === normUname
        ) {
          delete store.byUid[existingUid];
        }
      });
      store.byUsername[normUname] = cred;
    }
    store.byUid[cred.uid] = cred;
  });
  writeRawStore(store);
  return { ...store.byUid };
}

export function updateStoredCredentialMetadata(params: {
  uid: string;
  oldUsername?: string;
  newUsername: string;
  newName?: string;
  newClassLabel?: string;
}): Record<string, SessionIssuedCredential> {
  const store = readRawStore();
  const normOld = (params.oldUsername || '').trim().toLowerCase();
  const normNew = params.newUsername.trim().toLowerCase();
  const existing = store.byUid[params.uid] || (normOld ? store.byUsername[normOld] : undefined);
  if (existing) {
    const updated: SessionIssuedCredential = {
      ...existing,
      uid: params.uid,
      username: normNew,
      name: params.newName?.trim() || existing.name,
      classLabel: params.newClassLabel !== undefined ? params.newClassLabel : existing.classLabel,
      issuedAt: new Date().toISOString(),
    };
    if (normOld && normOld !== normNew && store.byUsername[normOld]?.uid === params.uid) {
      delete store.byUsername[normOld];
    }
    store.byUid[params.uid] = updated;
    store.byUsername[normNew] = updated;
    writeRawStore(store);
  }
  return { ...store.byUid };
}

export function removeStoredCredential(
  uid: string,
  username?: string
): Record<string, SessionIssuedCredential> {
  const store = readRawStore();
  delete store.byUid[uid];
  const normUname = (username || '').trim().toLowerCase();
  if (normUname && store.byUsername[normUname]?.uid === uid) {
    delete store.byUsername[normUname];
  }
  writeRawStore(store);
  return { ...store.byUid };
}
