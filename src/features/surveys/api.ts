import type { User } from 'firebase/auth';

type QueuedRequest = { id: string; body: Record<string, unknown>; createdAt: string; attempts: number };
const QUEUE_DB = 'techsavvy-survey-offline';
const QUEUE_STORE = 'survey_offline_queue';
const QUEUEABLE = new Set(['saveModule', 'upsertRecord', 'deleteRecord', 'uploadAttachment']);

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(QUEUE_STORE)) request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueRequest(body: Record<string, unknown>) {
  const database = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE, 'readwrite');
    transaction.objectStore(QUEUE_STORE).put({ id: crypto.randomUUID(), body, createdAt: new Date().toISOString(), attempts: 0 } satisfies QueuedRequest);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function queuedRequests(): Promise<QueuedRequest[]> {
  const database = await openQueue();
  const rows = await new Promise<QueuedRequest[]>((resolve, reject) => { const request = database.transaction(QUEUE_STORE).objectStore(QUEUE_STORE).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  database.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function removeQueued(id: string) {
  const database = await openQueue();
  await new Promise<void>((resolve, reject) => { const transaction = database.transaction(QUEUE_STORE, 'readwrite'); transaction.objectStore(QUEUE_STORE).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

export async function surveyRequest<T>(user: User, query = '', body?: Record<string, unknown>): Promise<T> {
  if (body && !navigator.onLine && QUEUEABLE.has(String(body.action))) {
    const queuedBody = body.action === 'upsertRecord' && !body.recordId ? { ...body, recordId: `offline-${crypto.randomUUID()}` } : body;
    await queueRequest(queuedBody);
    return { queued: true, id: queuedBody.recordId } as T;
  }
  const token = await user.getIdToken();
  const response = await fetch(`/api/surveys${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Survey request failed.');
  return payload as T;
}

export async function flushSurveyQueue(user: User): Promise<number> {
  if (!navigator.onLine) return 0;
  const rows = await queuedRequests();
  let completed = 0;
  for (const row of rows) {
    const body = row.body.recordId && String(row.body.recordId).startsWith('offline-') ? { ...row.body, recordId: '' } : row.body;
    await surveyRequest(user, '', body);
    await removeQueued(row.id);
    completed += 1;
  }
  return completed;
}

export function saveLocalDraft(surveyId: string, moduleKey: string, answers: Record<string, unknown>) {
  localStorage.setItem(`survey-draft:${surveyId}:${moduleKey}`, JSON.stringify({ answers, savedAt: new Date().toISOString() }));
}

export function loadLocalDraft(surveyId: string, moduleKey: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`survey-draft:${surveyId}:${moduleKey}`);
    return raw ? JSON.parse(raw).answers : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(surveyId: string, moduleKey: string) {
  localStorage.removeItem(`survey-draft:${surveyId}:${moduleKey}`);
}
