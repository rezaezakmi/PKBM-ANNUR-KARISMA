import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().some((a) => a.name === '[DEFAULT]')
  ? getApp('[DEFAULT]')
  : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

const SECONDARY_APP_NAME = 'SiakadAccountProvisioner';
let secondaryAuthPromise: Promise<Auth> | null = null;

/**
 * Instance Firebase Auth kedua khusus pembuatan akun oleh Admin
 * menggunakan inMemoryPersistence agar sesi Admin utama tidak pernah ikut logout.
 */
export async function getProvisionerAuth(): Promise<Auth> {
  if (!secondaryAuthPromise) {
    secondaryAuthPromise = (async () => {
      const secondaryApp = getApps().some((a) => a.name === SECONDARY_APP_NAME)
        ? getApp(SECONDARY_APP_NAME)
        : initializeApp(firebaseConfig, SECONDARY_APP_NAME);
      const secondaryAuth = getAuth(secondaryApp);
      await setPersistence(secondaryAuth, inMemoryPersistence);
      return secondaryAuth;
    })();
  }
  return secondaryAuthPromise;
}

export const INTERNAL_EMAIL_DOMAIN = 'annurkarisma.app';

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

export function buildInternalEmail(
  username: string,
  version = 1,
  collisionSalt?: string
): string {
  const clean = normalizeUsername(username);
  const versionSuffix = version > 1 ? `.v${version}` : '';
  const saltSuffix = collisionSalt ? `.${collisionSalt}` : '';
  return `${clean}${versionSuffix}${saltSuffix}@${INTERNAL_EMAIL_DOMAIN}`;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Harap periksa konfigurasi Firebase Anda — klien sedang offline.');
      return false;
    }
    return true;
  }
}

testConnection();
