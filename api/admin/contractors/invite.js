import { randomBytes } from 'node:crypto';
import { adminAuth, adminDb, adminStorage, requireAdmin } from '../../_lib/firebase-admin.js';
import { writeAudit } from '../../_lib/audit.js';

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

const terminalJobStatuses = new Set(['complete', 'completed', 'closed', 'cancelled', 'canceled', 'voided']);

const assignedContractorIds = (job) => Array.isArray(job.assignedTechIds)
  ? job.assignedTechIds
  : [job.assignedTechId || 'ALL'];

async function sendLifecycleNotice({ contractor, status, reason }) {
  const apiKey = process.env.RESEND_API_KEY;
  const email = contractor.email?.trim();
  if (!apiKey || !email) return { sent: false, reason: apiKey ? 'missing_email' : 'email_not_configured' };
  const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';
  const firstName = String(contractor.name || 'there').trim().split(/\s+/)[0];
  const copy = status === 'Active'
    ? { subject: 'Your TechSavvy portal access is active', heading: 'Portal access active', message: 'Your technician access is active and you may sign in to the TechSavvy Contractor Portal.' }
    : status === 'Suspended'
      ? { subject: 'Your TechSavvy portal access has been suspended', heading: 'Portal access suspended', message: 'Your technician portal access has been temporarily suspended.' }
      : { subject: 'Your TechSavvy technician access has ended', heading: 'Technician access offboarded', message: 'Your technician portal access has been closed. Your completed work and payment history remain on file.' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'TechSavvy-Contractor-Portal/1.0' },
      body: JSON.stringify({
        from: sender,
        reply_to: supportEmail,
        to: [email],
        subject: copy.subject,
        text: `Hello ${firstName},\n\n${copy.message}${reason ? `\n\nReason: ${reason}` : ''}\n\nQuestions? Contact ${supportEmail}.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><h1 style="font-size:22px">${escapeHtml(copy.heading)}</h1><p>Hello ${escapeHtml(firstName)},</p><p>${escapeHtml(copy.message)}</p>${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}<p>Questions? Contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>.</p></div>`,
      }),
    });
    if (!response.ok) console.error('Lifecycle notice failed:', response.status, await response.text());
    return { sent: response.ok };
  } catch (error) {
    console.error('Lifecycle notice failed:', error);
    return { sent: false, reason: 'provider_error' };
  }
}

async function handleLifecycle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const actor = await requireAdmin(req);
  const contractorId = typeof req.body?.contractorId === 'string' ? req.body.contractorId : '';
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  const reassignToId = typeof req.body?.reassignToId === 'string' ? req.body.reassignToId : '';
  if (!contractorId || !['Active', 'Suspended', 'Offboarded'].includes(status)) {
    return res.status(400).json({ error: 'A contractor and valid lifecycle status are required.' });
  }
  if (status !== 'Active' && !reason) return res.status(422).json({ error: 'A reason is required for suspension or offboarding.' });

  const contractorRef = adminDb.collection('contractors').doc(contractorId);
  const contractorSnapshot = await contractorRef.get();
  if (!contractorSnapshot.exists) return res.status(404).json({ error: 'Contractor profile not found.' });
  const contractor = contractorSnapshot.data();
  const previousStatus = contractor.accessStatus || (contractor.active === false ? 'Suspended' : 'Active');

  const jobsSnapshot = await adminDb.collection('jobs').get();
  const openJobs = jobsSnapshot.docs.filter((snapshot) => {
    const job = snapshot.data();
    return !terminalJobStatuses.has(String(job.status || '').toLowerCase()) && assignedContractorIds(job).includes(contractorId);
  });

  let replacement = null;
  if (status !== 'Active' && openJobs.length && !reassignToId) {
    return res.status(409).json({
      error: 'Reassign or unassign this technician’s open work orders before changing access.',
      openJobs: openJobs.map((job) => ({ id: job.id, name: job.data().name || job.data().jobName || job.data().workOrderNumber || job.id })),
    });
  }
  if (reassignToId && reassignToId !== 'UNASSIGNED') {
    const replacementSnapshot = await adminDb.collection('contractors').doc(reassignToId).get();
    if (!replacementSnapshot.exists) return res.status(422).json({ error: 'The replacement technician was not found.' });
    replacement = { id: replacementSnapshot.id, ...replacementSnapshot.data() };
    const replacementStatus = replacement.accessStatus || (replacement.active === false ? 'Suspended' : 'Active');
    if (replacementStatus !== 'Active') return res.status(422).json({ error: 'Choose an active replacement technician.' });
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  for (const jobSnapshot of openJobs) {
    const job = jobSnapshot.data();
    const currentIds = assignedContractorIds(job).filter((id) => id !== contractorId && id !== 'ALL');
    if (replacement && !currentIds.includes(replacement.id)) currentIds.push(replacement.id);
    const leadWasRemoved = job.technicianLeadId === contractorId || job.assignedTechId === contractorId;
    batch.set(jobSnapshot.ref, {
      assignedTechIds: currentIds,
      ...(leadWasRemoved ? {
        assignedTechId: replacement?.id || '',
        assignedTechName: replacement?.name || '',
        technicianLeadId: replacement?.id || '',
      } : {}),
      updatedAt: now,
      lastAssignmentChange: { fromContractorId: contractorId, toContractorId: replacement?.id || null, changedAt: now },
    }, { merge: true });
  }

  const lifecycleEvent = { status, previousStatus, reason, changedAt: now, changedBy: actor.uid || null, reassignedToId: replacement?.id || null, affectedJobCount: openJobs.length };
  const history = Array.isArray(contractor.lifecycleHistory) ? contractor.lifecycleHistory.slice(-49) : [];
  batch.set(contractorRef, {
    accessStatus: status,
    active: status === 'Active',
    lifecycleReason: reason,
    lifecycleChangedAt: now,
    lifecycleChangedBy: actor.uid || null,
    lifecycleHistory: [...history, lifecycleEvent],
    ...(status === 'Active' ? { activatedAt: now, suspendedAt: null, offboardedAt: null } : {}),
    ...(status === 'Suspended' ? { suspendedAt: now } : {}),
    ...(status === 'Offboarded' ? { offboardedAt: now } : {}),
  }, { merge: true });
  await batch.commit();

  if (contractor.authUid) {
    await adminAuth.updateUser(contractor.authUid, { disabled: status !== 'Active' });
    if (status !== 'Active') await adminAuth.revokeRefreshTokens(contractor.authUid);
  }
  const notification = await sendLifecycleNotice({ contractor, status, reason });
  await writeAudit({
    actor,
    action: `contractor.${status.toLowerCase()}`,
    entityType: 'contractor',
    entityId: contractorId,
    summary: `${contractor.name || contractor.email || contractorId} changed from ${previousStatus} to ${status}.`,
    details: { previousStatus, status, reason, affectedJobCount: openJobs.length, reassignToId: replacement?.id || null, notification },
  });
  return res.status(200).json({ success: true, status, affectedJobCount: openJobs.length, notification });
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
  if (req.query?.adminOperation === 'lifecycle') {
    try {
      return await handleLifecycle(req, res);
    } catch (error) {
      if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') return res.status(403).json({ error: error.message });
      console.error('Contractor lifecycle update failed:', error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Could not update technician access.' });
    }
  }
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
    const actor = await requireAdmin(req);

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
    if (['Suspended', 'Offboarded'].includes(contractor.accessStatus)) {
      return res.status(409).json({ error: 'Use the Activate control before sending a new portal invitation.' });
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

    if (user.disabled) await adminAuth.updateUser(user.uid, { disabled: false });

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
      accessStatus: 'Active',
      active: true,
      activatedAt: now,
      invitationDelivery: {
        emailId: emailDelivery.id,
        status: 'accepted',
        acceptedAt: now,
        checkedAt: now,
      },
    }, { merge: true });
    await writeAudit({
      actor,
      action: accountCreated ? 'contractor.invited' : 'contractor.invitation_resent',
      entityType: 'contractor',
      entityId: contractorId,
      summary: `${contractor.name || email} received a branded portal invitation.`,
      details: { email, accountCreated, previousAccessStatus: contractor.accessStatus || null, accessStatus: 'Active' },
    });

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
