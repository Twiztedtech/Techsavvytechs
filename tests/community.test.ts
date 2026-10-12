import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadUrlPrefix } from '../api/_lib/receipts.js';
import {
  DEFAULT_CATEGORIES, LIMITS, OWN_POST_EDIT_WINDOW_MS, addFollower, alertRecipients, buildSearchText, canManagePost, canMarkAnswer, canViewWikiPage,
  cleanBody, cleanLine, communityPhotoFolder, isValidSlug, markLessonComplete, needsRetake, rankSearch, sanitizePhotoRefs, scoreItem, slugify, tokenize, viewerFor,
} from '../api/_lib/community.js';

test('cleanLine and cleanBody: control characters go, blank runs and length are capped, line breaks survive in bodies', () => {
  assert.equal(cleanLine('  Cat6A \t\n pulling  tips \u0007 ', 50), 'Cat6A pulling tips');
  assert.equal(cleanLine('x'.repeat(300), 140).length, 140);
  assert.equal(cleanBody('Line one\r\n\r\n\r\n\r\nLine two   \n\u0000end', 100), 'Line one\n\nLine two\nend');
  assert.equal(cleanBody(null, 10), '');
  assert.equal(cleanBody('a'.repeat(50), 10).length, 10);
});

test('slugify and isValidSlug: readable url names, safe characters only', () => {
  assert.equal(slugify('Cat6A Termination & Testing!'), 'cat6a-termination-and-testing');
  assert.equal(slugify('  --Fiber   Splicing 101-- '), 'fiber-splicing-101');
  assert.equal(slugify('???'), '');
  assert.equal(isValidSlug('cat6a-termination'), true);
  for (const bad of ['', 'Has Caps', 'trailing-', '-leading', 'a--b', '../etc', 'x'.repeat(81)]) assert.equal(isValidSlug(bad), false, bad);
});

test('viewerFor: who can read, post and moderate', () => {
  const tech = viewerFor({ uid: 't', contractor: true });
  assert.deepEqual([tech.canRead, tech.canPost, tech.canModerate, tech.role], [true, true, false, 'technician']);
  const lead = viewerFor({ uid: 'l', contractor: true, technicianLead: true });
  assert.deepEqual([lead.canModerate, lead.role], [true, 'technician_lead']);
  assert.equal(viewerFor({ uid: 'a', admin: true }).canModerate, true);
  assert.equal(viewerFor({ uid: 'x', staffRole: 'assistant_admin' }).canModerate, true);
  const dispatcher = viewerFor({ uid: 'd', staffRole: 'dispatcher' });
  assert.deepEqual([dispatcher.canRead, dispatcher.canModerate], [true, false]);
  for (const nobody of [{ uid: 'b', staffRole: 'office_billing' }, { uid: 'n' }, { uid: 'fake', technicianLead: true }, null, {}]) {
    const v = viewerFor(nobody as never);
    assert.deepEqual([v.canRead, v.canPost, v.canModerate], [false, false, false]);
  }
});

test('canManagePost: authors manage their own posts (edits only inside the window), moderators manage any', () => {
  const author = viewerFor({ uid: 'me', contractor: true });
  const other = viewerFor({ uid: 'you', contractor: true });
  const lead = viewerFor({ uid: 'lead', contractor: true, technicianLead: true });
  const now = Date.parse('2026-10-12T12:00:00Z');
  const fresh = { authorUid: 'me', createdAt: new Date(now - 5 * 60 * 1000).toISOString() };
  const old = { authorUid: 'me', createdAt: new Date(now - OWN_POST_EDIT_WINDOW_MS - 60000).toISOString() };
  assert.equal(canManagePost(author, fresh, { now, forEdit: true }), true);
  assert.equal(canManagePost(author, old, { now, forEdit: true }), false);
  assert.equal(canManagePost(author, old, { now }), true);             // deleting your own is always allowed
  assert.equal(canManagePost(other, fresh, { now }), false);
  assert.equal(canManagePost(lead, old, { now, forEdit: true }), true);
  assert.equal(canManagePost(viewerFor({ uid: 'x', staffRole: 'office_billing' }), fresh, { now }), false);
});

test('canMarkAnswer: the thread author or a moderator', () => {
  const thread = { authorUid: 'me' };
  assert.equal(canMarkAnswer(viewerFor({ uid: 'me', contractor: true }), thread), true);
  assert.equal(canMarkAnswer(viewerFor({ uid: 'you', contractor: true }), thread), false);
  assert.equal(canMarkAnswer(viewerFor({ uid: 'a', admin: true }), thread), true);
});

test('canViewWikiPage: public to everyone, members-only to readers, drafts to moderators', () => {
  const published = { status: 'published', visibility: 'members' };
  const publicPage = { status: 'published', visibility: 'public' };
  const draft = { status: 'draft', visibility: 'public' };
  const tech = viewerFor({ uid: 't', contractor: true });
  const lead = viewerFor({ uid: 'l', contractor: true, technicianLead: true });
  assert.equal(canViewWikiPage(publicPage, null), true);
  assert.equal(canViewWikiPage(published, null), false);
  assert.equal(canViewWikiPage(published, tech), true);
  assert.equal(canViewWikiPage(draft, null), false);
  assert.equal(canViewWikiPage(draft, tech), false);
  assert.equal(canViewWikiPage(draft, lead), true);
  assert.equal(canViewWikiPage(null, lead), false);
});

const bucket = 'demo.firebasestorage.app';
const photo = (uid: string, name: string, over: Record<string, unknown> = {}) => {
  const path = `${communityPhotoFolder(uid)}${name}`;
  return { name, path, url: `${downloadUrlPrefix(bucket, path)}?alt=media&token=t`, ...over };
};

test('sanitizePhotoRefs: only the poster\'s own folder with a matching url, no duplicates, capped', () => {
  const good = sanitizePhotoRefs([photo('me', 'a.jpg'), photo('me', 'a.jpg'), photo('me', 'b.jpg')], { uid: 'me', bucket });
  assert.deepEqual(good.map((item) => item.name), ['a.jpg', 'b.jpg']);
  const bad = sanitizePhotoRefs([photo('someone', 'x.jpg'), photo('me', 'y.jpg', { url: 'https://evil.example/y.jpg' }), { path: 'community/uploads/me/../x.jpg', url: 'z' }, null], { uid: 'me', bucket });
  assert.deepEqual(bad, []);
  assert.equal(sanitizePhotoRefs(Array.from({ length: 20 }, (_, i) => photo('me', `p${i}.jpg`)), { uid: 'me', bucket }).length, LIMITS.photos);
  assert.deepEqual(sanitizePhotoRefs('nope' as never, { uid: 'me', bucket }), []);
});

test('tokenize and scoreItem: every term must match somewhere, titles count most', () => {
  assert.deepEqual(tokenize('  Cat6A, termination!! a '), ['cat6a', 'termination']);
  assert.equal(tokenize('').length, 0);
  // 'fiber' is in the title (5); 'splice' is only in the body, since 'splicing' does not contain it (1).
  assert.equal(scoreItem(['fiber', 'splice'], { title: 'Fiber splicing tips', body: 'how to splice' }), 6);
  assert.ok(scoreItem(['fiber'], { title: 'Fiber basics' }) > scoreItem(['fiber'], { body: 'about fiber' }));
  assert.equal(scoreItem(['fiber', 'wifi'], { title: 'Fiber basics', body: 'nothing else' }), 0);
  assert.equal(scoreItem([], { title: 'x' }), 0);
});

test('rankSearch: best match first, ties by recency, non-matches dropped, limited', () => {
  const items = [
    { id: 'body', title: 'Rack day', body: 'we talked about cat6a patching', updatedAt: '2026-10-01' },
    { id: 'title-old', title: 'Cat6A patching', body: '', updatedAt: '2026-09-01' },
    { id: 'title-new', title: 'Cat6A patching', body: '', updatedAt: '2026-10-05' },
    { id: 'none', title: 'Cell boosters', body: 'antenna', updatedAt: '2026-10-09' },
  ];
  assert.deepEqual(rankSearch('cat6a patching', items).map((item) => item.id), ['title-new', 'title-old', 'body']);
  assert.equal(rankSearch('cat6a', items, { limit: 1 }).length, 1);
  assert.deepEqual(rankSearch('', items), []);
  assert.equal(buildSearchText('Cat6A  Tips', null, 'Pulling'), 'cat6a tips pulling');
});

test('alertRecipients: followers except the author, email unless off, text only when verified and opted in', () => {
  const technicians = [
    { authUid: 'author', email: 'a@x.com' },
    { authUid: 'f1', name: 'F1', email: 'f1@x.com', mobile: '+17075550101', mobileVerified: true, smsConsent: { optedIn: true } },
    { authUid: 'f2', email: 'f2@x.com', notificationPreferences: { email: false }, mobile: '+17075550102', mobileVerified: true, smsConsent: { optedIn: true } },
    { authUid: 'f3', email: 'f3@x.com', mobile: '+17075550103' },
    { authUid: 'f4', email: 'f4@x.com', accessStatus: 'Suspended' },
    { authUid: 'f5', email: 'f5@x.com', notificationPreferences: { email: false } },
    { authUid: 'stranger', email: 's@x.com' },
  ];
  const result = alertRecipients({ followerUids: ['author', 'f1', 'f2', 'f3', 'f4', 'f5'], authorUid: 'author', technicians });
  assert.deepEqual(result.map((r) => r.uid), ['f1', 'f2', 'f3']);
  assert.deepEqual(result.find((r) => r.uid === 'f1'), { uid: 'f1', name: 'F1', email: 'f1@x.com', phone: '+17075550101' });
  assert.equal(result.find((r) => r.uid === 'f2')?.email, '');       // email off, text on
  assert.equal(result.find((r) => r.uid === 'f3')?.phone, '');       // unverified phone is never texted
});

test('addFollower: adds once, ignores blanks, keeps the list capped', () => {
  assert.deepEqual(addFollower(['a'], 'a'), ['a']);
  assert.deepEqual(addFollower(undefined, 'a'), ['a']);
  assert.deepEqual(addFollower(['a'], ''), ['a']);
  const long = Array.from({ length: LIMITS.followers }, (_, i) => `u${i}`);
  const grown = addFollower(long, 'new');
  assert.equal(grown.length, LIMITS.followers);
  assert.equal(grown[grown.length - 1], 'new');
});

test('training progress: completing records the version, and an older version needs a retake', () => {
  const progress = markLessonComplete({}, 'fiber-splicing', 2, '2026-10-12T00:00:00Z');
  assert.deepEqual(progress['fiber-splicing'], { completedAt: '2026-10-12T00:00:00Z', version: 2 });
  assert.equal(markLessonComplete(progress, 'cat6a', 1, 'now').cat6a.version, 1);
  assert.equal(needsRetake(progress, 'fiber-splicing', 2), false);
  assert.equal(needsRetake(progress, 'fiber-splicing', 3), true);
  assert.equal(needsRetake(progress, 'never-done', 3), false);
  assert.equal(needsRetake(undefined, 'x', 1), false);
});

test('DEFAULT_CATEGORIES: unique ids, in order, and valid slugs', () => {
  const ids = DEFAULT_CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(DEFAULT_CATEGORIES.map((c) => c.order), ids.map((_, i) => i + 1));
  for (const id of ids) assert.equal(isValidSlug(id), true, id);
});
