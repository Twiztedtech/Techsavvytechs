// Pure access rules for client-portal jobs. Kept free of database imports so
// the rules that decide who may see or edit a company's job can be unit tested.

const hasRole = (profile, ...roles) =>
  Array.isArray(profile?.roles) && roles.some((role) => profile.roles.includes(role));

// Who may open a job. The company check comes first for everyone, company
// administrators included: an administrator sees every job of THEIR company,
// never another company's.
export function jobAccessDecision(profile, job, participantExists) {
  if (!profile?.customerId || !job) return false;
  if (job.customerId !== profile.customerId) return false;
  if (hasRole(profile, "company_admin")) return true;
  return job.createdByClientUid === profile.id || participantExists === true;
}

// Client-editable details stay open only until TechSavvy schedules the work;
// afterwards changes go through the scope-change approval instead.
export const CLIENT_EDITABLE_JOB_STATUSES = new Set([
  "",
  "requested",
  "reviewing",
  "clarification_needed",
  "approved",
  "scheduling",
]);

export function jobEditState(profile, job) {
  if (!hasRole(profile, "company_admin") && job.createdByClientUid !== profile.id)
    return {
      allowed: false,
      reason:
        "Only a company administrator or the person who requested this job can edit its details.",
    };
  const crmStatus = String(job.status || "New").toLowerCase();
  const clientStatus = String(job.clientStatus || "").toLowerCase();
  if (
    crmStatus !== "new" ||
    !CLIENT_EDITABLE_JOB_STATUSES.has(clientStatus) ||
    job.schedule?.date
  )
    return {
      allowed: false,
      reason:
        'This job is already scheduled or in progress, so its details are locked. Use "Request scope change" and TechSavvy will review it.',
    };
  return { allowed: true, reason: "" };
}
