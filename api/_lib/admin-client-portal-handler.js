import { adminDb, requireAdmin } from './firebase-admin.js';
import { clean, hashValue, nowIso, opaqueToken, recordEvent, sendEmail, sendSms, syncCalendarAppointment } from './client-portal.js';

async function listDashboard(res) {
  const [requests, organizations, users, settings, appointments, failedNotifications, scopeChanges] = await Promise.all([
    adminDb.collection('vendor_requests').limit(100).get(),
    adminDb.collection('client_organizations').limit(100).get(),
    adminDb.collection('client_users').limit(200).get(),
    adminDb.collection('settings').doc('client_portal').get(),
    adminDb.collection('appointments').limit(200).get(),
    adminDb.collection('notification_deliveries').where('status', '==', 'failed').limit(50).get(),
    adminDb.collection('scope_versions').where('status', '==', 'client_requested').limit(50).get(),
  ]);
  return res.status(200).json({
    requests: requests.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    organizations: organizations.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    users: users.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, verificationCodeHash: undefined }; }),
    appointments: appointments.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    failedNotifications: failedNotifications.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    scopeChanges: scopeChanges.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    settings: settings.exists ? settings.data() : { enabled: true, pilotOnly: false },
  });
}

async function saveOrganization(req, res, admin) {
  const organizationId = clean(req.body?.organizationId, 120) || adminDb.collection('client_organizations').doc().id;
  const current = await adminDb.collection('client_organizations').doc(organizationId).get();
  const domains = Array.isArray(req.body?.approvedDomains) ? req.body.approvedDomains.map((v) => clean(v, 120).toLowerCase().replace(/^@/, '')).filter(Boolean) : (current.data()?.approvedDomains || []);
  const prefixes = Array.isArray(req.body?.referencePrefixes) ? req.body.referencePrefixes.map((v) => clean(v, 40)).filter(Boolean) : (current.data()?.referencePrefixes || []);
  const data = {
    name: clean(req.body?.name || current.data()?.name, 150), approvedDomains: [...new Set(domains)], referencePrefixes: [...new Set(prefixes)],
    defaultContactPolicy: ['techsavvy_only', 'direct_required', 'per_job'].includes(req.body?.defaultContactPolicy) ? req.body.defaultContactPolicy : (current.data()?.defaultContactPolicy || 'techsavvy_only'),
    billingEmail: clean(req.body?.billingEmail || current.data()?.billingEmail, 254).toLowerCase(), status: req.body?.status === 'suspended' ? 'suspended' : 'active',
    updatedAt: nowIso(), updatedByUid: admin.uid, ...(current.exists ? {} : { createdAt: nowIso() }),
  };
  if (!data.name) return res.status(422).json({ error: 'Company name is required.' });
  await adminDb.collection('client_organizations').doc(organizationId).set(data, { merge: true });
  return res.status(200).json({ organization: { id: organizationId, ...data } });
}

async function approveMember(req, res, admin) {
  const uid = clean(req.body?.uid, 128);
  const ref = adminDb.collection('client_users').doc(uid);
  const profile = await ref.get();
  if (!profile.exists) return res.status(404).json({ error: 'Membership request not found.' });
  if (profile.data().emailVerified !== true || profile.data().phoneVerified !== true) return res.status(409).json({ error: 'The user must verify email and phone before approval.' });
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : profile.data().requestedRoles;
  await ref.set({ status: 'active', roles, approvedAt: nowIso(), approvedByUid: admin.uid, updatedAt: nowIso() }, { merge: true });
  await sendEmail({ to: profile.data().email, subject: 'Your TechSavvy client portal access is approved', text: 'Your company membership is active. You may now sign in to the TechSavvy Client Portal.', html: '<h1>Client portal access approved</h1><p>Your company membership is active. You may now sign in.</p>', type: 'membership_approved' }).catch(() => null);
  return res.status(200).json({ success: true });
}

async function updateRequest(req, res, admin) {
  const requestId = clean(req.body?.requestId, 120);
  const status = clean(req.body?.status, 40);
  if (!['reviewing', 'clarification_needed', 'approved', 'declined'].includes(status)) return res.status(422).json({ error: 'Invalid request status.' });
  const ref = adminDb.collection('vendor_requests').doc(requestId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Request not found.' });
  await ref.set({ status, reviewNote: clean(req.body?.reviewNote, 2000), reviewedAt: nowIso(), reviewedByUid: admin.uid, updatedAt: nowIso() }, { merge: true });
  await recordEvent({ requestId, type: `request_${status}`, actorUid: admin.uid, actorRole: 'admin', visibility: 'client', message: status === 'clarification_needed' ? clean(req.body?.reviewNote, 2000) : `Request marked ${status.replace(/_/g, ' ')}.` });
  await sendEmail({ to: snapshot.data().requesterEmail, subject: `${snapshot.data().requestNumber} update`, text: clean(req.body?.reviewNote, 2000) || `Your request is now ${status.replace(/_/g, ' ')}.`, html: `<p>${clean(req.body?.reviewNote, 2000) || `Your request is now ${status.replace(/_/g, ' ')}.`}</p>`, type: 'request_status' }).catch(() => null);
  return res.status(200).json({ success: true });
}

async function convertRequest(req, res, admin) {
  const requestId = clean(req.body?.requestId, 120);
  const requestRef = adminDb.collection('vendor_requests').doc(requestId);
  const snapshot = await requestRef.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Request not found.' });
  if (snapshot.data().convertedJobId) return res.status(409).json({ error: 'This request already has a work order.' });
  const request = snapshot.data();
  let organizationId = request.organizationId;
  if (!organizationId) {
    const orgRef = adminDb.collection('client_organizations').doc();
    await orgRef.set({ name: request.companyName, approvedDomains: [request.requesterEmail.split('@')[1]], referencePrefixes: [String(request.clientReference || '').replace(/[\d]+$/, '')].filter(Boolean), defaultContactPolicy: 'techsavvy_only', status: 'active', createdAt: nowIso(), updatedAt: nowIso(), createdByUid: admin.uid });
    organizationId = orgRef.id;
  }
  const jobRef = adminDb.collection('jobs').doc();
  const workOrderNumber = clean(req.body?.workOrderNumber, 80) || `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const assignedTechIds = Array.isArray(req.body?.assignedTechIds) && req.body.assignedTechIds.length ? req.body.assignedTechIds.map((v) => clean(v, 120)) : ['ALL'];
  const conversationToken = opaqueToken();
  const job = {
    id: jobRef.id, name: request.siteName, address: request.address, notes: request.accessInstructions || request.scopeSummary,
    clientVisibleNotes: request.scopeSummary, workOrderNumber, clientReference: request.clientReference,
    vendorName: request.companyName, siteContact: request.siteContact || `${request.requesterName} · ${request.requesterPhone}`,
    dateIssued: nowIso().slice(0, 10), targetCompletion: request.requestedWindows?.[0]?.date || '',
    workOrderTemplate: request.serviceType || 'general', hourlyRate: Number(req.body?.hourlyRate || 55), travelRate: Number(req.body?.travelRate || 35),
    equipment: request.equipment || [], scopeTasks: request.scopeTasks?.length ? request.scopeTasks : [request.scopeSummary],
    qaChecklist: ['Scope completed or exceptions noted.', 'Work area cleared and equipment secured.', 'Customer walkthrough completed.'],
    attachments: request.attachments || [], assignedTechIds, assignedTechId: assignedTechIds[0], technicianLeadId: clean(req.body?.technicianLeadId, 120),
    clientOrganizationId: organizationId, sourceRequestId: requestId, createdByClientUid: request.createdByClientUid || '',
    clientStatus: 'scheduling', clientContactPolicy: req.body?.directContactApproved === true ? 'direct_approved' : 'techsavvy_only',
    currentScopeVersion: 1, closeoutStatus: '', conversationTokenHash: hashValue(conversationToken), createdAt: nowIso(), updatedAt: nowIso(),
  };
  const batch = adminDb.batch();
  batch.set(jobRef, job);
  batch.set(adminDb.collection('scope_versions').doc(`${jobRef.id}_1`), { jobId: jobRef.id, version: 1, status: 'approved', scopeTasks: job.scopeTasks, equipment: job.equipment, approvedByUid: admin.uid, approvedAt: nowIso(), createdAt: nowIso() });
  batch.set(requestRef, { status: 'converted', convertedJobId: jobRef.id, organizationId, updatedAt: nowIso() }, { merge: true });
  if (request.createdByClientUid) batch.set(adminDb.collection('job_participants').doc(`${jobRef.id}_${request.createdByClientUid}`), { jobId: jobRef.id, clientUid: request.createdByClientUid, organizationId, roles: ['requester'], notifications: { email: true, sms: request.smsConsent?.optedIn === true }, createdAt: nowIso() });
  await batch.commit();
  const requested = request.requestedWindows?.[0];
  if (requested) await adminDb.collection('appointments').add({ jobId: jobRef.id, requestedWindows: request.requestedWindows, status: 'requested', technicianId: clean(req.body?.technicianLeadId, 120), history: [], createdAt: nowIso(), updatedAt: nowIso() });
  await recordEvent({ jobId: jobRef.id, requestId, type: 'request_converted', actorUid: admin.uid, actorRole: 'admin', visibility: 'client', message: 'Request approved and converted to a work order.' });
  await sendEmail({ to: request.requesterEmail, subject: `${workOrderNumber} approved`, text: `Your request ${request.requestNumber} was approved as work order ${workOrderNumber}. TechSavvy is confirming the appointment and assignment.`, html: `<h1>Request approved</h1><p>Your request ${request.requestNumber} is now work order <strong>${workOrderNumber}</strong>.</p>`, jobId: jobRef.id, type: 'request_converted' }).catch(() => null);
  if (job.technicianLeadId) {
    const technician = await adminDb.collection('contractors').doc(job.technicianLeadId).get();
    if (technician.exists) await sendEmail({ to: technician.data().email, subject: `New assignment ${workOrderNumber}`, text: `You have been assigned to ${job.name}. Sign in to the Contractor Portal to review the SOW.`, html: `<h1>New assignment</h1><p>You have been assigned to <strong>${job.name}</strong>. Sign in to review the SOW.</p>`, jobId: jobRef.id, type: 'technician_assignment' }).catch(() => null);
  }
  return res.status(201).json({ jobId: jobRef.id, workOrderNumber });
}

async function scheduleAppointment(req, res, admin) {
  const appointmentId = clean(req.body?.appointmentId, 120);
  const ref = adminDb.collection('appointments').doc(appointmentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Appointment not found.' });
  const start = clean(req.body?.start, 40), end = clean(req.body?.end, 40);
  if (!Date.parse(start) || !Date.parse(end) || Date.parse(end) <= Date.parse(start)) return res.status(422).json({ error: 'Choose a valid appointment window.' });
  const previous = snapshot.data();
  const appointment = { id: appointmentId, ...previous, confirmedStart: start, confirmedEnd: end, technicianId: clean(req.body?.technicianId, 120) || previous.technicianId, status: 'scheduled', directContactApproved: req.body?.directContactApproved === true, history: [...(previous.history || []), { type: 'scheduled', start, end, actorUid: admin.uid, at: nowIso() }], updatedAt: nowIso() };
  const jobDoc = await adminDb.collection('jobs').doc(previous.jobId).get();
  const calendar = await syncCalendarAppointment(appointment, { id: jobDoc.id, ...jobDoc.data() }, previous.googleCalendarEventId).catch((error) => ({ error: error.message }));
  await ref.set({ ...appointment, googleCalendarEventId: calendar.eventId || previous.googleCalendarEventId || '', calendarSyncStatus: calendar.error ? 'failed' : calendar.skipped ? 'not_configured' : 'synced', calendarSyncError: calendar.error || '' }, { merge: true });
  await adminDb.collection('jobs').doc(previous.jobId).set({ clientStatus: 'scheduled', targetCompletion: start.slice(0, 10), updatedAt: nowIso() }, { merge: true });
  await recordEvent({ jobId: previous.jobId, appointmentId, type: 'appointment_scheduled', actorUid: admin.uid, actorRole: 'admin', visibility: 'client', message: 'Appointment confirmed.', metadata: { start, end } });
  const participants = await adminDb.collection('job_participants').where('jobId', '==', previous.jobId).get();
  const clients = await Promise.all(participants.docs.map((doc) => adminDb.collection('client_users').doc(doc.data().clientUid).get()));
  await Promise.allSettled(clients.filter((doc) => doc.exists && doc.data().status === 'active').map(async (client) => {
    const text = `TechSavvy appointment confirmed for ${new Date(start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.`;
    await sendEmail({ to: client.data().email, subject: `${jobDoc.data().workOrderNumber} appointment confirmed`, text, html: `<p>${text}</p>`, jobId: previous.jobId, type: 'appointment_confirmed' });
    if (client.data().smsConsent?.optedIn === true) await sendSms({ to: client.data().phone, body: text, jobId: previous.jobId, type: 'appointment_confirmed' });
  }));
  return res.status(200).json({ success: true, calendarSyncStatus: calendar.error ? 'failed' : calendar.skipped ? 'not_configured' : 'synced' });
}

async function approveScopeChange(req, res, admin) {
  const scopeVersionId = clean(req.body?.scopeVersionId, 120);
  const ref = adminDb.collection('scope_versions').doc(scopeVersionId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().status !== 'client_requested') return res.status(404).json({ error: 'Pending scope change not found.' });
  const approved = req.body?.approve === true;
  await ref.set({ status: approved ? 'approved' : 'declined', reviewNote: clean(req.body?.reviewNote, 2000), reviewedAt: nowIso(), reviewedByUid: admin.uid }, { merge: true });
  if (approved) {
    const scopeTasks = clean(snapshot.data().revisedScope, 5000).split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    await adminDb.collection('jobs').doc(snapshot.data().jobId).set({ currentScopeVersion: snapshot.data().version, scopeTasks, updatedAt: nowIso() }, { merge: true });
  }
  await recordEvent({ jobId: snapshot.data().jobId, type: approved ? 'scope_change_approved' : 'scope_change_declined', actorUid: admin.uid, actorRole: 'admin', visibility: 'client', message: approved ? 'TechSavvy approved the revised scope.' : 'TechSavvy declined the requested scope change.' });
  return res.status(200).json({ success: true });
}

async function saveTechnicianPublicProfile(req, res, admin) {
  const contractorId = clean(req.body?.contractorId, 120);
  const ref = adminDb.collection('contractors').doc(contractorId);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Technician not found.' });
  const data = { publicDisplayName: clean(req.body?.publicDisplayName, 100), specialty: clean(req.body?.specialty, 120), profilePhotoUrl: clean(req.body?.profilePhotoUrl, 1000), showPhotoToClients: req.body?.showPhotoToClients === true, allowDirectClientContact: req.body?.allowDirectClientContact === true, businessPhone: clean(req.body?.businessPhone, 40), businessEmail: clean(req.body?.businessEmail, 254).toLowerCase(), contactHours: clean(req.body?.contactHours, 100), publicProfileUpdatedAt: nowIso(), publicProfileUpdatedByUid: admin.uid };
  await ref.set(data, { merge: true });
  return res.status(200).json({ success: true });
}

async function saveSettings(req, res, admin) {
  await adminDb.collection('settings').doc('client_portal').set({ enabled: req.body?.enabled !== false, pilotOnly: req.body?.pilotOnly === true, updatedAt: nowIso(), updatedByUid: admin.uid }, { merge: true });
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req);
    const action = clean(req.query?.action, 60);
    if (req.method === 'GET' && action === 'dashboard') return await listDashboard(res);
    if (req.method === 'POST' && action === 'organization') return await saveOrganization(req, res, admin);
    if (req.method === 'POST' && action === 'approve-member') return await approveMember(req, res, admin);
    if (req.method === 'POST' && action === 'request-status') return await updateRequest(req, res, admin);
    if (req.method === 'POST' && action === 'convert') return await convertRequest(req, res, admin);
    if (req.method === 'POST' && action === 'schedule') return await scheduleAppointment(req, res, admin);
    if (req.method === 'POST' && action === 'scope-change') return await approveScopeChange(req, res, admin);
    if (req.method === 'POST' && action === 'technician-public-profile') return await saveTechnicianPublicProfile(req, res, admin);
    if (req.method === 'POST' && action === 'settings') return await saveSettings(req, res, admin);
    return res.status(404).json({ error: 'Admin client-portal operation not found.' });
  } catch (error) {
    console.error('Admin client portal error:', error);
    const status = ['Authentication required.', 'Administrator access required.'].includes(error.message) ? 403 : (error.statusCode || 500);
    return res.status(status).json({ error: status === 500 ? 'The admin client portal could not complete this request.' : error.message });
  }
}
