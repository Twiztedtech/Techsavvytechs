import { adminDb } from './lib/firebase-admin.js';

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isValidSubmission(req.body)) {
    return res.status(400).json({ error: 'Please provide a valid name, email address, and message.' });
  }

  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const message = req.body.message.trim();
  const createdAt = new Date().toISOString();
  try {
    await adminDb.collection('contacts').add({ name, email, message, createdAt });
    await adminDb.collection('mail').add({
      to: process.env.CONTACT_RECIPIENT_EMAIL || 'support@techsavvytechs.com',
      message: {
        subject: `New website contact from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      },
      createdAt,
    });
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Contact submission failed:', error);
    return res.status(500).json({ error: 'Your message could not be sent. Please try again later.' });
  }
}
