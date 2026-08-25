import { adminDb } from '../_lib/firebase-admin.js';
import { addBusinessDays, nowIso, renewGoogleCalendarWatch, sendEmail, sendSms, syncGoogleCalendarChanges } from '../_lib/client-portal.js';

async function recipientsFor(jobId) {
  const participants = await adminDb.collection('job_participants').where('jobId', '==', jobId).get();
  const users = await Promise.all(participants.docs.map((doc) => adminDb.collection('client_users').doc(doc.data().clientUid).get()));
  return users.filter((doc) => doc.exists && doc.data().status === 'active').map((doc) => doc.data());
}

async function notify(recipients, subject, message, jobId, type) {
  await Promise.allSettled(recipients.map(async (recipient) => {
    await sendEmail({ to: recipient.email, subject, text: message, html: `<p>${message}</p>`, jobId, type });
    if (recipient.smsConsent?.optedIn === true) await sendSms({ to: recipient.phone, body: message, jobId, type, important: true });
  }));
}

export default async function handler(req, res) {
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) return res.status(403).json({ error: 'Cron authorization required.' });
  const current = Date.now();
  let reminders = 0, autoClosed = 0;
  const calendarSettings = await adminDb.collection('settings').doc('google_calendar').get();
  if (calendarSettings.data()?.syncPending === true) await syncGoogleCalendarChanges().catch((error) => console.error('Calendar sync failed:', error));
  if (!calendarSettings.data()?.watchExpiresAt || Date.parse(calendarSettings.data().watchExpiresAt) < current + 24 * 60 * 60 * 1000) await renewGoogleCalendarWatch().catch((error) => console.error('Calendar watch renewal failed:', error));
  const appointments = await adminDb.collection('appointments').where('status', '==', 'scheduled').limit(200).get();
  for (const doc of appointments.docs) {
    const appointment = doc.data();
    const start = Date.parse(appointment.confirmedStart || '');
    if (!Number.isFinite(start) || start <= current) continue;
    const hours = (start - current) / 3600000;
    const job = await adminDb.collection('jobs').doc(appointment.jobId).get();
    if (!job.exists) continue;
    const recipients = await recipientsFor(appointment.jobId);
    if (hours <= 25 && hours > 20 && !appointment.reminder24SentAt) {
      await notify(recipients, `${job.data().workOrderNumber} appointment reminder`, `TechSavvy reminder: ${job.data().name} is scheduled for ${new Date(start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.`, job.id, 'appointment_reminder_24h');
      await doc.ref.set({ reminder24SentAt: nowIso() }, { merge: true }); reminders += 1;
    }
    if (hours <= 2.5 && hours > 1 && !appointment.reminder2SentAt) {
      await notify(recipients, `${job.data().workOrderNumber} arrival reminder`, `TechSavvy reminder: the arrival window for ${job.data().name} begins in about two hours.`, job.id, 'appointment_reminder_2h');
      await doc.ref.set({ reminder2SentAt: nowIso() }, { merge: true }); reminders += 1;
    }
  }
  const awaiting = await adminDb.collection('jobs').where('closeoutStatus', '==', 'awaiting_acceptance').limit(100).get();
  for (const doc of awaiting.docs) {
    const completed = Date.parse(doc.data().completedAt || '');
    if (!Number.isFinite(completed)) continue;
    if (current >= addBusinessDays(new Date(completed), 3).getTime() && !doc.data().closeoutReminderSentAt) {
      const recipients = await recipientsFor(doc.id);
      await notify(recipients, `${doc.data().workOrderNumber} closeout awaiting acceptance`, `Please review the TechSavvy closeout package. The job will close automatically after five business days if no dispute is opened.`, doc.id, 'closeout_reminder');
      await doc.ref.set({ closeoutReminderSentAt: nowIso() }, { merge: true });
    }
    if (current >= addBusinessDays(new Date(completed), 5).getTime()) {
      await doc.ref.set({ closeoutStatus: 'auto_closed', clientStatus: 'closed', autoClosedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
      autoClosed += 1;
    }
  }
  return res.status(200).json({ success: true, reminders, autoClosed });
}
