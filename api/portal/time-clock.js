import { adminAuth, adminDb, adminStorage } from '../lib/firebase-admin.js';

const getUser = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const user = await adminAuth.verifyIdToken(token);
  if (user.admin !== true && user.contractor !== true) throw new Error('Contractor Portal access is required.');
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
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
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
      return res.status(200).json({
        entries,
        assignedJobIds: assignedJobs.map((job) => job.id),
        // Contractors receive their work orders through this authenticated
        // server endpoint. Do not expose the whole jobs collection to them.
        jobs: assignedJobs.map((job) => ({ id: job.id, ...job.data() })),
        activeEntry: entries.find((entry) => entry.active === true) || null,
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const action = req.body?.action;
    const existingEntries = await entriesFor(user);
    const activeEntry = existingEntries.find((entry) => entry.active === true);
    if (action === 'start') {
      if (activeEntry) return res.status(409).json({ error: `You are already clocked in at ${activeEntry.jobSite}.` });
      const jobId = req.body?.jobId;
      const job = (await workOrdersFor(user)).find((candidate) => candidate.id === jobId);
      if (!job) return res.status(403).json({ error: 'You are not assigned to this work order.' });
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
    return res.status(400).json({ error: 'Unsupported time-clock action.' });
  } catch (error) {
    const status = ['Authentication required.', 'Contractor Portal access is required.', 'Your contractor profile is not linked to this account.'].includes(error.message) ? 403 : 500;
    console.error('Time clock error:', error);
    return res.status(status).json({ error: status === 500 ? 'Could not update the time clock.' : error.message });
  }
}
