import React, { useState, useEffect, lazy, Suspense } from 'react';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { Link, useNavigate } from 'react-router';
import { SupportTicketModal } from '../features/contractor/support/SupportTicketModal';
import type { NotificationProfile } from '../features/contractor/types';
import { DashboardHeader } from '../features/contractor/layout/DashboardHeader';
import { NotificationPreferencesModal } from '../features/contractor/profile/NotificationPreferencesModal';
import { formatElapsed, getEntryTotals, getGoogleMapsUrl } from '../features/contractor/timesheets/calculations';
import { ContractorProgressPanel } from '../features/contractor/workOrders/ContractorProgressPanel';
import { type OnboardingState } from '../features/contractor/onboarding/ContractorOnboardingCard';

const WorkOrderSigningModal = lazy(() => import('../features/contractor/workOrders/WorkOrderSigningModal').then(({ WorkOrderSigningModal }) => ({ default: WorkOrderSigningModal })));


export default function ContractorDashboard() {
  const navigate = useNavigate();
  // Authentication & View State
  const [userRole, setUserRole] = useState<'contractor' | 'admin'>('contractor');
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ id: string; label: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isEmailSigningIn, setIsEmailSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [assignedJobIds, setAssignedJobIds] = useState<string[]>([]);
  const [savedTechnicianSignature, setSavedTechnicianSignature] = useState('');
  const [notificationProfile, setNotificationProfile] = useState<NotificationProfile | null>(null);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [contractorJobTab, setContractorJobTab] = useState<'form' | 'instructions'>('form');
  const [completionIntent, setCompletionIntent] = useState<'progress' | 'final'>('progress');
  const [signatureExceptionReason, setSignatureExceptionReason] = useState('');
  const [signatureExceptionNotes, setSignatureExceptionNotes] = useState('');

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
    if (isAdmin) {
      navigate('/crm', { replace: true });
      return;
    }
    setCanAccessAdmin(false);
    setUserRole('contractor');
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

  const getAuthErrorMessage = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'The email or password is incorrect. Try again or reset your password.';
      case 'auth/too-many-requests':
        return 'Too many attempts were made. Please wait a few minutes and try again.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was canceled before it finished.';
      case 'auth/account-exists-with-different-credential':
        return 'This email already uses password login. Sign in with your password first; Google can then be connected to the same account.';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled yet. An administrator must enable the Google provider in Firebase Authentication.';
      case 'auth/unauthorized-domain':
        return 'This website domain is not authorized for Google sign-in. Add it to Firebase Authentication authorized domains.';
      case 'auth/network-request-failed':
        return 'The authentication service could not be reached. Check your connection and try again.';
      default:
        return 'We could not complete sign-in. Please try again or contact TechSavvy support.';
    }
  };

  // Support Tickets State
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

  const [isSigningWorkOrder, setIsSigningWorkOrder] = useState(false);
  const [jobSitesViewedAt, setJobSitesViewedAt] = useState({});

  const getAssignedTechIds = (job) => {
    if (Array.isArray(job.assignedTechIds) && job.assignedTechIds.length > 0) {
      return job.assignedTechIds;
    }
    return [job.assignedTechId || 'ALL'];
  };

  useEffect(() => {
    const availableJobs = jobSitesList.filter((job) => !['voided', 'completed', 'closed', 'cancelled', 'canceled'].includes(String(job.status || '').toLowerCase()));
    if (availableJobs.length > 0 && !availableJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(availableJobs[0].id);
    } else if (availableJobs.length === 0 && selectedJobId) {
      setSelectedJobId('');
    }
  }, [jobSitesList, selectedJobId]);

  useEffect(() => {
    setCompletionIntent('progress');
    setSignatureExceptionReason('');
    setSignatureExceptionNotes('');
  }, [selectedJobId]);

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
        setNotificationProfile(data.notificationProfile || null);
        setJobSitesList(data.jobs || []);
        if (data.activeEntry) {
          const started = new Date(data.activeEntry.clockInAt || data.activeEntry.clockIn).getTime();
          setActiveShift({ isClockedIn: true, startTime: data.activeEntry.clockIn, jobName: data.activeEntry.jobSite, elapsedSeconds: Math.max(0, Math.floor((Date.now() - started) / 1000)) });
        }
      } catch (error) {
        console.error('Could not load production time clock:', error);
      }
    };
    void loadTimeClock();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userRole]);

  // Auto-fill contractor rates when selecting a predefined job site
  useEffect(() => {
    if (!isCustomJob) {
    const job = jobSitesList.find(j => j.id === selectedJobId && j.status !== 'voided');
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

  // Contractor View Navigation & History Filter State
  const [contractorTab, setContractorTab] = useState('logger'); // 'logger' | 'history'
  const [historyFilterJob, setHistoryFilterJob] = useState('ALL');
  const [historyFilterStatus, setHistoryFilterStatus] = useState('ALL');

  // Submissions Data
  const [timeEntries, setTimeEntries] = useState([]);

  const totalLifetimeHours = timeEntries
    .filter((entry) => entry.status !== 'voided')
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
  const activeJobSites = jobSitesList.filter((job) => !['voided', 'completed', 'closed', 'cancelled', 'canceled'].includes(String(job.status || '').toLowerCase()));
  const selectedJobObj = activeJobSites.find(j => j.id === selectedJobId) || activeJobSites[0];

  // The time clock is the default way to log a shift; manual entry is only a
  // fallback for a forgotten clock-in. Whichever method is used first for a
  // job on a given day should be the only one used -- these mirror the
  // server-side dedup check in api/portal/time-clock.js so a tech sees why a
  // button is disabled instead of hitting a rejected submission.
  const todayStr = new Date().toISOString().split('T')[0];
  const hasLoggedEntryFor = (jobId, date) => timeEntries.some((entry) => entry.jobId === jobId && entry.date === date && entry.status !== 'voided');
  const alreadyClockedInToday = Boolean(selectedJobId) && hasLoggedEntryFor(selectedJobId, todayStr);
  const alreadyLoggedForManualDate = Boolean(selectedJobId) && !isCustomJob && hasLoggedEntryFor(selectedJobId, logDate);

  // Filtered History Entries
  const filteredHistoryEntries = timeEntries.filter(entry => {
    const matchesJob = historyFilterJob === 'ALL' || entry.jobSite === historyFilterJob;
    const matchesStatus =
      historyFilterStatus === 'ALL' ||
      (historyFilterStatus === 'paid' && entry.qbStatus === 'synced') ||
      (historyFilterStatus === 'approved' && entry.status === 'approved' && entry.qbStatus !== 'synced') ||
      (historyFilterStatus === 'pending' && entry.status === 'pending') ||
      (historyFilterStatus === 'rejected' && entry.status === 'rejected') ||
      (historyFilterStatus === 'voided' && entry.status === 'voided');
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

  const submitVoidAction = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'request_void_timecard', reason: voidReason.trim(), timecardId: voidTarget.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not complete the void request.');
      if (data.entry) setTimeEntries((current) => current.map((entry) => entry.id === data.entry.id ? data.entry : entry));
      alert('Your void request was sent to the administrator.');
      setVoidTarget(null);
      setVoidReason('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not complete the void request.');
    } finally {
      setIsVoiding(false);
    }
  };

  const respondToCorrection = async (entry, agreed: boolean) => {
    const responseNote = agreed ? '' : window.prompt('Explain why you dispute this correction:');
    if (!agreed && !responseNote?.trim()) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'respond_timecard_correction', timecardId: entry.id, agreed, responseNote: responseNote?.trim() || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save your response.');
      setTimeEntries((current) => current.map((item) => item.id === data.entry.id ? data.entry : item));
      alert(agreed ? 'Correction accepted. The original submission remains in voided history.' : 'Your dispute was sent to TechSavvy for review.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save your response.');
    }
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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []) as File[];
    const filePreviews = files.map(file => URL.createObjectURL(file));
    setUploadedPhotos(prev => [...prev, ...filePreviews]);
  };

  const handleSubmitLog = async (e) => {
    e.preventDefault();
    const finalJobName = isCustomJob ? customJobSite : selectedJobObj?.name;
    const finalAddress = isCustomJob ? customJobAddress : selectedJobObj?.address;
    if (!finalJobName) return;
    const hasSignedWorkOrder = Boolean(selectedJobObj?.signedWorkOrders?.length);
    if (completionIntent === 'final' && isCustomJob) {
      alert('Choose an administrator-issued work order before marking a job complete. Custom sites can receive progress entries only.');
      return;
    }
    if (completionIntent === 'final' && selectedJobObj?.signatureRequired && !hasSignedWorkOrder) {
      alert('This work order requires a customer signature before final completion. Open Work Order & SOW and complete the signing step.');
      setContractorJobTab('instructions');
      return;
    }
    if (completionIntent === 'final' && !hasSignedWorkOrder && !signatureExceptionReason) {
      alert('Obtain the customer signature or select a reason for completing without one.');
      return;
    }
    if (completionIntent === 'final' && !hasSignedWorkOrder && signatureExceptionReason === 'other' && !signatureExceptionNotes.trim()) {
      alert('Explain why the customer signature was not needed or available.');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'submit_manual_log',
          jobId: isCustomJob ? '' : selectedJobId,
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
          notes,
          photos: [...uploadedPhotos],
          completionIntent,
          signatureExceptionReason: completionIntent === 'final' && !hasSignedWorkOrder ? signatureExceptionReason : '',
          signatureExceptionNotes: completionIntent === 'final' && !hasSignedWorkOrder ? signatureExceptionNotes.trim() : '',
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit timesheet.');

      const newEntry = data.entry;
      setTimeEntries([newEntry, ...timeEntries]);
      if (data.job) setJobSitesList((current) => current.map((job) => job.id === data.job.id ? data.job : job));

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
      setCompletionIntent('progress');
      setSignatureExceptionReason('');
      setSignatureExceptionNotes('');
      setActiveInvoice(newEntry);
      alert(completionIntent === 'final' ? 'Final time entry submitted and the work order was marked complete.' : 'Progress time entry submitted successfully!');
    } catch (error) {
      console.error('Error submitting timesheet:', error);
      alert(error instanceof Error ? error.message : 'Could not submit timesheet.');
    }
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
              setAuthMessage(null);
              setIsEmailSigningIn(true);
              try {
                await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
              } catch (error) {
                setAuthMessage({ tone: 'error', text: getAuthErrorMessage(error) });
              } finally {
                setIsEmailSigningIn(false);
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
              disabled={isEmailSigningIn}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded text-sm transition shadow-lg shadow-amber-500/10"
            >
              {isEmailSigningIn ? 'Signing in…' : 'Continue with Email'}
            </button>
          </form>

          {authMessage && (
            <div
              role="alert"
              className={`rounded border px-3 py-2 text-xs leading-relaxed ${authMessage.tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-green-500/30 bg-green-500/10 text-green-200'}`}
            >
              {authMessage.text}
            </div>
          )}

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
                setAuthMessage(null);
                setIsGoogleSigningIn(true);
                try {
                  const provider = new GoogleAuthProvider();
                  provider.setCustomParameters({ prompt: 'select_account' });
                  await signInWithPopup(auth, provider);
                } catch (error) {
                  setAuthMessage({ tone: 'error', text: getAuthErrorMessage(error) });
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
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="password-reset-title"
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 text-lg">🔑</span>
                  <h3 id="password-reset-title" className="font-bold text-sm text-slate-100">Reset Portal Password</h3>
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
                    setAuthMessage(null);
                    try {
                      const response = await fetch('/api/auth/password-reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: resetEmail.trim() }),
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error || 'Unable to send the reset email.');
                      setResetStatus('sent');
                    } catch (error) {
                      setResetStatus('idle');
                      setAuthMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to send the reset email.' });
                      setIsResetModalOpen(false);
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
    <div className="contractor-dashboard min-h-screen bg-slate-950 text-slate-100 font-sans">
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
        onOpenNotificationPreferences={() => setIsNotificationModalOpen(true)}
        onSignOut={() => void signOut(auth)}
      />

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
          {/* CONTRACTOR VIEW: TIME & PHOTO LOGGING + HISTORICAL EARNINGS LEDGER */}
          <div className="space-y-6">
            {onboarding?.status !== 'approved' && (
              <div className={`rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4 transition-all ${
                onboarding?.status === 'submitted'
                  ? 'border-sky-500/30 bg-sky-500/5 text-sky-400'
                  : onboarding?.status === 'needs_update'
                  ? 'border-red-500/30 bg-red-500/5 text-red-400'
                  : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
              }`}>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">Action Required</p>
                  <h3 className="text-sm font-black text-white">
                    {onboarding?.status === 'submitted'
                      ? 'W-9 Onboarding Under Review'
                      : onboarding?.status === 'needs_update'
                      ? 'W-9 Onboarding Needs Update'
                      : 'W-9 Onboarding Required'}
                  </h3>
                  <p className="text-xs text-slate-355 max-w-2xl leading-relaxed">
                    {onboarding?.status === 'submitted'
                      ? 'Thank you! Your W-9 documentation is being reviewed by TechSavvy administrators.'
                      : onboarding?.status === 'needs_update'
                      ? `Attention: Your submission requires correction. Reason: ${onboarding.reviewNote || 'Please update your details.'}`
                      : 'Complete and sign your secure digital W-9 tax form and accept the portal terms to finalize your portal onboarding.'}
                  </p>
                </div>
                <Link
                  to="/contractor/onboarding"
                  className={`rounded-xl px-5 py-2.5 text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                    onboarding?.status === 'submitted'
                      ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                      : onboarding?.status === 'needs_update'
                      ? 'bg-red-500 hover:bg-red-400 text-slate-950'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {onboarding?.status === 'submitted'
                    ? 'Check Status'
                    : onboarding?.status === 'needs_update'
                    ? 'Update W-9'
                    : 'Get Started'}
                </Link>
              </div>
            )}
            
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
                          disabled={alreadyClockedInToday}
                          title={alreadyClockedInToday ? 'You already have hours logged for this job today.' : undefined}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs transition shadow-lg shadow-green-600/20 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          🟢 {alreadyClockedInToday ? 'Already logged today' : 'Clock In Now'}
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
                            if (['voided', 'completed', 'closed', 'cancelled', 'canceled'].includes(String(job.status || '').toLowerCase())) return false;
                            const assignedIds = getAssignedTechIds(job);
                            return assignedIds.includes('ALL') || assignedJobIds.includes(job.id);
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

                      {/* TABS BAR FOR MOBILE & EASIER READING */}
                      {!isCustomJob && selectedJobObj && (
                        <div className="flex border-b border-slate-800 mb-2">
                          <button
                            type="button"
                            onClick={() => setContractorJobTab('form')}
                            className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition ${
                              contractorJobTab === 'form'
                                ? 'text-amber-500 border-b-2 border-amber-500'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            ⏱️ Log Hours & Shift
                          </button>
                          <button
                            type="button"
                            onClick={() => setContractorJobTab('instructions')}
                            className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition ${
                              contractorJobTab === 'instructions'
                                ? 'text-amber-500 border-b-2 border-amber-500'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            📋 Work Order & SOW
                          </button>
                        </div>
                      )}

                      {!isCustomJob && selectedJobObj && (
                        <div className={`rounded-lg border p-3 text-xs ${selectedJobObj.signedWorkOrders?.length ? 'border-green-500/30 bg-green-500/5 text-green-200' : selectedJobObj.signatureRequired ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-bold">{selectedJobObj.signedWorkOrders?.length ? '✓ Customer sign-off received' : selectedJobObj.signatureRequired ? 'Customer signature required' : 'Customer signature recommended'}</p>
                              {!selectedJobObj.signedWorkOrders?.length && <p className="mt-1 text-[10px] opacity-80">Obtain a signed work order before final completion. If the administrator did not require it, a documented technician exception is available.</p>}
                            </div>
                            {!selectedJobObj.signedWorkOrders?.length && <button type="button" onClick={() => { setContractorJobTab('instructions'); setIsSigningWorkOrder(true); }} className="rounded bg-green-500 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-green-400">Get signature</button>}
                          </div>
                        </div>
                      )}

                      {/* JOB INSTRUCTIONS & MANAGER UPDATES NOTIFICATION */}
                      {!isCustomJob && selectedJobObj && contractorJobTab === 'instructions' && (
                        <div className="space-y-2">
                          <ContractorProgressPanel jobId={selectedJobObj.id} />
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

                    {(isCustomJob || !selectedJobObj || contractorJobTab === 'form') && (
                      <>
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

                    {!isCustomJob && selectedJobObj && (
                      <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                        <div>
                          <p className="text-xs font-bold text-slate-200">Submission type</p>
                          <p className="mt-1 text-[10px] text-slate-500">Use progress for ordinary daily time. Select final only when the work order is complete.</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className={`cursor-pointer rounded border p-3 text-xs ${completionIntent === 'progress' ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-slate-800 text-slate-400'}`}><input type="radio" name="completion-intent" value="progress" checked={completionIntent === 'progress'} onChange={() => setCompletionIntent('progress')} className="mr-2 accent-amber-500"/><strong>Progress entry</strong><span className="mt-1 block text-[10px] opacity-75">Work continues; no signature enforcement.</span></label>
                          <label className={`cursor-pointer rounded border p-3 text-xs ${completionIntent === 'final' ? 'border-green-500 bg-green-500/10 text-green-200' : 'border-slate-800 text-slate-400'}`}><input type="radio" name="completion-intent" value="final" checked={completionIntent === 'final'} onChange={() => setCompletionIntent('final')} className="mr-2 accent-green-500"/><strong>Final entry</strong><span className="mt-1 block text-[10px] opacity-75">Mark this work order complete.</span></label>
                        </div>
                        {completionIntent === 'final' && !selectedJobObj.signedWorkOrders?.length && selectedJobObj.signatureRequired && (
                          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"><strong>Signature required by administrator.</strong><p className="mt-1 text-[10px]">Final submission is blocked until the signed work order is saved.</p><button type="button" onClick={() => setIsSigningWorkOrder(true)} className="mt-2 rounded bg-red-500 px-3 py-2 text-[10px] font-bold text-white">Complete signing</button></div>
                        )}
                        {completionIntent === 'final' && !selectedJobObj.signedWorkOrders?.length && !selectedJobObj.signatureRequired && (
                          <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/10 p-3">
                            <p className="text-xs font-bold text-amber-200">Customer signature reminder</p>
                            <p className="text-[10px] text-amber-100/80">Please obtain a signature when practical. To complete without one, document the exception below.</p>
                            <select value={signatureExceptionReason} onChange={(event) => setSignatureExceptionReason(event.target.value)} className="w-full rounded border border-amber-500/30 bg-slate-950 px-3 py-2 text-xs text-slate-100"><option value="">Select exception reason</option><option value="customer_unavailable">Customer unavailable</option><option value="customer_declined">Customer declined to sign</option><option value="remote_unattended">Remote or unattended work</option><option value="not_required_for_visit">Signature not required for this visit</option><option value="other">Other</option></select>
                            <textarea value={signatureExceptionNotes} onChange={(event) => setSignatureExceptionNotes(event.target.value)} rows={2} placeholder={signatureExceptionReason === 'other' ? 'Explanation required' : 'Optional supporting notes'} className="w-full rounded border border-amber-500/30 bg-slate-950 px-3 py-2 text-xs text-slate-100"/>
                          </div>
                        )}
                      </div>
                    )}

                    {alreadyLoggedForManualDate ? (
                      <p className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-center text-xs font-bold text-green-300">✓ Already logged for this job on {logDate} via the time clock — no manual entry needed.</p>
                    ) : (
                      <button
                        type="submit"
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
                      >
                        <span>{completionIntent === 'final' && !isCustomJob ? 'Submit Final Entry & Complete Job' : 'Submit Progress Time for Review'}</span>
                        <span>→</span>
                      </button>
                    )}
                      </>
                    )}
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
                    {timeEntries.filter((entry) => entry.status !== 'voided').slice(0, 4).map((entry) => (
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
                          <div className="flex items-center gap-3">
                            {entry.status === 'rejected' && !entry.voidStatus && entry.qbStatus !== 'synced' && (
                              <button type="button" onClick={() => setVoidTarget({ id: entry.id, label: `${entry.jobSite} · ${entry.date}` })} className="text-rose-400 hover:underline font-bold">Request void</button>
                            )}
                            {entry.voidStatus === 'requested' && <span className="font-bold text-violet-400">Void requested</span>}
                            <button type="button" onClick={() => setActiveInvoice(entry)} className="text-amber-400 hover:underline font-bold flex items-center gap-1">Review time entry</button>
                          </div>
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
                        <option value="voided">Voided</option>
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
                                  entry.status === 'voided'
                                    ? 'bg-slate-700/40 text-slate-300 border border-slate-600'
                                    : entry.status === 'approved'
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                    : entry.status === 'rejected'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {entry.status === 'rejected' ? 'Not Approved' : entry.status}
                                </span>
                          {entry.status === 'voided' && <span className="mt-1 block max-w-xs text-[10px] text-slate-500">Reason: {entry.voidReason}</span>}
                          {entry.correctionStatus === 'awaiting_technician' && <div className="mt-2 max-w-xl rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><strong>Correction awaiting your response</strong><p className="mt-1">{entry.correctionReason}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => void respondToCorrection(entry, true)} className="rounded bg-green-500 px-3 py-1.5 text-[10px] font-bold text-slate-950">I agree</button><button type="button" onClick={() => void respondToCorrection(entry, false)} className="rounded border border-rose-500/40 px-3 py-1.5 text-[10px] font-bold text-rose-300">Dispute</button></div></div>}
                          {entry.correctionStatus === 'disputed' && <span className="mt-1 block max-w-xs text-[10px] text-rose-300">Correction disputed · TechSavvy is reviewing your response.</span>}
                              </td>
                              <td className="p-3">
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1 w-max">⏳ Accounting review</span>
                              </td>
                              <td className="p-3 text-right">
                                {entry.status === 'rejected' && !entry.voidStatus && entry.qbStatus !== 'synced' && <button type="button" onClick={() => setVoidTarget({ id: entry.id, label: `${entry.jobSite} · ${entry.date}` })} className="mr-2 px-2.5 py-1 text-rose-400 font-bold hover:underline text-[11px]">Request void</button>}
                                {entry.voidStatus === 'requested' && <span className="mr-2 text-[10px] font-bold text-violet-400">Awaiting admin</span>}
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
          <WorkOrderSigningModal job={selectedJobObj} technicianName={loginEmail} savedTechnicianSignature={savedTechnicianSignature} onSaveTechnicianSignature={saveTechnicianSignature} onClose={() => setIsSigningWorkOrder(false)} onComplete={(workOrder) => { setJobSitesList((current) => current.map((job) => job.id === selectedJobObj.id ? { ...job, signedWorkOrders: [...(job.signedWorkOrders || []), workOrder], signatureStatus: 'signed' } : job)); setIsSigningWorkOrder(false); }} />
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
        onSubmit={async (ticket) => {
          try {
            const token = await auth.currentUser?.getIdToken();
            const response = await fetch('/api/support-tickets?action=submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(ticket),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Could not submit the ticket.');
            setSupportMessage('');
            setIsSupportModalOpen(false);
            alert(`Support ticket #${data.id} created successfully! The system administrator has been notified.`);
          } catch (error) {
            alert(error instanceof Error ? error.message : 'Could not submit the ticket.');
          }
        }}
      />
      <NotificationPreferencesModal
        isOpen={isNotificationModalOpen}
        profile={notificationProfile}
        onClose={() => setIsNotificationModalOpen(false)}
        onUpdated={setNotificationProfile}
      />

      {voidTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
            <div>
              <h3 className="text-lg font-bold text-rose-400">Request a void</h3>
              <p className="mt-1 text-xs text-slate-400">{voidTarget.label}</p>
            </div>
            <p className="text-sm text-slate-300">Explain why this rejected submission should be voided. The administrator must approve your request.</p>
            <textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={4} maxLength={500} placeholder="Required reason" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-rose-500 focus:outline-none" />
            <div className="flex justify-end gap-3">
              <button type="button" disabled={isVoiding} onClick={() => { setVoidTarget(null); setVoidReason(''); }} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">Cancel</button>
              <button type="button" disabled={isVoiding || !voidReason.trim()} onClick={submitVoidAction} className="rounded-xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 bg-rose-600 text-white hover:bg-rose-500">{isVoiding ? 'Saving…' : 'Send request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
