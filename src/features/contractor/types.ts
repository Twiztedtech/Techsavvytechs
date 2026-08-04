export type PortalRole = 'contractor' | 'admin';

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  email: string;
  timestamp: string;
  status: 'Open';
}

export interface Contractor {
  id: string;
  name: string;
  email: string;
  rate: number;
  status: string;
  qboVendorId?: string;
  authUid?: string;
  invitationStatus?: 'ready' | 'sent';
  authProvisionedAt?: string;
  invitedAt?: string;
}

export interface JobSite {
  id: string;
  name: string;
  address: string;
  notes: string;
  hourlyRate: number;
  travelRate: number;
  // assignedTechId is retained for existing work orders. New work orders use
  // assignedTechIds so one job can be shared with several technicians.
  assignedTechId?: string;
  assignedTechIds?: string[];
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
}
