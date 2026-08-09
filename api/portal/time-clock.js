import { adminAuth, adminDb, adminStorage } from '../lib/firebase-admin.js';
import { createQBOBillForTimecard } from '../lib/qbo-helper.js';

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
        technicianUid: user.uid,
        active: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const created = await adminDb.collection('time_entries').add(entry);
      return res.status(201).json({ entry: { id: created.id, ...entry } });
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

      const statuses = [
        updatedTimecard.laborStatus || 'pending',
        updatedTimecard.suppliesStatus || 'pending',
        updatedTimecard.travelStatus || 'pending'
      ];

      let newOverallStatus = 'pending';
      if (statuses.every(s => s === 'approved')) {
        newOverallStatus = 'approved';
      } else if (statuses.every(s => s === 'rejected')) {
        newOverallStatus = 'rejected';
      } else if (statuses.some(s => s === 'approved')) {
        newOverallStatus = 'approved';
      }

      await docRef.update({ status: newOverallStatus });
      updatedTimecard.status = newOverallStatus;

      const isFullyApproved = statuses.every(s => s === 'approved');

      if (isFullyApproved) {
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

        if (techEmail) {
          const apiKey = process.env.RESEND_API_KEY;
          const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
          const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';

          if (apiKey) {
            const laborAmt = Number(updatedTimecard.totalHours || 0) * (updatedTimecard.rate || 75);
            const suppliesAmt = Number(updatedTimecard.suppliesCost || 0);
            const travelAmt = Number(updatedTimecard.travelCost || 0);
            const totalPayable = laborAmt + suppliesAmt + travelAmt;

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

        try {
          const qboResult = await createQBOBillForTimecard(updatedTimecard, payoutDueDate);
          await docRef.update({
            qbStatus: 'synced',
            qboBillId: qboResult.Bill?.Id || '',
            qboSyncedAt: new Date().toISOString()
          });
        } catch (qboError) {
          console.error('QBO Sync Error:', qboError);
          await docRef.update({
            qbStatus: 'failed',
            qboSyncError: qboError.message
          });
        }
      }

      return res.status(200).json({ success: true, status: newOverallStatus });
    }

    return res.status(400).json({ error: 'Unsupported time-clock action.' });
  } catch (error) {
    const status = ['Authentication required.', 'Contractor Portal access is required.', 'Your contractor profile is not linked to this account.'].includes(error.message) ? 403 : 500;
    console.error('Time clock error:', error);
    return res.status(status).json({ error: status === 500 ? 'Could not update the time clock.' : error.message });
  }
}
