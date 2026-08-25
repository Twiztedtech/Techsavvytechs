import { createHmac, timingSafeEqual } from 'node:crypto';
import { adminDb } from '../_lib/firebase-admin.js';
import { clean, hashValue, nowIso, recordEvent } from '../_lib/client-portal.js';

function verifySvix(req) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = req.headers['svix-id'], timestamp = req.headers['svix-timestamp'], signatureHeader = req.headers['svix-signature'];
  if (!secret || !id || !timestamp || !signatureHeader || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const raw = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return String(signatureHeader).split(' ').some((item) => {
    const value = item.includes(',') ? item.split(',')[1] : item.replace(/^v1=/, '');
    const left = Buffer.from(value || ''), right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  req.rawBody = Buffer.concat(chunks).toString('utf8');
  try { req.body = JSON.parse(req.rawBody); } catch { return res.status(400).json({ error: 'Invalid webhook payload.' }); }
  if (!verifySvix(req)) return res.status(403).json({ error: 'Invalid webhook signature.' });
  const eventId = clean(req.headers['svix-id'], 120);
  const eventRef = adminDb.collection('webhook_events').doc(hashValue(eventId));
  if ((await eventRef.get()).exists) return res.status(200).json({ received: true, duplicate: true });
  await eventRef.set({ provider: 'resend', type: clean(req.body?.type, 80), createdAt: nowIso() });
  if (req.body?.type !== 'email.received') return res.status(200).json({ received: true });
  const data = req.body.data || {};
  const recipient = (Array.isArray(data.to) ? data.to : []).find((value) => /job\+[^@]+@/i.test(value)) || '';
  const token = recipient.match(/job\+([^@]+)@/i)?.[1];
  if (!token) return res.status(202).json({ ignored: true });
  const tokenDoc = await adminDb.collection('conversation_tokens').doc(hashValue(token)).get();
  if (!tokenDoc.exists || tokenDoc.data().active !== true) return res.status(202).json({ ignored: true });
  const emailId = clean(data.email_id, 120);
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  const email = await response.json();
  if (!response.ok) return res.status(502).json({ error: 'Could not retrieve inbound email.' });
  const message = clean(email.text || email.html?.replace(/<[^>]+>/g, ' ') || data.subject, 10000);
  const jobId = tokenDoc.data().jobId;
  await adminDb.collection('job_messages').add({ jobId, organizationId: tokenDoc.data().organizationId, authorName: clean(data.from, 200), authorRole: 'email', visibility: 'client', message, subject: clean(data.subject, 300), source: 'email', providerId: emailId, attachments: data.attachments || [], createdAt: nowIso() });
  await recordEvent({ jobId, type: 'email_reply_received', actorRole: 'client', visibility: 'client', message: 'A reply was added to the job conversation.' });
  return res.status(200).json({ received: true });
}

export const config = { api: { bodyParser: false } };
