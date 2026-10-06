import type { User } from 'firebase/auth';
import { overlayQueuedChanges } from './offline-overlay';
import type { SiteSurvey } from './types';

type QueuedRequest = { id: string; body: Record<string, unknown>; createdAt: string; attempts: number };
type CachedResponse = { key: string; payload: unknown; cachedAt: string };
const QUEUE_DB = 'techsavvy-survey-offline';
const QUEUE_STORE = 'survey_offline_queue';
// Last good copy of every survey GET (the list, and each survey opened or
// prefetched), so the screen still opens with no signal.
const CACHE_STORE = 'survey_cache';
const QUEUEABLE = new Set(['saveModule', 'upsertRecord', 'deleteRecord', 'uploadAttachment']);

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(QUEUE_STORE)) request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) request.result.createObjectStore(CACHE_STORE, { keyPath: 'key' });
    };
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
  const rows = await new Promise<QueuedRequest[]>((resolve, reject) => { const request = database.transaction(QUEUE_STORE).objectStore(QUEUE_STORE).getAll(); request.onsuccess = () => resolve(request.result as QueuedRequest[]); request.onerror = () => reject(request.error); });
  database.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function removeQueued(id: string) {
  const database = await openQueue();
  await new Promise<void>((resolve, reject) => { const transaction = database.transaction(QUEUE_STORE, 'readwrite'); transaction.objectStore(QUEUE_STORE).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

async function putCached(key: string, payload: unknown) {
  const database = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE, 'readwrite');
    transaction.objectStore(CACHE_STORE).put({ key, payload, cachedAt: new Date().toISOString() } satisfies CachedResponse);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getCached(key: string): Promise<CachedResponse | null> {
  const database = await openQueue();
  const row = await new Promise<CachedResponse | null>((resolve, reject) => { const request = database.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(key); request.onsuccess = () => resolve((request.result as CachedResponse) || null); request.onerror = () => reject(request.error); });
  database.close();
  return row;
}

// Cached survey data includes customer site details, so it is dropped on
// sign-out. The unsynced-changes queue is deliberately kept: that is the
// technician's own unsaved work.
export async function clearSurveyCache() {
  try {
    const database = await openQueue();
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction(CACHE_STORE, 'readwrite'); transaction.objectStore(CACHE_STORE).clear(); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
  } catch { /* nothing cached, or storage unavailable */ }
}

// A failure to reach the server at all (no signal, dead Wi-Fi, timeout),
// as opposed to the server answering with an error.
function isNetworkFailure(error: unknown) {
  const name = (error as { name?: string })?.name;
  const code = (error as { code?: string })?.code;
  return error instanceof TypeError || name === 'AbortError' || name === 'TimeoutError' || code === 'auth/network-request-failed';
}

const isSurveyGet = (query: string) => query.startsWith('?action=get&');

async function cachedGet<T>(user: User, query: string): Promise<T> {
  const key = `${user.uid}:${query}`;
  const cached = await getCached(key).catch(() => null);
  // Queued, not-yet-synced changes are shown on top of whichever copy we have.
  const present = async (payload: unknown) => (isSurveyGet(query) ? overlayQueuedChanges(payload as SiteSurvey, (await queuedRequests().catch(() => [])).map((row) => row.body)) : payload) as T;
  if (cached && !navigator.onLine) return present(cached.payload);
  try {
    const token = await user.getIdToken();
    const response = await fetch(`/api/surveys${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      // With a cached copy to fall back on, do not make the technician wait out a dead connection.
      signal: cached ? AbortSignal.timeout(12000) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Survey request failed.');
    void putCached(key, payload).catch(() => {});
    return present(payload);
  } catch (error) {
    if (cached && isNetworkFailure(error)) return present(cached.payload);
    throw error;
  }
}

export async function surveyRequest<T>(user: User, query = '', body?: Record<string, unknown>): Promise<T> {
  if (!body) return cachedGet<T>(user, query);
  if (!navigator.onLine && QUEUEABLE.has(String(body.action))) {
    const queuedBody = body.action === 'upsertRecord' && !body.recordId ? { ...body, recordId: `offline-${crypto.randomUUID()}` } : body;
    await queueRequest(queuedBody);
    return { queued: true, id: queuedBody.recordId } as T;
  }
  const token = await user.getIdToken();
  const response = await fetch(`/api/surveys${query}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Survey request failed.');
  return payload as T;
}

// Warm the cache for the surveys a technician is likely to open, while there is
// signal, so each one opens later with none. Quiet: failures just mean that
// survey is not available offline.
export async function prefetchSurveys(user: User, surveys: { id: string; status: string }[]) {
  if (!navigator.onLine) return;
  const wanted = surveys.filter((survey) => !['archived', 'converted_to_estimate'].includes(survey.status)).slice(0, 20);
  let next = 0;
  const worker = async () => {
    while (next < wanted.length) {
      const survey = wanted[next++];
      try { await cachedGet(user, `?action=get&id=${encodeURIComponent(survey.id)}`); } catch { /* skip */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

export async function flushSurveyQueue(user: User): Promise<number> {
  if (!navigator.onLine) return 0;
  const rows = await queuedRequests();
  let completed = 0;
  // Items created offline got a temporary "offline-..." id. The first time one
  // reaches the server it gets its real id, and later changes to the same item
  // (edit it again, add a photo, delete it) must use that id, not create a copy.
  const realIds = new Map<string, string>();
  for (const row of rows) {
    const tempId = String(row.body.recordId || '');
    const isTemp = tempId.startsWith('offline-');
    if (isTemp && realIds.has(tempId)) {
      await surveyRequest(user, '', { ...row.body, recordId: realIds.get(tempId) });
    } else if (isTemp && row.body.action === 'deleteRecord') {
      // Deleted before it ever reached the server: nothing to delete.
    } else if (isTemp) {
      const result = await surveyRequest<{ id?: string }>(user, '', { ...row.body, recordId: '' });
      if (result?.id) realIds.set(tempId, result.id);
    } else {
      await surveyRequest(user, '', row.body);
    }
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
