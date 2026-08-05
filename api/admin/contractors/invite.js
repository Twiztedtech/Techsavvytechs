import { randomBytes } from 'node:crypto';
import { adminAuth, adminDb, adminStorage, requireAdmin } from '../../lib/firebase-admin.js';

const temporaryPassword = () => randomBytes(32).toString('base64url');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

async function sendBrandedInvitation({ email, name, resetLink }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = new Error('Branded invitation email is not configured yet.');
    error.statusCode = 503;
    throw error;
  }

  const firstName = name.trim().split(/\s+/)[0] || 'there';
  const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';
  const safeLink = escapeHtml(resetLink);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'TechSavvy-Contractor-Portal/1.0',
    },
    body: JSON.stringify({
      from: sender,
      reply_to: supportEmail,
      to: [email],
      subject: 'Set up your TechSavvy Contractor Portal access',
      text: `Hello ${firstName},\n\nTechSavvy has invited you to access the Contractor Portal. Use this secure link to choose your password and sign in:\n${resetLink}\n\nThis link expires automatically. If you need help, reply to this email or contact ${supportEmail}.\n\nTechSavvy Contractor Portal`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><h1 style="color:#16a34a;font-size:24px">TechSavvy Contractor Portal</h1><p>Hello ${escapeHtml(firstName)},</p><p>TechSavvy has invited you to access the Contractor Portal.</p><p><a href="${safeLink}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Set up portal access</a></p><p>This secure link lets you choose your password and expires automatically.</p><p>If you need help, reply to this email or contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>.</p><p style="color:#475569">TechSavvy Contractor Portal</p></div>`,
    }),
  });

  if (!response.ok) {
    console.error('Resend invitation failed:', await response.text());
    const error = new Error('Could not send the branded invitation email.');
    error.statusCode = 502;
    throw error;
  }
  return response.json();
}

async function refreshInvitationDelivery(req, res) {
  await requireAdmin(req);
  const contractorId = typeof req.query.contractorId === 'string' ? req.query.contractorId : '';
  if (!contractorId) return res.status(400).json({ error: 'A contractor is required.' });
  const ref = adminDb.collection('contractors').doc(contractorId);
  const snapshot = await ref.get();
  const delivery = snapshot.data()?.invitationDelivery;
  if (!snapshot.exists || !delivery?.emailId) return res.status(404).json({ error: 'This contractor has no tracked portal invitation yet.' });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Branded invitation email is not configured yet.' });

  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(delivery.emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'TechSavvy-Contractor-Portal/1.0' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || 'Could not check the invitation delivery status.');
  const status = typeof data.last_event === 'string' ? data.last_event : 'accepted';
  const checkedAt = new Date().toISOString();
  await ref.set({ invitationDelivery: { ...delivery, status, checkedAt } }, { merge: true });
  return res.status(200).json({ success: true, status, checkedAt });
}

async function handleOnboardingReview(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  await requireAdmin(req);
  if (req.method === 'GET') {
    const contractorId = typeof req.query.contractorId === 'string' ? req.query.contractorId : '';
    if (!contractorId) return res.status(400).json({ error: 'A contractor is required.' });
    const contractor = await adminDb.collection('contractors').doc(contractorId).get();
    const storagePath = contractor.data()?.onboarding?.w9?.storagePath;
    if (!contractor.exists || typeof storagePath !== 'string' || !storagePath.startsWith('contractor-onboarding/')) {
      return res.status(404).json({ error: 'No submitted W-9 was found for this contractor.' });
    }
    const [url] = await adminStorage.file(storagePath).getSignedUrl({ action: 'read', version: 'v4', expires: Date.now() + 5 * 60 * 1000 });
    return res.status(200).json({ url, expiresInSeconds: 300 });
  }

  const contractorId = typeof req.body?.contractorId === 'string' ? req.body.contractorId : '';
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim().slice(0, 1000) : '';
  if (!contractorId || !['approved', 'needs_update'].includes(status)) return res.status(400).json({ error: 'A contractor and valid review status are required.' });
  const ref = adminDb.collection('contractors').doc(contractorId);
  const snapshot = await ref.get();
  if (!snapshot.exists || !snapshot.data()?.onboarding?.w9?.storagePath) return res.status(404).json({ error: 'No submitted W-9 was found for this contractor.' });
  await ref.set({ onboarding: { ...snapshot.data().onboarding, status, reviewedAt: new Date().toISOString(), reviewNote } }, { merge: true });
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  if (req.query?.adminOperation === 'onboarding') {
    try {
      return await handleOnboardingReview(req, res);
    } catch (error) {
      if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') return res.status(403).json({ error: error.message });
      console.error('Contractor onboarding review failed:', error);
      return res.status(500).json({ error: 'Could not save the onboarding review.' });
    }
  }
  if (req.query?.adminOperation === 'invite-status') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    try {
      return await refreshInvitationDelivery(req, res);
    } catch (error) {
      if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') return res.status(403).json({ error: error.message });
      console.error('Contractor invitation delivery check failed:', error);
      return res.status(500).json({ error: error.message || 'Could not check the invitation delivery status.' });
    }
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    await requireAdmin(req);

    const contractorId = typeof req.body?.contractorId === 'string' ? req.body.contractorId : '';
    if (!contractorId) {
      return res.status(400).json({ error: 'A contractor is required.' });
    }

    const contractorRef = adminDb.collection('contractors').doc(contractorId);
    const contractorSnap = await contractorRef.get();
    if (!contractorSnap.exists) {
      return res.status(404).json({ error: 'Contractor profile not found.' });
    }

    const contractor = contractorSnap.data();
    const email = contractor.email?.trim().toLowerCase();
    if (!email) {
      return res.status(422).json({ error: 'This contractor does not have an email address.' });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: 'Branded invitation email is not configured yet.' });
    }

    let user;
    let accountCreated = false;
    try {
      user = await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      user = await adminAuth.createUser({
        email,
        displayName: contractor.name || email,
        // The random password is never returned. The Firebase reset email lets
        // the technician choose their own password before their first login.
        password: temporaryPassword(),
        disabled: false,
      });
      accountCreated = true;
    }

    if (user.disabled) {
      return res.status(409).json({
        error: 'This email already belongs to a disabled Firebase account. Enable it in Firebase before sending an invite.',
      });
    }

    await adminAuth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), contractor: true });
    const appUrl = (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');
    const passwordResetLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${appUrl}/contractor/dashboard`,
    });
    const emailDelivery = await sendBrandedInvitation({
      email,
      name: contractor.name || email,
      resetLink: passwordResetLink,
    });

    const now = new Date().toISOString();
    await contractorRef.set({
      authUid: user.uid,
      invitationStatus: 'sent',
      invitationSentAt: now,
      authProvisionedAt: now,
      invitationDelivery: {
        emailId: emailDelivery.id,
        status: 'accepted',
        acceptedAt: now,
        checkedAt: now,
      },
    }, { merge: true });

    return res.status(200).json({
      success: true,
      email,
      accountCreated,
      message: accountCreated ? 'Branded portal invitation sent.' : 'A fresh branded portal invitation was sent.',
    });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Contractor invitation setup failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Could not send the contractor invitation.' });
  }
}
