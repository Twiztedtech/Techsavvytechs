import { adminAuth, adminDb, adminStorage } from './firebase-admin.js';
import { isAcceptableReceiptFile } from './receipts.js';
import { alertRecipients, sanitizePhotoRefs, viewerFor } from './community.js';

// Shared pieces for the forum and wiki handlers: sign-in, display names, photo
// checks, and working out who to alert.

export const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
export const nowIso = () => new Date().toISOString();
export const appUrl = () => (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');

/** "TechSavvy Community <address>" using the same sending address as the rest of the app. */
export function communitySender() {
  const configured = process.env.EMAIL_FROM || 'TechSavvy <support@techsavvytechs.com>';
  const address = configured.match(/<([^>]+)>/)?.[1] || configured;
  return `TechSavvy Community <${address}>`;
}

/**
 * Verifies the token and returns { user, viewer }. With required (the default)
 * it throws 401 without a token and 403 without portal access; with
 * required:false a missing token simply gives an anonymous viewer (public wiki pages).
 */
export async function authenticate(req, { required = true } = {}) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    if (required) throw fail('Authentication required.', 401);
    return { user: null, viewer: viewerFor(null) };
  }
  let user;
  try { user = await adminAuth.verifyIdToken(token); }
  catch {
    if (!required) return { user: null, viewer: viewerFor(null) };
    throw fail('Your sign-in expired. Please sign in again.', 401);
  }
  const viewer = viewerFor(user);
  if (required && !viewer.canRead) throw fail('Community access is for TechSavvy technicians and staff.', 403);
  return { user, viewer };
}

export const requirePost = (req) => {
  if (req.method !== 'POST') throw fail('Method not allowed.', 405);
};

/** Name shown next to a person's posts. Technicians use their profile name; staff use their account name. */
export async function displayNameFor(user) {
  if (user.contractor === true) {
    const snapshot = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
    const name = snapshot.docs[0]?.data()?.name;
    if (name) return String(name).slice(0, 80);
  }
  return String(user.name || user.email?.split('@')[0] || 'TechSavvy staff').slice(0, 80);
}

/** Keeps photo references that point at the poster's own real image files in Storage. */
export async function verifiedPhotos(input, uid) {
  const verified = [];
  for (const photo of sanitizePhotoRefs(input, { uid, bucket: adminStorage.name })) {
    try {
      const [metadata] = await adminStorage.file(photo.path).getMetadata();
      if (isAcceptableReceiptFile(metadata)) verified.push({ name: photo.name, path: photo.path, url: photo.url, contentType: metadata.contentType, size: Number(metadata.size) });
    } catch { /* a missing file is simply not attached */ }
  }
  return verified;
}

/** Technician profiles for a list of login ids (Firestore `in` queries take 30 at a time). */
export async function contractorsByUid(uids) {
  const unique = [...new Set((uids || []).filter(Boolean))];
  const found = [];
  for (let i = 0; i < unique.length; i += 30) {
    const snapshot = await adminDb.collection('contractors').where('authUid', 'in', unique.slice(i, i + 30)).get();
    snapshot.docs.forEach((doc) => found.push({ id: doc.id, ...doc.data() }));
  }
  return found;
}

/**
 * Who to tell about something in a thread: technicians by their notification
 * settings (email unless off; text only when verified and opted in) and staff
 * followers by email. Never includes `exceptUid`.
 */
export async function alertTargets(uids, exceptUid = '') {
  const wanted = [...new Set((uids || []).filter((uid) => uid && uid !== exceptUid))];
  if (!wanted.length) return [];
  const technicians = await contractorsByUid(wanted);
  const targets = alertRecipients({ followerUids: wanted, authorUid: exceptUid, technicians });
  const covered = new Set(technicians.map((technician) => technician.authUid));
  const staffUids = wanted.filter((uid) => !covered.has(uid));
  for (let i = 0; i < staffUids.length; i += 100) {
    const result = await adminAuth.getUsers(staffUids.slice(i, i + 100).map((uid) => ({ uid }))).catch(() => ({ users: [] }));
    for (const account of result.users) {
      const claims = account.customClaims || {};
      if ((claims.admin === true || ['assistant_admin', 'dispatcher'].includes(claims.staffRole)) && account.email) targets.push({ uid: account.uid, name: account.displayName || '', email: account.email, phone: '' });
    }
  }
  return targets;
}
