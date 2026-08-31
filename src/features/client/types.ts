export type ClientRole = 'company_admin' | 'dispatcher' | 'sales' | 'project_viewer' | 'billing' | 'site_contact';

export interface ClientProfile {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  phone: string;
  roles: ClientRole[];
  status: 'pending' | 'active' | 'suspended';
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface ClientOrganization {
  id: string;
  name: string;
  approvedDomains: string[];
  referencePrefixes: string[];
  defaultContactPolicy: 'techsavvy_only' | 'direct_required' | 'per_job';
  personnel?: Array<{ id: string; name: string; email: string; role: 'requester' | 'sales' | 'project_manager' | 'payroll' | 'accounts_payable' | 'manager' | 'other'; active: boolean }>;
  billingRecipientEmails?: string[];
}

export interface ClientJobSummary {
  id: string;
  name: string;
  address: string;
  workOrderNumber: string;
  clientReference: string;
  status: string;
  targetCompletion: string;
  closeoutStatus: string;
}

export interface ClientJobDetail {
  job: ClientJobSummary & { notes: string; scopeTasks: string[]; qaChecklist: string[]; contactPolicy: string; documents?: Array<{ name: string; url: string; type: string }>; billingDocuments?: Array<{ name: string; url: string }> };
  appointments: Array<{ id: string; status: string; confirmedStart?: string; confirmedEnd?: string; requestedWindows: Array<{ date: string; start: string; end: string }>; rescheduleProposal?: { start: string; end: string; status: string }; technician?: { displayName: string; profilePhotoUrl?: string; specialty?: string; assignmentStatus: string; estimatedArrivalStart?: string; estimatedArrivalEnd?: string; businessPhone?: string; businessEmail?: string; contactHours?: string } }>;
  events: Array<{ id: string; type: string; message: string; createdAt: string }>;
  messages: Array<{ id: string; authorName: string; message: string; createdAt: string }>;
}
