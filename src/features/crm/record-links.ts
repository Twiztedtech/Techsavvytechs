type Assignment = { assignedTechId?: string; assignedTechIds?: string[] };
export function assignmentIds(job: Assignment): string[] {
  return [...new Set([job.assignedTechId, ...(job.assignedTechIds || [])].filter((id): id is string => Boolean(id)))];
}
export function isClosedJob(job: { status?: string }): boolean {
  return ['complete', 'completed', 'closed', 'cancelled', 'canceled', 'voided', 'invoiced', 'ready to invoice', 'field complete'].includes((job.status || '').toLowerCase());
}
export function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function customerFor<T extends { id: string; name: string }>(record: { customerId?: string; vendorName?: string; customerName?: string; customer?: string }, customers: T[]): T | undefined {
  if (record.customerId) return customers.find((customer) => customer.id === record.customerId);
  const name = (record.vendorName || record.customerName || record.customer || '').trim().toLowerCase();
  const matches = customers.filter((customer) => customer.name.trim().toLowerCase() === name);
  return name && matches.length === 1 ? matches[0] : undefined;
}
export type TimeRecord = { status?: string; laborStatus?: string; totalHours?: string | number; active?: boolean };
export function approvedLabor(entry: TimeRecord): boolean {
  return entry.active !== true && !['voided', 'rejected'].includes(entry.status || '') && (entry.laborStatus === 'approved' || (!entry.laborStatus && entry.status === 'approved'));
}
export function laborSummary(entries: TimeRecord[]) {
  const hours = (entry: TimeRecord) => Math.max(0, Number.isFinite(Number(entry.totalHours)) ? Number(entry.totalHours) : 0);
  const submitted = entries.filter((entry) => entry.active !== true && !['voided', 'rejected'].includes(entry.status || '') && entry.laborStatus !== 'rejected');
  const approved = submitted.filter(approvedLabor);
  const round = (value: number) => Math.round(value * 100) / 100;
  return { submitted: round(submitted.reduce((sum, entry) => sum + hours(entry), 0)), approved: round(approved.reduce((sum, entry) => sum + hours(entry), 0)), pending: round(submitted.filter((entry) => !approvedLabor(entry)).reduce((sum, entry) => sum + hours(entry), 0)) };
}
