export type PortalRole = "contractor" | "admin";

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  email: string;
  contractorUid?: string;
  createdAt: string;
  updatedAt?: string;
  status: "Open" | "Resolved";
}

export interface Contractor {
  id: string;
  name: string;
  email: string;
  rate: number;
  status: string;
  qboVendorId?: string;
  authUid?: string;
  invitationStatus?: "ready" | "sent";
  authProvisionedAt?: string;
  invitedAt?: string;
  mobile?: string;
  mobileVerified?: boolean;
  mobileVerificationDeferred?: boolean;
  smsConsent?: { optedIn: boolean; consentedAt?: string };
  notificationPreferences?: { email: boolean; sms: boolean };
}

export interface NotificationProfile {
  mobile: string;
  mobileVerified: boolean;
  mobileVerificationDeferred: boolean;
  notificationPreferences: { email: boolean; sms: boolean };
}

export interface Certification {
  id: string;
  name: string;
  expiryDate: string;
}

export interface SelfProfile {
  name: string;
  email: string;
  specialty: string;
  rate: number;
  employmentType: "1099_contractor" | "w2_employee";
  skills: string[];
  tools: string[];
  certifications: Certification[];
}

export interface JobSite {
  id: string;
  name: string;
  address: string;
  notes: string;
  hourlyRate: number;
  customerBillRate?: number;
  // Billed to the customer for work performed outside standard business
  // hours (7:00 AM-5:00 PM) per the signed service agreement's rate terms.
  customerNightBillRate?: number;
  travelRate: number;
  workOrderNumber?: string;
  clientReference?: string;
  clientProjectManager?: string;
  vendorName?: string;
  siteContact?: string;
  dateIssued?: string;
  targetCompletion?: string;
  technicianLeadId?: string;
  workOrderTemplate?:
    | "general"
    | "nextivity"
    | "security"
    | "low-voltage"
    | "network";
  equipment?: Array<{
    description: string;
    quantity?: string;
    upc?: string;
    serial?: string;
    notes?: string;
    providedBy?: "client" | "techsavvy";
  }>;
  packages?: Array<{
    carrier?: string;
    trackingNumber?: string;
    destination?: "site" | "office";
    description?: string;
  }>;
  requiredDeliverables?: string[];
  scopeTasks?: string[];
  qaChecklist?: string[];
  signatureRequired?: boolean;
  signatureStatus?: 'pending' | 'signed' | 'technician_exception' | 'admin_exception';
  completionStatus?: 'open' | 'completed';
  completedAt?: string;
  completedByUid?: string;
  signatureException?: {
    reason: string;
    notes?: string;
    technicianUid: string;
    createdAt: string;
  };
  signedWorkOrders?: Array<{
    id: string;
    fileName: string;
    url: string;
    completedAt: string;
    technicianName: string;
    customerName: string;
  }>;
  // assignedTechId is retained for existing work orders. New work orders use
  // assignedTechIds so one job can be shared with several technicians.
  assignedTechId?: string;
  assignedTechIds?: string[];
  status?: "voided" | string;
  voidStatus?: "voided";
  voidedAt?: string;
  voidedByUid?: string;
  voidedByRole?: "admin";
  voidReason?: string;
}

export interface TimeEntry {
  id: string;
  jobSite: string;
  address: string;
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  totalHours: string;
  rate: number;
  suppliesCost: number;
  travelCost: number;
  laborStatus: string;
  suppliesStatus: string;
  travelStatus: string;
  status: string;
  qbStatus: string;
  notes: string;
  photos: string[];
  suppliesItems?: Array<{ id: string; description: string; cost: string }>;
  voidStatus?: "requested" | "voided";
  voidRequestedAt?: string;
  voidRequestReason?: string;
  voidedAt?: string;
  voidReason?: string;
  voidAgreedByTechnician?: boolean;
}
