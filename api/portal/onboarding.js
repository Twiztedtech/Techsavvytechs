import { adminAuth, adminDb, adminStorage } from '../lib/firebase-admin.js';

const W9_PREFIX = 'contractor-onboarding/';
const MAX_W9_SIZE = 25 * 1024 * 1024;

async function getContractorForRequest(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const user = await adminAuth.verifyIdToken(token);
  if (user.contractor !== true) throw new Error('Contractor Portal access is required.');
  const contractor = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
  if (contractor.empty) throw new Error('Your contractor profile is not linked to this account.');
  return { user, ref: contractor.docs[0].ref, data: contractor.docs[0].data() };
}

function responseOnboarding(data) {
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
}

export default async function handler(req, res) {
  try {
    const { user, ref, data } = await getContractorForRequest(req);
    if (req.method === 'GET') return res.status(200).json({ onboarding: responseOnboarding(data) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const w9 = req.body?.w9;
    if (req.body?.agreementAccepted !== true) {
      return res.status(422).json({ error: 'You must accept the contractor portal terms before submitting onboarding.' });
    }
    if (!w9 || typeof w9.storagePath !== 'string' || typeof w9.fileName !== 'string') {
      return res.status(422).json({ error: 'Upload a completed W-9 PDF before submitting onboarding.' });
    }
    const requiredPrefix = `${W9_PREFIX}${user.uid}/w9/`;
    if (!w9.storagePath.startsWith(requiredPrefix)) {
      return res.status(403).json({ error: 'The uploaded W-9 file does not belong to your account.' });
    }

    const [metadata] = await adminStorage.file(w9.storagePath).getMetadata();
    if (metadata.contentType !== 'application/pdf' || Number(metadata.size) > MAX_W9_SIZE) {
      return res.status(422).json({ error: 'Your W-9 must be a PDF smaller than 25 MB.' });
    }

    const now = new Date().toISOString();
    await ref.set({
      onboarding: {
        status: 'submitted',
        submittedAt: now,
        agreementAcceptedAt: now,
        agreementVersion: '2026-08-04',
        reviewNote: '',
        w9: {
          storagePath: w9.storagePath,
          fileName: w9.fileName.slice(0, 180),
          uploadedAt: now,
          size: Number(metadata.size),
        },
      },
    }, { merge: true });

    return res.status(200).json({
      success: true,
      onboarding: { status: 'submitted', submittedAt: now, agreementAcceptedAt: now, hasW9: true, w9FileName: w9.fileName },
    });
  } catch (error) {
    const status = ['Authentication required.', 'Contractor Portal access is required.', 'Your contractor profile is not linked to this account.'].includes(error.message) ? 403 : 500;
    console.error('Contractor onboarding error:', error);
    return res.status(status).json({ error: status === 500 ? 'Could not save contractor onboarding.' : error.message });
  }
}
