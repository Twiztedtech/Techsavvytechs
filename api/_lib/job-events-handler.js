import { adminAuth, adminDb } from './firebase-admin.js';
import { clean, nowIso, recordEvent, sendEmail, sendSms, syncCalendarAppointment } from './client-portal.js';

async function portalUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  const user = await adminAuth.verifyIdToken(token);
  if (user.admin !== true && user.contractor !== true) throw Object.assign(new Error('Contractor Portal access is required.'), { statusCode: 403 });
  return user;
}

async function contractorFor(user) {
  if (user.admin === true) return null;
  const snapshot = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
  if (snapshot.empty) throw Object.assign(new Error('Contractor profile is not linked.'), { statusCode: 403 });
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function assignedJob(user, contractor, jobId) {
  const job = await adminDb.collection('jobs').doc(jobId).get();
  if (!job.exists) throw Object.assign(new Error('Job not found.'), { statusCode: 404 });
  if (user.admin !== true) {
    const assigned = Array.isArray(job.data().assignedTechIds) ? job.data().assignedTechIds : [job.data().assignedTechId || 'ALL'];
    if (!assigned.includes('ALL') && !assigned.includes(contractor.id)) throw Object.assign(new Error('You are not assigned to this job.'), { statusCode: 403 });
  }
  return job;
}

async function clientRecipients(jobId) {
  const [participants, job] = await Promise.all([
    adminDb.collection('job_participants').where('jobId', '==', jobId).get(),
    adminDb.collection('jobs').doc(jobId).get(),
  ]);
  const users = await Promise.all(participants.docs.map((doc) => adminDb.collection('client_users').doc(doc.data().clientUid).get()));
  const recipients = users.filter((doc) => doc.exists && doc.data().status === 'active').map((doc) => doc.data());
  const existing = new Set(recipients.map((recipient) => String(recipient.email || '').toLowerCase()));
  for (const email of job.data()?.clientNotificationEmails || []) {
    if (!existing.has(String(email).toLowerCase())) recipients.push({ email });
  }
  return recipients;
}

async function createProgress(req, res, user, contractor) {
  const jobId = clean(req.body?.jobId, 120);
  const job = await assignedJob(user, contractor, jobId);
  const status = clean(req.body?.status, 40);
  if (!['accepted', 'en_route', 'on_site', 'in_progress', 'blocked', 'completed', 'missed'].includes(status)) return res.status(422).json({ error: 'Invalid progress status.' });
  const visibility = req.body?.clientVisible === true ? 'client' : 'internal';
  const message = clean(req.body?.message, 3000);
  await adminDb.collection('jobs').doc(jobId).set({ clientStatus: status === 'completed' ? 'awaiting_acceptance' : status, closeoutStatus: status === 'completed' ? 'awaiting_acceptance' : (job.data().closeoutStatus || ''), completedAt: status === 'completed' ? nowIso() : (job.data().completedAt || ''), updatedAt: nowIso() }, { merge: true });
  await recordEvent({ jobId, type: `job_${status}`, actorUid: user.uid, actorRole: user.admin === true ? 'admin' : 'contractor', visibility, message: message || `Job marked ${status.replace(/_/g, ' ')}.`, metadata: { photoUrls: Array.isArray(req.body?.photoUrls) ? req.body.photoUrls.map((v) => clean(v, 1000)).slice(0, 12) : [] } });
  if (visibility === 'client') {
    const recipients = await clientRecipients(jobId);
    await Promise.allSettled(recipients.map(async (recipient) => {
      await sendEmail({ to: recipient.email, subject: `${job.data().workOrderNumber || 'Job'} progress update`, text: message || `Your job is now ${status.replace(/_/g, ' ')}.`, html: `<p>${message || `Your job is now ${status.replace(/_/g, ' ')}.`}</p>`, jobId, type: 'progress_update' });
      if (recipient.smsConsent?.optedIn === true && ['en_route', 'missed', 'completed'].includes(status)) await sendSms({ to: recipient.phone, body: `TechSavvy ${job.data().workOrderNumber || 'job'}: ${message || status.replace(/_/g, ' ')}.`, jobId, type: 'progress_update', important: status === 'missed' });
    }));
  }
  return res.status(201).json({ success: true });
}

async function respondReschedule(req, res, user, contractor) {
  const appointmentId = clean(req.body?.appointmentId, 120);
  const ref = adminDb.collection('appointments').doc(appointmentId);
  const appointment = await ref.get();
  if (!appointment.exists) return res.status(404).json({ error: 'Appointment not found.' });
  const job = await assignedJob(user, contractor, appointment.data().jobId);
  const proposal = appointment.data().rescheduleProposal;
  if (!proposal || proposal.status !== 'proposed') return res.status(409).json({ error: 'No pending reschedule proposal exists.' });
  if (req.body?.accept !== true) {
    await ref.set({ rescheduleProposal: { ...proposal, status: 'declined', respondedByUid: user.uid, respondedAt: nowIso() }, updatedAt: nowIso() }, { merge: true });
    await recordEvent({ jobId: job.id, appointmentId, type: 'reschedule_declined', actorUid: user.uid, actorRole: user.admin ? 'admin' : 'contractor', visibility: 'client', message: 'The proposed appointment window was declined.' });
    return res.status(200).json({ success: true, status: 'declined' });
  }
  const updated = { id: appointmentId, ...appointment.data(), confirmedStart: proposal.start, confirmedEnd: proposal.end, status: 'scheduled', rescheduleProposal: { ...proposal, status: 'accepted', respondedByUid: user.uid, respondedAt: nowIso() }, history: [...(appointment.data().history || []), { type: 'rescheduled', previousStart: appointment.data().confirmedStart || '', previousEnd: appointment.data().confirmedEnd || '', start: proposal.start, end: proposal.end, actorUid: user.uid, at: nowIso() }], updatedAt: nowIso() };
  const calendar = await syncCalendarAppointment(updated, { id: job.id, ...job.data() }, appointment.data().googleCalendarEventId).catch((error) => ({ error: error.message }));
  await ref.set({ ...updated, calendarSyncStatus: calendar.error ? 'failed' : calendar.skipped ? 'not_configured' : 'synced', calendarSyncError: calendar.error || '', googleCalendarEventId: calendar.eventId || appointment.data().googleCalendarEventId || '' }, { merge: true });
  await recordEvent({ jobId: job.id, appointmentId, type: 'appointment_rescheduled', actorUid: user.uid, actorRole: user.admin ? 'admin' : 'contractor', visibility: 'client', message: 'The client and technician agreed to a new appointment window.', metadata: { start: proposal.start, end: proposal.end } });
  const recipients = await clientRecipients(job.id);
  const updateText = `TechSavvy ${job.data().workOrderNumber || 'appointment'} was rescheduled to ${new Date(proposal.start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.`;
  await Promise.allSettled([
    ...recipients.map(async (recipient) => { await sendEmail({ to: recipient.email, subject: 'Appointment rescheduled', text: updateText, html: `<p>${updateText}</p>`, jobId: job.id, type: 'appointment_rescheduled' }); if (recipient.smsConsent?.optedIn === true) await sendSms({ to: recipient.phone, body: updateText, jobId: job.id, type: 'appointment_rescheduled' }); }),
    sendEmail({ to: process.env.CLIENT_REQUEST_ALERT_EMAILS?.split(',') || process.env.SUPPORT_EMAIL, subject: `${job.data().workOrderNumber || 'Job'} rescheduled`, text: updateText, html: `<p>${updateText}</p>`, jobId: job.id, type: 'admin_reschedule_notice' }),
    ...(process.env.CLIENT_REQUEST_ALERT_PHONES || '').split(',').filter(Boolean).map((phone) => sendSms({ to: phone, body: updateText, jobId: job.id, type: 'admin_reschedule_notice', important: true })),
  ]);
  return res.status(200).json({ success: true, status: 'scheduled' });
}

async function listAppointments(req, res, user, contractor) {
  const jobId = clean(req.query?.jobId, 120);
  await assignedJob(user, contractor, jobId);
  const snapshot = await adminDb.collection('appointments').where('jobId', '==', jobId).get();
  return res.status(200).json({ appointments: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(a.confirmedStart || '').localeCompare(String(b.confirmedStart || ''))) });
}

export default async function handler(req, res) {
  try {
    const user = await portalUser(req);
    const contractor = await contractorFor(user);
    const action = clean(req.query?.action, 50);
    if (req.method === 'GET' && action === 'appointments') return await listAppointments(req, res, user, contractor);
    if (req.method === 'POST' && action === 'progress') return await createProgress(req, res, user, contractor);
    if (req.method === 'POST' && action === 'reschedule-response') return await respondReschedule(req, res, user, contractor);
    return res.status(404).json({ error: 'Job event operation not found.' });
  } catch (error) {
    console.error('Portal job event error:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not save the job update.' });
  }
}
