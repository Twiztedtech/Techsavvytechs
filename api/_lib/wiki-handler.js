import { adminDb } from './firebase-admin.js';
import { rateLimited } from './client-portal.js';
import { LIMITS, canViewWikiPage, cleanBody, cleanLine, isValidSlug, markLessonComplete, needsRetake, slugify } from './community.js';
import { authenticate, displayNameFor, fail, nowIso, requirePost } from './community-core.js';

// Skills wiki and training. Actions are merged into the community handler:
//   wiki-list, wiki-page (public pages need no sign-in), wiki-save, wiki-revisions,
//   wiki-suggest, wiki-suggestions, wiki-review-suggestion,
//   training-complete, training-progress, training-matrix.

const pagesCol = () => adminDb.collection('wiki_pages');
const revisionsCol = () => adminDb.collection('wiki_revisions');
const suggestionsCol = () => adminDb.collection('wiki_suggestions');
const progressCol = () => adminDb.collection('training_progress');

/** A short plain excerpt from a markdown body when the author did not write a summary. */
const derivedSummary = (body) => cleanLine(String(body).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`|\-\[\]()!]/g, ' '), LIMITS.wikiSummary);

function pageSummary(slug, data, progress) {
  const done = progress?.[slug];
  return {
    slug,
    title: data.title,
    track: data.track || 'General',
    summary: data.summary || '',
    visibility: data.visibility || 'members',
    status: data.status || 'draft',
    order: Number(data.order || 0),
    estimatedMinutes: Number(data.estimatedMinutes || 0),
    version: Number(data.version || 0),
    updatedAt: data.updatedAt || '',
    searchText: data.searchText || '',
    ...(progress ? { completed: Boolean(done), needsRetake: needsRetake(progress, slug, data.version) } : {}),
  };
}

async function myProgress(viewer) {
  if (!viewer?.uid) return null;
  const snapshot = await progressCol().doc(viewer.uid).get();
  return snapshot.exists ? snapshot.data().lessons || {} : {};
}

/** Every page the viewer may see (public pages for anyone, members pages for readers, drafts for moderators). */
export async function visiblePages(viewer) {
  const docs = (await pagesCol().limit(500).get()).docs;
  const progress = await myProgress(viewer);
  return docs.filter((doc) => canViewWikiPage(doc.data(), viewer)).map((doc) => pageSummary(doc.id, doc.data(), progress));
}

async function applyBody(slug, current, { body, title, userUid, userName, note }) {
  const version = Number(current?.version || 0) + 1;
  const now = nowIso();
  await pagesCol().doc(slug).set({ body, ...(title ? { title } : {}), status: 'published', version, searchText: `${(title || current?.title || '')} ${body}`.toLowerCase().slice(0, 4000), updatedAt: now, updatedByUid: userUid, updatedByName: userName }, { merge: true });
  await revisionsCol().add({ pageSlug: slug, version, title: title || current?.title || '', body, editorUid: userUid, editorName: userName, at: now, note: cleanLine(note, 200) });
  return version;
}

export const wikiActions = {
  async 'wiki-list'(req, res) {
    const { viewer } = await authenticate(req, { required: false });
    const pages = (await visiblePages(viewer)).filter((page) => page.status === 'published' || viewer.canModerate).map(({ searchText, ...page }) => page);
    const trackOrder = new Map();
    pages.forEach((page) => { trackOrder.set(page.track, Math.min(trackOrder.get(page.track) ?? Infinity, page.order)); });
    pages.sort((a, b) => (trackOrder.get(a.track) - trackOrder.get(b.track)) || a.track.localeCompare(b.track) || a.order - b.order || a.title.localeCompare(b.title));
    return res.status(200).json({ pages, viewer: { role: viewer.role, canModerate: viewer.canModerate, signedIn: viewer.canRead } });
  },

  async 'wiki-page'(req, res) {
    const { viewer } = await authenticate(req, { required: false });
    const slug = cleanLine(req.query?.slug, 80);
    const snapshot = isValidSlug(slug) ? await pagesCol().doc(slug).get() : null;
    if (!snapshot?.exists || !canViewWikiPage(snapshot.data(), viewer)) throw fail('That page was not found.', 404);
    const data = snapshot.data();
    const progress = await myProgress(viewer);
    const pending = viewer.canModerate ? (await suggestionsCol().where('pageSlug', '==', slug).where('status', '==', 'pending').get()).size : 0;
    const { searchText, ...summary } = pageSummary(slug, data, progress);
    return res.status(200).json({ page: { ...summary, body: data.body, updatedByName: data.updatedByName || '' }, canEdit: viewer.canModerate, pendingSuggestions: pending, signedIn: viewer.canRead });
  },

  async 'wiki-save'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only technician leads and administrators can edit training pages.', 403);
    const input = req.body || {};
    const title = cleanLine(input.title, LIMITS.wikiTitle);
    if (title.length < 3) throw fail('Give the page a title (at least 3 characters).', 422);
    const body = cleanBody(input.body, LIMITS.wikiBody);
    if (!body) throw fail('The page needs some content.', 422);
    const visibility = input.visibility === 'public' ? 'public' : 'members';
    const status = input.status === 'published' ? 'published' : 'draft';
    let slug = cleanLine(input.slug, 80);
    if (slug && !isValidSlug(slug)) throw fail('That page address is not valid.', 422);
    let existing = null;
    if (slug) {
      const snapshot = await pagesCol().doc(slug).get();
      existing = snapshot.exists ? snapshot.data() : null;
    } else {
      const base = slugify(title);
      if (!base) throw fail('Give the page a title with some letters in it.', 422);
      slug = base;
      for (let n = 2; (await pagesCol().doc(slug).get()).exists && n < 50; n += 1) slug = `${base}-${n}`.slice(0, 80);
    }
    if (visibility === 'public' && existing?.visibility !== 'public' && input.confirmPublic !== true) {
      return res.status(409).json({ error: 'Public pages can be read by anyone on the internet. Confirm this page has no customer names, prices, passwords or private site details.', requiresConfirmation: true });
    }
    const userName = await displayNameFor(user);
    const now = nowIso();
    const bodyChanged = !existing || existing.body !== body;
    let version = Number(existing?.version || 0);
    if (status === 'published' && (bodyChanged || existing?.status !== 'published')) version += 1;
    const minutes = Math.max(0, Math.min(600, Number(input.estimatedMinutes) || 0));
    await pagesCol().doc(slug).set({
      title, track: cleanLine(input.track, 60) || 'General', summary: cleanLine(input.summary, LIMITS.wikiSummary) || derivedSummary(body), body, visibility, status,
      order: Number(input.order) || 0, estimatedMinutes: minutes, version,
      searchText: `${title} ${body}`.toLowerCase().slice(0, 4000),
      createdAt: existing?.createdAt || now, createdByName: existing?.createdByName || userName, updatedAt: now, updatedByUid: user.uid, updatedByName: userName,
    });
    if (status === 'published' && version !== Number(existing?.version || 0)) {
      await revisionsCol().add({ pageSlug: slug, version, title, body, editorUid: user.uid, editorName: userName, at: now, note: cleanLine(input.note, 200) });
    }
    return res.status(existing ? 200 : 201).json({ success: true, slug, version, status });
  },

  async 'wiki-revisions'(req, res) {
    const { viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only technician leads and administrators can see page history.', 403);
    const slug = cleanLine(req.query?.slug, 80);
    const docs = (await revisionsCol().where('pageSlug', '==', slug).limit(100).get()).docs;
    const revisions = docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => Number(b.version) - Number(a.version));
    return res.status(200).json({ revisions });
  },

  async 'wiki-suggest'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    if (rateLimited(req, `wiki-suggest:${user.uid}`, 10, 60 * 60 * 1000)) throw fail('Too many suggestions. Please wait a little.', 429);
    const slug = cleanLine(req.body?.slug, 80);
    const snapshot = isValidSlug(slug) ? await pagesCol().doc(slug).get() : null;
    if (!snapshot?.exists || !canViewWikiPage(snapshot.data(), viewer) || snapshot.data().status !== 'published') throw fail('That page was not found.', 404);
    const body = cleanBody(req.body?.body, LIMITS.wikiBody);
    if (!body || body === snapshot.data().body) throw fail('Change something in the text before sending a suggestion.', 422);
    const authorName = await displayNameFor(user);
    await suggestionsCol().doc(`${slug}__${user.uid}`).set({
      pageSlug: slug, pageTitle: snapshot.data().title, proposedBody: body, note: cleanLine(req.body?.note, LIMITS.note), baseVersion: Number(snapshot.data().version || 0),
      authorUid: user.uid, authorName, status: 'pending', createdAt: nowIso(),
    });
    return res.status(201).json({ success: true });
  },

  async 'wiki-suggestions'(req, res) {
    const { viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only technician leads and administrators can review suggestions.', 403);
    const docs = (await suggestionsCol().where('status', '==', 'pending').limit(100).get()).docs;
    const pages = new Map();
    const suggestions = [];
    for (const doc of docs) {
      const data = doc.data();
      if (!pages.has(data.pageSlug)) pages.set(data.pageSlug, (await pagesCol().doc(data.pageSlug).get()).data() || null);
      const page = pages.get(data.pageSlug);
      suggestions.push({ id: doc.id, ...data, currentBody: page?.body || '', currentVersion: Number(page?.version || 0), outdated: Number(page?.version || 0) > Number(data.baseVersion || 0) });
    }
    suggestions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return res.status(200).json({ suggestions });
  },

  async 'wiki-review-suggestion'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only technician leads and administrators can review suggestions.', 403);
    const ref = suggestionsCol().doc(cleanLine(req.body?.id, 160) || '_');
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().status !== 'pending') throw fail('That suggestion was not found.', 404);
    const suggestion = snapshot.data();
    const reviewerName = await displayNameFor(user);
    if (req.body?.approve !== true) {
      await ref.update({ status: 'rejected', reviewedBy: reviewerName, reviewedAt: nowIso(), reviewNote: cleanLine(req.body?.note, LIMITS.note) });
      return res.status(200).json({ success: true, status: 'rejected' });
    }
    const page = await pagesCol().doc(suggestion.pageSlug).get();
    if (!page.exists) throw fail('The page no longer exists.', 404);
    if (Number(page.data().version || 0) > Number(suggestion.baseVersion || 0) && req.body?.force !== true) {
      return res.status(409).json({ error: 'The page changed after this suggestion was written. Applying it would replace the newer text. Review it, then approve again to apply anyway.', outdated: true });
    }
    const version = await applyBody(suggestion.pageSlug, page.data(), { body: suggestion.proposedBody, userUid: user.uid, userName: `${reviewerName} (from ${suggestion.authorName})`, note: suggestion.note });
    await ref.update({ status: 'approved', reviewedBy: reviewerName, reviewedAt: nowIso(), appliedVersion: version });
    return res.status(200).json({ success: true, status: 'approved', version });
  },

  async 'training-complete'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    const slug = cleanLine(req.body?.slug, 80);
    const snapshot = isValidSlug(slug) ? await pagesCol().doc(slug).get() : null;
    if (!snapshot?.exists || snapshot.data().status !== 'published' || !canViewWikiPage(snapshot.data(), viewer)) throw fail('That lesson was not found.', 404);
    const ref = progressCol().doc(user.uid);
    const current = (await ref.get()).data() || {};
    const lessons = markLessonComplete(current.lessons, slug, snapshot.data().version);
    await ref.set({ lessons, name: await displayNameFor(user), updatedAt: nowIso() }, { merge: true });
    return res.status(200).json({ success: true, completed: true, version: Number(snapshot.data().version || 1) });
  },

  async 'training-progress'(req, res) {
    const { viewer } = await authenticate(req);
    const lessons = await myProgress(viewer);
    const pages = (await visiblePages(viewer)).filter((page) => page.status === 'published');
    const done = pages.filter((page) => lessons[page.slug] && !needsRetake(lessons, page.slug, page.version)).length;
    return res.status(200).json({ lessons, total: pages.length, completed: done });
  },

  async 'training-matrix'(req, res) {
    const { viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only technician leads and administrators can see training progress.', 403);
    const lessons = (await pagesCol().where('status', '==', 'published').limit(300).get()).docs
      .map((doc) => ({ slug: doc.id, title: doc.data().title, track: doc.data().track || 'General', order: Number(doc.data().order || 0), version: Number(doc.data().version || 1) }))
      .sort((a, b) => a.track.localeCompare(b.track) || a.order - b.order || a.title.localeCompare(b.title));
    const technicians = (await adminDb.collection('contractors').get()).docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((technician) => technician.authUid && (!technician.accessStatus || technician.accessStatus === 'Active'));
    const rows = [];
    for (const technician of technicians) {
      const progress = (await progressCol().doc(technician.authUid).get()).data()?.lessons || {};
      const completed = {};
      for (const lesson of lessons) if (progress[lesson.slug]) completed[lesson.slug] = { completedAt: progress[lesson.slug].completedAt, needsRetake: needsRetake(progress, lesson.slug, lesson.version) };
      rows.push({ uid: technician.authUid, name: technician.name || technician.email || technician.id, completed });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ lessons, rows });
  },
};
