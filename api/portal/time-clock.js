import { adminAuth, adminDb, adminStorage } from '../_lib/firebase-admin.js';
import { createQBOBillForTimecard } from '../_lib/qbo-helper.js';

const getUser = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const user = await adminAuth.verifyIdToken(token);
  if (user.admin !== true && user.contractor !== true) throw new Error('Contractor Portal access is required.');
  if (user.admin !== true) {
    const contractor = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
    if (contractor.empty) throw new Error('Your contractor profile is not linked to this account.');
    const data = contractor.docs[0].data();
    const accessStatus = data.accessStatus || (data.active === false ? 'Suspended' : 'Active');
    if (accessStatus === 'Suspended') throw new Error('Your contractor portal access is suspended.');
    if (accessStatus === 'Offboarded') throw new Error('Your contractor portal access has been offboarded.');
  }
  return user;
};

const workOrdersFor = async (user) => {
  const jobs = await adminDb.collection('jobs').get();
  if (user.admin === true) return jobs.docs;
  const contractor = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
  if (contractor.empty) throw new Error('Your contractor profile is not linked to this account.');
  const contractorId = contractor.docs[0].id;
  return jobs.docs.filter((job) => {
    const data = job.data();
    const assigned = Array.isArray(data.assignedTechIds) ? data.assignedTechIds : [data.assignedTechId || 'ALL'];
    return assigned.includes('ALL') || assigned.includes(contractorId);
  });
};

const entriesFor = async (user) => {
  const snapshot = user.admin === true
    ? await adminDb.collection('time_entries').limit(100).get()
    : await adminDb.collection('time_entries').where('technicianUid', '==', user.uid).limit(100).get();
  const contractorByUid = new Map();
  if (user.admin === true) {
    const contractors = await adminDb.collection('contractors').get();
    contractors.docs.forEach((contractor) => {
      const data = contractor.data();
      if (typeof data.authUid === 'string' && data.authUid) {
        contractorByUid.set(data.authUid, { id: contractor.id, name: data.name || '', email: data.email || '' });
      }
    });
  }
  return snapshot.docs
    .map((entry) => {
      const data = entry.data();
      const contractor = contractorByUid.get(data.technicianUid);
      return {
        id: entry.id,
        ...data,
        contractorId: contractor?.id || data.contractorId || '',
        technicianName: contractor?.name || data.technicianName || '',
        technicianEmail: contractor?.email || data.technicianEmail || '',
      };
    })
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
};

const onboardingFor = (data) => {
  const onboarding = data.onboarding || {};
  return {
    status: onboarding.status || 'not_started',
    submittedAt: onboarding.submittedAt || null,
    reviewedAt: onboarding.reviewedAt || null,
    reviewNote: onboarding.reviewNote || '',
    agreementAcceptedAt: onboarding.agreementAcceptedAt || null,
    hasW9: Boolean(onboarding.w9?.storagePath),
    w9FileName: onboarding.w9?.fileName || null,
  };
};

const contractorProfileFor = async (user) => {
  if (user.contractor !== true) throw new Error('Contractor Portal access is required.');
  const contractor = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
  if (contractor.empty) throw new Error('Your contractor profile is not linked to this account.');
  return contractor.docs[0];
};

const signatureFor = (contractor) => {
  const signature = contractor.data().signature || {};
  return typeof signature.dataUrl === 'string' ? signature.dataUrl : '';
};

const cleanReason = (value) => typeof value === 'string' ? value.trim().slice(0, 500) : '';

const getApprovedTotal = (entry) => (
  (Number(entry.totalHours || 0) * Number(entry.rate || 75))
  + Number(entry.suppliesCost || 0)
  + Number(entry.travelCost || 0)
  + Number(entry.bonusCost || 0)
);

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const sendPortalNotice = async ({ to, subject, heading, message, details = [] }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'TechSavvy-Contractor-Portal/1.0' },
      body: JSON.stringify({
        from: sender,
        reply_to: supportEmail,
        to: [to],
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p><div style="background:#f8fafc;padding:15px;border-radius:6px;border:1px solid #e2e8f0">${details.map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br/>`).join('')}</div><p>This record remains available in portal history for your records.</p></div>`,
      }),
    });
    if (!response.ok) console.error('Portal notice email failed:', response.status, await response.text());
    return response.ok;
  } catch (error) {
    console.error('Portal notice email failed:', error);
    return false;
  }
};

const handleOnboarding = async (req, res, user) => {
  const contractor = await contractorProfileFor(user);
  if (req.method === 'GET') return res.status(200).json({ onboarding: onboardingFor(contractor.data()) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const w9 = req.body?.w9;
  if (req.body?.agreementAccepted !== true) {
    return res.status(422).json({ error: 'You must accept the contractor portal terms before submitting onboarding.' });
  }
  if (!w9 || typeof w9.storagePath !== 'string' || typeof w9.fileName !== 'string') {
    return res.status(422).json({ error: 'Upload a completed W-9 PDF before submitting onboarding.' });
  }
  const requiredPrefix = `contractor-onboarding/${user.uid}/w9/`;
  if (!w9.storagePath.startsWith(requiredPrefix)) {
    return res.status(403).json({ error: 'The uploaded W-9 file does not belong to your account.' });
  }
  const [metadata] = await adminStorage.file(w9.storagePath).getMetadata();
  if (metadata.contentType !== 'application/pdf' || Number(metadata.size) > 25 * 1024 * 1024) {
    return res.status(422).json({ error: 'Your W-9 must be a PDF smaller than 25 MB.' });
  }
  const now = new Date().toISOString();
  await contractor.ref.set({ onboarding: {
    status: 'submitted', submittedAt: now, agreementAcceptedAt: now, agreementVersion: '2026-08-04', reviewNote: '',
    w9: { storagePath: w9.storagePath, fileName: w9.fileName.slice(0, 180), uploadedAt: now, size: Number(metadata.size) },
  } }, { merge: true });
  return res.status(200).json({ success: true, onboarding: { status: 'submitted', submittedAt: now, agreementAcceptedAt: now, hasW9: true, w9FileName: w9.fileName } });
};

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (req.query?.portalOperation === 'onboarding') return await handleOnboarding(req, res, user);
    if (req.method === 'GET') {
      const entries = await entriesFor(user);
      const assignedJobs = await workOrdersFor(user);
      // Admin accounts are bootstrapped with both admin and contractor claims.
      // They do not necessarily have a linked contractor document, and the
      // admin timecard response must not depend on one existing.
      const contractor = user.admin !== true && user.contractor === true
        ? await contractorProfileFor(user)
        : null;
      return res.status(200).json({
        entries,
        assignedJobIds: assignedJobs.map((job) => job.id),
        // Contractors receive their work orders through this authenticated
        // server endpoint. Do not expose the whole jobs collection to them.
        jobs: assignedJobs.map((job) => ({ id: job.id, ...job.data() })),
        activeEntry: entries.find((entry) => entry.active === true) || null,
        technicianSignature: contractor ? signatureFor(contractor) : '',
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const action = req.body?.action;
    if (action === 'save_signature') {
      const contractor = await contractorProfileFor(user);
      const signatureDataUrl = req.body?.signatureDataUrl;
      if (typeof signatureDataUrl !== 'string' || !signatureDataUrl.startsWith('data:image/png;base64,') || signatureDataUrl.length > 400000) {
        return res.status(422).json({ error: 'Please provide a valid PNG signature smaller than 300 KB.' });
      }
      await contractor.ref.set({ signature: { dataUrl: signatureDataUrl, updatedAt: new Date().toISOString() } }, { merge: true });
      return res.status(200).json({ success: true, technicianSignature: signatureDataUrl });
    }
    if (action === 'clear_signature') {
      const contractor = await contractorProfileFor(user);
      await contractor.ref.set({ signature: { dataUrl: '', updatedAt: new Date().toISOString() } }, { merge: true });
      return res.status(200).json({ success: true, technicianSignature: '' });
    }
    if (action === 'request_void_timecard') {
      if (user.contractor !== true || user.admin === true) return res.status(403).json({ error: 'Technician access required.' });
      const reason = cleanReason(req.body?.reason);
      if (!reason) return res.status(422).json({ error: 'Please explain why this submission should be voided.' });
      const docRef = adminDb.collection('time_entries').doc(String(req.body?.timecardId || ''));
      const snapshot = await docRef.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Time entry not found.' });
      const entry = snapshot.data();
      if (entry.technicianUid !== user.uid) return res.status(403).json({ error: 'You can only request changes to your own submissions.' });
      if (entry.status !== 'rejected') return res.status(409).json({ error: 'A submission can be voided by agreement after it has been rejected.' });
      if (entry.active) return res.status(409).json({ error: 'Stop the active shift before requesting a void.' });
      if (entry.qbStatus === 'synced') return res.status(409).json({ error: 'QuickBooks-synced records cannot be voided in the portal.' });
      const now = new Date().toISOString();
      const update = { voidStatus: 'requested', voidRequestedAt: now, voidRequestedByUid: user.uid, voidRequestReason: reason, updatedAt: now };
      await docRef.set(update, { merge: true });
      const contractor = await contractorProfileFor(user);
      await sendPortalNotice({
        to: process.env.SUPPORT_EMAIL,
        subject: `Void requested: ${entry.jobSite || 'time submission'}`,
        heading: 'Technician requested a void',
        message: `${contractor.data().name || 'A technician'} requested that a rejected submission be voided.`,
        details: [['Job', entry.jobSite || 'Unknown'], ['Service date', entry.date || 'Unknown'], ['Reason', reason]],
      });
      return res.status(200).json({ success: true, entry: { id: snapshot.id, ...entry, ...update } });
    }
    if (action === 'void_timecard') {
      if (user.admin !== true) return res.status(403).json({ error: 'Administrator access required.' });
      const reason = cleanReason(req.body?.reason);
      if (!reason) return res.status(422).json({ error: 'A reason is required to void this submission.' });
      const docRef = adminDb.collection('time_entries').doc(String(req.body?.timecardId || ''));
      const snapshot = await docRef.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Time entry not found.' });
      const entry = snapshot.data();
      if (entry.active) return res.status(409).json({ error: 'An active shift cannot be voided.' });
      if (entry.qbStatus === 'synced') return res.status(409).json({ error: 'This entry is already synced to QuickBooks and cannot be voided in the portal.' });
      if (entry.status === 'voided') return res.status(409).json({ error: 'This submission is already voided.' });
      const now = new Date().toISOString();
      const agreed = entry.voidStatus === 'requested';
      const update = { status: 'voided', voidStatus: 'voided', voidedAt: now, voidedByUid: user.uid, voidedByRole: 'admin', voidReason: reason, voidAgreedByTechnician: agreed, updatedAt: now };
      await docRef.set(update, { merge: true });
      let techEmail = entry.technicianEmail;
      let techName = entry.technicianName;
      if (!techEmail && entry.technicianUid) {
        const contractor = await adminDb.collection('contractors').where('authUid', '==', entry.technicianUid).limit(1).get();
        if (!contractor.empty) ({ email: techEmail, name: techName } = contractor.docs[0].data());
      }
      await sendPortalNotice({
        to: techEmail,
        subject: `Submission voided: ${entry.jobSite || 'time entry'}`,
        heading: 'Time submission voided',
        message: `Hello ${techName || 'there'}, this submission has been removed from active review. It was not permanently deleted.`,
        details: [['Job', entry.jobSite || 'Unknown'], ['Service date', entry.date || 'Unknown'], ['Reason', reason], ['Agreement', agreed ? 'Technician requested the void' : 'Administrative void']],
      });
      return res.status(200).json({ success: true, entry: { id: snapshot.id, ...entry, ...update } });
    }
    if (action === 'void_job') {
      if (user.admin !== true) return res.status(403).json({ error: 'Administrator access required.' });
      const reason = cleanReason(req.body?.reason);
      if (!reason) return res.status(422).json({ error: 'A reason is required to void this work order.' });
      const jobRef = adminDb.collection('jobs').doc(String(req.body?.jobId || ''));
      const snapshot = await jobRef.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Work order not found.' });
      const job = snapshot.data();
      if (job.status === 'voided') return res.status(409).json({ error: 'This work order is already voided.' });
      const relatedEntries = await adminDb.collection('time_entries').where('jobId', '==', snapshot.id).get();
      if (relatedEntries.docs.some((entry) => entry.data().active === true)) return res.status(409).json({ error: 'A technician is currently clocked in to this work order. Stop that shift before voiding it.' });
      const now = new Date().toISOString();
      const update = { status: 'voided', voidStatus: 'voided', voidedAt: now, voidedByUid: user.uid, voidedByRole: 'admin', voidReason: reason, updatedAt: now };
      await jobRef.set(update, { merge: true });
      const contractors = await adminDb.collection('contractors').get();
      const assigned = Array.isArray(job.assignedTechIds) ? job.assignedTechIds : [job.assignedTechId || 'ALL'];
      const recipients = contractors.docs.filter((contractor) => assigned.includes('ALL') || assigned.includes(contractor.id));
      await Promise.all(recipients.map((contractor) => sendPortalNotice({
        to: contractor.data().email,
        subject: `Work order voided: ${job.name || snapshot.id}`,
        heading: 'Work order voided',
        message: `Hello ${contractor.data().name || 'there'}, this work order has been removed from your active assignments.`,
        details: [['Work order', job.workOrderNumber || snapshot.id], ['Job', job.name || 'Unknown'], ['Reason', reason]],
      })));
      return res.status(200).json({ success: true, job: { id: snapshot.id, ...job, ...update } });
    }
    const existingEntries = await entriesFor(user);
    const activeEntry = existingEntries.find((entry) => entry.active === true);
    if (action === 'start') {
      if (activeEntry) return res.status(409).json({ error: `You are already clocked in at ${activeEntry.jobSite}.` });
      const jobId = req.body?.jobId;
      const job = (await workOrdersFor(user)).find((candidate) => candidate.id === jobId);
      if (!job) return res.status(403).json({ error: 'You are not assigned to this work order.' });
      if (job.data().status === 'voided') return res.status(409).json({ error: 'This work order has been voided and is no longer active.' });
      const now = new Date();
      const entry = {
        jobId,
        jobSite: job.data().name,
        address: job.data().address || 'Address on file',
        date: now.toISOString().slice(0, 10),
        clockIn: now.toTimeString().slice(0, 5),
        clockInAt: now.toISOString(),
        clockOut: '',
        breakMinutes: 0,
        totalHours: '0.00',
        rate: Number(job.data().hourlyRate ?? 55),
        suppliesCost: 0,
        travelCost: 0,
        laborStatus: 'pending',
        suppliesStatus: 'pending',
        travelStatus: 'pending',
        status: 'pending',
        qbStatus: 'pending',
        photos: [],
        notes: '',
        technicianUid: user.uid,
        active: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      const created = await adminDb.collection('time_entries').add(entry);
      return res.status(201).json({ entry: { id: created.id, ...entry } });
    }
    if (action === 'stop') {
      if (!activeEntry) return res.status(409).json({ error: 'There is no active shift to stop.' });
      const ended = new Date();
      const started = new Date(activeEntry.clockInAt || activeEntry.clockIn);
      const totalHours = Math.max(0, (ended.getTime() - started.getTime()) / 3600000).toFixed(2);
      const update = { clockOut: ended.toTimeString().slice(0, 5), clockOutAt: ended.toISOString(), totalHours, active: false, updatedAt: ended.toISOString() };
      await adminDb.collection('time_entries').doc(activeEntry.id).set(update, { merge: true });
      return res.status(200).json({ entry: { ...activeEntry, ...update } });
    }
    if (action === 'submit_manual_log') {
      const jobId = req.body?.jobId;
      const jobSite = req.body?.jobSite;
      const address = req.body?.address;
      const date = req.body?.date;
      const clockIn = req.body?.clockIn;
      const clockOut = req.body?.clockOut;
      const breakMinutes = Number(req.body?.breakMinutes) || 0;
      const totalHours = req.body?.totalHours;
      const rate = Number(req.body?.rate) || 55;
      const suppliesCost = Number(req.body?.suppliesCost) || 0;
      const suppliesItems = Array.isArray(req.body?.suppliesItems) ? req.body.suppliesItems : [];
      const travelCost = Number(req.body?.travelCost) || 0;
      const notes = req.body?.notes || '';
      const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];
      const completionIntent = req.body?.completionIntent === 'final' ? 'final' : 'progress';
      const allowedExceptionReasons = new Set(['customer_unavailable', 'customer_declined', 'remote_unattended', 'not_required_for_visit', 'other']);
      const signatureExceptionReason = allowedExceptionReasons.has(req.body?.signatureExceptionReason) ? req.body.signatureExceptionReason : '';
      const signatureExceptionNotes = cleanReason(req.body?.signatureExceptionNotes);

      let assignedJob = null;
      if (jobId) {
        assignedJob = (await workOrdersFor(user)).find((candidate) => candidate.id === jobId) || null;
        if (!assignedJob) return res.status(403).json({ error: 'You are not assigned to this work order.' });
        if (['voided', 'completed', 'closed', 'cancelled', 'canceled'].includes(String(assignedJob.data().status || '').toLowerCase())) {
          return res.status(409).json({ error: 'This work order is no longer open for new submissions.' });
        }
      }

      let completionUpdate = null;
      if (completionIntent === 'final') {
        if (!assignedJob) return res.status(422).json({ error: 'An administrator-issued work order is required for final completion.' });
        const job = assignedJob.data();
        const hasSignedWorkOrder = Array.isArray(job.signedWorkOrders) && job.signedWorkOrders.length > 0;
        if (job.signatureRequired === true && !hasSignedWorkOrder) {
          return res.status(409).json({ error: 'The administrator requires a signed work order before this job can be completed.' });
        }
        if (!hasSignedWorkOrder && !signatureExceptionReason) {
          return res.status(422).json({ error: 'Obtain the customer signature or document why it was not needed or available.' });
        }
        if (!hasSignedWorkOrder && signatureExceptionReason === 'other' && !signatureExceptionNotes) {
          return res.status(422).json({ error: 'Explain the customer-signature exception.' });
        }
        const completedAt = new Date().toISOString();
        completionUpdate = {
          status: 'completed',
          completionStatus: 'completed',
          completedAt,
          completedByUid: user.uid,
          signatureStatus: hasSignedWorkOrder ? 'signed' : 'technician_exception',
          updatedAt: completedAt,
          ...(!hasSignedWorkOrder ? { signatureException: { reason: signatureExceptionReason, notes: signatureExceptionNotes, technicianUid: user.uid, createdAt: completedAt } } : {}),
        };
      }

      const now = new Date();
      const entry = {
        jobId: jobId || '',
        jobSite: jobSite || 'Custom Job Site',
        address: address || 'Address on file',
        date: date || now.toISOString().slice(0, 10),
        clockIn: clockIn || '07:00',
        clockOut: clockOut || '15:30',
        breakMinutes,
        totalHours: totalHours || '8.50',
        rate,
        suppliesCost,
        suppliesItems,
        travelCost,
        laborStatus: 'pending',
        suppliesStatus: 'pending',
        travelStatus: 'pending',
        notes,
        status: 'pending',
        qbStatus: 'pending',
        photos,
        completionIntent,
        signatureDisposition: completionIntent === 'final' ? (completionUpdate?.signatureStatus || 'signed') : 'not_applicable',
        ...(completionIntent === 'final' && completionUpdate?.signatureStatus === 'technician_exception' ? { signatureExceptionReason, signatureExceptionNotes } : {}),
        technicianUid: user.uid,
        active: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const entryRef = adminDb.collection('time_entries').doc();
      const batch = adminDb.batch();
      batch.set(entryRef, entry);
      if (assignedJob && completionUpdate) batch.set(assignedJob.ref, completionUpdate, { merge: true });
      await batch.commit();

      if (assignedJob && completionUpdate?.signatureStatus === 'technician_exception') {
        await sendPortalNotice({
          to: process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com',
          subject: `Customer signature exception: ${assignedJob.data().name || jobSite || 'completed work order'}`,
          heading: 'Work order completed without customer signature',
          message: 'A technician used the permitted exception workflow. Review the reason in the administrator work-order record.',
          details: [['Work order', assignedJob.data().workOrderNumber || assignedJob.id], ['Job', assignedJob.data().name || jobSite || 'Unknown'], ['Reason', signatureExceptionReason], ['Notes', signatureExceptionNotes || 'None provided']],
        });
      }
      return res.status(201).json({ entry: { id: entryRef.id, ...entry }, ...(assignedJob && completionUpdate ? { job: { id: assignedJob.id, ...assignedJob.data(), ...completionUpdate } } : {}) });
    }

    if (action === 'approve_item') {
      if (user.admin !== true) {
        return res.status(403).json({ error: 'Administrator access required.' });
      }

      const { timecardId, itemType, status, feedback } = req.body;
      if (!timecardId || !itemType || !status) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      const docRef = adminDb.collection('time_entries').doc(timecardId);
      const snapshot = await docRef.get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: 'Time entry not found.' });
      }
      if (snapshot.data().status === 'voided') {
        return res.status(409).json({ error: 'Voided submissions cannot be approved or changed.' });
      }

      const updates = {
        [`${itemType}Status`]: status,
        updatedAt: new Date().toISOString()
      };

      if (status === 'rejected' && feedback) {
        updates[`${itemType}Feedback`] = feedback;
      }

      await docRef.update(updates);

      const updatedSnap = await docRef.get();
      const updatedTimecard = { id: updatedSnap.id, ...updatedSnap.data() };

      const isLaborActive = updatedTimecard.totalHours && Number(updatedTimecard.totalHours) > 0;
      const isSuppliesActive = updatedTimecard.suppliesCost && Number(updatedTimecard.suppliesCost) > 0;
      const isTravelActive = updatedTimecard.travelCost && Number(updatedTimecard.travelCost) > 0;
      const isBonusActive = updatedTimecard.bonusCost && Number(updatedTimecard.bonusCost) > 0;

      const isLaborApproved = !isLaborActive || updatedTimecard.laborStatus === 'approved';
      const isSuppliesApproved = !isSuppliesActive || updatedTimecard.suppliesStatus === 'approved';
      const isTravelApproved = !isTravelActive || updatedTimecard.travelStatus === 'approved';
      const isBonusApproved = !isBonusActive || updatedTimecard.bonusStatus === 'approved';

      const isLaborRejected = isLaborActive && updatedTimecard.laborStatus === 'rejected';
      const isSuppliesRejected = isSuppliesActive && updatedTimecard.suppliesStatus === 'rejected';
      const isTravelRejected = isTravelActive && updatedTimecard.travelStatus === 'rejected';
      const isBonusRejected = isBonusActive && updatedTimecard.bonusStatus === 'rejected';

      let newOverallStatus = 'pending';
      if (isLaborApproved && isSuppliesApproved && isTravelApproved && isBonusApproved) {
        newOverallStatus = 'approved';
      } else if (isLaborRejected || isSuppliesRejected || isTravelRejected || isBonusRejected) {
        newOverallStatus = 'rejected';
      } else if (updatedTimecard.laborStatus === 'approved' || updatedTimecard.suppliesStatus === 'approved' || updatedTimecard.travelStatus === 'approved' || updatedTimecard.bonusStatus === 'approved') {
        newOverallStatus = 'approved';
      }

      await docRef.update({ status: newOverallStatus });
      updatedTimecard.status = newOverallStatus;

      const isFullyApproved = isLaborApproved && isSuppliesApproved && isTravelApproved && isBonusApproved;

      if (isFullyApproved) {
        const approvedAt = new Date().toISOString();
        await docRef.update({
          qbStatus: 'pending',
          qboReadyAt: updatedTimecard.qboReadyAt || approvedAt,
          updatedAt: approvedAt,
        });
        updatedTimecard.qbStatus = 'pending';
        updatedTimecard.qboReadyAt = updatedTimecard.qboReadyAt || approvedAt;
        const jobDate = new Date(updatedTimecard.date);
        const payoutDueDate = new Date(jobDate);
        payoutDueDate.setDate(payoutDueDate.getDate() + 15);
        const formattedDueDate = payoutDueDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        let techEmail = updatedTimecard.technicianEmail;
        let techName = updatedTimecard.technicianName;
        if (!techEmail && updatedTimecard.technicianUid) {
          const contractorSnap = await adminDb.collection('contractors')
            .where('authUid', '==', updatedTimecard.technicianUid)
            .limit(1)
            .get();
          if (!contractorSnap.empty) {
            techEmail = contractorSnap.docs[0].data().email;
            techName = contractorSnap.docs[0].data().name;
          }
        }

        updatedTimecard.technicianEmail = techEmail;
        updatedTimecard.technicianName = techName;

        if (techEmail) {
          const apiKey = process.env.RESEND_API_KEY;
          const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
          const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';

          if (apiKey) {
            const totalPayable = getApprovedTotal(updatedTimecard);

            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  'User-Agent': 'TechSavvy-Contractor-Portal/1.0',
                },
                body: JSON.stringify({
                  from: sender,
                  reply_to: supportEmail,
                  to: [techEmail],
                  subject: `Timecard Approved: ${updatedTimecard.jobSite} (${updatedTimecard.date})`,
                  html: `
                    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55">
                      <h1 style="color:#16a34a;font-size:24px">Timecard Approved</h1>
                      <p>Hello ${techName || 'there'},</p>
                      <p>Your timecard and expense items for <strong>${updatedTimecard.jobSite}</strong> have been reviewed and approved.</p>
                      <div style="background:#f8fafc;padding:15px;border-radius:6px;margin:15px 0;border:1px solid #e2e8f0">
                        <strong>Job Site:</strong> ${updatedTimecard.jobSite}<br/>
                        <strong>Service Date:</strong> ${updatedTimecard.date}<br/>
                        <strong>Total Approved Payable:</strong> $${totalPayable.toFixed(2)}
                      </div>
                      <p><strong>Payment Terms:</strong> Payment will be disbursed within <strong>15 days</strong> of task completion.</p>
                      <p><strong>Estimated Payout Date:</strong> <span style="color:#16a34a;font-weight:700">${formattedDueDate}</span></p>
                    </div>
                  `
                })
              });
            } catch (emailErr) {
              console.error('Failed to send resend approval email:', emailErr);
            }
          }
        }

        if (!updatedTimecard.qboReminderSentAt) {
          const reminderSent = await sendPortalNotice({
            to: process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com',
            subject: `QuickBooks sync required: ${updatedTimecard.jobSite || 'approved timecard'}`,
            heading: 'Approved timecard is ready for QuickBooks',
            message: 'An approved contractor timecard is waiting in the portal. Sign in to review it and select Sync to QuickBooks.',
            details: [
              ['Technician', techName || techEmail || 'Unknown technician'],
              ['Job', updatedTimecard.jobSite || 'Unknown'],
              ['Service date', updatedTimecard.date || 'Unknown'],
              ['Approved total', `$${getApprovedTotal(updatedTimecard).toFixed(2)}`],
            ],
          });
          if (reminderSent) {
            await docRef.update({ qboReminderSentAt: new Date().toISOString() });
          }
        }
      }

      return res.status(200).json({ success: true, status: newOverallStatus });
    }

    if (action === 'retry_qbo_sync') {
      if (user.admin !== true) {
        return res.status(403).json({ error: 'Administrator access required.' });
      }

      const { timecardId } = req.body;
      if (!timecardId) {
        return res.status(400).json({ error: 'Missing timecard ID.' });
      }

      const docRef = adminDb.collection('time_entries').doc(timecardId);
      const snapshot = await docRef.get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: 'Time entry not found.' });
      }
      if (snapshot.data().status === 'voided') {
        return res.status(409).json({ error: 'Voided submissions cannot be synced to QuickBooks.' });
      }
      if (snapshot.data().status !== 'approved') {
        return res.status(409).json({ error: 'Only fully approved submissions can be synced to QuickBooks.' });
      }

      const updatedTimecard = { id: snapshot.id, ...snapshot.data() };

      let techEmail = updatedTimecard.technicianEmail;
      let techName = updatedTimecard.technicianName;
      if (!techEmail && updatedTimecard.technicianUid) {
        const contractorSnap = await adminDb.collection('contractors')
          .where('authUid', '==', updatedTimecard.technicianUid)
          .limit(1)
          .get();
        if (!contractorSnap.empty) {
          techEmail = contractorSnap.docs[0].data().email;
          techName = contractorSnap.docs[0].data().name;
        }
      }
      updatedTimecard.technicianEmail = techEmail;
      updatedTimecard.technicianName = techName;

      const jobDate = new Date(updatedTimecard.date);
      const payoutDueDate = new Date(jobDate);
      payoutDueDate.setDate(payoutDueDate.getDate() + 15);

      console.log('[DEBUG retry_qbo_sync] Calling QBO helper with updatedTimecard:', JSON.stringify(updatedTimecard, null, 2));
      try {
        const qboResult = await createQBOBillForTimecard(updatedTimecard, payoutDueDate);
        await docRef.update({
          qbStatus: 'synced',
          qboBillId: qboResult.Bill?.Id || '',
          qboTimeActivityId: qboResult.TimeActivity?.Id || '',
          qboSyncedAt: new Date().toISOString(),
          qboSyncError: null
        });
        return res.status(200).json({
          success: true,
          qbStatus: 'synced',
          qboBillId: qboResult.Bill?.Id || '',
          qboTimeActivityId: qboResult.TimeActivity?.Id || ''
        });
      } catch (qboError) {
        console.error('QBO Sync Error:', qboError);
        await docRef.update({
          qbStatus: 'failed',
          qboSyncError: qboError.message
        });
        return res.status(500).json({ error: qboError.message });
      }
    }

    if (action === 'add_bonus') {
      if (user.admin !== true) {
        return res.status(403).json({ error: 'Administrator access required.' });
      }

      const { timecardId, amount } = req.body;
      if (!timecardId || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Invalid timecard ID or bonus amount.' });
      }

      const docRef = adminDb.collection('time_entries').doc(timecardId);
      const snapshot = await docRef.get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: 'Time entry not found.' });
      }
      if (snapshot.data().status === 'voided') {
        return res.status(409).json({ error: 'Voided submissions cannot be changed.' });
      }

      await docRef.update({
        bonusCost: amount,
        bonusStatus: 'approved',
        qbStatus: 'pending',
        qboSyncError: null
      });

      const updatedSnap = await docRef.get();
      const updatedTimecard = { id: updatedSnap.id, ...updatedSnap.data() };

      const isLaborActive = updatedTimecard.totalHours && Number(updatedTimecard.totalHours) > 0;
      const isSuppliesActive = updatedTimecard.suppliesCost && Number(updatedTimecard.suppliesCost) > 0;
      const isTravelActive = updatedTimecard.travelCost && Number(updatedTimecard.travelCost) > 0;
      const isBonusActive = updatedTimecard.bonusCost && Number(updatedTimecard.bonusCost) > 0;

      const isLaborApproved = !isLaborActive || updatedTimecard.laborStatus === 'approved';
      const isSuppliesApproved = !isSuppliesActive || updatedTimecard.suppliesStatus === 'approved';
      const isTravelApproved = !isTravelActive || updatedTimecard.travelStatus === 'approved';
      const isBonusApproved = !isBonusActive || updatedTimecard.bonusStatus === 'approved';

      const isLaborRejected = isLaborActive && updatedTimecard.laborStatus === 'rejected';
      const isSuppliesRejected = isSuppliesActive && updatedTimecard.suppliesStatus === 'rejected';
      const isTravelRejected = isTravelActive && updatedTimecard.travelStatus === 'rejected';
      const isBonusRejected = isBonusActive && updatedTimecard.bonusStatus === 'rejected';

      let newOverallStatus = 'pending';
      if (isLaborApproved && isSuppliesApproved && isTravelApproved && isBonusApproved) {
        newOverallStatus = 'approved';
      } else if (isLaborRejected || isSuppliesRejected || isTravelRejected || isBonusRejected) {
        newOverallStatus = 'rejected';
      } else if (updatedTimecard.laborStatus === 'approved' || updatedTimecard.suppliesStatus === 'approved' || updatedTimecard.travelStatus === 'approved' || updatedTimecard.bonusStatus === 'approved') {
        newOverallStatus = 'approved';
      }

      await docRef.update({ status: newOverallStatus });

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unsupported time-clock action.' });
  } catch (error) {
    const status = ['Authentication required.', 'Contractor Portal access is required.', 'Your contractor profile is not linked to this account.', 'Your contractor portal access is suspended.', 'Your contractor portal access has been offboarded.'].includes(error.message) ? 403 : 500;
    console.error('Time clock error:', error);
    return res.status(status).json({ error: status === 500 ? 'Could not update the time clock.' : error.message });
  }
}
