import { adminDb, requireStaffRole } from './firebase-admin.js';
import { rateLimited } from './client-portal.js';
import { DEFAULT_MODEL, triageRequest } from './triage-agent.js';

// POST /api/portal/time-clock?portalOperation=triage&action=run   { requestId }
// GET  /api/portal/time-clock?portalOperation=triage&action=get&requestId=...
// GET  /api/portal/time-clock?portalOperation=triage&action=list   (latest triage per request)
// Admin and Assistant Admin only. Results live in the server-only `request_triage` collection and are
// advice: nothing here creates a job, edits a customer or sends a message.

const nowIso = () => new Date().toISOString();
const triageRef = (requestId) => adminDb.collection('request_triage').doc(requestId);

export async function loadSettings() {
  const snap = await adminDb.collection('settings').doc('triage').get();
  const data = snap.exists ? snap.data() : {};
  return { enabled: data.enabled === true, dailyCap: Number(data.dailyCap) > 0 ? Number(data.dailyCap) : 25, model: String(data.model || DEFAULT_MODEL) };
}

/** Runs triage for one request and stores the outcome. Never throws: a failure is recorded, the request is untouched. */
export async function runTriage(requestId, { force = false } = {}) {
  const settings = await loadSettings();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: 'unavailable', error: 'The assistant is not configured (no API key).' };
  if (!settings.enabled && !force) return { status: 'unavailable', error: 'Request triage is turned off.' };
  const requestSnap = await adminDb.collection('vendor_requests').doc(requestId).get();
  if (!requestSnap.exists) return { status: 'failed', error: 'Request not found.' };
  const today = nowIso().slice(0, 10);
  const used = await adminDb.collection('request_triage').where('day', '==', today).get().then((s) => s.size).catch(() => 0);
  if (used >= settings.dailyCap) return { status: 'unavailable', error: `Daily limit of ${settings.dailyCap} reached.` };
  await triageRef(requestId).set({ status: 'pending', day: today, requestNumber: requestSnap.data().requestNumber || '', startedAt: nowIso() }, { merge: true });
  try {
    const { triage, usage } = await triageRequest({ id: requestId, ...requestSnap.data() }, { apiKey, model: settings.model, today });
    const record = { ...triage, status: 'ready', day: today, model: settings.model, usage, requestNumber: requestSnap.data().requestNumber || '', completedAt: nowIso(), error: '' };
    await triageRef(requestId).set(record, { merge: true });
    return record;
  } catch (error) {
    const record = { status: 'failed', error: String(error.message || error).slice(0, 300), completedAt: nowIso() };
    await triageRef(requestId).set(record, { merge: true });
    return record;
  }
}

export default async function triageHandler(req, res) {
  let user;
  try { user = await requireStaffRole(req, ['assistant_admin']); }
  catch (error) { return res.status(/Authentication/.test(error.message) ? 401 : 403).json({ error: error.message }); }
  const action = String(req.query?.action || '');
  if (req.method === 'GET' && action === 'list') {
    const snap = await adminDb.collection('request_triage').orderBy('completedAt', 'desc').limit(100).get().catch(() => ({ docs: [] }));
    return res.status(200).json({ settings: await loadSettings(), items: snap.docs.map((d) => ({ requestId: d.id, ...d.data() })) });
  }
  if (req.method === 'GET' && action === 'get') {
    const snap = await triageRef(String(req.query?.requestId || '')).get();
    return res.status(200).json({ triage: snap.exists ? snap.data() : null });
  }
  if (req.method === 'POST' && action === 'run') {
    if (rateLimited(req, `triage:${user.uid}`, 20, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many runs. Please wait a few minutes.' });
    const requestId = String(req.body?.requestId || '').slice(0, 120);
    if (!requestId) return res.status(422).json({ error: 'requestId is required.' });
    const result = await runTriage(requestId, { force: true });
    return res.status(result.status === 'ready' ? 200 : 502).json({ triage: result });
  }
  if (req.method === 'POST' && action === 'settings') {
    const patch = { enabled: req.body?.enabled === true, dailyCap: Math.min(200, Math.max(1, Number(req.body?.dailyCap) || 25)), updatedAt: nowIso(), updatedByUid: user.uid };
    await adminDb.collection('settings').doc('triage').set(patch, { merge: true });
    return res.status(200).json({ settings: await loadSettings() });
  }
  return res.status(404).json({ error: 'Unknown action.' });
}
