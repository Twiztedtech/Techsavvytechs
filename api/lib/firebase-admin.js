import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)) });
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);

export async function requireAdmin(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const decoded = await adminAuth.verifyIdToken(token);
  if (decoded.admin !== true) throw new Error('Administrator access required.');
  return decoded;
}
