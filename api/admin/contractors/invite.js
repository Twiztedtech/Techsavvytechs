import { randomBytes } from 'node:crypto';
import { adminAuth, adminDb, requireAdmin } from '../../lib/firebase-admin.js';

const temporaryPassword = () => randomBytes(32).toString('base64url');

export default async function handler(req, res) {
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

    await adminAuth.setCustomUserClaims(user.uid, { contractor: true });
    await contractorRef.set({
      authUid: user.uid,
      invitationStatus: 'ready',
      authProvisionedAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      success: true,
      email,
      accountCreated,
      message: accountCreated ? 'Account ready. Send the password-setup email to finish the invitation.' : 'Account already exists. You can send a fresh password-setup email.',
    });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Contractor invitation setup failed:', error);
    return res.status(500).json({ error: 'Could not prepare the contractor invitation.' });
  }
}
