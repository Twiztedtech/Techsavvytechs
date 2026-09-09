import { createHmac } from 'node:crypto';
import { adminDb } from './firebase-admin.js';
import { clean, hashValue, nowIso } from './client-portal.js';
import {
  classifySmsKeyword,
  keywordReply,
  twilioWebhookUrl,
  twimlResponse,
} from './twilio-messaging.js';

function validSignature(req) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const url = twilioWebhookUrl(process.env.APP_URL);
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
  const keywordKind = classifySmsKeyword(incoming);
  if (from && incoming) {
    const preference = {
      phoneHash: hashValue(from),
      lastKeyword: incoming.slice(0, 20),
      updatedAt: nowIso(),
    };
    if (keywordKind === 'opt_in') preference.optedIn = true;
    if (keywordKind === 'opt_out') preference.optedIn = false;
    await adminDb.collection('sms_preferences').doc(hashValue(from)).set(preference, { merge: true });
  }
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twimlResponse(keywordReply(keywordKind)));
}
