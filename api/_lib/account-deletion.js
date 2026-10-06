import { FieldValue } from 'firebase-admin/firestore';

// Account deletion for technicians (required by Google Play and Apple).
//
// What "delete" means here, and why it is not "erase everything":
//  - Removed for good: the login itself, and everything that is personal and
//    not needed for our books -- name, email, phone, photo, signature, skills,
//    notification settings, and the GPS stamps on their time entries.
//  - Kept, as the law requires us to: pay history and the W-9 on file (tax /
//    1099 records), which stay attached to a profile that no longer names them.
//    Their name may also remain on completed work records customers already
//    received (signed work orders, invoices). This is stated in the privacy
//    policy and in the delete dialog.
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;
export const RETENTION_YEARS = 4;

// Deleting an account is irreversible, so require a sign-in from the last few
// minutes: a stolen or left-open session alone cannot do it.
export function isRecentSignIn(authTimeSeconds, nowMs = Date.now(), windowMs = REAUTH_WINDOW_MS) {
  const signedInAt = Number(authTimeSeconds) * 1000;
  return Number.isFinite(signedInAt) && signedInAt <= nowMs + 60 * 1000 && nowMs - signedInAt <= windowMs;
}

export function retentionEnd(now = new Date(), years = RETENTION_YEARS) {
  const end = new Date(now);
  end.setUTCFullYear(end.getUTCFullYear() + years);
  return end.toISOString();
}

// Fields written onto the technician's profile when they delete their account.
// Anything not listed (rate, QuickBooks ids, W-9/onboarding record, lifecycle
// history) is deliberately left in place as a retained financial record.
export function scrubbedContractorFields(nowIso, retainUntil) {
  return {
    name: 'Deleted technician',
    email: '',
    mobile: '',
    mobileVerified: false,
    mobileVerificationDeferred: false,
    profilePhotoUrl: '',
    skills: [],
    tools: [],
    certifications: [],
    signature: { dataUrl: '', updatedAt: nowIso },
    notificationPreferences: FieldValue.delete(),
    smsConsent: FieldValue.delete(),
    verificationHash: FieldValue.delete(),
    verificationAttempts: FieldValue.delete(),
    verificationExpiresAt: FieldValue.delete(),
    authUid: null,
    active: false,
    accessStatus: 'Deleted',
    deletedAt: nowIso,
    retainedUntil: retainUntil,
    updatedAt: nowIso,
  };
}

// Open work orders that listed this technician: remove them so the office sees
// the job as needing someone, instead of pointing at a deleted profile.
export function unassignedJobFields(job, contractorId, nowIso) {
  const ids = (Array.isArray(job.assignedTechIds) ? job.assignedTechIds : []).filter((id) => id !== contractorId);
  const wasLead = job.technicianLeadId === contractorId || job.assignedTechId === contractorId;
  return {
    assignedTechIds: ids,
    ...(wasLead ? { assignedTechId: '', assignedTechName: '', technicianLeadId: '' } : {}),
    updatedAt: nowIso,
  };
}
