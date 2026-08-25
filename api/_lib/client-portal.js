import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb, adminStorage } from './firebase-admin.js';

export const CLIENT_ROLES = ['company_admin', 'dispatcher', 'sales', 'project_viewer', 'billing', 'site_contact'];
export const JOB_STATUSES = ['requested', 'reviewing', 'clarification_needed', 'approved', 'scheduling', 'scheduled', 'assigned', 'accepted', 'en_route', 'on_site', 'in_progress', 'blocked', 'completed', 'awaiting_acceptance', 'closed', 'cancelled', 'missed'];

export const nowIso = () => new Date().toISOString();
export const clean = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const normalizeEmail = (value) => clean(value, 254).toLowerCase();
export const normalizePhone = (value) => clean(value, 30).replace(/[^+\d]/g, '');
export const emailDomain = (email) => normalizeEmail(email).split('@')[1] || '';
export const opaqueToken = () => randomBytes(24).toString('base64url');
export const hashValue = (value) => createHash('sha256').update(String(value)).digest('hex');
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function optionalUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return adminAuth.verifyIdToken(token);
}

export async function requireUser(req) {
  const user = await optionalUser(req);
  if (!user) throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  return user;
}

export async function requireClient(req) {
  const user = await requireUser(req);
  const profile = await adminDb.collection('client_users').doc(user.uid).get();
  if (!profile.exists) throw Object.assign(new Error('Client membership is required.'), { statusCode: 403 });
  const data = profile.data();
  if (data.status !== 'active' || data.emailVerified !== true || data.phoneVerified !== true) {
    throw Object.assign(new Error('Client membership is awaiting verification or approval.'), { statusCode: 403 });
  }
  return { user, profile: { id: profile.id, ...data } };
}

export function hasRole(profile, ...roles) {
  return Array.isArray(profile.roles) && roles.some((role) => profile.roles.includes(role));
}

export async function canAccessJob(profile, jobId) {
  if (hasRole(profile, 'company_admin')) return true;
  const participantId = `${jobId}_${profile.id}`;
  const [job, participant] = await Promise.all([
    adminDb.collection('jobs').doc(jobId).get(),
    adminDb.collection('job_participants').doc(participantId).get(),
  ]);
  if (!job.exists || job.data().clientOrganizationId !== profile.organizationId) return false;
  return job.data().createdByClientUid === profile.id || participant.exists;
}

export function publicTechnician(contractor, appointment = {}) {
  if (!contractor) return null;
  const name = clean(contractor.publicDisplayName || contractor.name, 100);
  const parts = name.split(/\s+/).filter(Boolean);
  const displayName = contractor.publicDisplayName || [parts[0], parts[1] ? `${parts[1][0]}.` : ''].filter(Boolean).join(' ');
  const directAllowed = appointment.directContactApproved === true && contractor.allowDirectClientContact === true;
  return {
    displayName,
    profilePhotoUrl: contractor.showPhotoToClients === true ? clean(contractor.profilePhotoUrl, 1000) : '',
    specialty: clean(contractor.specialty, 120),
    assignmentStatus: clean(appointment.status, 40),
    estimatedArrivalStart: appointment.confirmedStart || null,
    estimatedArrivalEnd: appointment.confirmedEnd || null,
    ...(directAllowed ? {
      businessPhone: clean(contractor.businessPhone, 40),
      businessEmail: normalizeEmail(contractor.businessEmail),
      contactHours: clean(contractor.contactHours, 100),
    } : {}),
  };
}

export async function recordEvent({ jobId = '', requestId = '', appointmentId = '', type, actorUid = '', actorRole = 'system', visibility = 'internal', message = '', metadata = {} }) {
  return adminDb.collection('job_events').add({
    jobId, requestId, appointmentId, type, actorUid, actorRole, visibility,
    message: clean(message, 3000), metadata, createdAt: nowIso(),
  });
}

export async function sendEmail({ to, subject, text, html, replyTo, jobId = '', type = 'email' }) {
  const recipients = (Array.isArray(to) ? to : [to]).map(normalizeEmail).filter(Boolean);
  if (!recipients.length || !process.env.RESEND_API_KEY) return { skipped: true };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'TechSavvy Portal <support@techsavvytechs.com>',
      to: recipients, reply_to: replyTo, subject, text, html,
    }),
  });
  const body = await response.json().catch(() => ({}));
  await adminDb.collection('notification_deliveries').add({
    channel: 'email', type, jobId, recipients, providerId: body.id || '',
    status: response.ok ? 'accepted' : 'failed', error: response.ok ? '' : JSON.stringify(body).slice(0, 1000), createdAt: nowIso(),
  });
  if (!response.ok) throw new Error('Email delivery was rejected.');
  return body;
}

export async function sendSms({ to, body, jobId = '', type = 'sms', important = false }) {
  const phone = normalizePhone(to);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!phone || !sid || !token || (!serviceSid && !from)) return { skipped: true };
  const preference = await adminDb.collection('sms_preferences').doc(hashValue(phone)).get();
  if (preference.exists && preference.data().optedIn === false) return { skipped: true, reason: 'opted_out' };
  const pacificHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(new Date()));
  if (!important && (pacificHour >= 20 || pacificHour < 8)) {
    await adminDb.collection('notification_deliveries').add({ channel: 'sms', type, jobId, recipientHash: hashValue(phone), status: 'deferred_quiet_hours', important, createdAt: nowIso() });
    return { skipped: true, reason: 'quiet_hours' };
  }
  const params = new URLSearchParams({ To: phone, Body: clean(body, 1500) });
  if (serviceSid) params.set('MessagingServiceSid', serviceSid); else params.set('From', from);
  if (process.env.APP_URL) params.set('StatusCallback', `${process.env.APP_URL.replace(/\/$/, '')}/api/webhooks/twilio`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  const result = await response.json().catch(() => ({}));
  await adminDb.collection('notification_deliveries').add({
    channel: 'sms', type, jobId, recipientHash: hashValue(phone), providerId: result.sid || '',
    status: response.ok ? 'accepted' : 'failed', important, error: response.ok ? '' : JSON.stringify(result).slice(0, 1000), createdAt: nowIso(),
  });
  if (!response.ok) throw new Error('SMS delivery was rejected.');
  return result;
}

export async function notifyNewRequest(request) {
  const appUrl = (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');
  const reviewUrl = `${appUrl}/contractor/dashboard?adminTab=requests`;
  const emails = (process.env.CLIENT_REQUEST_ALERT_EMAILS || process.env.SUPPORT_EMAIL || '').split(',').map((v) => v.trim()).filter(Boolean);
  const phones = (process.env.CLIENT_REQUEST_ALERT_PHONES || '').split(',').map((v) => v.trim()).filter(Boolean);
  const summary = `${request.requestNumber}: ${request.companyName} — ${request.siteName}, ${request.requestedWindows?.[0]?.date || 'date pending'}${request.urgent ? ' (URGENT)' : ''}`;
  await Promise.allSettled([
    sendEmail({ to: emails, subject: `${request.urgent ? 'URGENT: ' : ''}New client job request ${request.requestNumber}`, text: `${summary}\n\n${reviewUrl}`, html: `<h1>New client job request</h1><p>${escapeHtml(summary)}</p><p><a href="${reviewUrl}">Review request</a></p>`, type: 'new_request' }),
    ...phones.map((phone) => sendSms({ to: phone, body: `New ${request.urgent ? 'URGENT ' : ''}job request ${summary}. Review: ${reviewUrl}`, type: 'new_request', important: true })),
  ]);
}

export async function uploadInlineFiles(files, requestId) {
  if (!Array.isArray(files) || files.length === 0) return [];
  if (files.length > 2) throw Object.assign(new Error('Upload no more than two files per request.'), { statusCode: 422 });
  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);
  const uploaded = [];
  for (const file of files) {
    const contentType = clean(file?.contentType, 100);
    const match = clean(file?.data, 2500000).match(/^data:[^;]+;base64,(.+)$/);
    const bytes = match ? Buffer.from(match[1], 'base64') : null;
    if (!bytes || bytes.length > 1_500_000 || !allowed.has(contentType)) throw Object.assign(new Error('Attachments must be PDF, JPG, PNG, or text files smaller than 1.5 MB.'), { statusCode: 422 });
    const safeName = clean(file.name, 150).replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `client-request-documents/${requestId}/${Date.now()}-${safeName}`;
    await adminStorage.file(path).save(bytes, { metadata: { contentType }, resumable: false });
    uploaded.push({ name: safeName, storagePath: path, contentType, size: bytes.length });
  }
  return uploaded;
}

export function verificationHash(uid, code) {
  return createHmac('sha256', process.env.CLIENT_PORTAL_SECRET || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 'dev-only').update(`${uid}:${code}`).digest('hex');
}

export function addBusinessDays(input, count) {
  const date = new Date(input);
  let remaining = count;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) remaining -= 1;
  }
  return date;
}

export function encryptSecret(value) {
  const key = createHash('sha256').update(process.env.CLIENT_PORTAL_SECRET || '').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value) {
  const [ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (!ivValue || !tagValue || !encryptedValue || !process.env.CLIENT_PORTAL_SECRET) return '';
  const key = createHash('sha256').update(process.env.CLIENT_PORTAL_SECRET).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

export async function googleAccessToken() {
  let refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!refreshToken) {
    const connection = await adminDb.collection('settings').doc('google_calendar').get();
    refreshToken = connection.exists ? decryptSecret(connection.data().encryptedRefreshToken) : '';
  }
  if (!refreshToken || !process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) return null;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Google Calendar authorization could not be refreshed.');
  return data.access_token;
}

export async function renewGoogleCalendarWatch() {
  const accessToken = await googleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const address = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/webhooks/google-calendar` : '';
  if (!accessToken || !calendarId || !address || !process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN) return { skipped: true };
  const channelId = opaqueToken();
  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: channelId, type: 'web_hook', address, token: process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN, expiration }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Google Calendar notification channel could not be created.');
  await adminDb.collection('settings').doc('google_calendar').set({ watchChannelIdHash: hashValue(channelId), watchResourceId: data.resourceId || '', watchExpiresAt: new Date(Number(data.expiration || expiration)).toISOString(), syncPending: true, updatedAt: nowIso() }, { merge: true });
  return data;
}

export async function syncGoogleCalendarChanges() {
  const accessToken = await googleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!accessToken || !calendarId) return { skipped: true, updated: 0 };
  const settingsRef = adminDb.collection('settings').doc('google_calendar');
  const settings = await settingsRef.get();
  let pageToken = '', nextSyncToken = '', updated = 0;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true'); url.searchParams.set('showDeleted', 'true'); url.searchParams.set('maxResults', '250');
    if (settings.data()?.syncToken) url.searchParams.set('syncToken', settings.data().syncToken); else url.searchParams.set('timeMin', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 410) { await settingsRef.set({ syncToken: '', syncPending: true }, { merge: true }); return syncGoogleCalendarChanges(); }
    const data = await response.json();
    if (!response.ok) throw new Error('Google Calendar changes could not be synchronized.');
    for (const event of data.items || []) {
      const appointmentId = event.extendedProperties?.private?.techsavvyAppointmentId;
      if (!appointmentId) continue;
      const ref = adminDb.collection('appointments').doc(appointmentId);
      const appointment = await ref.get();
      if (!appointment.exists) continue;
      if (event.status === 'cancelled') await ref.set({ status: 'cancelled', calendarUpdatedAt: event.updated || nowIso(), updatedAt: nowIso() }, { merge: true });
      else if (event.start?.dateTime && event.end?.dateTime && (appointment.data().confirmedStart !== event.start.dateTime || appointment.data().confirmedEnd !== event.end.dateTime) && appointment.data().calendarUpdatedAt !== event.updated) {
        await ref.set({ confirmedStart: event.start.dateTime, confirmedEnd: event.end.dateTime, status: 'scheduled', calendarUpdatedAt: event.updated || nowIso(), history: [...(appointment.data().history || []), { type: 'calendar_updated', start: event.start.dateTime, end: event.end.dateTime, at: nowIso() }], updatedAt: nowIso() }, { merge: true });
      }
      updated += 1;
    }
    pageToken = data.nextPageToken || ''; nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);
  await settingsRef.set({ syncToken: nextSyncToken, syncPending: false, lastSyncedAt: nowIso() }, { merge: true });
  return { updated };
}

export async function syncCalendarAppointment(appointment, job, existingEventId = '') {
  const accessToken = await googleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!accessToken || !calendarId || !appointment.confirmedStart || !appointment.confirmedEnd) return { skipped: true };
  const encodedCalendar = encodeURIComponent(calendarId);
  const encodedEvent = existingEventId ? `/${encodeURIComponent(existingEventId)}` : '';
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalendar}/events${encodedEvent}`, {
    method: existingEventId ? 'PUT' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: `${job.workOrderNumber || 'TechSavvy'} · ${job.name}`,
      location: job.address || '',
      description: `TechSavvy portal job ${job.id || ''}. The portal remains the scheduling system of record.`,
      start: { dateTime: appointment.confirmedStart, timeZone: 'America/Los_Angeles' },
      end: { dateTime: appointment.confirmedEnd, timeZone: 'America/Los_Angeles' },
      extendedProperties: { private: { techsavvyAppointmentId: appointment.id, techsavvyJobId: appointment.jobId } },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Calendar rejected the appointment (${response.status}).`);
  return { eventId: data.id, updated: data.updated };
}
