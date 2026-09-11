import { adminAuth, adminDb, requireAdmin } from './_lib/firebase-admin.js';

const clean = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const nowIso = () => new Date().toISOString();

async function requireContractorOrAdmin(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  const user = await adminAuth.verifyIdToken(token);
  if (user.admin !== true && user.contractor !== true) {
    throw Object.assign(new Error('Contractor Portal access is required.'), { statusCode: 403 });
  }
  return user;
}

async function submitTicket(req, res) {
  const user = await requireContractorOrAdmin(req);
  const subject = clean(req.body?.subject, 200);
  const message = clean(req.body?.message, 5000);
  const email = clean(req.body?.email, 254);
  if (!subject || !message || !email) {
    return res.status(422).json({ error: 'Subject, message, and contact email are required.' });
  }
  const ref = adminDb.collection('support_tickets').doc();
  const ticket = {
    subject,
    message,
    email,
    contractorUid: user.uid,
    status: 'Open',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await ref.set(ticket);
  return res.status(201).json({ id: ref.id, ...ticket });
}

async function listTickets(req, res) {
  await requireAdmin(req);
  const snapshot = await adminDb.collection('support_tickets').orderBy('createdAt', 'desc').limit(200).get();
  const tickets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return res.status(200).json({ tickets });
}

async function updateStatus(req, res) {
  await requireAdmin(req);
  const id = clean(req.body?.id, 120);
  const status = req.body?.status === 'Resolved' ? 'Resolved' : req.body?.status === 'Open' ? 'Open' : '';
  if (!id || !status) return res.status(422).json({ error: 'A ticket id and valid status are required.' });
  const ref = adminDb.collection('support_tickets').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'Ticket not found.' });
  await ref.set({ status, updatedAt: nowIso() }, { merge: true });
  return res.status(200).json({ success: true });
}

async function deleteTicket(req, res) {
  await requireAdmin(req);
  const id = clean(req.body?.id, 120);
  if (!id) return res.status(422).json({ error: 'A ticket id is required.' });
  await adminDb.collection('support_tickets').doc(id).delete();
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  try {
    if (req.method === 'POST' && action === 'submit') return await submitTicket(req, res);
    if (req.method === 'GET' && action === 'list') return await listTickets(req, res);
    if (req.method === 'POST' && action === 'update-status') return await updateStatus(req, res);
    if (req.method === 'POST' && action === 'delete') return await deleteTicket(req, res);
    return res.status(404).json({ error: 'Support ticket operation not found.' });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.' || error.message === 'Contractor Portal access is required.') {
      return res.status(error.statusCode || 403).json({ error: error.message });
    }
    console.error('Support ticket request failed:', error);
    return res.status(error.statusCode || 500).json({ error: 'Could not complete the support ticket request.' });
  }
}
