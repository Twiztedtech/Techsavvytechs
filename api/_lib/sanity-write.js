// Server-side Sanity access with the SANITY_WRITE_TOKEN (Editor) secret.
// Shared by public submissions that land in the Studio for approval
// (blog comments, customer testimonials).

export const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID || 'dnlgguay';
export const SANITY_DATASET = process.env.SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production';
export const STUDIO_URL = 'https://techsavvy-content.sanity.studio';
const SANITY_API_VERSION = '2026-08-17';

const sanityBase = () => `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data`;

export async function sanityRequest(path, init = {}) {
  // Trim: a pasted token often carries a trailing space or newline.
  const token = String(process.env.SANITY_WRITE_TOKEN || '').trim();
  if (!token) { const error = new Error('This feature is not available right now.'); error.statusCode = 503; throw error; }
  const response = await fetch(`${sanityBase()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.error?.description || data?.message || `Sanity request failed (${response.status}).`); error.statusCode = 502; throw error; }
  return data;
}

export async function sanityQuery(query, params = {}) {
  const search = new URLSearchParams({ query, perspective: 'published' });
  for (const [key, value] of Object.entries(params)) search.set(`$${key}`, JSON.stringify(value));
  const data = await sanityRequest(`/query/${SANITY_DATASET}?${search}`);
  return data?.result ?? null;
}

export const sanityMutate = (mutations) =>
  sanityRequest(`/mutate/${SANITY_DATASET}?returnIds=true&visibility=sync`, { method: 'POST', body: JSON.stringify({ mutations }) });

export const studioEditUrl = (id, type) => `${STUDIO_URL}/intent/edit/id=${encodeURIComponent(id)};type=${type}`;

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Strips control characters (optionally keeping line breaks) and collapses blank runs.
export const cleanText = (value, keepNewlines = false) =>
  String(value ?? '')
    .replace(keepNewlines ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export function slidingWindowLimiter(windowMs, max) {
  const store = new Map();
  return (key, now = Date.now(), map = store) => {
    const attempts = (map.get(key) || []).filter((time) => now - time < windowMs);
    if (attempts.length >= max) { map.set(key, attempts); return true; }
    attempts.push(now);
    map.set(key, attempts);
    return false;
  };
}

export async function emailOwner({ subject, text, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) return;
  const to = process.env.SUPPORT_EMAIL || process.env.CONTACT_RECIPIENT_EMAIL || 'support@techsavvytechs.com';
  const from = process.env.EMAIL_FROM || 'TechSavvy Website <support@techsavvytechs.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], ...(replyTo ? { reply_to: replyTo } : {}), subject, text, html }),
  });
  if (!response.ok) console.error('Owner notification failed:', await response.text());
}
