import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../lib/firebase';
import { compressSurveyPhoto } from '../surveys/photo';

// Thin client for the community + wiki handler
// (/api/portal/time-clock?portalOperation=community&action=...).

export type Photo = { name: string; url: string; path?: string };
export type Viewer = { role: string; canModerate: boolean };
export type Category = { id: string; name: string; description?: string; order?: number; archived?: boolean; threadCount: number; lastActivityAt: string };
export type Thread = {
  id: string; categoryId: string; title: string; excerpt: string; body?: string; authorName: string; authorRole: string; mine: boolean;
  createdAt: string; editedAt: string; lastActivityAt: string; replyCount: number; pinned: boolean; locked: boolean; solvedReplyId: string;
  status: string; photos: Photo[]; following: boolean;
};
export type Reply = { id: string; body?: string; authorName?: string; authorRole?: string; mine?: boolean; createdAt: string; editedAt?: string; photos?: Photo[]; removed?: boolean; removedBy?: string };
export type WikiSummary = {
  slug: string; title: string; track: string; summary: string; visibility: 'members' | 'public'; status: 'draft' | 'published'; order: number;
  estimatedMinutes: number; version: number; updatedAt: string; completed?: boolean; needsRetake?: boolean;
};
export type WikiPage = WikiSummary & { body: string; updatedByName: string };
export type Report = { id: string; targetType: 'thread' | 'reply'; targetId: string; threadId: string; reason: string; reporterName: string; status: string; createdAt: string; snippet: string; targetHidden: boolean; outcome?: string };
export type Suggestion = { id: string; pageSlug: string; pageTitle: string; proposedBody: string; note: string; authorName: string; createdAt: string; currentBody: string; currentVersion: number; baseVersion: number; outdated: boolean };
export type Revision = { id: string; version: number; title: string; body: string; editorName: string; at: string; note: string };
export type MatrixLesson = { slug: string; title: string; track: string; order: number; version: number };
export type MatrixRow = { uid: string; name: string; completed: Record<string, { completedAt: string; needsRetake: boolean }> };

export class CommunityError extends Error {
  status: number; payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown>) { super(message); this.status = status; this.payload = payload; }
}

const ENDPOINT = '/api/portal/time-clock';

/** Calls the community handler. Signed-out visitors can still call the public wiki actions. */
export async function communityRequest<T>(action: string, { query = {}, body }: { query?: Record<string, string | undefined>; body?: Record<string, unknown> } = {}): Promise<T> {
  const params = new URLSearchParams({ portalOperation: 'community', action });
  Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
  const headers: Record<string, string> = {};
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${ENDPOINT}?${params}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new CommunityError(String(payload.error || 'Something went wrong. Please try again.'), response.status, payload);
  return payload as T;
}

/** Waits for Firebase to restore a saved sign-in before the first request. */
export function authReady(): Promise<void> {
  return new Promise((resolve) => {
    const stop = auth.onAuthStateChanged(() => { stop(); resolve(); });
  });
}

/** Compresses and uploads a photo into the signed-in technician's own community folder. */
export async function uploadCommunityPhoto(file: File): Promise<Photo> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to attach photos.');
  const dataUrl = await compressSurveyPhoto(file);
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 40) || 'photo';
  const path = `community/uploads/${uid}/${Date.now()}-${base}.jpg`;
  const fileRef = ref(storage, path);
  await uploadString(fileRef, dataUrl, 'data_url');
  return { name: file.name || 'Photo', path, url: await getDownloadURL(fileRef) };
}

/** Wiki images uploaded by leads and admins. */
export async function uploadWikiImage(slug: string, file: File): Promise<string> {
  const dataUrl = await compressSurveyPhoto(file);
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 40) || 'image';
  const fileRef = ref(storage, `wiki-media/${slug || 'new'}/${Date.now()}-${base}.jpg`);
  await uploadString(fileRef, dataUrl, 'data_url');
  return getDownloadURL(fileRef);
}

export function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (!then) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
