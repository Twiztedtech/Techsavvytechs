import React, { useState, useEffect, lazy, Suspense } from 'react';
import { auth, db, storage } from '../lib/firebase';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { SupportTicketModal } from '../features/contractor/support/SupportTicketModal';
import type { SupportTicket } from '../features/contractor/types';
import { DashboardHeader } from '../features/contractor/layout/DashboardHeader';
import { formatElapsed, getEntryTotals, getGoogleMapsUrl } from '../features/contractor/timesheets/calculations';
import { ContractorOnboardingCard, type OnboardingState } from '../features/contractor/onboarding/ContractorOnboardingCard';

const WorkOrderSigningModal = lazy(() => import('../features/contractor/workOrders/WorkOrderSigningModal').then(({ WorkOrderSigningModal }) => ({ default: WorkOrderSigningModal })));
const TechnicianWorkOrderPreview = lazy(() => import('../features/contractor/workOrders/TechnicianWorkOrderPreview').then(({ TechnicianWorkOrderPreview }) => ({ default: TechnicianWorkOrderPreview })));


export default function ContractorDashboard() {
  // Authentication & View State
  const [userRole, setUserRole] = useState<'contractor' | 'admin'>('contractor');
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('timecards'); // 'timecards' | 'contractors'
  const [contractorsList, setContractorsList] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [invitingContractorId, setInvitingContractorId] = useState<string | null>(null);
  const [checkingInvitationId, setCheckingInvitationId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [reviewingOnboardingId, setReviewingOnboardingId] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [assignedJobIds, setAssignedJobIds] = useState<string[]>([]);
  const [savedTechnicianSignature, setSavedTechnicianSignature] = useState('');

  // Add Contractor Modal State
  const [isAddContractorOpen, setIsAddContractorOpen] = useState(false);
  const [newContractorName, setNewContractorName] = useState('');
  const [newContractorEmail, setNewContractorEmail] = useState('');
  const [newContractorRate, setNewContractorRate] = useState('75');
  const [newContractorSpecialty, setNewContractorSpecialty] = useState('');
  const [isSavingContractor, setIsSavingContractor] = useState(false);
  const [viewingContractorTimecards, setViewingContractorTimecards] = useState<any | null>(null);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setIsAuthenticated(false);
      setUserRole('contractor');
      setCanAccessAdmin(false);
      return;
    }
    setLoginEmail(user.email || '');
    let token = await user.getIdTokenResult();
    if (token.claims.admin !== true) {
      const response = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (response.ok) token = await user.getIdTokenResult(true);
    }
    const isAdmin = token.claims.admin === true;
    const isContractor = token.claims.contractor === true;
    if (!isAdmin && !isContractor) {
      await signOut(auth);
      setIsAuthenticated(false);
      setLoginEmail('');
      setCanAccessAdmin(false);
      alert('This email has not been invited to the Contractor Portal. Please contact TechSavvy for access.');
      return;
    }
    setCanAccessAdmin(isAdmin);
    setUserRole(isAdmin ? 'admin' : 'contractor');
    setIsAuthenticated(true);
  }), []);

  // A contractor's W-9 status is served by a protected API instead of exposing
  // sensitive onboarding details through a broadly readable Firestore record.
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'contractor') {
      setOnboarding(null);
      return;
    }
    let cancelled = false;
    const loadOnboarding = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/portal/onboarding', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load onboarding status.');
        if (!cancelled) setOnboarding(data.onboarding as OnboardingState);
      } catch (error) {
        console.error('Could not load contractor onboarding:', error);
      }
    };
    void loadOnboarding();
    return () => { cancelled = true; };
  }, [isAuthenticated, userRole]);

  // Password Reset Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('idle'); // 'idle' | 'sending' | 'sent'

  // Support Tickets State
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState('QuickBooks Sync Error');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  // Production work orders are loaded from Firestore. Never show seeded demo jobs.
  const [jobSitesList, setJobSitesList] = useState([]);

  // Time Logger Form State
  const [selectedJobId, setSelectedJobId] = useState('');
  const [customJobSite, setCustomJobSite] = useState('');
  const [customJobAddress, setCustomJobAddress] = useState('');
  const [isCustomJob, setIsCustomJob] = useState(false);
  
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [clockIn, setClockIn] = useState('07:00');
  const [clockOut, setClockOut] = useState('15:30');
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [contractorRate, setContractorRate] = useState(55.00); // Admin-approved rate (read-only for tech)
  const [suppliesCost, setSuppliesCost] = useState('0.00');
  const [suppliesItems, setSuppliesItems] = useState([{ id: `supply-${Date.now()}-0`, description: '', cost: '' }]);
  const [travelCost, setTravelCost] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);

  // Active Clock-In / Live Shift Tracking
  const [activeShift, setActiveShift] = useState({
    isClockedIn: false,
    startTime: null,
    jobName: '',
    elapsedSeconds: 0
  });

  // Admin Add Job Form State
  const [adminJobName, setAdminJobName] = useState('');
  const [adminJobAddress, setAdminJobAddress] = useState('');
  const [adminJobNotes, setAdminJobNotes] = useState('');
  const [adminJobWorkOrderNumber, setAdminJobWorkOrderNumber] = useState(() => `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`);
  const [adminJobVendorName, setAdminJobVendorName] = useState('');
  const [adminJobSiteContact, setAdminJobSiteContact] = useState('');
  const [adminJobDateIssued, setAdminJobDateIssued] = useState(() => new Date().toISOString().slice(0, 10));
  const [adminJobTargetCompletion, setAdminJobTargetCompletion] = useState('');
  const [adminJobTechnicianLeadId, setAdminJobTechnicianLeadId] = useState('');
  const [adminJobWorkOrderTemplate, setAdminJobWorkOrderTemplate] = useState<'general' | 'nextivity' | 'security' | 'low-voltage' | 'network'>('general');
  const [adminJobHourlyRate, setAdminJobHourlyRate] = useState('55.00');
  const [adminJobTravelRate, setAdminJobTravelRate] = useState('35.00');
  const [adminJobEquipment, setAdminJobEquipment] = useState([{ description: '', quantity: '', notes: '' }]);
  const [adminJobScopeTasks, setAdminJobScopeTasks] = useState(['']);
  const [adminJobQaChecklist, setAdminJobQaChecklist] = useState(['Scope completed or exceptions noted.', 'Work area cleared and equipment secured.', 'Customer walkthrough completed.']);
  const [adminJobAssignedTechIds, setAdminJobAssignedTechIds] = useState<string[]>(['ALL']);
  const [editingJobId, setEditingJobId] = useState(null);
  const [adminJobFiles, setAdminJobFiles] = useState<File[]>([]);
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [isSigningWorkOrder, setIsSigningWorkOrder] = useState(false);
  const [previewJob, setPreviewJob] = useState(null);
  const [qboConnected, setQboConnected] = useState(false);
  const [qboRealmId, setQboRealmId] = useState('');
  const [jobSitesViewedAt, setJobSitesViewedAt] = useState({});
  const [customersList, setCustomersList] = useState<{ id: string; name: string }[]>([]);

  const getAssignedTechIds = (job) => {
    if (Array.isArray(job.assignedTechIds) && job.assignedTechIds.length > 0) {
      return job.assignedTechIds;
    }
    return [job.assignedTechId || 'ALL'];
  };

  const getAssignmentLabel = (job) => {
    const assignedIds = getAssignedTechIds(job);
    if (assignedIds.includes('ALL')) return 'Anyone (All Techs)';
    return assignedIds
      .map((id) => contractorsList.find((contractor) => contractor.id === id)?.name || id)
      .join(', ');
  };

  const openContractorW9 = async (contractor) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`/api/admin/contractors/onboarding?contractorId=${encodeURIComponent(contractor.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not prepare this W-9 for review.');
      const url = data.url;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Could not open contractor W-9:', error);
      alert('Could not open this W-9. Confirm that the file is still available in secure storage.');
    }
  };

  const reviewContractorOnboarding = async (contractor, status) => {
    let reviewNote = '';
    if (status === 'needs_update') {
      const requestedNote = window.prompt('What needs to be corrected on this W-9? This note will be shown to the contractor.');
      if (requestedNote === null) return;
      reviewNote = requestedNote;
    }
    setReviewingOnboardingId(contractor.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/contractors/onboarding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorId: contractor.id, status, reviewNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the onboarding review.');
      alert(status === 'approved' ? 'W-9 onboarding approved.' : 'The contractor has been asked to update their W-9.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save the onboarding review.');
    } finally {
      setReviewingOnboardingId(null);
    }
  };

  const resetWorkOrderForm = () => {
    setEditingJobId(null);
    setAdminJobName('');
    setAdminJobAddress('');
    setAdminJobNotes('');
    setAdminJobWorkOrderNumber(`WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`);
    setAdminJobVendorName('');
    setAdminJobSiteContact('');
    setAdminJobDateIssued(new Date().toISOString().slice(0, 10));
    setAdminJobTargetCompletion('');
    setAdminJobTechnicianLeadId('');
    setAdminJobWorkOrderTemplate('general');
    setAdminJobHourlyRate('55.00');
    setAdminJobTravelRate('35.00');
    setAdminJobEquipment([{ description: '', quantity: '', notes: '' }]);
    setAdminJobScopeTasks(['']);
    setAdminJobQaChecklist(['Scope completed or exceptions noted.', 'Work area cleared and equipment secured.', 'Customer walkthrough completed.']);
    setAdminJobAssignedTechIds(['ALL']);
    setAdminJobFiles([]);
  };

  // Admins manage the shared job collection directly. Contractors get only
  // their assigned jobs from the authenticated portal API below.
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin') {
      setJobSitesList([]);
      return;
    }
    return onSnapshot(collection(db, 'jobs'), (snapshot) => {
      if (!snapshot.empty) {
        setJobSitesList(snapshot.docs.map((job) => ({ id: job.id, ...job.data() })));
      }
    }, (error) => console.error('Could not load shared work orders:', error));
  }, [isAuthenticated, userRole]);

  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin') {
      setCustomersList([]);
      return;
    }
    return onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomersList(snapshot.docs
        .map((customer) => ({ id: customer.id, name: String(customer.data().name || '').trim() }))
        .filter((customer) => customer.name)
        .sort((left, right) => left.name.localeCompare(right.name)));
    });
  }, [isAuthenticated, userRole]);

  const addCustomer = async () => {
    const requestedName = window.prompt('Customer name');
    const name = requestedName?.trim();
    if (!name) return;

    const existing = customersList.find((customer) => customer.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    if (existing) {
      setAdminJobVendorName(existing.name);
      return;
    }

    try {
      await addDoc(collection(db, 'customers'), { name, createdAt: serverTimestamp() });
      setAdminJobVendorName(name);
    } catch (error) {
      console.error('Could not add customer:', error);
      alert('Could not add the customer. Please try again.');
    }
  };

  const handleAddContractor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContractorName.trim()) {
      alert('Please enter a contractor name.');
      return;
    }
    if (!newContractorEmail.trim()) {
      alert('Please enter a contractor email.');
      return;
    }

    setIsSavingContractor(true);
    try {
      await addDoc(collection(db, 'contractors'), {
        name: newContractorName.trim(),
        email: newContractorEmail.trim().toLowerCase(),
        rate: Number(newContractorRate) || 75,
        specialty: newContractorSpecialty.trim(),
        status: 'active',
        createdAt: serverTimestamp(),
        onboarding: {
          status: 'not_started'
        }
      });

      setNewContractorName('');
      setNewContractorEmail('');
      setNewContractorRate('75');
      setNewContractorSpecialty('');
      setIsAddContractorOpen(false);
      alert('Contractor added successfully!');
    } catch (error) {
      console.error('Error adding contractor:', error);
      alert('Failed to add contractor: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSavingContractor(false);
    }
  };

  useEffect(() => {
    if (jobSitesList.length > 0 && !jobSitesList.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(jobSitesList[0].id);
    }
  }, [jobSitesList, selectedJobId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadTimeClock = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/portal/time-clock', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Could not load time entries.');
        const data = await response.json();
        if (cancelled) return;
        setTimeEntries(data.entries || []);
        setAssignedJobIds(data.assignedJobIds || []);
        setSavedTechnicianSignature(data.technicianSignature || '');
        if (userRole === 'contractor') setJobSitesList(data.jobs || []);
        if (data.activeEntry) {
          const started = new Date(data.activeEntry.clockInAt || data.activeEntry.clockIn).getTime();
          setActiveShift({ isClockedIn: true, startTime: data.activeEntry.clockIn, jobName: data.activeEntry.jobSite, elapsedSeconds: Math.max(0, Math.floor((Date.now() - started) / 1000)) });
        }
      } catch (error) {
        console.error('Could not load production time clock:', error);
      }
    };
    void loadTimeClock();
    return () => { cancelled = true; };
  }, [isAuthenticated, userRole]);

  const uploadWorkOrderDocuments = async (jobId: string, files: File[]) => {
    return Promise.all(files.map(async (file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const fileRef = ref(storage, `work-order-documents/${jobId}/${Date.now()}-${safeName}`);
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      return {
        name: file.name,
        url: await getDownloadURL(fileRef),
        size: file.size,
        contentType: file.type || 'Document',
        uploadedAt: new Date().toISOString(),
      };
    }));
  };
  // Query the server for QuickBooks status; tokens never enter the browser.
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin') {
      setQboConnected(false);
      setQboRealmId('');
      return;
    }
    const loadStatus = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/admin/quickbooks/status', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!response.ok) throw new Error('Could not load QuickBooks status.');
        const data = await response.json();
        setQboConnected(data.connected === true);
        setQboRealmId(data.realmId || '');
      } catch (error) {
        console.error('QuickBooks status check failed:', error);
        setQboConnected(false);
        setQboRealmId('');
      }
    };
    void loadStatus();
  }, [isAuthenticated, userRole]);

  // Handle QuickBooks Connection Redirect Params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qboConnect = params.get('qbo_connect');
    if (qboConnect === 'success') {
      const realmId = params.get('realmId');
      alert(`🎉 QuickBooks Online connected successfully! (Realm ID: ${realmId})`);
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (qboConnect === 'error') {
      const details = params.get('details');
      alert(`✕ QuickBooks Connection Failed: ${details}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);


  // Auto-fill contractor rates when selecting a predefined job site
  useEffect(() => {
    if (!isCustomJob) {
      const job = jobSitesList.find(j => j.id === selectedJobId);
      if (job) {
        setContractorRate(job.hourlyRate !== undefined ? Number(job.hourlyRate) : 55.00);
        setTravelCost(job.travelRate !== undefined ? Number(job.travelRate).toFixed(2) : '0.00');
      }
    } else {
      setContractorRate(55.00);
      setTravelCost('0.00');
    }
  }, [selectedJobId, isCustomJob, jobSitesList]);

  // Dynamically calculate supplies total cost based on item list
  useEffect(() => {
    const total = suppliesItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    setSuppliesCost(total.toFixed(2));
  }, [suppliesItems]);

  // Calendar Popover Modal State
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // QuickBooks & Invoice Review Modal State
  const [activeInvoice, setActiveInvoice] = useState(null);

  // Admin Selection for Batch Approvals / Rejections
  const [selectedEntryIds, setSelectedEntryIds] = useState([]);

  // Contractor View Navigation & History Filter State
  const [contractorTab, setContractorTab] = useState('logger'); // 'logger' | 'history'
  const [historyFilterJob, setHistoryFilterJob] = useState('ALL');
  const [historyFilterStatus, setHistoryFilterStatus] = useState('ALL');

  // Submissions Data
  const [timeEntries, setTimeEntries] = useState([]);

  const totalLifetimeHours = timeEntries
    .reduce((acc, curr) => acc + Number(curr.totalHours || 0), 0)
    .toFixed(2);

  const totalPaidEarnings = timeEntries
    .filter(e => e.qbStatus === 'synced')
    .reduce((acc, curr) => acc + getEntryTotals(curr).totalGross, 0);

  const totalApprovedEarnings = timeEntries
    .filter(e => e.status === 'approved' && e.qbStatus !== 'synced')
    .reduce((acc, curr) => acc + getEntryTotals(curr).totalApproved, 0);

  const totalPendingEarnings = timeEntries
    .filter(e => e.status === 'pending')
    .reduce((acc, curr) => acc + getEntryTotals(curr).totalGross, 0);

  // Active Job Details
  const selectedJobObj = jobSitesList.find(j => j.id === selectedJobId) || jobSitesList[0];

  // Filtered History Entries
  const filteredHistoryEntries = timeEntries.filter(entry => {
    const matchesJob = historyFilterJob === 'ALL' || entry.jobSite === historyFilterJob;
    const matchesStatus =
      historyFilterStatus === 'ALL' ||
      (historyFilterStatus === 'paid' && entry.qbStatus === 'synced') ||
      (historyFilterStatus === 'approved' && entry.status === 'approved' && entry.qbStatus !== 'synced') ||
      (historyFilterStatus === 'pending' && entry.status === 'pending') ||
      (historyFilterStatus === 'rejected' && entry.status === 'rejected');
    return matchesJob && matchesStatus;
  });

  useEffect(() => {
    let timer;
    if (activeShift.isClockedIn) {
      timer = setInterval(() => {
        setActiveShift(prev => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeShift.isClockedIn]);

  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin') return;
    const unsubscribe = onSnapshot(collection(db, 'contractors'), (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      if (list.length > 0) {
        setContractorsList(list);
      }
    });
    return () => unsubscribe();
  }, [isAuthenticated, userRole]);

  // Clear browser-only sample data created by the early portal prototype.
  // This deliberately leaves Firestore records and QuickBooks data untouched.
  useEffect(() => {
    ['tst_job_sites', 'tst_time_entries', 'tst_job_sites_viewed_at', 'tst_support_tickets'].forEach((key) => localStorage.removeItem(key));
  }, []);

  const handleStartShift = async () => {
    const now = new Date();
    const formattedTime = now.toTimeString().slice(0, 5);
    const currentName = isCustomJob ? (customJobSite || 'Custom Job Site') : selectedJobObj?.name;
    if (!currentName) {
      alert('Choose an assigned work order before starting your shift.');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'start', jobId: selectedJobObj.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start the time clock.');
      setActiveShift({ isClockedIn: true, startTime: data.entry.clockIn, jobName: currentName, elapsedSeconds: 0 });
      setClockIn(data.entry.clockIn || formattedTime);
      setLogDate(now.toISOString().split('T')[0]);
      setTimeEntries((current) => [data.entry, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not start the time clock.');
    }
  };

  const handleStopShift = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'stop' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not stop the time clock.');
      setClockOut(data.entry.clockOut);
      setActiveShift((current) => ({ ...current, isClockedIn: false }));
      setTimeEntries((current) => current.map((entry) => entry.id === data.entry.id ? data.entry : entry));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not stop the time clock.');
    }
  };

  const saveTechnicianSignature = async (signatureDataUrl: string) => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/portal/time-clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'save_signature', signatureDataUrl }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save your signature.');
    setSavedTechnicianSignature(data.technicianSignature || signatureDataUrl);
  };

  const calculateHours = (start, end, breakMins) => {
    if (!start || !end) return '0.00';
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    let startTotalMins = startH * 60 + startM;
    let endTotalMins = endH * 60 + endM;

    // Overnight shift check
    if (endTotalMins < startTotalMins) {
      endTotalMins += 24 * 60;
    }

    let netMins = endTotalMins - startTotalMins - Number(breakMins || 0);
    if (netMins < 0) netMins = 0;
    return (netMins / 60).toFixed(2);
  };

  const calculatedHours = calculateHours(clockIn, clockOut, breakMinutes);

  const toggleSelectEntry = (id) => {
    setSelectedEntryIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedEntryIds.length === timeEntries.length) {
      setSelectedEntryIds([]);
    } else {
      setSelectedEntryIds(timeEntries.map(e => e.id));
    }
  };

  const handleBulkStatusChange = (newStatus) => {
    if (selectedEntryIds.length === 0) return;
    setTimeEntries(prev =>
      prev.map(entry =>
        selectedEntryIds.includes(entry.id)
          ? {
              ...entry,
              status: newStatus,
              laborStatus: newStatus,
              suppliesStatus: newStatus,
              travelStatus: newStatus,
              qbStatus: 'pending'
            }
          : entry
      )
    );
    setSelectedEntryIds([]);
  };

  const handleLineItemStatusChange = (entryId, itemType, newStatus) => {
    setTimeEntries(prev =>
      prev.map(entry => {
        if (entry.id !== entryId) return entry;
        const updated = {
          ...entry,
          [`${itemType}Status`]: newStatus
        };

        const statuses = [updated.laborStatus, updated.suppliesStatus, updated.travelStatus];
        if (statuses.every(s => s === 'approved')) {
          updated.status = 'approved';
          updated.qbStatus = 'pending';
        } else if (statuses.every(s => s === 'rejected')) {
          updated.status = 'rejected';
        } else {
          updated.status = 'approved';
        }
        return updated;
      })
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []) as File[];
    const filePreviews = files.map(file => URL.createObjectURL(file));
    setUploadedPhotos(prev => [...prev, ...filePreviews]);
  };

  const handleSubmitLog = (e) => {
    e.preventDefault();
    const finalJobName = isCustomJob ? customJobSite : selectedJobObj?.name;
    const finalAddress = isCustomJob ? customJobAddress : selectedJobObj?.address;
    if (!finalJobName) return;

    const newEntry = {
      id: `te-${Date.now().toString().slice(-4)}`,
      jobSite: finalJobName,
      address: finalAddress || 'Address on file',
      date: logDate,
      clockIn,
      clockOut,
      breakMinutes: Number(breakMinutes),
      totalHours: calculatedHours,
      rate: Number(contractorRate),
      suppliesCost: Number(suppliesCost || 0),
      suppliesItems: suppliesItems.filter(item => item.description.trim() !== '' || item.cost.trim() !== ''),
      travelCost: Number(travelCost || 0),
      laborStatus: 'pending',
      suppliesStatus: 'pending',
      travelStatus: 'pending',
      notes,
      status: 'pending',
      qbStatus: 'pending',
      photos: [...uploadedPhotos],
    };

    setTimeEntries([newEntry, ...timeEntries]);

    if (isCustomJob && customJobSite) {
      const newJobObj = {
        id: `j-${Date.now().toString().slice(-4)}`,
        name: customJobSite,
        address: customJobAddress || 'Site Location Unspecified',
        notes: 'User added custom job site',
        hourlyRate: Number(contractorRate),
        travelRate: Number(travelCost || 0)
      };
      setJobSitesList(prev => [...prev, newJobObj]);
      setSelectedJobId(newJobObj.id);
      setIsCustomJob(false);
      setCustomJobSite('');
      setCustomJobAddress('');
    }

    setNotes('');
    setSuppliesCost('0.00');
    setSuppliesItems([{ id: `supply-${Date.now()}-0`, description: '', cost: '' }]);
    setTravelCost('0.00');
    setUploadedPhotos([]);
    setActiveInvoice(newEntry);
  };

  const renderCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="h-8"></div>);
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isSelected = logDate === dateStr;
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => {
            setLogDate(dateStr);
            setIsCalendarOpen(false);
          }}
          className={`h-8 w-8 rounded-full text-xs font-bold transition flex items-center justify-center mx-auto ${
            isSelected
              ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
              : isToday
              ? 'border border-amber-500 text-amber-400 bg-amber-500/10'
              : 'text-slate-200 hover:bg-slate-800'
          }`}
        >
          {day}
        </button>
      );
    }
    return days;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-block bg-amber-500 text-slate-950 font-black px-3 py-1 rounded text-sm tracking-tight mb-2">
              TECH SAVVY TECHS
            </div>
            <h1 className="text-2xl font-black text-white">Log in to your account</h1>
            <p className="text-xs text-slate-400">Use your work email or a connected sign-in provider.</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
              } catch (error) {
                alert(error instanceof Error ? error.message : 'Unable to sign in.');
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email address</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-300">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(loginEmail);
                    setResetStatus('idle');
                    setIsResetModalOpen(true);
                  }}
                  className="text-xs text-amber-400 hover:underline font-semibold"
                >
                  Forgot Password?
                </button>
              </div>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded text-sm transition shadow-lg shadow-amber-500/10"
            >
              Continue with Email
            </button>
          </form>

          <div className="relative flex items-center py-1" aria-hidden="true">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-4 text-[10px] font-bold tracking-[0.2em] text-slate-500">OR</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={isGoogleSigningIn}
              onClick={async () => {
                setIsGoogleSigningIn(true);
                try {
                  const provider = new GoogleAuthProvider();
                  provider.setCustomParameters({ prompt: 'select_account' });
                  await signInWithPopup(auth, provider);
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Unable to sign in with Google.');
                } finally {
                  setIsGoogleSigningIn(false);
                }
              }}
              className="w-full flex items-center justify-center gap-3 border border-slate-700 hover:border-amber-500/80 hover:bg-slate-800 disabled:opacity-60 text-slate-100 font-bold py-2.5 rounded text-sm transition"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-black text-blue-600">G</span>
              {isGoogleSigningIn ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <button
              type="button"
              disabled
              title="Apple sign-in will be enabled after Apple account setup is complete."
              className="w-full flex items-center justify-center gap-3 border border-slate-800 text-slate-500 font-bold py-2.5 rounded text-sm cursor-not-allowed"
            >
              <span className="text-base leading-none"></span>
              Continue with Apple — coming soon
            </button>
          </div>

          <div className="text-center text-[11px] text-slate-500 border-t border-slate-800 pt-4">
            Protected by Firebase Authentication & Firestore Security Rules
      </div>

    </div>

        {/* PASSWORD RESET MODAL */}
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 text-lg">🔑</span>
                  <h3 className="font-bold text-sm text-slate-100">Reset Portal Password</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  ×
                </button>
              </div>

              {resetStatus === 'sent' ? (
                <div className="space-y-4 text-center py-4">
                  <div className="w-12 h-12 bg-green-500/10 text-green-400 border border-green-500/30 rounded-full flex items-center justify-center text-xl mx-auto">
                    ✓
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-white">Reset Link Transmitted</h4>
                    <p className="text-xs text-slate-400">
                      If an account exists for <strong className="text-amber-400">{resetEmail}</strong>, password recovery instructions have been dispatched.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 rounded text-xs transition"
                  >
                    Return to Login Screen
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setResetStatus('sending');
                    try {
                      await sendPasswordResetEmail(auth, resetEmail);
                      setResetStatus('sent');
                    } catch (error) {
                      setResetStatus('idle');
                      alert(error instanceof Error ? error.message : 'Unable to send the reset email.');
                    }
                  }}
                  className="space-y-4"
                >
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Enter your registered contractor email below. A secure password reset link will be transmitted via Firebase Authentication.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contractor Email</label>
                    <input
                      type="email"
                      required
                      placeholder="contractor@techsavvytechs.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsResetModalOpen(false)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetStatus === 'sending'}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded text-xs transition flex items-center justify-center gap-2"
                    >
                      {resetStatus === 'sending' ? 'Transmitting...' : 'Send Reset Link'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <DashboardHeader
        role={userRole}
        canAccessAdmin={canAccessAdmin}
        onRoleChange={(role) => {
          if (canAccessAdmin) setUserRole(role);
        }}
        onContactAdmin={() => {
          setSupportSubject('QuickBooks Sync Error');
          setSupportEmail(loginEmail || '');
          setIsSupportModalOpen(true);
        }}
        onSignOut={() => void signOut(auth)}
      />

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {userRole === 'contractor' ? (
          /* CONTRACTOR VIEW: TIME & PHOTO LOGGING + HISTORICAL EARNINGS LEDGER */
          <div className="space-y-6">
            <ContractorOnboardingCard onboarding={onboarding} onUpdated={setOnboarding} />
            
            {/* CONTRACTOR LIFETIME EARNINGS OVERVIEW CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Paid (QB Synced)</span>
                <div className="text-2xl font-black text-green-400 font-mono">
                  ${totalPaidEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-slate-500">Processed & verified payments</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Approved (Awaiting QB Payout)</span>
                <div className="text-2xl font-black text-amber-400 font-mono">
                  ${totalApprovedEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-slate-500">Authorized by Admin</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pending Approval</span>
                <div className="text-2xl font-black text-slate-300 font-mono">
                  ${totalPendingEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-slate-500">Under manager review</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Lifetime Hours</span>
                <div className="text-2xl font-black text-amber-500 font-mono">
                  {totalLifetimeHours} hrs
                </div>
                <p className="text-[10px] text-slate-500">Across all assigned job sites</p>
              </div>
            </div>

            {/* CONTRACTOR VIEW TABS */}
            <div className="flex border-b border-slate-800 gap-4">
              <button
                type="button"
                onClick={() => setContractorTab('logger')}
                className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                  contractorTab === 'logger'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📝</span>
                <span>Clock In & Submit Daily Hours</span>
              </button>
              <button
                type="button"
                onClick={() => setContractorTab('history')}
                className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                  contractorTab === 'history'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📊</span>
                <span>Work & Earnings History Ledger</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
                  {timeEntries.length}
                </span>
              </button>
            </div>

            {contractorTab === 'logger' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* LEFT COLUMN: LIVE CLOCK-IN & TIME LOG FORM */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                  
                  {/* LIVE SHIFT / ONSITE CLOCK-IN BANNER */}
                  <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${activeShift.isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          {activeShift.isClockedIn ? 'Live Shift Active' : 'Onsite Clock-In Status'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {activeShift.isClockedIn 
                          ? `Clocked in at ${activeShift.startTime} on ${activeShift.jobName}`
                          : 'Press start when arriving at the job site to track active hours.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {activeShift.isClockedIn && (
                        <span className="text-lg font-mono font-black text-amber-400 bg-amber-500/10 px-3 py-1 rounded border border-amber-500/30">
                          {formatElapsed(activeShift.elapsedSeconds)}
                        </span>
                      )}

                      {!activeShift.isClockedIn ? (
                        <button
                          type="button"
                          onClick={handleStartShift}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs transition shadow-lg shadow-green-600/20 flex items-center gap-1.5"
                        >
                          🟢 Clock In Now
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStopShift}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs transition shadow-lg shadow-red-600/20 flex items-center gap-1.5"
                        >
                          🔴 Clock Out Now
                        </button>
                      )}
                    </div>
                  </div>

                  {/* FORM SECTION */}
                  <form onSubmit={handleSubmitLog} className="space-y-4">
                    {/* JOB SITE SELECTOR & GOOGLE MAPS LINK */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">Job Site / Project Name *</label>
                      
                      {!isCustomJob ? (
                        <select
                          value={selectedJobId}
                          onChange={(e) => {
                            if (e.target.value === '__NEW__') {
                              setIsCustomJob(true);
                            } else {
                              setSelectedJobId(e.target.value);
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          {jobSitesList.filter((job) => {
                            const assignedIds = getAssignedTechIds(job);
                            return userRole === 'admin' || assignedIds.includes('ALL') || assignedJobIds.includes(job.id);
                          }).map((site) => (
                            <option key={site.id} value={site.id} className="bg-slate-900 text-slate-100 py-1">
                              {site.name}
                            </option>
                          ))}
                          <option value="__NEW__" className="bg-slate-900 text-amber-400 font-bold py-1">
                            + Add Custom Job Site...
                          </option>
                        </select>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            required
                            placeholder="Type new job site name..."
                            value={customJobSite}
                            onChange={(e) => setCustomJobSite(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="Job site street address (optional)..."
                            value={customJobAddress}
                            onChange={(e) => setCustomJobAddress(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => setIsCustomJob(false)}
                            className="text-xs text-slate-400 hover:text-white underline font-semibold"
                          >
                            Cancel Custom Job
                          </button>
                        </div>
                      )}

                      {/* GOOGLE MAPS ADDRESS LINK */}
                      {!isCustomJob && selectedJobObj?.address && (
                        <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs text-slate-300">
                          <div className="flex items-center gap-2 truncate mr-2">
                            <span className="text-amber-500">📍</span>
                            <span className="truncate text-slate-400">{selectedJobObj.address}</span>
                          </div>
                          <a
                            href={getGoogleMapsUrl(selectedJobObj.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-bold rounded text-[11px] transition shrink-0 flex items-center gap-1"
                          >
                            <span>🗺️ Get Directions</span>
                          </a>
                        </div>
                      )}

                      {/* JOB INSTRUCTIONS & MANAGER UPDATES NOTIFICATION */}
                      {!isCustomJob && selectedJobObj && (
                        <div className="space-y-2">
                          {/* Real-time Notification Banner */}
                          {selectedJobObj.updatedAt && (!jobSitesViewedAt[selectedJobObj.id] || new Date(selectedJobObj.updatedAt) > new Date(jobSitesViewedAt[selectedJobObj.id])) && (
                            <div className="bg-amber-500/10 border border-amber-500/40 p-3 rounded-lg text-xs text-amber-300 space-y-2 flex flex-col sm:flex-row justify-between sm:items-center gap-2 animate-pulse">
                              <div>
                                <span className="font-bold block">⚠️ Site Update Detected</span>
                                <span>The manager updated the instructions for this job. Please review below.</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setJobSitesViewedAt(prev => ({
                                    ...prev,
                                    [selectedJobObj.id]: new Date().toISOString()
                                  }));
                                }}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] transition uppercase cursor-pointer self-start sm:self-center"
                              >
                                Acknowledge
                              </button>
                            </div>
                          )}

                          {/* Site Instructions / Notes Card */}
                          <div className={`p-3 rounded-lg text-xs space-y-1 transition ${
                            selectedJobObj.updatedAt && (!jobSitesViewedAt[selectedJobObj.id] || new Date(selectedJobObj.updatedAt) > new Date(jobSitesViewedAt[selectedJobObj.id]))
                              ? 'bg-amber-500/5 border border-amber-500/30'
                              : 'bg-slate-950/40 border border-slate-800'
                          }`}>
                            <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Site Instructions / Notes:</span>
                            <p className="text-slate-200 leading-relaxed font-mono">{selectedJobObj.notes || 'No special instructions recorded.'}</p>
                          </div>

                          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-bold uppercase tracking-wider text-[10px] text-green-400">Field Service Work Order</span>
                              {selectedJobObj.workOrderNumber && <span className="font-mono text-[10px] text-slate-400">{selectedJobObj.workOrderNumber}</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
                              <span className="text-slate-500">Vendor</span><span>{selectedJobObj.vendorName || 'Not specified'}</span>
                              <span className="text-slate-500">Site contact</span><span>{selectedJobObj.siteContact || 'Not specified'}</span>
                              <span className="text-slate-500">Target completion</span><span>{selectedJobObj.targetCompletion || 'Not specified'}</span>
                            </div>
                            <button type="button" onClick={() => setIsSigningWorkOrder(true)} className="w-full mt-1 rounded bg-green-500 hover:bg-green-400 px-3 py-2 text-[11px] font-bold text-slate-950 transition">
                              Complete & Sign Work Order
                            </button>
                          </div>

                          {selectedJobObj.signedWorkOrders?.length ? (
                            <div className="rounded-lg border border-green-500/20 bg-slate-950/40 p-3 text-xs space-y-2">
                              <span className="block font-semibold uppercase tracking-wider text-[10px] text-green-400">Signed Work Orders</span>
                              {selectedJobObj.signedWorkOrders.map((workOrder) => (
                                <a key={workOrder.id} href={workOrder.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded border border-slate-700 px-2.5 py-2 text-slate-200 hover:border-green-500 hover:text-green-300 transition">
                                  <span className="truncate">✓ {workOrder.fileName}</span><span className="shrink-0 text-[10px] text-slate-500">Open ↗</span>
                                </a>
                              ))}
                            </div>
                          ) : null}

                          <div className="p-3 rounded-lg text-xs space-y-2 bg-slate-950/40 border border-slate-800">
                            <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Work Order Documents</span>
                            {selectedJobObj.attachments?.length ? (
                              <div className="space-y-1.5">
                                {selectedJobObj.attachments.map((attachment) => (
                                  <a
                                    key={attachment.url}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between gap-3 rounded border border-slate-700 px-2.5 py-2 text-slate-200 hover:border-amber-500 hover:text-amber-300 transition"
                                  >
                                    <span className="truncate">📎 {attachment.name}</span>
                                    <span className="shrink-0 text-[10px] text-slate-500">Open ↗</span>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-slate-500">No documents attached to this work order.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* WORK DATE WITH INTERACTIVE CALENDAR POPOVER */}
                    <div className="relative">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Work Date *</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          required
                          value={logDate}
                          onChange={(e) => setLogDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded text-xs font-bold border border-slate-700 flex items-center gap-1 shrink-0"
                        >
                          📅 Calendar
                        </button>
                      </div>

                      {/* CALENDAR POPOVER MODAL */}
                      {isCalendarOpen && (
                        <div className="absolute top-full left-0 mt-2 z-50 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl w-72 space-y-3 text-slate-100">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                              className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-950 text-xs font-bold"
                            >
                              ◄
                            </button>
                            <span className="text-xs font-bold font-mono text-amber-400">
                              {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                              className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-950 text-xs font-bold"
                            >
                              ►
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500">
                            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {renderCalendarDays()}
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => {
                                setLogDate(new Date().toISOString().split('T')[0]);
                                setIsCalendarOpen(false);
                              }}
                              className="text-[10px] font-bold text-amber-400 hover:underline"
                            >
                              Select Today
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsCalendarOpen(false)}
                              className="text-[10px] font-bold text-slate-400 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TIME & RATE GRID */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Clock In</label>
                        <input
                          type="time"
                          value={clockIn}
                          onChange={(e) => setClockIn(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Clock Out</label>
                        <input
                          type="time"
                          value={clockOut}
                          onChange={(e) => setClockOut(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Break (Mins)</label>
                        <input
                          type="number"
                          value={breakMinutes}
                          onChange={(e) => setBreakMinutes(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Rate ($/hr)</label>
                        {/* LOCKED READ-ONLY RATE */}
                        <div className="w-full bg-slate-950/80 border border-slate-800/80 rounded px-2.5 py-1.5 text-xs text-slate-300 font-mono font-bold flex items-center justify-between">
                          <span>${contractorRate.toFixed(2)}</span>
                          <span className="text-[9px] text-amber-500 bg-amber-500/10 px-1 rounded">🔒 Admin</span>
                        </div>
                      </div>
                    </div>

                     {/* EXPENSES & REIMBURSEMENTS SECTION (SUPPLIES & TRAVEL) */}
                    <div className="space-y-4 pt-2">
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                        <label className="block text-xs font-bold text-slate-300">
                          📦 Supplies & Materials Purchases (Receipt Itemization)
                        </label>
                        
                        <div className="space-y-2">
                          {suppliesItems.map((item, index) => (
                            <div key={item.id} className="flex gap-2 items-center">
                              <input
                                type="text"
                                placeholder="e.g., 2x Junction Box, 50ft CAT6"
                                value={item.description}
                                onChange={(e) => {
                                  const updated = [...suppliesItems];
                                  updated[index].description = e.target.value;
                                  setSuppliesItems(updated);
                                }}
                                className="flex-grow bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                              />
                              <div className="relative w-28 shrink-0">
                                <span className="absolute left-2 top-1.5 text-[10px] text-slate-500">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={item.cost}
                                  onChange={(e) => {
                                    const updated = [...suppliesItems];
                                    updated[index].cost = e.target.value;
                                    setSuppliesItems(updated);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-800 rounded pl-5 pr-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                                />
                              </div>
                              {suppliesItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSuppliesItems(suppliesItems.filter(x => x.id !== item.id));
                                  }}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-400 rounded transition cursor-pointer"
                                  title="Delete Item"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-800/60">
                          <button
                            type="button"
                            onClick={() => {
                              setSuppliesItems([...suppliesItems, { id: `supply-${Date.now()}-${suppliesItems.length}`, description: '', cost: '' }]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-bold rounded text-[10px] transition cursor-pointer"
                          >
                            + Add Line Item
                          </button>
                          <span className="text-xs font-mono font-bold text-slate-400">
                            Supplies Total: <span className="text-amber-500">${Number(suppliesCost).toFixed(2)}</span>
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          🚗 Travel, Gas & Mileage Allowance ($)
                        </label>
                        <input
                          type="number"
                          value={travelCost}
                          readOnly
                          aria-label="Admin-assigned travel allowance"
                          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 font-mono cursor-not-allowed"
                        />
                        <span className="text-[10px] text-slate-500 block mt-1">Fixed allowance set by TechSavvy administration for this work order.</span>
                      </div>
                    </div>

                    {/* TOTAL CALCULATED HOURS & PAYABLE SUMMARY */}
                    <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Labor Duration: <strong className="text-slate-200">{calculatedHours} hrs</strong> @ ${contractorRate}/hr</span>
                        <span className="font-mono">${(Number(calculatedHours) * contractorRate).toFixed(2)}</span>
                      </div>
                      {(Number(suppliesCost) > 0 || Number(travelCost) > 0) && (
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Supplies (${Number(suppliesCost || 0).toFixed(2)}) + Travel (${Number(travelCost || 0).toFixed(2)})</span>
                          <span className="font-mono">+${(Number(suppliesCost || 0) + Number(travelCost || 0)).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-800 pt-1.5 flex justify-between items-center">
                        <span className="text-slate-300 font-bold">Total Shift Claim:</span>
                        <span className="font-mono font-black text-amber-400 text-base">
                          ${(Number(calculatedHours) * contractorRate + Number(suppliesCost || 0) + Number(travelCost || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* NOTES FIELD */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Work Description & Site Notes</label>
                      <textarea
                        rows={3}
                        placeholder="Describe completed electrical tasks, conduit runs, or safety inspection details..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                      />
                    </div>

                    {/* PHOTO UPLOAD */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">Job Completion Photos (Field Verification)</label>
                      <div className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-xl p-4 text-center transition cursor-pointer relative bg-slate-950/40">
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <span className="text-2xl">📷</span>
                          <p className="text-xs font-bold text-slate-300">Tap to Take or Upload Job Photos</p>
                          <p className="text-[10px] text-slate-500">Supports JPG, PNG with auto-compression</p>
                        </div>
                      </div>

                      {uploadedPhotos.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pt-2">
                          {uploadedPhotos.map((src, i) => (
                            <img key={i} src={src} alt="Upload preview" className="w-16 h-16 object-cover rounded-lg border border-slate-700 shrink-0" />
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
                    >
                      <span>Submit Time Entry for Review</span>
                      <span>→</span>
                    </button>
                  </form>
                </div>

                {/* RIGHT COLUMN: SUBMISSION HISTORY */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                    <h3 className="font-bold text-sm text-slate-100">Recent Time Logs</h3>
                    <button
                      type="button"
                      onClick={() => setContractorTab('history')}
                      className="text-[11px] text-amber-400 hover:underline font-semibold"
                    >
                      View Full History →
                    </button>
                  </div>

                  <div className="space-y-3">
                    {timeEntries.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2 hover:border-slate-700 transition">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-xs font-bold text-slate-200">{entry.jobSite}</h4>
                            <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{entry.notes}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                            entry.status === 'approved' 
                              ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                              : entry.status === 'rejected'
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {entry.status === 'rejected' ? 'Not Approved' : entry.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                          <span>{entry.date}</span>
                          <span className="text-slate-200 font-bold">{entry.totalHours} hrs (${getEntryTotals(entry).totalGross.toFixed(2)})</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[11px]">
                          <span className="text-slate-500">📷 {entry.photos?.length || 0} Photos</span>
                          <button
                            type="button"
                            onClick={() => setActiveInvoice(entry)}
                            className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                          >
                            Review time entry
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Work & Earnings History Ledger</h3>
                    <p className="text-xs text-slate-400">Complete itemized record of submitted hours, supplies, and travel reimbursements.</p>
                  </div>

                  {/* HISTORY FILTERS */}
                  <div className="flex items-center gap-3">
                    <div>
                      <select
                        value={historyFilterJob}
                        onChange={(e) => setHistoryFilterJob(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="ALL">All Job Sites</option>
                        {jobSitesList.map((site) => (
                          <option key={site.id} value={site.name}>{site.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <select
                        value={historyFilterStatus}
                        onChange={(e) => setHistoryFilterStatus(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="paid">Paid (QB Synced)</option>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending Review</option>
                        <option value="rejected">Not Approved</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* HISTORICAL LEDGER TABLE */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Work Date</th>
                        <th className="p-3">Job Site / Project</th>
                        <th className="p-3">Labor Hours</th>
                        <th className="p-3">Supplies</th>
                        <th className="p-3">Travel</th>
                        <th className="p-3">Total Claim</th>
                        <th className="p-3">Approval Status</th>
                        <th className="p-3">QuickBooks Status</th>
                        <th className="p-3 text-right">Invoice Preview</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredHistoryEntries.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500">
                            No work history records match your selected filters.
                          </td>
                        </tr>
                      ) : (
                        filteredHistoryEntries.map((entry) => {
                          const totals = getEntryTotals(entry);
                          return (
                            <tr key={entry.id} className="hover:bg-slate-950/40 transition">
                              <td className="p-3 font-mono font-semibold text-slate-200">{entry.date}</td>
                              <td className="p-3">
                                <span className="font-bold text-slate-100 block">{entry.jobSite}</span>
                                <span className="text-[11px] text-slate-400 block truncate max-w-xs">{entry.notes || 'No notes attached'}</span>
                              </td>
                              <td className="p-3 font-mono">
                                <div>{entry.totalHours} hrs</div>
                                <div className="text-[10px] text-slate-500">${totals.labor.toFixed(2)}</div>
                              </td>
                              <td className="p-3 font-mono text-slate-300">${totals.supplies.toFixed(2)}</td>
                              <td className="p-3 font-mono text-slate-300">${totals.travel.toFixed(2)}</td>
                              <td className="p-3 font-mono font-bold text-green-400">${totals.totalGross.toFixed(2)}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  entry.status === 'approved'
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                    : entry.status === 'rejected'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {entry.status === 'rejected' ? 'Not Approved' : entry.status}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1 w-max">⏳ Accounting review</span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setActiveInvoice(entry)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded text-[11px] transition"
                                >
                                  View Invoice
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Admin Approval & Payroll Dashboard</h2>
                <p className="text-xs text-slate-400">Review contractor time, supplies, and travel line items independently. Authorize payouts to QuickBooks Online.</p>
              </div>
            </div>

            {/* ADMIN VIEW TABS */}
            <div className="flex border-b border-slate-800 gap-4 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveAdminTab('timecards')}
                className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                  activeAdminTab === 'timecards'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🕒</span>
                <span>Timecards & Line Items</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('jobs')}
                className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                  activeAdminTab === 'jobs'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🗺️</span>
                <span>Job Sites</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
                  {jobSitesList.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('contractors')}
                className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                  activeAdminTab === 'contractors'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>👥</span>
                <span>Contractor Sync (QBO)</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
                  {contractorsList.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('tickets')}
                className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                  activeAdminTab === 'tickets'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🛠️</span>
                <span>Support Tickets</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
                  {supportTickets.filter(t => t.status === 'Open').length}
                </span>
              </button>
            </div>

            {activeAdminTab === 'timecards' && (
              <>
                <div className="flex justify-end gap-2 mb-2">
                  <button
                    type="button"
                    disabled={selectedEntryIds.length === 0}
                    onClick={() => handleBulkStatusChange('approved')}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:hover:bg-slate-800 disabled:hover:text-slate-500 text-white font-bold rounded text-xs transition flex items-center gap-1 cursor-pointer"
                  >
                    ✓ Approve All Selected ({selectedEntryIds.length})
                  </button>
                  <button
                    type="button"
                    disabled={selectedEntryIds.length === 0}
                    onClick={() => handleBulkStatusChange('rejected')}
                    className="px-3 py-1.5 bg-red-600/90 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-slate-800 disabled:hover:text-slate-500 text-white font-bold rounded text-xs transition flex items-center gap-1 cursor-pointer"
                  >
                    ✕ Reject All Selected ({selectedEntryIds.length})
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3 w-10">
                          <input
                            type="checkbox"
                            checked={timeEntries.length > 0 && selectedEntryIds.length === timeEntries.length}
                            onChange={toggleSelectAll}
                            className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Technician</th>
                        <th className="p-3">Job Site & Date</th>
                        <th className="p-3">Item 1: Labor Hours</th>
                        <th className="p-3">Item 2: Supplies</th>
                        <th className="p-3">Item 3: Travel</th>
                        <th className="p-3">Total Payable</th>
                        <th className="p-3 text-right">Entry Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {timeEntries.map((entry) => {
                        const isSelected = selectedEntryIds.includes(entry.id);
                        const totals = getEntryTotals(entry);
                        return (
                          <tr key={entry.id} className={`hover:bg-slate-950/40 ${isSelected ? 'bg-amber-500/5' : ''}`}>
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectEntry(entry.id)}
                                className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                              />
                            </td>
                            <td className="p-3">
                              <span className="font-semibold text-slate-200 block">
                                {contractorsList.find(c => c.authUid === entry.technicianUid)?.name || 'Unknown Tech'}
                              </span>
                              <span className="text-[10px] text-slate-500 block font-mono">
                                {contractorsList.find(c => c.authUid === entry.technicianUid)?.email || 'No Email'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-slate-100 block">{entry.jobSite}</span>
                              <span className="text-[11px] font-mono text-amber-400 block">{entry.date}</span>
                            </td>

                            {/* LINE ITEM 1: LABOR */}
                            <td className="p-3 bg-slate-950/30">
                              <div className="font-mono text-slate-200 font-semibold">{entry.totalHours} hrs @ ${entry.rate || 75}</div>
                              <div className="text-[11px] font-mono text-green-400 mb-1">${totals.labor.toFixed(2)}</div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleLineItemStatusChange(entry.id, 'labor', 'approved')}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    entry.laborStatus === 'approved' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleLineItemStatusChange(entry.id, 'labor', 'rejected')}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    entry.laborStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            </td>

                            {/* LINE ITEM 2: SUPPLIES */}
                            <td className="p-3 bg-slate-950/30">
                              <div className="font-mono text-slate-200 font-semibold">${totals.supplies.toFixed(2)}</div>
                              
                              {/* Display supply items if present */}
                              {((entry.suppliesItems && entry.suppliesItems.length > 0) || (entry.suppliesCost > 0)) && (
                                <div className="text-[10px] text-slate-500 font-mono space-y-0.5 my-1 max-w-[150px] truncate">
                                  {entry.suppliesItems && entry.suppliesItems.length > 0 ? (
                                    entry.suppliesItems.map((item, idx) => (
                                      <div key={idx} className="flex justify-between gap-1 truncate">
                                        <span className="truncate">↳ {item.description || 'Supply'}</span>
                                        <span className="shrink-0 font-bold text-slate-400">${Number(item.cost || 0).toFixed(0)}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex justify-between gap-1 font-mono">
                                      <span>↳ General</span>
                                      <span className="font-bold text-slate-400">${Number(entry.suppliesCost || 0).toFixed(0)}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex gap-1 mt-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleLineItemStatusChange(entry.id, 'supplies', 'approved')}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    entry.suppliesStatus === 'approved' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleLineItemStatusChange(entry.id, 'supplies', 'rejected')}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    entry.suppliesStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            </td>

                            {/* LINE ITEM 3: TRAVEL */}
                            <td className="p-3 bg-slate-950/30">
                              <div className="font-mono text-slate-200 font-semibold">${totals.travel.toFixed(2)}</div>
                              <div className="text-[11px] font-mono text-green-400 mb-1">${totals.travel.toFixed(2)}</div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleLineItemStatusChange(entry.id, 'travel', 'approved')}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    entry.travelStatus === 'approved' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleLineItemStatusChange(entry.id, 'travel', 'rejected')}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    entry.travelStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            </td>

                            <td className="p-3 font-mono font-bold">
                              <span className="text-amber-400 block">${totals.totalApproved.toFixed(2)}</span>
                              {totals.totalGross !== totals.totalApproved && (
                                <span className="text-[9px] text-slate-500 line-through block">${totals.totalGross.toFixed(2)} claimed</span>
                              )}
                            </td>

                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => setActiveInvoice(entry)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded text-[11px] cursor-pointer"
                              >
                                Review entry
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeAdminTab === 'jobs' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* LEFT: ADD / EDIT JOB FORM */}
                  <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>{editingJobId ? '📝' : '➕'}</span> {editingJobId ? 'Edit Job Site' : 'Add New Job Site'}
                    </h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!adminJobName) return;
                        if (!adminJobAssignedTechIds.includes('ALL') && adminJobAssignedTechIds.length === 0) {
                          alert('Assign at least one technician, or choose anyone.');
                          return;
                        }
                        const nowStr = new Date().toISOString();
                        const jobId = editingJobId || `j-${Date.now().toString().slice(-6)}`;
                        const existingJob = jobSitesList.find((job) => job.id === jobId);
                        setIsSavingJob(true);
                        try {
                          const newAttachments = adminJobFiles.length
                            ? await uploadWorkOrderDocuments(jobId, adminJobFiles)
                            : [];
                          const job = {
                            ...existingJob,
                            id: jobId,
                            name: adminJobName,
                            address: adminJobAddress || 'Address on file',
                            notes: adminJobNotes || 'Site instructions unspecified',
                            workOrderNumber: adminJobWorkOrderNumber,
                            vendorName: adminJobVendorName,
                            siteContact: adminJobSiteContact,
                            dateIssued: adminJobDateIssued,
                            targetCompletion: adminJobTargetCompletion,
                            technicianLeadId: adminJobTechnicianLeadId,
                            workOrderTemplate: adminJobWorkOrderTemplate,
                            hourlyRate: Number(adminJobHourlyRate || 0),
                            travelRate: Number(adminJobTravelRate || 0),
                            equipment: adminJobEquipment.filter((item) => item.description.trim()).map((item) => ({
                              description: item.description.trim(),
                              quantity: item.quantity.trim(),
                              notes: item.notes.trim(),
                            })),
                            scopeTasks: adminJobScopeTasks.map((task) => task.trim()).filter(Boolean),
                            qaChecklist: adminJobQaChecklist.map((item) => item.trim()).filter(Boolean),
                            // Keep the original single-value field for backward
                            // compatibility while the array drives multi-tech access.
                            assignedTechId: adminJobAssignedTechIds.includes('ALL')
                              ? 'ALL'
                              : adminJobAssignedTechIds[0],
                            assignedTechIds: adminJobAssignedTechIds,
                            attachments: [...(existingJob?.attachments || []), ...newAttachments],
                            updatedAt: nowStr,
                          };
                          await setDoc(doc(db, 'jobs', jobId), job);
                          setJobSitesList((previous) => {
                            const exists = previous.some((item) => item.id === jobId);
                            return exists ? previous.map((item) => item.id === jobId ? job : item) : [...previous, job];
                          });
                          resetWorkOrderForm();
                        } catch (error) {
                          console.error('Could not save work order:', error);
                          alert('The work order could not be saved. Confirm Firebase Storage is enabled and the latest Firebase rules are published.');
                        } finally {
                          setIsSavingJob(false);
                        }
                      }}
                      className="space-y-3"
                    >
                      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-green-400">Work Order Details</span>
                          <span className="text-[10px] text-slate-500">Used for the signed customer PDF</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Work Order #</label>
                            <input
                              type="text"
                              required
                              value={adminJobWorkOrderNumber}
                              onChange={(e) => setAdminJobWorkOrderNumber(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Work Order Type</label>
                            <select
                              value={adminJobWorkOrderTemplate}
                              onChange={(e) => setAdminJobWorkOrderTemplate(e.target.value as typeof adminJobWorkOrderTemplate)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500"
                            >
                              <option value="general">General field service</option>
                              <option value="nextivity">Nextivity / Cel-Fi</option>
                              <option value="security">Security cameras</option>
                              <option value="low-voltage">Low-voltage cabling</option>
                              <option value="network">Network / Wi-Fi</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <label className="block text-[11px] font-semibold text-slate-400">Vendor / Customer</label>
                            <button type="button" onClick={addCustomer} className="text-[10px] font-bold text-green-300 hover:text-green-200">+ Add customer</button>
                          </div>
                          <select
                            value={adminJobVendorName}
                            onChange={(e) => setAdminJobVendorName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500"
                          >
                            <option value="">Select a customer</option>
                            {[...new Set([...customersList.map((customer) => customer.name), ...jobSitesList.map((job) => job.vendorName).filter(Boolean)])]
                              .sort((left, right) => left.localeCompare(right))
                              .map((customer) => <option key={customer} value={customer}>{customer}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Site Contact</label>
                          <input
                            list="work-order-contacts"
                            placeholder="Name, phone, or email"
                            value={adminJobSiteContact}
                            onChange={(e) => setAdminJobSiteContact(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500"
                          />
                          <datalist id="work-order-contacts">
                            {[...new Set(jobSitesList.map((job) => job.siteContact).filter(Boolean))].map((contact) => <option key={contact} value={contact} />)}
                          </datalist>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date Issued</label>
                            <input type="date" required value={adminJobDateIssued} onChange={(e) => setAdminJobDateIssued(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Completion</label>
                            <input type="date" value={adminJobTargetCompletion} onChange={(e) => setAdminJobTargetCompletion(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Technician Lead</label>
                          <select value={adminJobTechnicianLeadId} onChange={(e) => setAdminJobTechnicianLeadId(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-green-500">
                            <option value="">Choose a technician lead</option>
                            {contractorsList
                              .filter((contractor) => adminJobAssignedTechIds.includes('ALL') || adminJobAssignedTechIds.includes(contractor.id))
                              .map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Assign Technicians</label>
                        <div className="rounded border border-slate-800 bg-slate-900 divide-y divide-slate-800 max-h-48 overflow-y-auto">
                          <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-300 cursor-pointer hover:bg-slate-800/70">
                            <input
                              type="checkbox"
                              checked={adminJobAssignedTechIds.includes('ALL')}
                              onChange={(event) => setAdminJobAssignedTechIds(event.target.checked ? ['ALL'] : [])}
                              className="accent-amber-500"
                            />
                            Anyone (all technicians)
                          </label>
                          {contractorsList.map((contractor) => (
                            <label key={contractor.id} className="flex items-center gap-2 px-3 py-2 text-xs text-slate-200 cursor-pointer hover:bg-slate-800/70">
                              <input
                                type="checkbox"
                                checked={!adminJobAssignedTechIds.includes('ALL') && adminJobAssignedTechIds.includes(contractor.id)}
                                disabled={adminJobAssignedTechIds.includes('ALL')}
                                onChange={(event) => setAdminJobAssignedTechIds((current) => {
                                  const withoutAll = current.filter((id) => id !== 'ALL');
                                  return event.target.checked
                                    ? [...withoutAll, contractor.id]
                                    : withoutAll.filter((id) => id !== contractor.id);
                                })}
                                className="accent-amber-500 disabled:opacity-40"
                              />
                              <span>{contractor.name}</span>
                              <span className="text-slate-500">({contractor.email})</span>
                            </label>
                          ))}
                        </div>
                        {!adminJobAssignedTechIds.includes('ALL') && adminJobAssignedTechIds.length === 0 && (
                          <p className="mt-1 text-[10px] text-red-400">Select at least one technician or choose anyone.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Job Site Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g., Substation Gamma"
                          value={adminJobName}
                          onChange={(e) => setAdminJobName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Address</label>
                        <input
                          type="text"
                          placeholder="e.g., 100 Main St, Sacramento, CA"
                          value={adminJobAddress}
                          onChange={(e) => setAdminJobAddress(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Labor Rate ($/hr) *</label>
                          <input
                            type="number"
                            required
                            step="0.01"
                            placeholder="55.00"
                            value={adminJobHourlyRate}
                            onChange={(e) => setAdminJobHourlyRate(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Travel Rate ($) *</label>
                          <input
                            type="number"
                            required
                            step="0.01"
                            placeholder="35.00"
                            value={adminJobTravelRate}
                            onChange={(e) => setAdminJobTravelRate(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Instructions / Notes</label>
                        <textarea
                          rows={3}
                          placeholder="e.g., Verify safety gear..."
                          value={adminJobNotes}
                          onChange={(e) => setAdminJobNotes(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                        />
                      </div>
                      <div className="space-y-2 rounded border border-green-500/20 bg-green-500/5 p-3">
                        <div className="flex items-center justify-between gap-3"><label className="text-[11px] font-bold uppercase tracking-wider text-green-400">Equipment / materials</label><button type="button" onClick={() => setAdminJobEquipment((items) => [...items, { description: '', quantity: '', notes: '' }])} className="text-[10px] font-bold text-green-300 hover:text-green-200">+ Add item</button></div>
                        {adminJobEquipment.map((item, index) => <div key={`equipment-${index}`} className="grid grid-cols-[1fr_68px_24px] gap-1.5"><input value={item.description} onChange={(event) => setAdminJobEquipment((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, description: event.target.value } : current))} placeholder="Equipment or material" className="min-w-0 rounded bg-slate-900 border border-slate-800 px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-green-500" /><input value={item.quantity} onChange={(event) => setAdminJobEquipment((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, quantity: event.target.value } : current))} placeholder="Qty" className="rounded bg-slate-900 border border-slate-800 px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-green-500" />{adminJobEquipment.length > 1 ? <button type="button" onClick={() => setAdminJobEquipment((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-red-400 hover:text-red-300">×</button> : <span />}</div>)}
                      </div>
                      <div className="space-y-2 rounded border border-green-500/20 bg-green-500/5 p-3">
                        <div className="flex items-center justify-between gap-3"><label className="text-[11px] font-bold uppercase tracking-wider text-green-400">Scope of work</label><button type="button" onClick={() => setAdminJobScopeTasks((tasks) => [...tasks, ''])} className="text-[10px] font-bold text-green-300 hover:text-green-200">+ Add task</button></div>
                        {adminJobScopeTasks.map((task, index) => <div key={`scope-${index}`} className="flex gap-1.5"><input value={task} onChange={(event) => setAdminJobScopeTasks((tasks) => tasks.map((current, taskIndex) => taskIndex === index ? event.target.value : current))} placeholder="Task or installation step" className="min-w-0 flex-1 rounded bg-slate-900 border border-slate-800 px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-green-500" />{adminJobScopeTasks.length > 1 && <button type="button" onClick={() => setAdminJobScopeTasks((tasks) => tasks.filter((_, taskIndex) => taskIndex !== index))} className="px-1 text-red-400 hover:text-red-300">×</button>}</div>)}
                      </div>
                      <div className="space-y-2 rounded border border-green-500/20 bg-green-500/5 p-3">
                        <div className="flex items-center justify-between gap-3"><label className="text-[11px] font-bold uppercase tracking-wider text-green-400">Customer sign-off checklist</label><button type="button" onClick={() => setAdminJobQaChecklist((items) => [...items, ''])} className="text-[10px] font-bold text-green-300 hover:text-green-200">+ Add check</button></div>
                        {adminJobQaChecklist.map((item, index) => <div key={`qa-${index}`} className="flex gap-1.5"><input value={item} onChange={(event) => setAdminJobQaChecklist((items) => items.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} placeholder="Customer confirmation item" className="min-w-0 flex-1 rounded bg-slate-900 border border-slate-800 px-2 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-green-500" />{adminJobQaChecklist.length > 1 && <button type="button" onClick={() => setAdminJobQaChecklist((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="px-1 text-red-400 hover:text-red-300">×</button>}</div>)}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Work Order Documents</label>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.txt,image/*"
                          onChange={(e) => setAdminJobFiles(Array.from(e.target.files || []))}
                          className="w-full text-[11px] text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-2.5 file:py-1.5 file:text-xs file:font-bold file:text-amber-400 hover:file:bg-slate-700"
                        />
                        <p className="mt-1 text-[10px] text-slate-500">PDF, Word, text, or image files; up to 25 MB each. Uploads become available to signed-in technicians.</p>
                        {adminJobFiles.length > 0 && <p className="mt-1 text-[10px] text-amber-400">{adminJobFiles.length} document{adminJobFiles.length === 1 ? '' : 's'} ready to upload.</p>}
                      </div>
                      <div className="flex gap-2">
                        {editingJobId && (
                          <button
                            type="button"
                            onClick={() => {
                              resetWorkOrderForm();
                            }}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-lg text-xs transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={isSavingJob}
                          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60 text-slate-950 font-bold py-2 rounded-lg text-xs transition cursor-pointer"
                        >
                          {isSavingJob ? 'Saving Work Order…' : editingJobId ? 'Update Job Site' : 'Create Job Site'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* RIGHT: JOB SITES DATA TABLE */}
                  <div className="lg:col-span-2 space-y-3">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>📋</span> Active Job Sites List
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                          <tr>
                            <th className="p-3">Job Site / Project</th>
                            <th className="p-3">Assigned Tech</th>
                            <th className="p-3">Rates</th>
                            <th className="p-3">Address</th>
                            <th className="p-3">Instructions / Notes</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {jobSitesList.map((job) => (
                            <tr key={job.id} className={`hover:bg-slate-950/40 ${editingJobId === job.id ? 'bg-amber-500/5' : ''}`}>
                              <td className="p-3 font-semibold text-slate-100">{job.name}</td>
                              <td className="p-3 font-semibold text-slate-300 text-[11px]">
                                {getAssignmentLabel(job)}
                              </td>
                              <td className="p-3 font-mono text-[11px] space-y-0.5">
                                <div className="text-slate-200">🛠️ Labor: <span className="text-amber-400 font-bold">${job.hourlyRate !== undefined ? Number(job.hourlyRate).toFixed(2) : '75.00'}/hr</span></div>
                                <div className="text-slate-400">🚗 Travel: <span className="text-slate-300">${job.travelRate !== undefined ? Number(job.travelRate).toFixed(2) : '35.00'}</span></div>
                              </td>
                              <td className="p-3 text-slate-400 font-mono text-[11px]">{job.address}</td>
                              <td className="p-3 text-slate-400">
                                <div>{job.notes}</div>
                                {job.attachments?.length > 0 && <div className="mt-1 text-[10px] text-amber-400">📎 {job.attachments.length} document{job.attachments.length === 1 ? '' : 's'}</div>}
                              </td>
                              <td className="p-3 text-right space-x-2">
                                <button type="button" onClick={() => setPreviewJob(job)} className="text-green-400 hover:text-green-300 font-bold hover:underline text-[11px] cursor-pointer">Preview Tech View</button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingJobId(job.id);
                                    setAdminJobName(job.name);
                                    setAdminJobAddress(job.address);
                                    setAdminJobNotes(job.notes);
                                    setAdminJobWorkOrderNumber(job.workOrderNumber || `WO-${new Date().getFullYear()}-${job.id.replace(/[^0-9]/g, '').slice(-5)}`);
                                    setAdminJobVendorName(job.vendorName || '');
                                    setAdminJobSiteContact(job.siteContact || '');
                                    setAdminJobDateIssued(job.dateIssued || new Date().toISOString().slice(0, 10));
                                    setAdminJobTargetCompletion(job.targetCompletion || '');
                                    setAdminJobTechnicianLeadId(job.technicianLeadId || '');
                                    setAdminJobWorkOrderTemplate(job.workOrderTemplate || 'general');
                                    setAdminJobHourlyRate((job.hourlyRate !== undefined ? job.hourlyRate : 55.00).toString());
                                    setAdminJobTravelRate((job.travelRate !== undefined ? job.travelRate : 35.00).toString());
                                    setAdminJobEquipment(job.equipment?.length ? job.equipment : [{ description: '', quantity: '', notes: '' }]);
                                    setAdminJobScopeTasks(job.scopeTasks?.length ? job.scopeTasks : [job.notes || '']);
                                    setAdminJobQaChecklist(job.qaChecklist?.length ? job.qaChecklist : ['Scope completed or exceptions noted.', 'Work area cleared and equipment secured.', 'Customer walkthrough completed.']);
                                    setAdminJobAssignedTechIds(getAssignedTechIds(job));
                                    setAdminJobFiles([]);
                                  }}
                                  className="text-amber-400 hover:text-amber-300 font-bold hover:underline text-[11px] cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingJobId === job.id) {
                                      resetWorkOrderForm();
                                    }
                                    setJobSitesList(prev => prev.filter(item => item.id !== job.id));
                                  }}
                                  className="text-red-400 hover:text-red-300 font-bold hover:underline text-[11px] cursor-pointer"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeAdminTab === 'contractors' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800 flex-wrap gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>🔗</span> QuickBooks Online Sync Engine
                    </h3>
                    <p className="text-xs text-slate-400">Sync and link QBO Vendors to your local contractor portal profiles.</p>
                    
                    {/* Status Badge */}
                    <div className="pt-1.5 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${qboConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {qboConnected ? `Connected to Realm ID: ${qboRealmId}` : 'Not Connected to QuickBooks'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddContractorOpen(true)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer animate-fade-in"
                    >
                      ➕ Add Contractor
                    </button>
                    {qboConnected ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm('Are you sure you want to disconnect QuickBooks? This will remove the authentication tokens.')) {
                            try {
                              const idToken = await auth.currentUser?.getIdToken();
                              const response = await fetch('/api/admin/quickbooks/disconnect', {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${idToken}` },
                              });
                              const data = await response.json();
                              if (!response.ok) throw new Error(data.error || 'Could not disconnect QuickBooks.');
                              setQboConnected(false);
                              setQboRealmId('');
                              alert('QuickBooks disconnected successfully.');
                            } catch (err) {
                              alert('Failed to disconnect: ' + (err instanceof Error ? err.message : 'Unknown error'));
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-red-650/20 hover:bg-red-600 text-red-400 hover:text-white font-bold rounded-lg text-xs transition border border-red-500/20 cursor-pointer"
                      >
                        🔌 Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const idToken = await auth.currentUser?.getIdToken();
                            const response = await fetch('/api/auth/quickbooks', {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${idToken}` },
                            });
                            const data = await response.json();
                            if (!response.ok) throw new Error(data.error || 'Could not start QuickBooks connection.');
                            window.location.assign(data.authorizationUrl);
                          } catch (err) {
                            alert('QuickBooks connection failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                          }
                        }}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-green-600/20 cursor-pointer"
                      >
                        🔗 Connect to QuickBooks
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={async () => {
                        setIsSyncing(true);
                        try {
                          const idToken = await auth.currentUser?.getIdToken();
                          const res = await fetch('/api/sync-vendors', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${idToken}` },
                          });
                          const data = await res.json();
                          if (data.success) {
                            alert(data.message);
                          } else {
                            alert('Sync failed: ' + (data.error || 'Unknown error'));
                          }
                      } catch (err) {
                        alert('Sync request failed: ' + err.message);
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSyncing ? '🔄 Syncing QBO...' : '🔄 Run Sync Script'}
                  </button>
                </div>
              </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Contractor Name</th>
                        <th className="p-3">Email Address</th>
                        <th className="p-3">Default Rate</th>
                        <th className="p-3">QBO Vendor ID</th>
                        <th className="p-3 text-right">Status</th>
                        <th className="p-3 text-right">W-9 Onboarding</th>
                        <th className="p-3 text-right">Portal Access</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {contractorsList.map((cont) => (
                        <tr key={cont.id} className="hover:bg-slate-950/40">
                          <td className="p-3 font-semibold text-slate-100">{cont.name}</td>
                          <td className="p-3 font-mono">{cont.email}</td>
                          <td className="p-3 font-mono">${cont.rate || 75}/hr</td>
                          <td className="p-3 font-mono text-amber-500 font-bold">
                            {cont.qboVendorId ? `#${cont.qboVendorId}` : 'Not Linked'}
                          </td>
                          <td className="p-3 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/10 text-green-400 border border-green-500/20">
                              {cont.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {(() => {
                              const onboardingStatus = cont.onboarding?.status || 'not_started';
                              const isReviewing = reviewingOnboardingId === cont.id;
                              const hasW9 = Boolean(cont.onboarding?.w9?.storagePath);
                              const statusClass = onboardingStatus === 'approved'
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : onboardingStatus === 'submitted'
                                  ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                                  : onboardingStatus === 'needs_update'
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                    : 'bg-slate-800 text-slate-400 border-slate-700';
                              return <div className="flex min-w-[190px] flex-col items-end gap-1.5">
                                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${statusClass}`}>{onboardingStatus.replace('_', ' ')}</span>
                                {hasW9 ? <div className="flex flex-wrap justify-end gap-1">
                                  <button type="button" onClick={() => void openContractorW9(cont)} className="rounded border border-slate-600 px-2 py-1 text-[10px] font-bold text-slate-200 hover:border-slate-400">Open W-9</button>
                                  {onboardingStatus !== 'approved' ? <button type="button" disabled={isReviewing} onClick={() => void reviewContractorOnboarding(cont, 'approved')} className="rounded border border-green-500/40 px-2 py-1 text-[10px] font-bold text-green-300 hover:bg-green-500 hover:text-slate-950 disabled:opacity-50">Approve</button> : null}
                                  {onboardingStatus !== 'needs_update' ? <button type="button" disabled={isReviewing} onClick={() => void reviewContractorOnboarding(cont, 'needs_update')} className="rounded border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-50">Request update</button> : null}
                                </div> : <span className="text-[10px] text-slate-500">No W-9 submitted</span>}
                              </div>;
                            })()}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex min-w-[165px] flex-col items-end gap-1.5 font-sans">
                            <button
                              type="button"
                              onClick={() => setViewingContractorTimecards(cont)}
                              className="px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                            >
                              📅 View History
                            </button>
                            <button
                              type="button"
                              disabled={!cont.email || invitingContractorId === cont.id}
                              onClick={async () => {
                                if (!confirm(`Send a branded TechSavvy portal invitation to ${cont.email}?`)) return;
                                setInvitingContractorId(cont.id);
                                try {
                                  const idToken = await auth.currentUser?.getIdToken();
                                  const response = await fetch('/api/admin/contractors/invite', {
                                    method: 'POST',
                                    headers: {
                                      Authorization: `Bearer ${idToken}`,
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({ contractorId: cont.id }),
                                  });
                                  const data = await response.json();
                                  if (!response.ok) throw new Error(data.error || 'Could not send this invitation.');
                                  alert(`Branded portal invitation sent to ${data.email}.`);
                                } catch (error) {
                                  alert(error instanceof Error ? error.message : 'Could not send the contractor invitation.');
                                } finally {
                                  setInvitingContractorId(null);
                                }
                              }}
                              className="px-2.5 py-1 rounded border border-amber-500/30 text-[10px] font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {invitingContractorId === cont.id
                                ? 'Sending…'
                                : cont.invitationStatus === 'sent'
                                  ? 'Resend Branded Invite'
                                  : 'Send Branded Invite'}
                            </button>
                            {cont.invitationDelivery?.emailId ? <button
                              type="button"
                              disabled={checkingInvitationId === cont.id}
                              onClick={async () => {
                                setCheckingInvitationId(cont.id);
                                try {
                                  const idToken = await auth.currentUser?.getIdToken();
                                  const response = await fetch(`/api/admin/contractors/invitation-status?contractorId=${encodeURIComponent(cont.id)}`, {
                                    headers: { Authorization: `Bearer ${idToken}` },
                                  });
                                  const data = await response.json();
                                  if (!response.ok) throw new Error(data.error || 'Could not check invitation delivery.');
                                  alert(`Email provider status: ${String(data.status).replace('_', ' ')}.`);
                                } catch (error) {
                                  alert(error instanceof Error ? error.message : 'Could not check invitation delivery.');
                                } finally {
                                  setCheckingInvitationId(null);
                                }
                              }}
                              className="text-[10px] font-bold text-sky-300 underline underline-offset-2 hover:text-sky-200 disabled:opacity-50"
                            >
                              {checkingInvitationId === cont.id
                                ? 'Checking delivery…'
                                : `Delivery: ${String(cont.invitationDelivery.status || 'accepted').replace('_', ' ')}`}
                            </button> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeAdminTab === 'tickets' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800 flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>🛠️</span> Support & Sync Tickets Ledger
                    </h3>
                    <p className="text-xs text-slate-400">View and resolve support requests submitted by portal contractors.</p>
                  </div>
                  <div className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
                    Total Tickets: <span className="text-amber-500 font-bold">{supportTickets.length}</span>
                  </div>
                </div>

                {supportTickets.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950/20 border border-slate-800/40 rounded-xl space-y-2">
                    <span className="text-2xl">🎉</span>
                    <p className="text-xs text-slate-400 font-medium">All clear! No support tickets have been reported.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3 w-24">Ticket ID</th>
                          <th className="p-3 w-40">Submitted At</th>
                          <th className="p-3">User Email</th>
                          <th className="p-3">Issue Category</th>
                          <th className="p-3">Message Details</th>
                          <th className="p-3 w-28 text-center">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {supportTickets.map((ticket) => (
                          <tr key={ticket.id} className="hover:bg-slate-950/40 align-top">
                            <td className="p-3 font-mono font-bold text-amber-500">#{ticket.id}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-400">{ticket.timestamp}</td>
                            <td className="p-3 font-mono text-slate-200">{ticket.email}</td>
                            <td className="p-3 font-semibold text-slate-100">{ticket.subject}</td>
                            <td className="p-3 text-slate-400 max-w-xs whitespace-pre-wrap">{ticket.message}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ticket.status === 'Resolved'
                                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {ticket.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {ticket.status === 'Open' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSupportTickets(prev =>
                                      prev.map(t => t.id === ticket.id ? { ...t, status: 'Resolved' } : t)
                                    );
                                  }}
                                  className="px-2 py-1 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white font-bold rounded text-[10px] transition cursor-pointer"
                                >
                                  Resolve
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSupportTickets(prev => prev.filter(t => t.id !== ticket.id));
                                  }}
                                  className="text-red-400 hover:text-red-300 font-bold hover:underline text-[11px] cursor-pointer"
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {}
      {activeInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded">
                    QuickBooks Integration
                  </span>
                  <span className="text-xs text-slate-400">Itemized Vendor Bill</span>
                </div>
                <h3 className="text-lg font-bold text-slate-100">{activeInvoice.jobSite}</h3>
              </div>
              <button 
                onClick={() => setActiveInvoice(null)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                ×
              </button>
            </div>

            {/* INVOICE BREAKDOWN TABLE WITH ITEMIZED LINE ITEMS */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                <span>Line Item Description</span>
                <span className="text-right">Approved Amount</span>
              </div>

              {/* LINE ITEM 1: LABOR */}
              <div className="flex justify-between text-xs py-1 border-b border-slate-900">
                <div>
                  <p className="font-semibold text-slate-200">1. Contractor Labor</p>
                  <p className="text-[10px] text-slate-400">{activeInvoice.totalHours} hrs @ ${activeInvoice.rate || 75}/hr ({activeInvoice.date})</p>
                </div>
                <div className="text-right font-mono font-bold">
                  <span className={activeInvoice.laborStatus === 'rejected' ? 'line-through text-slate-500' : 'text-slate-100'}>
                    ${getEntryTotals(activeInvoice).labor.toFixed(2)}
                  </span>
                  <span className={`block text-[9px] uppercase font-bold ${
                    activeInvoice.laborStatus === 'approved' ? 'text-green-400' : activeInvoice.laborStatus === 'rejected' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {activeInvoice.laborStatus}
                  </span>
                </div>
              </div>

              {/* LINE ITEM 2: SUPPLIES */}
              <div className="py-1 border-b border-slate-900">
                <div className="flex justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-200">2. Supplies & Materials</p>
                    <p className="text-[10px] text-slate-400">Hardware & job site materials purchased</p>
                  </div>
                  <div className="text-right font-mono font-bold">
                    <span className={activeInvoice.suppliesStatus === 'rejected' ? 'line-through text-slate-500' : 'text-slate-100'}>
                      ${getEntryTotals(activeInvoice).supplies.toFixed(2)}
                    </span>
                    <span className={`block text-[9px] uppercase font-bold ${
                      activeInvoice.suppliesStatus === 'approved' ? 'text-green-400' : activeInvoice.suppliesStatus === 'rejected' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {activeInvoice.suppliesStatus}
                    </span>
                  </div>
                </div>

                {/* dynamic supplies breakdown list */}
                {((activeInvoice.suppliesItems && activeInvoice.suppliesItems.length > 0) || (activeInvoice.suppliesCost > 0)) && (
                  <div className="mt-2 pl-3 border-l border-slate-800 space-y-1 text-[10px]">
                    {activeInvoice.suppliesItems && activeInvoice.suppliesItems.length > 0 ? (
                      activeInvoice.suppliesItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-slate-400 font-mono">
                          <span>↳ {item.description || 'Unnamed Supply Item'}</span>
                          <span>${Number(item.cost || 0).toFixed(2)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between text-slate-400 font-mono">
                        <span>↳ General Supplies</span>
                        <span>${Number(activeInvoice.suppliesCost || 0).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LINE ITEM 3: TRAVEL */}
              <div className="flex justify-between text-xs py-1">
                <div>
                  <p className="font-semibold text-slate-200">3. Travel & Mileage</p>
                  <p className="text-[10px] text-slate-400">Site travel allowance & expenses</p>
                </div>
                <div className="text-right font-mono font-bold">
                  <span className={activeInvoice.travelStatus === 'rejected' ? 'line-through text-slate-500' : 'text-slate-100'}>
                    ${getEntryTotals(activeInvoice).travel.toFixed(2)}
                  </span>
                  <span className={`block text-[9px] uppercase font-bold ${
                    activeInvoice.travelStatus === 'approved' ? 'text-green-400' : activeInvoice.travelStatus === 'rejected' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {activeInvoice.travelStatus}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 flex justify-between items-center text-base font-extrabold">
                <span>Total Approved Payable:</span>
                <span className="text-green-400 font-mono text-xl">
                  ${getEntryTotals(activeInvoice).totalApproved.toFixed(2)}
                </span>
              </div>
            </div>

            {/* QUICKBOOKS ACTION */}
            <div className="space-y-3">
              <div className="p-3 bg-slate-950/60 rounded border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-green-500/10 flex items-center justify-center text-green-400 font-black text-xs flex-shrink-0">
                  QB
                </div>
                <p>This is an internal review of submitted labor, supplies, and travel. QuickBooks bill posting is not enabled from this screen yet.</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveInvoice(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSigningWorkOrder && selectedJobObj && (
        <Suspense fallback={null}>
          <WorkOrderSigningModal job={selectedJobObj} technicianName={loginEmail} savedTechnicianSignature={savedTechnicianSignature} onSaveTechnicianSignature={userRole === 'contractor' ? saveTechnicianSignature : undefined} onClose={() => setIsSigningWorkOrder(false)} onComplete={() => setIsSigningWorkOrder(false)} />
        </Suspense>
      )}
      {previewJob && (
        <Suspense fallback={null}>
          <TechnicianWorkOrderPreview job={previewJob} technicianName={contractorsList.find((contractor) => contractor.id === previewJob.technicianLeadId)?.name || 'Assigned Technician'} onClose={() => setPreviewJob(null)} />
        </Suspense>
      )}
      <SupportTicketModal
        isOpen={isSupportModalOpen}
        defaultEmail={loginEmail}
        subject={supportSubject}
        message={supportMessage}
        email={supportEmail}
        onClose={() => setIsSupportModalOpen(false)}
        onSubjectChange={setSupportSubject}
        onMessageChange={setSupportMessage}
        onEmailChange={setSupportEmail}
        onSubmit={(ticket) => {
          setSupportTickets((currentTickets) => [...currentTickets, ticket]);
          setSupportMessage('');
          setIsSupportModalOpen(false);
          alert(`Support ticket #${ticket.id} created successfully! The system administrator has been notified.`);
        }}
      />

      {isAddContractorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden backdrop-blur-md">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                <span>➕</span> Add New Tech to Contractors Pool
              </h3>
              <button
                type="button"
                onClick={() => setIsAddContractorOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 transition flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddContractor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={newContractorName}
                  onChange={(e) => setNewContractorName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john@tech5avvy.com"
                  value={newContractorEmail}
                  onChange={(e) => setNewContractorEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Hourly Rate ($/hr)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="75"
                    value={newContractorRate}
                    onChange={(e) => setNewContractorRate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Tech Specialty</label>
                  <input
                    type="text"
                    placeholder="e.g. Network, DevOps"
                    value={newContractorSpecialty}
                    onChange={(e) => setNewContractorSpecialty(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddContractorOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingContractor}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-650 to-violet-650 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  {isSavingContractor ? 'Saving...' : 'Add Contractor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingContractorTimecards && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden backdrop-blur-md">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                  <span>📅</span> Timesheets: {viewingContractorTimecards.name}
                </h3>
                <p className="text-xs text-slate-400">Viewing work history and submitted times for this technician.</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingContractorTimecards(null)}
                className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 transition flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto max-h-[400px] border border-slate-800 rounded-xl bg-slate-950/40">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Job Site</th>
                    <th className="p-3 font-mono">Hours</th>
                    <th className="p-3 font-mono">Rate</th>
                    <th className="p-3 font-mono">Supplies</th>
                    <th className="p-3 font-mono">Travel</th>
                    <th className="p-3 font-mono">Total</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {timeEntries
                    .filter(entry => entry.technicianUid === viewingContractorTimecards.authUid)
                    .map(entry => {
                      const totals = getEntryTotals(entry);
                      return (
                        <tr key={entry.id} className="hover:bg-slate-950/60">
                          <td className="p-3 font-bold text-amber-400">{entry.date}</td>
                          <td className="p-3 font-sans text-slate-100">{entry.jobSite}</td>
                          <td className="p-3">{entry.totalHours} hrs</td>
                          <td className="p-3">${entry.rate}/hr</td>
                          <td className="p-3 text-slate-400">${totals.supplies.toFixed(2)}</td>
                          <td className="p-3 text-slate-400">${totals.travel.toFixed(2)}</td>
                          <td className="p-3 font-bold text-green-400">${totals.totalGross.toFixed(2)}</td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              entry.status === 'approved' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : entry.status === 'rejected'
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  {timeEntries.filter(entry => entry.technicianUid === viewingContractorTimecards.authUid).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                        No time entries found for this contractor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingContractorTimecards(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
