import type { JobSite } from '../contractor/types';

// Pure record-building logic factored out of saveJob.ts so it's testable
// without a Firebase client (mirrors src/features/crm/record-links.ts and
// api/_lib/notification-eligibility.js, which are dependency-free for the
// same reason).
export interface SaveJobInput extends Partial<Omit<JobSite, 'id'>> {
  id?: string;
  name: string;
  customerId?: string | null;
  sourceQuoteId?: string;
  attachments?: Array<Record<string, unknown>>;
  quotedValue?: number;
  actorUid?: string;
}

export function buildJobRecord(
  input: SaveJobInput,
  existingJob: Record<string, unknown> | null | undefined,
  now: string,
): Record<string, unknown> {
  const existing = existingJob || {};
  const signatureRequired =
    input.signatureRequired ?? (existing.signatureRequired as boolean | undefined) ?? false;
  const signaturePolicyChanged = existingJob
    ? existing.signatureRequired !== signatureRequired
    : true;
  const assignedTechIds =
    input.assignedTechIds ?? (existing.assignedTechIds as string[] | undefined) ?? [];

  return {
    ...existing,
    workOrderNumber: input.workOrderNumber ?? existing.workOrderNumber ?? '',
    vendorName: input.vendorName ?? existing.vendorName ?? '',
    customerId: input.customerId !== undefined ? input.customerId : (existing.customerId ?? null),
    sourceQuoteId: input.sourceQuoteId ?? existing.sourceQuoteId ?? '',
    name: input.name,
    address: input.address ?? existing.address ?? 'Address on file',
    notes: input.notes ?? existing.notes ?? 'Site instructions unspecified',
    siteContact: input.siteContact ?? existing.siteContact ?? '',
    dateIssued: input.dateIssued ?? existing.dateIssued ?? '',
    targetCompletion: input.targetCompletion ?? existing.targetCompletion ?? '',
    technicianLeadId: input.technicianLeadId ?? existing.technicianLeadId ?? '',
    workOrderTemplate: input.workOrderTemplate ?? existing.workOrderTemplate ?? '',
    // Authoritative for technician pay - api/portal/time-clock.js pulls this
    // directly and only falls back to 55 when the field is entirely absent,
    // so it must always be a real number here, never undefined.
    hourlyRate: Number(input.hourlyRate ?? existing.hourlyRate ?? 55),
    travelRate: Number(input.travelRate ?? existing.travelRate ?? 0),
    equipment: input.equipment ?? existing.equipment ?? [],
    scopeTasks: input.scopeTasks ?? existing.scopeTasks ?? [],
    qaChecklist: input.qaChecklist ?? existing.qaChecklist ?? [],
    requiredDeliverables: input.requiredDeliverables ?? existing.requiredDeliverables ?? [],
    // Authoritative for whether a signed work order is required before final
    // completion - must be a real boolean, never undefined (undefined reads
    // as falsy and silently skips the signature requirement entirely).
    signatureRequired,
    signatureStatus:
      existing.signatureStatus ||
      ((existing.signedWorkOrders as unknown[] | undefined)?.length ? 'signed' : 'pending'),
    signaturePolicyUpdatedAt: signaturePolicyChanged ? now : existing.signaturePolicyUpdatedAt || now,
    signaturePolicyUpdatedByUid: signaturePolicyChanged
      ? input.actorUid || ''
      : existing.signaturePolicyUpdatedByUid || input.actorUid || '',
    signaturePolicyHistory: signaturePolicyChanged
      ? [
          ...((existing.signaturePolicyHistory as unknown[] | undefined) || []),
          { required: signatureRequired, changedAt: now, changedByUid: input.actorUid || '' },
        ]
      : (existing.signaturePolicyHistory as unknown[] | undefined) || [],
    assignedTechId: assignedTechIds.includes('ALL') ? 'ALL' : assignedTechIds[0] || '',
    assignedTechIds,
    attachments: input.attachments ?? existing.attachments ?? [],
    status: input.status ?? existing.status ?? 'New',
    quotedValue: input.quotedValue ?? existing.quotedValue ?? 0,
    updatedAt: now,
    createdAt: existing.createdAt || now,
  };
}
