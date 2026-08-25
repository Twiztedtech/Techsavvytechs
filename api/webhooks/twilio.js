import { createHmac } from 'node:crypto';
import { adminDb } from '../_lib/firebase-admin.js';
import { clean, hashValue, nowIso } from '../_lib/client-portal.js';

function validSignature(req) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const url = `${(process.env.APP_URL || '').replace(/\/$/, '')}${req.url.split('?')[0]}`;
  const payload = Object.keys(req.body || {}).sort().reduce((value, key) => value + key + req.body[key], url);
  const expected = createHmac('sha1', token).update(payload).digest('base64');
  return expected === req.headers['x-twilio-signature'];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!validSignature(req)) return res.status(403).send('Invalid signature');
  const messageSid = clean(req.body?.MessageSid, 80);
  const status = clean(req.body?.MessageStatus, 40);
  if (messageSid && status) {
    const deliveries = await adminDb.collection('notification_deliveries').where('providerId', '==', messageSid).limit(1).get();
    if (!deliveries.empty) await deliveries.docs[0].ref.set({ status, error: clean(req.body?.ErrorMessage, 1000), updatedAt: nowIso() }, { merge: true });
  }
  const incoming = clean(req.body?.Body, 1600).toUpperCase();
  const from = clean(req.body?.From, 40);
  if (from && incoming) {
    const optOut = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(incoming);
    const optIn = ['START', 'UNSTOP', 'YES'].includes(incoming);
    await adminDb.collection('sms_preferences').doc(hashValue(from)).set({ phoneHash: hashValue(from), optedIn: optIn ? true : optOut ? false : undefined, lastKeyword: incoming.slice(0, 20), updatedAt: nowIso() }, { merge: true });
  }
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}
