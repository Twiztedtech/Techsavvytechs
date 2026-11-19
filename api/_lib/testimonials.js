// Customer testimonials.
//  - POST /api/contact?operation=testimonial          public form on /reviews
//  - GET  /api/contact?operation=review-request&ref=  prefill for a personal review link
//  - POST /api/contact?operation=send-review-request  CRM "Request review" button (staff)
// Testimonials are created in Sanity as unapproved; they appear on /reviews only
// after approval in the Studio. Reviewer emails stay server-side in Firestore.
// firebase-admin is imported lazily so the pure helpers can be unit tested.
import { createHash, randomBytes } from 'node:crypto';
import { cleanText, emailOwner, escapeHtml, sanityMutate, slidingWindowLimiter, studioEditUrl } from './sanity-write.js';

export const SERVICES = ['cabling', 'network', 'managed-it', 'cell-signal', 'other'];
export const TESTIMONIAL_LIMITS = { nameMin: 2, nameMax: 80, companyMax: 100, roleMax: 80, quoteMin: 20, quoteMax: 1200, emailMax: 150 };
const REQUEST_TTL_DAYS = 90;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const testimonialRateLimited = slidingWindowLimiter(15 * 60 * 1000, 3);
export const prefillRateLimited = slidingWindowLimiter(15 * 60 * 1000, 30);
export const hashRef = (ref) => createHash('sha256').update(String(ref)).digest('hex');
export const isValidRef = (ref) => typeof ref === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(ref);

// Returns { ok: true, value } or { ok: false, error }.
export function validateTestimonialInput(body) {
  const input = body && typeof body === 'object' ? body : {};
  const name = cleanText(input.name);
  const email = cleanText(input.email).toLowerCase();
  const company = cleanText(input.company);
  const role = cleanText(input.role);
  const quote = cleanText(input.quote, true);
  const service = SERVICES.includes(input.service) ? input.service : '';
  const rating = typeof input.rating === 'number' ? input.rating : NaN;
  const ref = isValidRef(input.ref) ? input.ref : '';
  const L = TESTIMONIAL_LIMITS;
  if (name.length < L.nameMin || name.length > L.nameMax) return { ok: false, error: `Please enter a name between ${L.nameMin} and ${L.nameMax} characters.` };
  if (email.length > L.emailMax || !EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (company.length > L.companyMax) return { ok: false, error: `Company must be ${L.companyMax} characters or fewer.` };
  if (role.length > L.roleMax) return { ok: false, error: `Role must be ${L.roleMax} characters or fewer.` };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'Please choose a rating from 1 to 5 stars.' };
  if (quote.length < L.quoteMin || quote.length > L.quoteMax) return { ok: false, error: `Reviews must be between ${L.quoteMin} and ${L.quoteMax} characters.` };
  if ((quote.match(/https?:\/\/|www\./gi) || []).length > 0) return { ok: false, error: 'Please leave links out of your review.' };
  if (input.consent !== true) return { ok: false, error: 'Please confirm we may publish your review.' };
  return { ok: true, value: { name, email, company, role, quote, service, rating, ref } };
}

export const isBotSubmission = (body) => Boolean(cleanText(body?.website));

const nowIso = () => new Date().toISOString();
const appUrl = () => (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');
const firstName = (value) => cleanText(value).split(/\s+/)[0] || '';

async function loadRequest(ref) {
  if (!isValidRef(ref)) return null;
  const { adminDb } = await import('./firebase-admin.js');
  const snapshot = await adminDb.collection('review_requests').doc(hashRef(ref)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) return null;
  return { ref: snapshot.ref, data };
}

export async function reviewRequestPrefill(req, res, { clientIp }) {
  if (prefillRateLimited(clientIp)) return res.status(429).json({ error: 'Too many requests.' });
  const found = await loadRequest(String(req.query?.ref || ''));
  if (!found) return res.status(404).json({ error: 'This review link has expired or is not valid.' });
  const { data } = found;
  return res.status(200).json({ name: data.contactName || '', company: data.customerName || '', jobName: data.jobName || '', alreadySubmitted: Boolean(data.usedAt) });
}

export async function submitTestimonial(req, res, { clientIp }) {
  const body = req.body || {};
  if (isBotSubmission(body)) return res.status(201).json({ success: true, pending: true });
  if (testimonialRateLimited(clientIp)) return res.status(429).json({ error: 'Please wait a few minutes before sending another review.' });
  const parsed = validateTestimonialInput(body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const { name, email, company, role, quote, service, rating, ref } = parsed.value;

  const request = ref ? await loadRequest(ref) : null;
  const createdAt = nowIso();
  const doc = {
    _type: 'testimonial', name, rating, quote, approved: false, featured: false, createdAt,
    source: request ? 'review-request' : 'website',
    ...(company ? { company } : {}), ...(role ? { role } : {}), ...(service ? { service } : {}),
  };
  const result = await sanityMutate([{ create: doc }]);
  const id = result?.results?.[0]?.id;
  if (!id) { const error = new Error('Your review could not be saved.'); error.statusCode = 502; throw error; }

  const { adminDb } = await import('./firebase-admin.js');
  try {
    await adminDb.collection('testimonial_contacts').doc(id).set({
      testimonialId: id, name, email, ip: clientIp, createdAt,
      jobId: request?.data.jobId || '', customerId: request?.data.customerId || '', requestId: request?.ref.id || '',
    });
  } catch (error) {
    await sanityMutate([{ delete: { id } }]).catch((rollbackError) => console.error('Testimonial rollback failed:', rollbackError));
    throw error;
  }

  if (request) {
    try {
      await request.ref.update({ usedAt: request.data.usedAt || createdAt, testimonialIds: [...(request.data.testimonialIds || []), id] });
      if (request.data.jobId) await adminDb.collection('jobs').doc(request.data.jobId).update({ 'reviewRequest.receivedAt': createdAt, 'reviewRequest.rating': rating });
    } catch (error) { console.error('Review request bookkeeping failed:', error); }
  }

  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const who = [name, role, company].filter(Boolean).join(', ');
  const reviewUrl = studioEditUrl(id, 'testimonial');
  try {
    await emailOwner({
      replyTo: email,
      subject: `New ${rating}-star review awaiting approval from ${name}${company ? ` (${company})` : ''}`,
      text: `${who} <${email}> left a ${rating}-star review${request?.data.jobName ? ` for ${request.data.jobName}` : ''}:\n\n${quote}\n\nApprove it in the Studio: ${reviewUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#17201a;line-height:1.55"><p style="font-size:20px;color:#f59e0b;margin:0">${stars}</p><p><strong>${escapeHtml(who)}</strong> (${escapeHtml(email)})${request?.data.jobName ? ` reviewed <strong>${escapeHtml(request.data.jobName)}</strong>` : ' left a review'}:</p><blockquote style="border-left:3px solid #22c55e;margin:0;padding:8px 14px;background:#f8fafc">${escapeHtml(quote).replace(/\n/g, '<br>')}</blockquote><p>It is hidden until approved. <a href="${reviewUrl}">Review it in the Studio</a>.</p></div>`,
    });
  } catch (error) { console.error('Testimonial notification failed:', error); }

  return res.status(201).json({ success: true, pending: true });
}

export function buildReviewRequestEmail({ contactName, jobName, link }) {
  const greeting = contactName ? `Hi ${firstName(contactName)},` : 'Hello,';
  const job = jobName ? ` on ${jobName}` : '';
  const subject = 'How did we do? A quick review for TechSavvy';
  const text = `${greeting}\n\nThank you for choosing TechSavvy${job}. If you have a minute, we would really appreciate a short review of how the work went. It helps other businesses decide, and it helps us keep improving.\n\nLeave a review: ${link}\n\nIt takes about a minute. Thank you!\n\nWill Jackson\nTechSavvy LLC\n(707) 653-6702`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17201a;line-height:1.6"><p>${escapeHtml(greeting)}</p><p>Thank you for choosing TechSavvy${escapeHtml(job)}. If you have a minute, we would really appreciate a short review of how the work went. It helps other businesses decide, and it helps us keep improving.</p><p style="margin:28px 0"><a href="${link}" style="background:#8DC63F;color:#030505;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:4px;display:inline-block">Leave a review</a></p><p style="color:#475569">It takes about a minute. Thank you!</p><p>Will Jackson<br>TechSavvy LLC<br>(707) 653-6702</p></div>`;
  return { subject, text, html };
}

export async function sendReviewRequest(req, res) {
  const { requireStaffRole, adminDb } = await import('./firebase-admin.js');
  let user;
  try { user = await requireStaffRole(req, ['assistant_admin', 'office_billing']); }
  catch (error) { return res.status(403).json({ error: error.message || 'Not allowed.' }); }
  const jobId = cleanText(req.body?.jobId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ error: 'A job is required.' });
  const jobSnap = await adminDb.collection('jobs').doc(jobId).get();
  if (!jobSnap.exists) return res.status(404).json({ error: 'The job was not found.' });
  const job = jobSnap.data();
  if (job.status === 'voided') return res.status(409).json({ error: 'This job was voided.' });
  if (job.reviewRequest?.sentAt && req.body?.resend !== true) return res.status(409).json({ error: 'A review was already requested for this job.', sentAt: job.reviewRequest.sentAt });

  let customer = null;
  if (job.customerId) {
    const snap = await adminDb.collection('customers').doc(job.customerId).get();
    if (snap.exists) customer = { id: snap.id, ...snap.data() };
  }
  if (!customer && job.vendorName) {
    const snap = await adminDb.collection('customers').where('name', '==', job.vendorName).limit(1).get();
    if (!snap.empty) customer = { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  const email = cleanText(req.body?.email || customer?.email).toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(422).json({ error: 'The customer needs a valid email address.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email delivery is not configured.' });

  const contactName = cleanText(req.body?.contactName || customer?.contact).slice(0, 80);
  const customerName = cleanText(customer?.name || job.vendorName).slice(0, 100);
  const jobName = cleanText(job.name).slice(0, 120);
  const ref = randomBytes(24).toString('base64url');
  const sentAt = nowIso();
  await adminDb.collection('review_requests').doc(hashRef(ref)).set({
    jobId, customerId: customer?.id || '', customerName, contactName, jobName, email,
    sentAt, sentBy: user.uid, expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * 86400000).toISOString(), usedAt: null,
  });
  const link = `${appUrl()}/reviews?ref=${encodeURIComponent(ref)}#write`;
  const { subject, text, html } = buildReviewRequestEmail({ contactName, jobName, link });
  const { sendEmail } = await import('./client-portal.js');
  const support = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';
  await sendEmail({ to: email, subject, text, html, replyTo: support, from: `TechSavvy <${(process.env.EMAIL_FROM || '').match(/<([^>]+)>/)?.[1] || support}>`, jobId, type: 'review_request' });
  await jobSnap.ref.update({ reviewRequest: { sentAt, email, sentBy: user.uid, count: (job.reviewRequest?.count || 0) + 1 } });
  return res.status(200).json({ success: true, email, sentAt });
}
