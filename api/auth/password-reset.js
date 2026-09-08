import { createHash } from 'node:crypto';
import { adminAuth, adminDb } from '../_lib/firebase-admin.js';

const RESET_COOLDOWN_MS = 5 * 60 * 1000;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const accepted = (res) => res.status(202).json({
  success: true,
  message: 'If an eligible account exists, password recovery instructions will be sent.',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !email.includes('@')) {
    return res.status(422).json({ error: 'Enter a valid email address.' });
  }

  try {
    // Use a one-way identifier so reset request metadata never stores the
    // submitted email address. The cooldown limits repeated mail to an account.
    const requestId = createHash('sha256').update(email).digest('hex');
    const requestRef = adminDb.collection('password_reset_requests').doc(requestId);
    const requestSnapshot = await requestRef.get();
    const lastRequestedAt = Date.parse(requestSnapshot.data()?.requestedAt || '');
    if (Number.isFinite(lastRequestedAt) && Date.now() - lastRequestedAt < RESET_COOLDOWN_MS) {
      return accepted(res);
    }

    let user;
    try {
      user = await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') return accepted(res);
      throw error;
    }

    if (user.disabled) return accepted(res);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('Password reset email delivery is not configured.');

    const appUrl = (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');
    const resetLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${appUrl}/contractor/dashboard`,
    });
    const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';
    const displayName = user.displayName?.trim().split(/\s+/)[0] || 'there';
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
        subject: 'Reset your TechSavvy Contractor Portal password',
        text: `Hello ${displayName},\n\nUse this secure link to reset your TechSavvy Contractor Portal password:\n${resetLink}\n\nIf you did not request this change, you can ignore this email. The link expires automatically.\n\nTechSavvy Contractor Portal`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><h1 style="color:#16a34a;font-size:24px">TechSavvy Contractor Portal</h1><p>Hello ${escapeHtml(displayName)},</p><p>We received a request to reset your portal password.</p><p><a href="${safeLink}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Reset portal password</a></p><p>This secure link expires automatically. If you did not request this change, you can ignore this email.</p><p style="color:#475569">TechSavvy Contractor Portal</p></div>`,
      }),
    });

    if (!response.ok) throw new Error(`Resend rejected the password reset email (${response.status}).`);
    const delivery = await response.json();
    await requestRef.set({ requestedAt: new Date().toISOString(), emailId: delivery.id || '' });
    return accepted(res);
  } catch (error) {
    console.error('Password reset delivery failed:', error);
    return res.status(503).json({ error: 'Password reset email could not be sent. Please try again shortly.' });
  }
}
