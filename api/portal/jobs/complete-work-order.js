import { adminAuth, adminDb } from '../../lib/firebase-admin.js';

const portalToken = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  return adminAuth.verifyIdToken(token);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const user = await portalToken(req);
    if (user.admin !== true && user.contractor !== true) return res.status(403).json({ error: 'Contractor Portal access is required.' });

    const { jobId, fileName, url, completedAt, technicianName, customerName } = req.body || {};
    if (![jobId, fileName, url, completedAt, technicianName, customerName].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ error: 'The signed work-order details are incomplete.' });
    }

    const jobRef = adminDb.collection('jobs').doc(jobId);
    const job = await jobRef.get();
    if (!job.exists) return res.status(404).json({ error: 'Work order not found.' });

    if (user.admin !== true) {
      const contractorSnapshot = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
      if (contractorSnapshot.empty) return res.status(403).json({ error: 'Your contractor profile is not linked to this account.' });
      const contractorId = contractorSnapshot.docs[0].id;
      const assigned = Array.isArray(job.data().assignedTechIds)
        ? job.data().assignedTechIds
        : [job.data().assignedTechId || 'ALL'];
      if (!assigned.includes('ALL') && !assigned.includes(contractorId)) {
        return res.status(403).json({ error: 'You are not assigned to this work order.' });
      }
    }

    const completed = Array.isArray(job.data().signedWorkOrders) ? job.data().signedWorkOrders : [];
    const workOrder = { id: `signed-${Date.now()}`, fileName, url, completedAt, technicianName, customerName };
    await jobRef.set({ signedWorkOrders: [...completed, workOrder], updatedAt: new Date().toISOString() }, { merge: true });
    return res.status(200).json({ success: true, workOrder });
  } catch (error) {
    if (error.message === 'Authentication required.') return res.status(403).json({ error: error.message });
    console.error('Could not save signed work order:', error);
    return res.status(500).json({ error: 'Could not save the signed work order.' });
  }
}
