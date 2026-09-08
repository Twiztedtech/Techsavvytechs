import { adminAuth, adminDb, adminStorage } from '../../_lib/firebase-admin.js';

const portalToken = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  return adminAuth.verifyIdToken(token);
};

// Confirms a client-supplied Firebase Storage download URL actually points to
// a PDF object under this job's own signed-work-orders/ prefix in our bucket,
// instead of trusting an arbitrary string as a "signed work order" link that
// will later be shown to the client as trustworthy.
const storagePathForSignedWorkOrder = (url, jobId) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'firebasestorage.googleapis.com') return null;
  const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) return null;
  const [, bucket, encodedPath] = match;
  if (bucket !== adminStorage.name) return null;
  let path;
  try {
    path = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  return path.startsWith(`signed-work-orders/${jobId}/`) ? path : null;
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

    const storagePath = storagePathForSignedWorkOrder(url, jobId);
    if (!storagePath) {
      return res.status(422).json({ error: 'The signed work-order file does not match this job.' });
    }
    const [fileExists] = await adminStorage.file(storagePath).exists();
    if (!fileExists) return res.status(422).json({ error: 'The signed work-order file was not found in storage.' });
    const [metadata] = await adminStorage.file(storagePath).getMetadata();
    if (metadata.contentType !== 'application/pdf') {
      return res.status(422).json({ error: 'The signed work order must be a PDF.' });
    }

    const jobRef = adminDb.collection('jobs').doc(jobId);
    const job = await jobRef.get();
    if (!job.exists) return res.status(404).json({ error: 'Work order not found.' });

    if (user.admin !== true) {
      const contractorSnapshot = await adminDb.collection('contractors').where('authUid', '==', user.uid).limit(1).get();
      if (contractorSnapshot.empty) return res.status(403).json({ error: 'Your contractor profile is not linked to this account.' });
      const contractorRecord = contractorSnapshot.docs[0];
      const contractorData = contractorRecord.data();
      const accessStatus = contractorData.accessStatus || (contractorData.active === false ? 'Suspended' : 'Active');
      if (accessStatus === 'Suspended') return res.status(403).json({ error: 'Your contractor portal access is suspended.' });
      if (accessStatus === 'Offboarded') return res.status(403).json({ error: 'Your contractor portal access has been offboarded.' });
      const contractorId = contractorRecord.id;
      const assigned = Array.isArray(job.data().assignedTechIds)
        ? job.data().assignedTechIds
        : [job.data().assignedTechId || 'ALL'];
      if (!assigned.includes('ALL') && !assigned.includes(contractorId)) {
        return res.status(403).json({ error: 'You are not assigned to this work order.' });
      }
    }

    const completed = Array.isArray(job.data().signedWorkOrders) ? job.data().signedWorkOrders : [];
    const workOrder = { id: `signed-${Date.now()}`, fileName, url, completedAt, technicianName, customerName };
    await jobRef.set({ signedWorkOrders: [...completed, workOrder], signatureStatus: 'signed', signatureReceivedAt: completedAt, updatedAt: new Date().toISOString() }, { merge: true });
    return res.status(200).json({ success: true, workOrder });
  } catch (error) {
    if (error.message === 'Authentication required.') return res.status(403).json({ error: error.message });
    console.error('Could not save signed work order:', error);
    return res.status(500).json({ error: 'Could not save the signed work order.' });
  }
}
