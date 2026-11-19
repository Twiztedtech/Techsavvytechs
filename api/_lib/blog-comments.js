// Public blog comments. Readers post through /api/contact?operation=blog-comment;
// the comment is created in Sanity as unapproved (it shows on the site only after
// it is approved in the Studio), and the commenter's email is kept server-side in
// Firestore so it is never published with the comment.
// firebase-admin is imported lazily so the pure helpers can be unit tested
// without service-account credentials.

export const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID || 'dnlgguay';
export const SANITY_DATASET = process.env.SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production';
const SANITY_API_VERSION = '2026-08-17';
const STUDIO_URL = 'https://techsavvy-content.sanity.studio';

export const COMMENT_LIMITS = { nameMin: 2, nameMax: 80, commentMin: 3, commentMax: 1500, emailMax: 150 };
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 3;
const recent = new Map();

// Strips control characters (keeps line breaks in the comment body).
const clean = (value, keepNewlines = false) =>
  String(value ?? '')
    .replace(keepNewlines ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Returns { ok: true, value } or { ok: false, error }. Pure, so it is unit tested.
export function validateCommentInput(body) {
  const input = body && typeof body === 'object' ? body : {};
  const name = clean(input.name);
  const email = clean(input.email).toLowerCase();
  const comment = clean(input.comment, true);
  const postId = clean(input.postId);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(postId) || postId.startsWith('drafts.')) return { ok: false, error: 'This article could not be found.' };
  if (name.length < COMMENT_LIMITS.nameMin || name.length > COMMENT_LIMITS.nameMax) return { ok: false, error: `Please enter a name between ${COMMENT_LIMITS.nameMin} and ${COMMENT_LIMITS.nameMax} characters.` };
  if (email.length > COMMENT_LIMITS.emailMax || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (comment.length < COMMENT_LIMITS.commentMin || comment.length > COMMENT_LIMITS.commentMax) return { ok: false, error: `Comments must be between ${COMMENT_LIMITS.commentMin} and ${COMMENT_LIMITS.commentMax} characters.` };
  const links = (comment.match(/https?:\/\/|www\./gi) || []).length;
  if (links > 2) return { ok: false, error: 'Please include no more than two links.' };
  return { ok: true, value: { name, email, comment, postId } };
}

// Honeypot: a hidden "website" field real readers never fill in.
export const isBotSubmission = (body) => Boolean(clean(body?.website));

export function commentRateLimited(ip, now = Date.now(), store = recent) {
  const attempts = (store.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (attempts.length >= RATE_MAX) { store.set(ip, attempts); return true; }
  attempts.push(now);
  store.set(ip, attempts);
  return false;
}

const sanityBase = () => `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data`;

async function sanityRequest(path, init = {}) {
  // Trim: a pasted token often carries a trailing space or newline.
  const token = String(process.env.SANITY_WRITE_TOKEN || '').trim();
  if (!token) { const error = new Error('Comments are not available right now.'); error.statusCode = 503; throw error; }
  const response = await fetch(`${sanityBase()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.error?.description || data?.message || `Sanity request failed (${response.status}).`); error.statusCode = 502; throw error; }
  return data;
}

async function findPublishedPost(postId) {
  const query = encodeURIComponent('*[_type == "post" && _id == $id && defined(slug.current) && defined(publishedAt) && publishedAt <= now()][0]{_id, title, "slug": slug.current}');
  const data = await sanityRequest(`/query/${SANITY_DATASET}?query=${query}&%24id=${encodeURIComponent(JSON.stringify(postId))}&perspective=published`);
  return data?.result || null;
}

const mutate = (mutations) => sanityRequest(`/mutate/${SANITY_DATASET}?returnIds=true&visibility=sync`, { method: 'POST', body: JSON.stringify({ mutations }) });

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function notifyOwner({ id, name, email, comment, post }) {
  if (!process.env.RESEND_API_KEY) return;
  const to = process.env.SUPPORT_EMAIL || process.env.CONTACT_RECIPIENT_EMAIL || 'support@techsavvytechs.com';
  const from = process.env.EMAIL_FROM || 'TechSavvy Website <support@techsavvytechs.com>';
  const reviewUrl = `${STUDIO_URL}/intent/edit/id=${encodeURIComponent(id)};type=comment`;
  const articleUrl = `https://techsavvytechs.com/blog/${post.slug}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], reply_to: email,
      subject: `New blog comment awaiting approval: ${post.title}`,
      text: `${name} <${email}> commented on "${post.title}":\n\n${comment}\n\nApprove or delete it in the Studio: ${reviewUrl}\nArticle: ${articleUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#17201a;line-height:1.55"><p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) commented on <a href="${articleUrl}">${escapeHtml(post.title)}</a>:</p><blockquote style="border-left:3px solid #22c55e;margin:0;padding:8px 14px;background:#f8fafc">${escapeHtml(comment).replace(/\n/g, '<br>')}</blockquote><p>It is hidden until approved. <a href="${reviewUrl}">Review it in the Studio</a>.</p></div>`,
    }),
  });
  if (!response.ok) console.error('Blog comment notification failed:', await response.text());
}

export async function submitBlogComment(req, res, { clientIp }) {
  const body = req.body || {};
  // Bots get a normal-looking success so they do not retry.
  if (isBotSubmission(body)) return res.status(201).json({ success: true, pending: true });
  if (commentRateLimited(clientIp)) return res.status(429).json({ error: 'Please wait a few minutes before posting another comment.' });
  const parsed = validateCommentInput(body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const { name, email, comment, postId } = parsed.value;

  const post = await findPublishedPost(postId);
  if (!post) return res.status(404).json({ error: 'This article could not be found.' });

  const createdAt = new Date().toISOString();
  const result = await mutate([{ create: { _type: 'comment', name, comment, approved: false, createdAt, post: { _type: 'reference', _ref: post._id, _weak: true } } }]);
  const id = result?.results?.[0]?.id;
  if (!id) { const error = new Error('Your comment could not be saved.'); error.statusCode = 502; throw error; }

  try {
    const { adminDb } = await import('./firebase-admin.js');
    await adminDb.collection('blog_comment_contacts').doc(id).set({ commentId: id, postId: post._id, postSlug: post.slug, name, email, ip: clientIp, createdAt });
  } catch (error) {
    // Do not leave a comment in Sanity with no way to reach its author.
    await mutate([{ delete: { id } }]).catch((rollbackError) => console.error('Blog comment rollback failed:', rollbackError));
    throw error;
  }

  try { await notifyOwner({ id, name, email, comment, post }); }
  catch (error) { console.error('Blog comment notification failed:', error); }

  return res.status(201).json({ success: true, pending: true });
}
