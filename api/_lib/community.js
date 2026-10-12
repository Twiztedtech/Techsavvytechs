// Community forum and skills wiki: the rules that do not need a database.
// Pure functions only (like receipts.js and notification-eligibility.js) so
// permissions, cleaning, search ranking and alert recipients are unit tested.
import { technicianNotifiable } from './notification-eligibility.js';
import { downloadUrlPrefix } from './receipts.js';

export const LIMITS = {
  title: 140,
  thread: 8000,
  reply: 4000,
  wikiTitle: 120,
  wikiSummary: 300,
  wikiBody: 60000,
  note: 1000,
  photos: 6,
  followers: 200,
};
export const OWN_POST_EDIT_WINDOW_MS = 15 * 60 * 1000;

// Created the first time anyone opens the forum; admins can rename or reorder them later.
export const DEFAULT_CATEGORIES = [
  { id: 'cabling', name: 'Cabling', description: 'Cat6/6A, termination, testing, pulling and labeling', order: 1 },
  { id: 'fiber', name: 'Fiber', description: 'Splicing, termination, OTDR and cleaning', order: 2 },
  { id: 'networking', name: 'Networking', description: 'Switches, Wi-Fi, firewalls and troubleshooting', order: 3 },
  { id: 'cell-boosters', name: 'Cell boosters', description: 'Signal surveys, boosters and antenna placement', order: 4 },
  { id: 'tools-safety', name: 'Tools & safety', description: 'Gear recommendations, ladders, lifts and site safety', order: 5 },
  { id: 'jobs-customers', name: 'Jobs & customers', description: 'Tough sites, customer questions and lessons learned', order: 6 },
  { id: 'general', name: 'General', description: 'Anything else', order: 7 },
];

// ---- text -------------------------------------------------------------------

/** One line of text: whitespace collapsed, control characters removed, length capped. */
export function cleanLine(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A post body: keeps line breaks, drops control characters, caps blank runs and length. */
export function cleanBody(value, max) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function slugify(title) {
  return cleanLine(title, 200)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export const isValidSlug = (value) => typeof value === 'string' && value.length >= 1 && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

// ---- who can do what ----------------------------------------------------------

/**
 * What a signed-in user may do. Read and post: technicians, Admin, Assistant Admin
 * and Dispatcher. Moderate and publish training: Admin, Assistant Admin and
 * Technician Leads. Office/Billing and anyone without a portal claim get nothing.
 */
export function viewerFor(user) {
  if (!user || !user.uid) return { uid: '', canRead: false, canPost: false, canModerate: false, isAdmin: false, role: 'none' };
  const isAdmin = user.admin === true;
  const staff = ['assistant_admin', 'dispatcher'].includes(user.staffRole);
  const isTech = user.contractor === true;
  const canRead = isAdmin || staff || isTech;
  const canModerate = isAdmin || user.staffRole === 'assistant_admin' || (isTech && user.technicianLead === true);
  const role = isAdmin ? 'admin' : user.staffRole === 'assistant_admin' ? 'assistant_admin' : user.staffRole === 'dispatcher' ? 'dispatcher' : isTech && user.technicianLead === true ? 'technician_lead' : isTech ? 'technician' : 'none';
  return { uid: user.uid, canRead, canPost: canRead, canModerate, isAdmin, role };
}

/** A user may change or remove their own post (within the edit window for edits), or a moderator may. */
export function canManagePost(viewer, post, { now = Date.now(), forEdit = false } = {}) {
  if (!viewer?.canRead) return false;
  if (viewer.canModerate) return true;
  if (!post || post.authorUid !== viewer.uid) return false;
  if (!forEdit) return true;
  const created = Date.parse(post.createdAt);
  return Number.isFinite(created) && now - created <= OWN_POST_EDIT_WINDOW_MS;
}

/** The thread author or any moderator can mark the answer. */
export const canMarkAnswer = (viewer, thread) => Boolean(viewer?.canRead && (viewer.canModerate || thread?.authorUid === viewer.uid));

/** Who may see a wiki page: public pages by anyone; members-only pages by readers; drafts by moderators. */
export function canViewWikiPage(page, viewer) {
  if (!page) return false;
  if (viewer?.canModerate) return true;
  if (page.status !== 'published') return false;
  if (page.visibility === 'public') return true;
  return Boolean(viewer?.canRead);
}

// ---- photos -------------------------------------------------------------------

/** Forum photos are uploaded into the author's own folder before the post is sent. */
export const communityPhotoFolder = (uid) => `community/uploads/${uid}/`;

/** Keeps only photo references inside the poster's own folder with a matching download URL. */
export function sanitizePhotoRefs(input, { uid, bucket, max = LIMITS.photos }) {
  if (!Array.isArray(input) || !uid || !bucket) return [];
  const folder = communityPhotoFolder(uid);
  const seen = new Set();
  const refs = [];
  for (const item of input) {
    const path = cleanLine(item?.path, 400);
    const url = cleanLine(item?.url, 1200);
    if (!path.startsWith(folder) || path.includes('..') || path.slice(folder.length).includes('/')) continue;
    if (!url.startsWith(downloadUrlPrefix(bucket, path))) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    refs.push({ name: cleanLine(item?.name, 120) || path.slice(folder.length), path, url });
    if (refs.length >= max) break;
  }
  return refs;
}

// ---- search -------------------------------------------------------------------

export function tokenize(query) {
  return [...new Set(String(query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 2))].slice(0, 6);
}

/** Lowercase text a record can be searched by. */
export const buildSearchText = (...parts) => parts.map((part) => cleanLine(part, 2000).toLowerCase()).filter(Boolean).join(' ');

/** Every term must appear somewhere; titles count most, then summaries, then the rest. 0 means no match. */
export function scoreItem(terms, { title = '', summary = '', body = '' }) {
  if (!terms.length) return 0;
  const t = String(title).toLowerCase();
  const s = String(summary).toLowerCase();
  const b = String(body).toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inTitle = t.includes(term);
    const inSummary = s.includes(term);
    const inBody = b.includes(term);
    if (!inTitle && !inSummary && !inBody) return 0;
    score += (inTitle ? 5 : 0) + (inSummary ? 3 : 0) + (inBody ? 1 : 0);
  }
  return score;
}

/** Best matches first; ties go to the most recently active. */
export function rankSearch(query, items, { limit = 20 } = {}) {
  const terms = tokenize(query);
  return items
    .map((item) => ({ item, score: scoreItem(terms, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.updatedAt || '').localeCompare(String(a.item.updatedAt || '')))
    .slice(0, limit)
    .map((entry) => entry.item);
}

// ---- alerts -------------------------------------------------------------------

/**
 * Who to tell about a new reply: followers other than the person who wrote it,
 * with email unless they turned it off and text only if they verified a phone
 * and opted in. `technicians` are contractor profiles.
 */
export function alertRecipients({ followerUids = [], authorUid = '', technicians = [] }) {
  const followers = new Set(followerUids.filter((uid) => uid && uid !== authorUid));
  return technicians
    .filter((technician) => technician.authUid && followers.has(technician.authUid))
    .filter((technician) => !technician.accessStatus || technician.accessStatus === 'Active')
    .map((technician) => {
      const { canEmail, canSms } = technicianNotifiable(technician);
      return {
        uid: technician.authUid,
        name: technician.name || '',
        email: canEmail ? technician.email || '' : '',
        phone: canSms ? technician.mobile || '' : '',
      };
    })
    .filter((recipient) => recipient.email || recipient.phone);
}

/** Followers list stays small: add a uid once, never beyond the cap. */
export function addFollower(followers, uid) {
  const list = Array.isArray(followers) ? followers : [];
  if (!uid || list.includes(uid)) return list;
  return [...list, uid].slice(-LIMITS.followers);
}

// ---- training progress ----------------------------------------------------------

/** Records a lesson as completed at its current version; returns the updated progress map. */
export function markLessonComplete(progress, slug, version, now = new Date().toISOString()) {
  return { ...(progress && typeof progress === 'object' ? progress : {}), [slug]: { completedAt: now, version: Number(version) || 1 } };
}

/** True when the technician finished an older version of the lesson than the one published now. */
export const needsRetake = (progress, slug, currentVersion) => {
  const done = progress?.[slug];
  return Boolean(done) && Number(done.version || 1) < Number(currentVersion || 1);
};
