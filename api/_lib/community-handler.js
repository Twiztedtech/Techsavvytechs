import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from './firebase-admin.js';
import { alertRecipients as officeAlertRecipients, rateLimited, sendEmail, sendSms, escapeHtml } from './client-portal.js';
import { technicianNotifiable } from './notification-eligibility.js';
import {
  DEFAULT_CATEGORIES, LIMITS, addFollower, buildSearchText, canManagePost, canMarkAnswer, cleanBody, cleanLine, communityPhotoFolder, isValidSlug, rankSearch, slugify,
} from './community.js';
import { alertTargets, appUrl, authenticate, communitySender, displayNameFor, fail, nowIso, requirePost, verifiedPhotos } from './community-core.js';
import { wikiActions, visiblePages } from './wiki-handler.js';

// Technician community forum.
// Reached through /api/portal/time-clock?portalOperation=community&action=...
// so it shares the existing serverless function (the 12-function limit stays at 12).
// Every collection behind it is server-only in firestore.rules; this handler is the
// single gate, so permissions are checked here with the pure helpers in community.js.

const threadsCol = () => adminDb.collection('community_threads');
const repliesCol = () => adminDb.collection('community_replies');
const reportsCol = () => adminDb.collection('community_reports');
const ROLE_LABELS = { admin: 'Admin', assistant_admin: 'Office', dispatcher: 'Dispatch', technician_lead: 'Technician Lead', technician: 'Technician' };

const limitPosting = (req, uid) => {
  if (rateLimited(req, `community-post:${uid}`, 12, 60 * 60 * 1000)) throw fail('You are posting quickly. Please wait a little and try again.', 429);
};
const asPhotos = (photos) => (Array.isArray(photos) ? photos.map((photo) => ({ name: photo.name || 'Photo', url: photo.url })) : []);

function shapeThread(id, data, viewer, { body = false } = {}) {
  return {
    id,
    categoryId: data.categoryId,
    title: data.title,
    excerpt: cleanLine(data.body, 180),
    ...(body ? { body: data.body } : {}),
    authorName: data.authorName || 'Former technician',
    authorRole: ROLE_LABELS[data.authorRole] || '',
    mine: data.authorUid === viewer.uid,
    createdAt: data.createdAt,
    editedAt: data.editedAt || '',
    lastActivityAt: data.lastActivityAt,
    replyCount: Number(data.replyCount || 0),
    pinned: data.pinned === true,
    locked: data.locked === true,
    solvedReplyId: data.solvedReplyId || '',
    status: data.status || 'active',
    photos: asPhotos(data.photos),
    following: Array.isArray(data.followers) && data.followers.includes(viewer.uid),
  };
}

function shapeReply(id, data, viewer) {
  if (data.status === 'hidden' && !viewer.canModerate) return { id, removed: true, createdAt: data.createdAt };
  return {
    id,
    body: data.body,
    authorName: data.authorName || 'Former technician',
    authorRole: ROLE_LABELS[data.authorRole] || '',
    mine: data.authorUid === viewer.uid,
    createdAt: data.createdAt,
    editedAt: data.editedAt || '',
    photos: asPhotos(data.photos),
    removed: data.status === 'hidden',
    removedBy: data.status === 'hidden' ? data.removedBy || '' : '',
  };
}

async function loadThread(id, viewer) {
  const snapshot = await threadsCol().doc(cleanLine(id, 80) || '_').get();
  if (!snapshot.exists) throw fail('That thread was not found.', 404);
  if (snapshot.data().status === 'hidden' && !viewer.canModerate) throw fail('That thread was not found.', 404);
  return snapshot;
}

// ---- alerts -----------------------------------------------------------------------

async function sendAlerts(targets, { subject, text, html, sms, type }) {
  await Promise.allSettled(targets.flatMap((target) => [
    target.email ? sendEmail({ to: target.email, subject, text, html, from: communitySender(), type }) : null,
    target.phone && sms ? sendSms({ to: target.phone, body: sms, type }) : null,
  ].filter(Boolean)));
}

async function notifyReply(thread, threadId, reply, authorName, authorUid) {
  const targets = await alertTargets(thread.followers || [], authorUid);
  if (!targets.length) return 0;
  const link = `${appUrl()}/community/t/${threadId}`;
  const excerpt = cleanLine(reply.body, 220);
  await sendAlerts(targets, {
    subject: `New reply in "${thread.title}"`,
    text: `${authorName} replied to "${thread.title}":\n\n${excerpt}\n\nOpen the thread: ${link}\n\nYou get these because you started or followed this thread. Unfollow from the thread page.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><p><strong>${escapeHtml(authorName)}</strong> replied to <strong>${escapeHtml(thread.title)}</strong>:</p><blockquote style="border-left:4px solid #f59e0b;margin:12px 0;padding:4px 12px;color:#334155">${escapeHtml(excerpt)}</blockquote><p><a href="${link}" style="display:inline-block;background:#f59e0b;color:#111827;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Open the thread</a></p><p style="font-size:12px;color:#64748b">You get these because you started or followed this thread. Unfollow from the thread page.</p></div>`,
    sms: `TechSavvy community: ${authorName} replied to "${cleanLine(thread.title, 60)}". ${link}`,
    type: 'community_reply',
  });
  return targets.length;
}

/** Announces a pinned thread to every active technician and staff member (only when a moderator asks for it). */
async function announceThread(thread, threadId, announcerName) {
  const snapshot = await adminDb.collection('contractors').get();
  const technicians = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((technician) => technician.authUid && (!technician.accessStatus || technician.accessStatus === 'Active'));
  const targets = technicians.map((technician) => {
    const { canEmail, canSms } = technicianNotifiable(technician);
    return { uid: technician.authUid, email: canEmail ? technician.email || '' : '', phone: canSms ? technician.mobile || '' : '' };
  }).filter((target) => target.email || target.phone);
  const link = `${appUrl()}/community/t/${threadId}`;
  await sendAlerts(targets, {
    subject: `Announcement: ${thread.title}`,
    text: `${announcerName} pinned a post in the TechSavvy community:\n\n${thread.title}\n\n${cleanLine(thread.body, 400)}\n\nRead it here: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><p><strong>${escapeHtml(announcerName)}</strong> pinned a post in the TechSavvy community:</p><h2 style="margin:8px 0">${escapeHtml(thread.title)}</h2><p>${escapeHtml(cleanLine(thread.body, 400))}</p><p><a href="${link}" style="display:inline-block;background:#f59e0b;color:#111827;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Read it</a></p></div>`,
    sms: `TechSavvy announcement: ${cleanLine(thread.title, 80)}. ${link}`,
    type: 'community_announcement',
  });
  return targets.length;
}

// ---- actions ------------------------------------------------------------------------

async function categoriesWithCounts() {
  const collection = adminDb.collection('community_categories');
  let snapshot = await collection.get();
  if (snapshot.empty) {
    const batch = adminDb.batch();
    for (const category of DEFAULT_CATEGORIES) batch.set(collection.doc(category.id), { ...category, createdAt: nowIso() });
    await batch.commit();
    snapshot = await collection.get();
  }
  const threads = (await threadsCol().orderBy('lastActivityAt', 'desc').limit(500).get()).docs.map((doc) => doc.data()).filter((thread) => thread.status !== 'hidden');
  return snapshot.docs
    .map((doc) => {
      const mine = threads.filter((thread) => thread.categoryId === doc.id);
      return { id: doc.id, ...doc.data(), threadCount: mine.length, lastActivityAt: mine[0]?.lastActivityAt || '' };
    })
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

const actions = {
  async categories(req, res) {
    const { viewer } = await authenticate(req);
    const categories = await categoriesWithCounts();
    return res.status(200).json({ categories: viewer.canModerate && ['admin', 'assistant_admin'].includes(viewer.role) ? categories : categories.filter((category) => !category.archived), viewer: { role: viewer.role, canModerate: viewer.canModerate } });
  },

  async threads(req, res) {
    const { viewer } = await authenticate(req);
    const categoryId = cleanLine(req.query?.categoryId, 60);
    const q = cleanLine(req.query?.q, 80);
    const docs = categoryId
      ? (await threadsCol().where('categoryId', '==', categoryId).limit(300).get()).docs
      : (await threadsCol().orderBy('lastActivityAt', 'desc').limit(300).get()).docs;
    let items = docs.filter((doc) => doc.data().status !== 'hidden' || viewer.canModerate).map((doc) => ({ ...shapeThread(doc.id, doc.data(), viewer), searchText: doc.data().searchText || '' }));
    if (q) items = rankSearch(q, items.map((item) => ({ ...item, summary: item.excerpt, body: item.searchText, updatedAt: item.lastActivityAt })));
    else items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
    return res.status(200).json({ threads: items.slice(0, 100).map(({ searchText, summary, updatedAt, ...item }) => item) });
  },

  async thread(req, res) {
    const { viewer } = await authenticate(req);
    const snapshot = await loadThread(req.query?.id, viewer);
    const replies = (await repliesCol().where('threadId', '==', snapshot.id).limit(500).get()).docs
      .map((doc) => ({ doc, data: doc.data() }))
      .sort((a, b) => String(a.data.createdAt).localeCompare(String(b.data.createdAt)))
      .map(({ doc, data }) => shapeReply(doc.id, data, viewer));
    return res.status(200).json({ thread: shapeThread(snapshot.id, snapshot.data(), viewer, { body: true }), replies });
  },

  async 'create-thread'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    limitPosting(req, user.uid);
    const categoryId = cleanLine(req.body?.categoryId, 60);
    const category = await adminDb.collection('community_categories').doc(categoryId || '_').get();
    if (!category.exists || category.data().archived) throw fail('Choose a category for your post.', 422);
    const title = cleanLine(req.body?.title, LIMITS.title);
    if (title.length < 4) throw fail('Give your post a title (at least 4 characters).', 422);
    const body = cleanBody(req.body?.body, LIMITS.thread);
    if (body.length < 5) throw fail('Write a little more detail (at least 5 characters).', 422);
    const photos = await verifiedPhotos(req.body?.photos, user.uid);
    const now = nowIso();
    const ref = threadsCol().doc();
    await ref.set({
      categoryId, title, body, photos, authorUid: user.uid, authorName: await displayNameFor(user), authorRole: viewer.role,
      createdAt: now, lastActivityAt: now, replyCount: 0, pinned: false, locked: false, solvedReplyId: '', status: 'active',
      followers: [user.uid], searchText: buildSearchText(title, body),
    });
    return res.status(201).json({ id: ref.id });
  },

  async reply(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    limitPosting(req, user.uid);
    const snapshot = await loadThread(req.body?.threadId, viewer);
    const thread = snapshot.data();
    if (thread.locked && !viewer.canModerate) throw fail('This thread is locked, so it is not taking new replies.', 409);
    const body = cleanBody(req.body?.body, LIMITS.reply);
    if (!body) throw fail('Write your reply first.', 422);
    const photos = await verifiedPhotos(req.body?.photos, user.uid);
    const authorName = await displayNameFor(user);
    const now = nowIso();
    const ref = repliesCol().doc();
    await ref.set({ threadId: snapshot.id, body, photos, authorUid: user.uid, authorName, authorRole: viewer.role, createdAt: now, status: 'active' });
    await snapshot.ref.update({ replyCount: FieldValue.increment(1), lastActivityAt: now, followers: addFollower(thread.followers, user.uid) });
    const alerted = await notifyReply(thread, snapshot.id, { body }, authorName, user.uid).catch((error) => { console.error('Community alert failed:', error); return 0; });
    return res.status(201).json({ id: ref.id, alerted });
  },

  async 'edit-post'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    const type = req.body?.type === 'reply' ? 'reply' : 'thread';
    const ref = (type === 'reply' ? repliesCol() : threadsCol()).doc(cleanLine(req.body?.id, 80) || '_');
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().status === 'hidden') throw fail('That post was not found.', 404);
    if (!canManagePost(viewer, snapshot.data(), { forEdit: true })) throw fail('You can edit your own post for 15 minutes after posting. Ask a moderator for changes after that.', 403);
    const body = cleanBody(req.body?.body, type === 'reply' ? LIMITS.reply : LIMITS.thread);
    if (!body) throw fail('The post cannot be empty.', 422);
    const update = { body, editedAt: nowIso() };
    if (type === 'thread') {
      const title = cleanLine(req.body?.title, LIMITS.title) || snapshot.data().title;
      update.title = title;
      update.searchText = buildSearchText(title, body);
    }
    await ref.update(update);
    return res.status(200).json({ success: true, editedAt: update.editedAt, authorUid: user.uid });
  },

  async 'delete-post'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    const type = req.body?.type === 'reply' ? 'reply' : 'thread';
    const ref = (type === 'reply' ? repliesCol() : threadsCol()).doc(cleanLine(req.body?.id, 80) || '_');
    const snapshot = await ref.get();
    if (!snapshot.exists) throw fail('That post was not found.', 404);
    if (!canManagePost(viewer, snapshot.data())) throw fail('You can only remove your own posts.', 403);
    await ref.update({ status: 'hidden', removedBy: snapshot.data().authorUid === user.uid ? 'author' : 'moderator', removedAt: nowIso() });
    return res.status(200).json({ success: true });
  },

  async 'mark-answer'(req, res) {
    requirePost(req);
    const { viewer } = await authenticate(req);
    const snapshot = await loadThread(req.body?.threadId, viewer);
    if (!canMarkAnswer(viewer, snapshot.data())) throw fail('Only the person who asked, or a moderator, can mark the answer.', 403);
    const replyId = cleanLine(req.body?.replyId, 80);
    if (replyId) {
      const reply = await repliesCol().doc(replyId).get();
      if (!reply.exists || reply.data().threadId !== snapshot.id || reply.data().status === 'hidden') throw fail('That reply is not part of this thread.', 422);
    }
    await snapshot.ref.update({ solvedReplyId: replyId });
    return res.status(200).json({ success: true, solvedReplyId: replyId });
  },

  async moderate(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only moderators can do that.', 403);
    const op = String(req.body?.op || '');
    const replyId = cleanLine(req.body?.replyId, 80);
    if (replyId) {
      if (!['hide', 'unhide'].includes(op)) throw fail('Unknown action.', 422);
      const ref = repliesCol().doc(replyId);
      if (!(await ref.get()).exists) throw fail('That reply was not found.', 404);
      await ref.update(op === 'hide' ? { status: 'hidden', removedBy: 'moderator', removedAt: nowIso() } : { status: 'active', removedBy: FieldValue.delete(), removedAt: FieldValue.delete() });
      return res.status(200).json({ success: true });
    }
    const snapshot = await loadThread(req.body?.threadId, viewer);
    const updates = {
      pin: { pinned: true }, unpin: { pinned: false }, lock: { locked: true }, unlock: { locked: false },
      hide: { status: 'hidden', removedBy: 'moderator', removedAt: nowIso() }, unhide: { status: 'active', removedBy: FieldValue.delete(), removedAt: FieldValue.delete() },
    }[op];
    if (!updates) throw fail('Unknown action.', 422);
    await snapshot.ref.update(updates);
    let announced = 0;
    if (op === 'pin' && req.body?.announce === true && !snapshot.data().announcedAt) {
      announced = await announceThread(snapshot.data(), snapshot.id, await displayNameFor(user)).catch((error) => { console.error('Announcement failed:', error); return 0; });
      await snapshot.ref.update({ announcedAt: nowIso() });
    }
    return res.status(200).json({ success: true, announced });
  },

  async follow(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    const snapshot = await loadThread(req.body?.threadId, viewer);
    const followers = Array.isArray(snapshot.data().followers) ? snapshot.data().followers : [];
    const next = req.body?.follow === false ? followers.filter((uid) => uid !== user.uid) : addFollower(followers, user.uid);
    await snapshot.ref.update({ followers: next });
    return res.status(200).json({ following: next.includes(user.uid) });
  },

  async report(req, res) {
    requirePost(req);
    const { user } = await authenticate(req);
    if (rateLimited(req, `community-report:${user.uid}`, 10, 60 * 60 * 1000)) throw fail('Too many reports. Please wait a little.', 429);
    const targetType = req.body?.targetType === 'reply' ? 'reply' : 'thread';
    const targetId = cleanLine(req.body?.targetId, 80);
    const target = await (targetType === 'reply' ? repliesCol() : threadsCol()).doc(targetId || '_').get();
    if (!target.exists) throw fail('That post was not found.', 404);
    const threadId = targetType === 'reply' ? target.data().threadId : target.id;
    const reason = cleanLine(req.body?.reason, 500) || 'No reason given';
    const reporterName = await displayNameFor(user);
    await reportsCol().add({ targetType, targetId, threadId, reason, reporterUid: user.uid, reporterName, status: 'open', createdAt: nowIso() });
    const office = await officeAlertRecipients().catch(() => ({ emails: [] }));
    if (office.emails.length) {
      await sendEmail({ to: office.emails, subject: 'Community post reported', text: `${reporterName} reported a ${targetType}:\n\n"${cleanLine(target.data().title || target.data().body, 200)}"\n\nReason: ${reason}\n\nReview it in the CRM under Community & Training.`, html: `<p><strong>${escapeHtml(reporterName)}</strong> reported a ${targetType}: <em>${escapeHtml(cleanLine(target.data().title || target.data().body, 200))}</em></p><p>Reason: ${escapeHtml(reason)}</p><p>Review it in the CRM under Community &amp; Training.</p>`, from: communitySender(), type: 'community_report' }).catch(() => null);
    }
    return res.status(201).json({ success: true });
  },

  async reports(req, res) {
    const { viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only moderators can see reports.', 403);
    const docs = (await reportsCol().orderBy('createdAt', 'desc').limit(100).get()).docs;
    const reports = await Promise.all(docs.map(async (doc) => {
      const data = doc.data();
      const target = await (data.targetType === 'reply' ? repliesCol() : threadsCol()).doc(data.targetId || '_').get();
      return {
        id: doc.id, ...data,
        snippet: target.exists ? cleanLine(target.data().title || target.data().body, 240) : '(deleted)',
        targetHidden: target.exists ? target.data().status === 'hidden' : true,
      };
    }));
    return res.status(200).json({ reports });
  },

  async 'resolve-report'(req, res) {
    requirePost(req);
    const { user, viewer } = await authenticate(req);
    if (!viewer.canModerate) throw fail('Only moderators can do that.', 403);
    const ref = reportsCol().doc(cleanLine(req.body?.id, 80) || '_');
    const snapshot = await ref.get();
    if (!snapshot.exists) throw fail('That report was not found.', 404);
    const outcome = req.body?.action === 'hide' ? 'hidden' : 'dismissed';
    if (outcome === 'hidden') {
      const data = snapshot.data();
      const target = (data.targetType === 'reply' ? repliesCol() : threadsCol()).doc(data.targetId || '_');
      if ((await target.get()).exists) await target.update({ status: 'hidden', removedBy: 'moderator', removedAt: nowIso() });
    }
    await ref.update({ status: 'resolved', outcome, resolvedBy: user.uid, resolvedAt: nowIso() });
    return res.status(200).json({ success: true, outcome });
  },

  async 'category-save'(req, res) {
    requirePost(req);
    const { viewer } = await authenticate(req);
    if (!['admin', 'assistant_admin'].includes(viewer.role)) throw fail('Only administrators can manage categories.', 403);
    const name = cleanLine(req.body?.name, 60);
    if (name.length < 2) throw fail('Give the category a name.', 422);
    let id = cleanLine(req.body?.id, 60);
    if (id && !isValidSlug(id)) throw fail('Invalid category.', 422);
    if (!id) id = slugify(name);
    if (!id) throw fail('Give the category a name.', 422);
    const ref = adminDb.collection('community_categories').doc(id);
    const existing = await ref.get();
    await ref.set({
      name, description: cleanLine(req.body?.description, 200), order: Number(req.body?.order) || Number(existing.data()?.order) || 99,
      archived: req.body?.archived === true, createdAt: existing.data()?.createdAt || nowIso(), updatedAt: nowIso(),
    }, { merge: true });
    return res.status(200).json({ success: true, id });
  },

  async search(req, res) {
    const { viewer } = await authenticate(req, { required: false });
    const q = cleanLine(req.query?.q, 80);
    if (q.length < 2) return res.status(200).json({ threads: [], pages: [] });
    const pages = rankSearch(q, (await visiblePages(viewer)).filter((page) => page.status === 'published' || viewer.canModerate).map((page) => ({ ...page, body: page.searchText, summary: page.summary })), { limit: 10 });
    let threads = [];
    if (viewer.canRead) {
      const docs = (await threadsCol().orderBy('lastActivityAt', 'desc').limit(300).get()).docs.filter((doc) => doc.data().status !== 'hidden');
      const items = docs.map((doc) => ({ ...shapeThread(doc.id, doc.data(), viewer), searchText: doc.data().searchText || '' }));
      threads = rankSearch(q, items.map((item) => ({ ...item, summary: item.excerpt, body: item.searchText, updatedAt: item.lastActivityAt })), { limit: 10 }).map(({ searchText, summary, updatedAt, ...item }) => item);
    }
    return res.status(200).json({ threads, pages: pages.map(({ searchText, body, ...page }) => page) });
  },

  ...wikiActions,
};

/**
 * Called when a technician deletes their account: their posts stay (so threads still read
 * properly) but lose their name and photos, they stop following threads, and their training
 * progress is removed.
 */
export async function scrubCommunityContent(uid) {
  if (!uid) return { threads: 0, replies: 0 };
  let threadCount = 0;
  let replyCount = 0;
  const anonymize = { authorUid: 'deleted', authorName: 'Former technician', photos: [] };
  for (const [collection, counter] of [[threadsCol(), 'threads'], [repliesCol(), 'replies']]) {
    const snapshot = await collection.where('authorUid', '==', uid).get();
    for (let i = 0; i < snapshot.docs.length; i += 400) {
      const batch = adminDb.batch();
      snapshot.docs.slice(i, i + 400).forEach((doc) => batch.update(doc.ref, anonymize));
      await batch.commit();
    }
    if (counter === 'threads') threadCount = snapshot.size; else replyCount = snapshot.size;
  }
  const following = await threadsCol().where('followers', 'array-contains', uid).get();
  for (let i = 0; i < following.docs.length; i += 400) {
    const batch = adminDb.batch();
    following.docs.slice(i, i + 400).forEach((doc) => batch.update(doc.ref, { followers: FieldValue.arrayRemove(uid) }));
    await batch.commit();
  }
  const suggestions = await adminDb.collection('wiki_suggestions').where('authorUid', '==', uid).get();
  for (const doc of suggestions.docs) await doc.ref.update({ authorUid: 'deleted', authorName: 'Former technician' });
  await adminDb.collection('training_progress').doc(uid).delete().catch(() => null);
  const [files] = await adminStorage.getFiles({ prefix: communityPhotoFolder(uid) }).catch(() => [[]]);
  await Promise.all(files.map((file) => file.delete().catch(() => null)));
  return { threads: threadCount, replies: replyCount };
}

export default async function communityHandler(req, res) {
  const action = String(req.query?.action || req.body?.action || '');
  const run = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
  if (!run) return res.status(404).json({ error: 'Unknown community action.' });
  try {
    return await run(req, res);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('Community request failed:', error);
    return res.status(status).json({ error: status >= 500 ? 'The community could not complete that request. Please try again.' : error.message });
  }
}
