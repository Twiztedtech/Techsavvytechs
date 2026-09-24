export type ClientRole =
  | "company_admin"
  | "dispatcher"
  | "sales"
  | "project_viewer"
  | "billing"
  | "site_contact";

export interface ClientProfile {
  id: string;
  customerId: string;
  email: string;
  displayName: string;
  phone: string;
  roles: ClientRole[];
  status: "pending" | "active" | "suspended";
  emailVerified: boolean;
  phoneVerified: boolean;
  phoneVerificationDeferred?: boolean;
  smsConsent?: { optedIn: boolean; phone?: string };
}

export interface ClientOrganization {
  id: string;
  name: string;
  approvedDomains: string[];
  referencePrefixes: string[];
  defaultContactPolicy: "techsavvy_only" | "direct_required" | "per_job";
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
  reportCount?: number;
}

export interface ClientEquipmentLine {
  description: string;
  quantity: string | number;
  upc: string;
  serial: string;
  notes: string;
  providedBy: "client" | "techsavvy";
}

export interface ClientJobDetail {
  job: ClientJobSummary & {
    siteContact?: string;
    equipment?: ClientEquipmentLine[];
    editable?: { allowed: boolean; reason: string };
    notes: string;
    scopeTasks: string[];
    qaChecklist: string[];
    contactPolicy: string;
    documents?: Array<{ name: string; url: string; type: string }>;
    billingDocuments?: Array<{ name: string; url: string }>;
  };
  appointments: Array<{
    id: string;
    status: string;
    confirmedStart?: string;
    confirmedEnd?: string;
    requestedWindows: Array<{ date: string; start: string; end: string }>;
    rescheduleProposal?: { start: string; end: string; status: string };
    technician?: {
      displayName: string;
      profilePhotoUrl?: string;
      specialty?: string;
      assignmentStatus: string;
      estimatedArrivalStart?: string;
      estimatedArrivalEnd?: string;
      businessPhone?: string;
      businessEmail?: string;
      contactHours?: string;
    };
  }>;
  events: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
  }>;
  messages: Array<{
    id: string;
    authorName: string;
    message: string;
    createdAt: string;
  }>;
  surveyReport?: {
    id: string;
    surveyNumber: string;
    customerName: string;
    siteName: string;
    siteAddress: string;
    status: string;
    modules: Array<{ id: string; answers?: Record<string, unknown>; records?: Array<Record<string, unknown>> }>;
  } | null;
}
