import { randomInt } from 'node:crypto';
import { adminAuth, adminDb, adminStorage } from './firebase-admin.js';
import {
  CLIENT_ROLES, addBusinessDays, canAccessJob, clean, emailDomain, hasRole, hashValue,
  normalizeEmail, normalizePhone, notifyNewRequest, nowIso, opaqueToken, optionalUser,
  escapeHtml, publicTechnician, recordEvent, requireClient, requireUser, sendEmail, sendSms,
  uploadInlineFiles, verificationHash,
} from './client-portal.js';

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const requestLimit = new Map();

function ipFor(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimited(req, key, max = 5, windowMs = 15 * 60 * 1000) {
  const bucket = `${key}:${ipFor(req)}`;
  const cutoff = Date.now() - windowMs;
  const entries = (requestLimit.get(bucket) || []).filter((value) => value > cutoff);
  if (entries.length >= max) return true;
  entries.push(Date.now());
  requestLimit.set(bucket, entries);
  return false;
}

function requestedWindows(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((window) => ({
    date: clean(window?.date, 10),
    start: clean(window?.start, 5),
    end: clean(window?.end, 5),
  })).filter((window) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(window.date) || !/^\d{2}:\d{2}$/.test(window.start) || !/^\d{2}:\d{2}$/.test(window.end)) return false;
    const weekday = new Date(`${window.date}T12:00:00Z`).getUTCDay();
    return ![0, 6].includes(weekday) && window.start >= '08:00' && window.end <= '17:00' && window.end > window.start;
  });
}

function isUrgent(windows) {
  if (!windows[0]) return false;
  const requested = new Date(`${windows[0].date}T${windows[0].start}:00-07:00`);
  return requested < addBusinessDays(new Date(), 2);
}

async function findOrganization(domain) {
  if (!domain) return null;
  const snapshot = await adminDb.collection('client_organizations').where('approvedDomains', 'array-contains', domain).limit(1).get();
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function createRequest(req, res) {
  const portalSettings = await adminDb.collection('settings').doc('client_portal').get();
  if (portalSettings.exists && portalSettings.data().enabled === false) return res.status(404).json({ error: 'Client booking is not currently accepting requests.' });
  if (req.body?.website) return res.status(202).json({ success: true });
  if (rateLimited(req, 'booking', 4)) return res.status(429).json({ error: 'Please wait before submitting another request.' });
  const requesterEmail = normalizeEmail(req.body?.requesterEmail);
  const windows = requestedWindows(req.body?.requestedWindows);
  const required = [req.body?.companyName, req.body?.requesterName, requesterEmail, req.body?.requesterPhone, req.body?.siteName, req.body?.address, req.body?.scopeSummary];
  if (!required.every((value) => clean(value, 500)) || !validEmail(requesterEmail) || windows.length === 0) {
    return res.status(422).json({ error: 'Complete the company, contact, site, scope, and requested scheduling fields.' });
  }
  const user = await optionalUser(req).catch(() => null);
  const organization = await findOrganization(emailDomain(requesterEmail));
  if (portalSettings.data()?.pilotOnly === true && !organization?.id) return res.status(403).json({ error: 'Online booking is currently limited to approved pilot companies.' });
  const ref = adminDb.collection('vendor_requests').doc();
  const sequence = Date.now().toString().slice(-7);
  const requestNumber = `TS-${new Date().getUTCFullYear()}-${sequence}`;
  let prefix = clean(req.body?.referencePrefix, 40);
  if (organization?.id) {
    const approved = Array.isArray(organization.referencePrefixes) ? organization.referencePrefixes : [];
    if (prefix && !approved.includes(prefix)) return res.status(422).json({ error: 'Choose an approved reference prefix for this company.' });
    if (!prefix && approved.length) prefix = approved[0];
  }
  const suppliedReference = clean(req.body?.clientReference, 80);
  const clientReference = suppliedReference ? `${prefix}${suppliedReference}` : `${prefix || 'REQ-'}${sequence}`;
  if (organization?.id) {
    const duplicate = await adminDb.collection('vendor_requests')
      .where('organizationId', '==', organization.id).where('clientReference', '==', clientReference).limit(1).get();
    if (!duplicate.empty) return res.status(409).json({ error: 'That client reference is already used by this company.' });
  }
  const createdAt = nowIso();
  const statusToken = opaqueToken();
  const request = {
    requestNumber, companyName: clean(req.body.companyName, 150), organizationId: organization?.id || '',
    createdByClientUid: user?.uid || '', requesterName: clean(req.body.requesterName, 120), requesterEmail,
    requesterPhone: normalizePhone(req.body.requesterPhone), clientReference,
    siteName: clean(req.body.siteName, 160), address: clean(req.body.address, 300),
    siteContact: clean(req.body.siteContact, 200), accessInstructions: clean(req.body.accessInstructions, 2000),
    serviceType: clean(req.body.serviceType, 80), scopeSummary: clean(req.body.scopeSummary, 5000),
    scopeTasks: Array.isArray(req.body.scopeTasks) ? req.body.scopeTasks.map((v) => clean(v, 500)).filter(Boolean).slice(0, 30) : [],
    equipment: Array.isArray(req.body.equipment) ? req.body.equipment.slice(0, 30).map((v) => ({ description: clean(v?.description, 300), quantity: clean(v?.quantity, 50), notes: clean(v?.notes, 300) })).filter((v) => v.description) : [],
    deliverables: clean(req.body.deliverables, 2000), safetyRequirements: clean(req.body.safetyRequirements, 2000),
    requestedWindows: windows, urgent: isUrgent(windows), status: 'requested',
    directContactRequested: req.body.directContactRequested === true, directContactDecision: 'techsavvy_only',
    smsConsent: req.body.smsConsent === true ? { optedIn: true, phone: normalizePhone(req.body.requesterPhone), consentVersion: 'client-booking-2026-08', consentedAt: createdAt } : { optedIn: false },
    attachments: [], statusTokenHash: hashValue(statusToken), createdAt, updatedAt: createdAt,
  };
  await ref.set(request);
  try {
    const attachments = await uploadInlineFiles(req.body?.attachments, ref.id);
    if (attachments.length) await ref.set({ attachments }, { merge: true });
    request.attachments = attachments;
  } catch (error) {
    await ref.delete();
    throw error;
  }
  await recordEvent({ requestId: ref.id, type: 'request_created', actorUid: user?.uid || '', actorRole: user ? 'client' : 'public', visibility: 'client', message: 'Job request submitted.' });
  await notifyNewRequest({ id: ref.id, ...request });
  const statusUrl = `${(process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '')}/request-status?request=${encodeURIComponent(ref.id)}&token=${encodeURIComponent(statusToken)}`;
  await sendEmail({
    to: requesterEmail, subject: `We received ${requestNumber}`,
    text: `Your TechSavvy job request ${requestNumber} has been received. Track it or answer clarification requests here: ${statusUrl}`,
    html: `<h1>Request received</h1><p>Your TechSavvy job request <strong>${requestNumber}</strong> has been received.</p><p><a href="${statusUrl}">Track your request</a></p>`, type: 'request_receipt',
  }).catch(() => null);
  return res.status(201).json({ success: true, requestId: ref.id, requestNumber, urgent: request.urgent, statusUrl });
}

async function publicRequestStatus(req, res) {
  const requestId = clean(req.query?.requestId || req.body?.requestId, 120);
  const token = clean(req.query?.token || req.body?.token, 200);
  const snapshot = await adminDb.collection('vendor_requests').doc(requestId).get();
  if (!snapshot.exists || !token || snapshot.data().statusTokenHash !== hashValue(token)) return res.status(404).json({ error: 'Request tracking link is invalid or expired.' });
  if (req.method === 'POST') {
    if (rateLimited(req, `request-message:${requestId}`, 8)) return res.status(429).json({ error: 'Please wait before sending another reply.' });
    const message = clean(req.body?.message, 5000);
    if (!message) return res.status(422).json({ error: 'Enter a reply.' });
    await adminDb.collection('job_messages').add({ requestId, organizationId: snapshot.data().organizationId || '', authorName: snapshot.data().requesterName, authorRole: 'client', visibility: 'client', message, source: 'private_status_link', createdAt: nowIso() });
    await recordEvent({ requestId, type: 'clarification_reply', actorRole: 'client', visibility: 'client', message: 'Client replied to the request.' });
    await sendEmail({ to: process.env.CLIENT_REQUEST_ALERT_EMAILS?.split(',') || process.env.SUPPORT_EMAIL, subject: `${snapshot.data().requestNumber} clarification reply`, text: message, html: `<p>${message.replace(/\n/g, '<br>')}</p>`, type: 'clarification_reply' }).catch(() => null);
  }
  const [events, messages] = await Promise.all([adminDb.collection('job_events').where('requestId', '==', requestId).get(), adminDb.collection('job_messages').where('requestId', '==', requestId).get()]);
  const data = snapshot.data();
  return res.status(200).json({ request: { requestNumber: data.requestNumber, companyName: data.companyName, siteName: data.siteName, status: data.status, requestedWindows: data.requestedWindows, reviewNote: data.reviewNote || '', convertedJobId: data.convertedJobId || '' }, events: events.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((event) => event.visibility === 'client').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))), messages: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((message) => message.visibility === 'client').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))) });
}

async function registerMembership(req, res) {
  const user = await requireUser(req);
  const email = normalizeEmail(user.email);
  if (!user.email_verified) return res.status(403).json({ error: 'Verify your email before requesting company access.' });
  const organization = await findOrganization(emailDomain(email));
  const requestedOrgId = clean(req.body?.organizationId, 100);
  const organizationId = organization?.id || requestedOrgId;
  if (!organizationId) return res.status(422).json({ error: 'No approved company matches this email domain. Submit a first job request or contact TechSavvy.' });
  const org = await adminDb.collection('client_organizations').doc(organizationId).get();
  if (!org.exists) return res.status(404).json({ error: 'Company not found.' });
  const requestedRoles = Array.isArray(req.body?.roles) ? req.body.roles.filter((role) => CLIENT_ROLES.includes(role) && role !== 'company_admin') : [];
  await adminDb.collection('client_users').doc(user.uid).set({
    organizationId, email, displayName: clean(req.body?.displayName || user.name || email, 120), phone: normalizePhone(req.body?.phone),
    roles: requestedRoles.length ? requestedRoles : ['project_viewer'], requestedRoles,
    status: 'pending', emailVerified: true, phoneVerified: false,
    smsConsent: req.body?.smsConsent === true ? { optedIn: true, phone: normalizePhone(req.body?.phone), consentVersion: 'client-membership-2026-08', consentedAt: nowIso() } : { optedIn: false },
    createdAt: nowIso(), updatedAt: nowIso(),
  }, { merge: true });
  const matchingRequests = await adminDb.collection('vendor_requests').where('requesterEmail', '==', email).limit(25).get();
  const batch = adminDb.batch();
  matchingRequests.docs.forEach((doc) => batch.set(doc.ref, { createdByClientUid: user.uid, organizationId, updatedAt: nowIso() }, { merge: true }));
  await batch.commit();
  for (const request of matchingRequests.docs) {
    if (request.data().convertedJobId) {
      await adminDb.collection('jobs').doc(request.data().convertedJobId).set({ createdByClientUid: user.uid, clientOrganizationId: organizationId, updatedAt: nowIso() }, { merge: true });
      await adminDb.collection('job_participants').doc(`${request.data().convertedJobId}_${user.uid}`).set({ jobId: request.data().convertedJobId, clientUid: user.uid, organizationId, roles: ['requester'], notifications: { email: true, sms: req.body?.smsConsent === true }, createdAt: nowIso() }, { merge: true });
    }
  }
  return res.status(202).json({ success: true, organization: { id: org.id, name: org.data().name }, status: 'pending_phone_verification' });
}

async function sendVerificationEmail(req, res) {
  const user = await requireUser(req);
  if (user.email_verified) return res.status(200).json({ success: true, alreadyVerified: true });
  if (rateLimited(req, `email-verification:${user.uid}`, 4, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'Please wait before requesting another verification email.' });
  }
  const email = normalizeEmail(user.email);
  if (!email) return res.status(422).json({ error: 'This account does not have an email address.' });
  const appUrl = (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');
  const verificationLink = await adminAuth.generateEmailVerificationLink(email, { url: `${appUrl}/client` });
  const safeLink = escapeHtml(verificationLink);
  const delivery = await sendEmail({
    to: email,
    subject: 'Verify your TechSavvy Client Portal email',
    text: `Verify your TechSavvy Client Portal email by opening this secure link:\n${verificationLink}\n\nIf you did not create this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><h1 style="color:#16a34a;font-size:24px">TechSavvy Client Portal</h1><p>Confirm that this email belongs to you.</p><p><a href="${safeLink}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Verify email address</a></p><p style="color:#475569">If you did not create this account, you can ignore this message.</p></div>`,
    type: 'client_email_verification',
  });
  if (delivery.skipped) return res.status(503).json({ error: 'Verification email delivery is not configured.' });
  return res.status(202).json({ success: true });
}

async function sendVerificationCode(req, res) {
  const user = await requireUser(req);
  if (rateLimited(req, `verify:${user.uid}`, 4, 30 * 60 * 1000)) return res.status(429).json({ error: 'Please wait before requesting another code.' });
  const profileRef = adminDb.collection('client_users').doc(user.uid);
  const profile = await profileRef.get();
  if (!profile.exists) return res.status(404).json({ error: 'Submit a company membership request first.' });
  const code = String(randomInt(100000, 1000000));
  await profileRef.set({ verificationCodeHash: verificationHash(user.uid, code), verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), verificationAttempts: 0 }, { merge: true });
  const delivery = await sendSms({ to: profile.data().phone, body: `${code} is your TechSavvy client portal verification code. It expires in 10 minutes.`, type: 'client_verification', important: true });
  if (delivery.skipped) return res.status(503).json({ error: 'Text verification is not configured yet.' });
  return res.status(202).json({ success: true });
}

async function verifyCode(req, res) {
  const user = await requireUser(req);
  const profileRef = adminDb.collection('client_users').doc(user.uid);
  const profile = await profileRef.get();
  const data = profile.data();
  if (!profile.exists || !data.verificationCodeHash) return res.status(404).json({ error: 'Request a verification code first.' });
  if (Date.parse(data.verificationExpiresAt) < Date.now() || Number(data.verificationAttempts || 0) >= 5) return res.status(410).json({ error: 'The code expired. Request a new one.' });
  const valid = verificationHash(user.uid, clean(req.body?.code, 6)) === data.verificationCodeHash;
  if (!valid) {
    await profileRef.set({ verificationAttempts: Number(data.verificationAttempts || 0) + 1 }, { merge: true });
    return res.status(422).json({ error: 'The verification code is incorrect.' });
  }
  await profileRef.set({ phoneVerified: true, phoneVerifiedAt: nowIso(), verificationCodeHash: '', verificationExpiresAt: '', updatedAt: nowIso() }, { merge: true });
  return res.status(200).json({ success: true, status: 'pending_approval' });
}

async function getMe(req, res) {
  const user = await requireUser(req);
  const profile = await adminDb.collection('client_users').doc(user.uid).get();
  if (!profile.exists) return res.status(200).json({ user: { uid: user.uid, email: user.email }, profile: null });
  const data = profile.data();
  const org = data.organizationId ? await adminDb.collection('client_organizations').doc(data.organizationId).get() : null;
  let members = [];
  if (data.status === 'active' && hasRole(data, 'company_admin')) {
    const memberSnapshot = await adminDb.collection('client_users').where('organizationId', '==', data.organizationId).limit(100).get();
    members = memberSnapshot.docs.map((doc) => { const member = doc.data(); return { id: doc.id, displayName: member.displayName, email: member.email, roles: member.roles || [], requestedRoles: member.requestedRoles || [], status: member.status, emailVerified: member.emailVerified, phoneVerified: member.phoneVerified }; });
  }
  return res.status(200).json({ user: { uid: user.uid, email: user.email, emailVerified: user.email_verified }, profile: { id: profile.id, ...data, verificationCodeHash: undefined }, organization: org?.exists ? { id: org.id, ...org.data() } : null, members });
}

async function listJobs(req, res) {
  const { profile } = await requireClient(req);
  const jobsSnapshot = await adminDb.collection('jobs').where('clientOrganizationId', '==', profile.organizationId).limit(100).get();
  let allowedIds = null;
  if (!hasRole(profile, 'company_admin')) {
    const participants = await adminDb.collection('job_participants').where('clientUid', '==', profile.id).get();
    allowedIds = new Set(participants.docs.map((doc) => doc.data().jobId));
  }
  const jobs = jobsSnapshot.docs.filter((doc) => hasRole(profile, 'company_admin') || doc.data().createdByClientUid === profile.id || allowedIds.has(doc.id)).map((doc) => {
    const data = doc.data();
    return { id: doc.id, name: data.name, address: data.address, workOrderNumber: data.workOrderNumber, clientReference: data.clientReference, status: data.clientStatus || data.status, targetCompletion: data.targetCompletion, closeoutStatus: data.closeoutStatus || '' };
  });
  return res.status(200).json({ jobs });
}

async function getJob(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.query?.jobId, 120);
  if (!jobId || !(await canAccessJob(profile, jobId))) return res.status(404).json({ error: 'Job not found.' });
  const [jobDoc, appointments, events, messages, contractors] = await Promise.all([
    adminDb.collection('jobs').doc(jobId).get(),
    adminDb.collection('appointments').where('jobId', '==', jobId).get(),
    adminDb.collection('job_events').where('jobId', '==', jobId).get(),
    adminDb.collection('job_messages').where('jobId', '==', jobId).get(),
    adminDb.collection('contractors').get(),
  ]);
  const data = jobDoc.data();
  const contractorMap = new Map(contractors.docs.map((doc) => [doc.id, doc.data()]));
  const safeAppointments = appointments.docs.map((doc) => {
    const appointment = { id: doc.id, ...doc.data() };
    return { id: appointment.id, status: appointment.status, confirmedStart: appointment.confirmedStart, confirmedEnd: appointment.confirmedEnd, requestedWindows: appointment.requestedWindows || [], rescheduleProposal: appointment.rescheduleProposal || null, technician: publicTechnician(contractorMap.get(appointment.technicianId), appointment) };
  }).sort((a, b) => String(a.confirmedStart || '').localeCompare(String(b.confirmedStart || '')));
  const clientFiles = await Promise.all([...(data.attachments || []), ...(data.signedWorkOrders || [])].filter((file) => file.storagePath || file.url).slice(0, 30).map(async (file) => {
    if (file.storagePath) {
      const [url] = await adminStorage.file(file.storagePath).getSignedUrl({ action: 'read', version: 'v4', expires: Date.now() + 15 * 60 * 1000 });
      return { name: file.name || file.fileName, url, type: file.contentType || 'document' };
    }
    return { name: file.name || file.fileName, url: file.url, type: file.contentType || 'document' };
  }));
  const billingDocuments = hasRole(profile, 'billing', 'company_admin') ? (data.clientBillingDocuments || []) : [];
  return res.status(200).json({
    job: { id: jobDoc.id, name: data.name, address: data.address, notes: data.clientVisibleNotes || '', workOrderNumber: data.workOrderNumber, clientReference: data.clientReference, status: data.clientStatus || data.status, targetCompletion: data.targetCompletion, scopeTasks: data.scopeTasks || [], qaChecklist: data.qaChecklist || [], contactPolicy: data.clientContactPolicy || 'techsavvy_only', closeoutStatus: data.closeoutStatus || '', documents: clientFiles, billingDocuments },
    appointments: safeAppointments,
    events: events.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((event) => event.visibility === 'client').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    messages: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((message) => message.visibility === 'client').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
  });
}

async function postMessage(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!(await canAccessJob(profile, jobId))) return res.status(404).json({ error: 'Job not found.' });
  const message = clean(req.body?.message, 5000);
  if (!message) return res.status(422).json({ error: 'Enter a message.' });
  const job = await adminDb.collection('jobs').doc(jobId).get();
  const token = opaqueToken();
  const ref = await adminDb.collection('job_messages').add({ jobId, organizationId: profile.organizationId, authorUid: profile.id, authorName: profile.displayName, authorRole: 'client', visibility: 'client', message, source: 'portal', createdAt: nowIso() });
  const replyAddress = process.env.RESEND_RECEIVING_DOMAIN ? `job+${token}@${process.env.RESEND_RECEIVING_DOMAIN}` : undefined;
  await adminDb.collection('conversation_tokens').doc(hashValue(token)).set({ jobId, organizationId: profile.organizationId, active: true, createdAt: nowIso() });
  await sendEmail({ to: process.env.SUPPORT_EMAIL, subject: `[${job.data().workOrderNumber || jobId}] Client message`, text: message, html: `<p>${message.replace(/\n/g, '<br>')}</p>`, replyTo: replyAddress, jobId, type: 'job_message' }).catch(() => null);
  return res.status(201).json({ message: { id: ref.id, message, createdAt: nowIso() } });
}

async function reschedule(req, res) {
  const { profile } = await requireClient(req);
  const appointmentId = clean(req.body?.appointmentId, 120);
  const appointmentRef = adminDb.collection('appointments').doc(appointmentId);
  const appointment = await appointmentRef.get();
  if (!appointment.exists || !(await canAccessJob(profile, appointment.data().jobId))) return res.status(404).json({ error: 'Appointment not found.' });
  const start = clean(req.body?.start, 40), end = clean(req.body?.end, 40);
  if (!Date.parse(start) || !Date.parse(end) || Date.parse(end) <= Date.parse(start)) return res.status(422).json({ error: 'Choose a valid replacement window.' });
  await appointmentRef.set({ rescheduleProposal: { start, end, proposedByUid: profile.id, proposedByRole: 'client', status: 'proposed', createdAt: nowIso() }, updatedAt: nowIso() }, { merge: true });
  await recordEvent({ jobId: appointment.data().jobId, appointmentId, type: 'reschedule_proposed', actorUid: profile.id, actorRole: 'client', visibility: 'client', message: 'Client proposed a new appointment window.', metadata: { start, end } });
  return res.status(200).json({ success: true });
}

async function acceptCloseout(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!(await canAccessJob(profile, jobId))) return res.status(404).json({ error: 'Job not found.' });
  await adminDb.collection('jobs').doc(jobId).set({ closeoutStatus: 'accepted', clientStatus: 'closed', clientAcceptedAt: nowIso(), clientAcceptedByUid: profile.id, updatedAt: nowIso() }, { merge: true });
  await recordEvent({ jobId, type: 'closeout_accepted', actorUid: profile.id, actorRole: 'client', visibility: 'client', message: 'Client accepted the closeout package.' });
  return res.status(200).json({ success: true });
}

async function requestScopeChange(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!(await canAccessJob(profile, jobId))) return res.status(404).json({ error: 'Job not found.' });
  const reason = clean(req.body?.reason, 3000);
  const revisedScope = clean(req.body?.revisedScope, 5000);
  if (!reason || !revisedScope) return res.status(422).json({ error: 'Provide the reason and requested scope revision.' });
  const job = await adminDb.collection('jobs').doc(jobId).get();
  const ref = await adminDb.collection('scope_versions').add({ jobId, organizationId: profile.organizationId, version: Number(job.data().currentScopeVersion || 1) + 1, status: 'client_requested', reason, revisedScope, scheduleImpact: clean(req.body?.scheduleImpact, 1000), costImpact: clean(req.body?.costImpact, 1000), requestedByUid: profile.id, requestedAt: nowIso(), createdAt: nowIso() });
  await recordEvent({ jobId, type: 'scope_change_requested', actorUid: profile.id, actorRole: 'client', visibility: 'client', message: 'Client submitted a scope change for TechSavvy approval.' });
  return res.status(201).json({ success: true, scopeVersionId: ref.id });
}

async function approveCompanyMember(req, res) {
  const { profile } = await requireClient(req);
  if (!hasRole(profile, 'company_admin')) return res.status(403).json({ error: 'Company Administrator role required.' });
  const uid = clean(req.body?.uid, 128);
  const target = await adminDb.collection('client_users').doc(uid).get();
  if (!target.exists || target.data().organizationId !== profile.organizationId) return res.status(404).json({ error: 'Membership request not found.' });
  if (target.data().emailVerified !== true || target.data().phoneVerified !== true) return res.status(409).json({ error: 'The user must verify email and phone first.' });
  const roles = Array.isArray(req.body?.roles) ? req.body.roles.filter((role) => CLIENT_ROLES.includes(role) && role !== 'company_admin') : target.data().requestedRoles;
  await target.ref.set({ status: 'active', roles, approvedAt: nowIso(), approvedByUid: profile.id, updatedAt: nowIso() }, { merge: true });
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  try {
    const action = clean(req.query?.action, 60);
    if (req.method === 'POST' && action === 'request') return await createRequest(req, res);
    if (['GET', 'POST'].includes(req.method) && action === 'request-status') return await publicRequestStatus(req, res);
    if (req.method === 'POST' && action === 'register') return await registerMembership(req, res);
    if (req.method === 'POST' && action === 'send-verification-email') return await sendVerificationEmail(req, res);
    if (req.method === 'POST' && action === 'send-code') return await sendVerificationCode(req, res);
    if (req.method === 'POST' && action === 'verify-code') return await verifyCode(req, res);
    if (req.method === 'GET' && action === 'me') return await getMe(req, res);
    if (req.method === 'GET' && action === 'jobs') return await listJobs(req, res);
    if (req.method === 'GET' && action === 'job') return await getJob(req, res);
    if (req.method === 'POST' && action === 'message') return await postMessage(req, res);
    if (req.method === 'POST' && action === 'reschedule') return await reschedule(req, res);
    if (req.method === 'POST' && action === 'accept-closeout') return await acceptCloseout(req, res);
    if (req.method === 'POST' && action === 'scope-change') return await requestScopeChange(req, res);
    if (req.method === 'POST' && action === 'approve-member') return await approveCompanyMember(req, res);
    return res.status(404).json({ error: 'Client portal operation not found.' });
  } catch (error) {
    console.error('Client portal error:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'The client portal could not complete this request.' });
  }
}
