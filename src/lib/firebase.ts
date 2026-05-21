import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, setDoc, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, query, orderBy, getDocFromServer, deleteDoc } from 'firebase/firestore';
import { getDatabase, ref, onValue, set, update, push, remove } from 'firebase/database';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const isUserProject = firebaseConfig.projectId === 'epedu-inventory-database';
const dbId = isUserProject ? undefined : firebaseConfig.firestoreDatabaseId;
export const db = getFirestore(app, dbId);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// Simple anonymous sign-in for MVP
signInAnonymously(auth).catch(err => console.error("Anonymous Auth Error:", err));

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation check as per skill
async function testConnection() {
  try {
    // Attempting a read to verify connection
    await getDocFromServer(doc(db, 'system', 'ping'));
  } catch (error) {
    console.warn("Firebase connection test failed (expected if rules are restricted):", error);
  }
}
testConnection();

export { collection, doc, addDoc, updateDoc, setDoc, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, query, orderBy, deleteDoc, ref, onValue, set, update, push, remove };
