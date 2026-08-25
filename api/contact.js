import { adminDb } from './_lib/firebase-admin.js';
import twilioWebhookHandler from './_lib/twilio-webhook-handler.js';
import resendWebhookHandler from './_lib/resend-webhook-handler.js';
import googleCalendarWebhookHandler from './_lib/google-calendar-webhook-handler.js';

export const config = { api: { bodyParser: false } };

async function ensureBody(req, integration) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  req.rawBody = raw;
  if (integration === 'resend') return;
  if (integration === 'twilio') req.body = Object.fromEntries(new URLSearchParams(raw));
  else if (raw) req.body = JSON.parse(raw);
  else req.body = {};
}

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const recentSubmissions = new Map();

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

function isValidSubmission(value) {
  return typeof value?.name === 'string'
    && value.name.trim().length >= 2
    && value.name.trim().length <= MAX_NAME_LENGTH
    && typeof value.email === 'string'
    && value.email.length >= 5
    && value.email.length <= MAX_EMAIL_LENGTH
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
    && typeof value.message === 'string'
    && value.message.trim().length >= 1
    && value.message.trim().length <= MAX_MESSAGE_LENGTH;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket?.remoteAddress || 'unknown').trim();
}

function isRateLimited(ip, now) {
  const attempts = (recentSubmissions.get(ip) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (attempts.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  attempts.push(now);
  recentSubmissions.set(ip, attempts);
  return false;
}

export default async function handler(req, res) {
  const integration = String(req.query?.integration || '');
  await ensureBody(req, integration);
  if (integration === 'twilio') {
    req.url = '/api/webhooks/twilio';
    return twilioWebhookHandler(req, res);
  }
  if (integration === 'resend') return resendWebhookHandler(req, res);
  if (integration === 'googleCalendar') return googleCalendarWebhookHandler(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.body?.company) {
    return res.status(201).json({ success: true });
  }
  if (isRateLimited(getClientIp(req), Date.now())) {
    return res.status(429).json({ error: 'Please wait a few minutes before sending another message.' });
  }
  if (!isValidSubmission(req.body)) {
    return res.status(400).json({ error: 'Please provide a valid name, email address, and message.' });
  }

  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const message = req.body.message.trim();
  const createdAt = new Date().toISOString();
  try {
    const contact = await adminDb.collection('contacts').add({ name, email, message, createdAt, deliveryStatus: 'pending' });
    if (!process.env.RESEND_API_KEY) {
      await contact.update({ deliveryStatus: 'not-configured' });
      return res.status(201).json({ success: true });
    }

    const supportEmail = process.env.SUPPORT_EMAIL || process.env.CONTACT_RECIPIENT_EMAIL || 'support@techsavvytechs.com';
    const sender = process.env.EMAIL_FROM || 'TechSavvy Website <support@techsavvytechs.com>';
    const delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        reply_to: email,
        to: [supportEmail],
        subject: `New website contact from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `<h1>New TechSavvy website contact</h1><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p><p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      }),
    });

    if (!delivery.ok) {
      console.error('Contact email delivery failed:', await delivery.text());
      await contact.update({ deliveryStatus: 'failed' });
      return res.status(201).json({ success: true });
    }

    await contact.update({ deliveryStatus: 'sent' });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Contact submission failed:', error);
    return res.status(500).json({ error: 'Your message could not be sent. Please try again later.' });
  }
}
