import { adminAuth, adminDb } from './firebase-admin.js';
import { DEFAULT_CATEGORIES, viewerFor } from './community.js';

// Technician community forum and skills wiki.
// Reached through POST/GET /api/portal/time-clock?portalOperation=community&action=...
// so it shares the existing serverless function (the 12-function limit stays at 12).
// Every collection behind it is server-only in firestore.rules; this handler is the
// single gate, so permissions are checked here with the pure helpers in community.js.

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** Verifies the token and returns { user, viewer }. Throws 401 without a token, 403 without portal access. */
export async function authenticate(req, { required = true } = {}) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    if (required) throw fail('Authentication required.', 401);
    return { user: null, viewer: viewerFor(null) };
  }
  let user;
  try { user = await adminAuth.verifyIdToken(token); }
  catch { throw fail('Your sign-in expired. Please sign in again.', 401); }
  const viewer = viewerFor(user);
  if (required && !viewer.canRead) throw fail('Community access is for TechSavvy technicians and staff.', 403);
  return { user, viewer };
}

/** Name shown next to a person's posts. Contractors use their profile name; staff use their account name. */
export async function displayNameFor(user) {
  if (user.contractor === true) {
    const snapshot = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
    const name = snapshot.docs[0]?.data()?.name;
    if (name) return String(name).slice(0, 80);
  }
  return String(user.name || user.email?.split('@')[0] || 'TechSavvy staff').slice(0, 80);
}

/** The forum categories, created from the defaults the first time anyone asks. */
export async function listCategories() {
  const collection = adminDb.collection('community_categories');
  let snapshot = await collection.get();
  if (snapshot.empty) {
    const batch = adminDb.batch();
    for (const category of DEFAULT_CATEGORIES) batch.set(collection.doc(category.id), { ...category, createdAt: new Date().toISOString() });
    await batch.commit();
    snapshot = await collection.get();
  }
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

const actions = {
  async categories(req, res) {
    await authenticate(req);
    return res.status(200).json({ categories: await listCategories() });
  },
};

export default async function communityHandler(req, res) {
  const action = String(req.query?.action || req.body?.action || '');
  const run = actions[action];
  if (!run) return res.status(404).json({ error: 'Unknown community action.' });
  try {
    return await run(req, res);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('Community request failed:', error);
    return res.status(status).json({ error: status >= 500 ? 'The community could not complete that request. Please try again.' : error.message });
  }
}
