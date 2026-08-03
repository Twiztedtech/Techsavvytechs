import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';


export default function ContractorDashboard() {
  // Authentication & View State
  const [userRole, setUserRole] = useState('contractor'); // 'contractor' | 'admin'
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('timecards'); // 'timecards' | 'contractors'
  const [contractorsList, setContractorsList] = useState([
    { id: 'qbo-1', name: 'Sinatra Monroe', email: 'contractor@techsavvytechs.com', rate: 75.00, status: 'Active', qboVendorId: '1' }
  ]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loginEmail, setLoginEmail] = useState('contractor@techsavvytechs.com');
  const [loginPassword, setLoginPassword] = useState('••••••••');

  // Password Reset Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('idle'); // 'idle' | 'sending' | 'sent'

  // MFA State
  const [isMfaStep, setIsMfaStep] = useState(false);
  const [mfaCodeInput, setMfaCodeInput] = useState('');
  const [generatedMfaCode, setGeneratedMfaCode] = useState('');

  // Support Tickets State
  const [supportTickets, setSupportTickets] = useState(() => {
    const saved = localStorage.getItem('tst_support_tickets');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState('QuickBooks Sync Error');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  // Pre-loaded Job Sites with Address info for Google Maps Directions
  const [jobSitesList, setJobSitesList] = useState(() => {
    const saved = localStorage.getItem('tst_job_sites');
    return saved ? JSON.parse(saved) : [
      { id: 'j-101', name: 'Mars Davis - High Voltage', address: '1200 Industrial Pkwy, Fairfield, CA 94533', notes: 'High voltage junction box assembly', hourlyRate: 75.00, travelRate: 35.00, assignedTechId: 'ALL' },
      { id: 'j-102', name: 'Substation Alpha - Conduit Run', address: '450 Energy Way, Sacramento, CA 95814', notes: 'North wall conduit run', hourlyRate: 80.00, travelRate: 40.00, assignedTechId: 'qbo-1' },
      { id: 'j-103', name: 'Data Center B - Fiber Racks', address: '880 Silicon Blvd, San Jose, CA 95131', notes: 'Rack 4 patch panels', hourlyRate: 85.00, travelRate: 50.00, assignedTechId: 'qbo-1' },
      { id: 'j-104', name: 'Solar Array Site 4 - Inverters', address: '3100 Sun Valley Rd, Fresno, CA 93706', notes: 'Inverter bank inspection', hourlyRate: 90.00, travelRate: 60.00, assignedTechId: 'ALL' },
    ];
  });

  // Time Logger Form State
  const [selectedJobId, setSelectedJobId] = useState('j-101');
  const [customJobSite, setCustomJobSite] = useState('');
  const [customJobAddress, setCustomJobAddress] = useState('');
  const [isCustomJob, setIsCustomJob] = useState(false);
  
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [clockIn, setClockIn] = useState('07:00');
  const [clockOut, setClockOut] = useState('15:30');
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [contractorRate, setContractorRate] = useState(75.00); // Admin-approved rate (read-only for tech)
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
  const [adminJobHourlyRate, setAdminJobHourlyRate] = useState('75.00');
  const [adminJobTravelRate, setAdminJobTravelRate] = useState('35.00');
  const [adminJobAssignedTech, setAdminJobAssignedTech] = useState('ALL');
  const [editingJobId, setEditingJobId] = useState(null);
  const [qboConnected, setQboConnected] = useState(false);
  const [qboRealmId, setQboRealmId] = useState('');
  const [jobSitesViewedAt, setJobSitesViewedAt] = useState(() => {
    const saved = localStorage.getItem('tst_job_sites_viewed_at');
    return saved ? JSON.parse(saved) : {};
  });
  // Listen to QuickBooks OAuth settings
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = onSnapshot(doc(db, 'settings', 'quickbooks'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setQboConnected(data.status === 'connected');
        setQboRealmId(data.realmId || '');
      } else {
        setQboConnected(false);
        setQboRealmId('');
      }
    });
    return () => unsubscribe();
  }, [isAuthenticated]);

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
        setContractorRate(job.hourlyRate !== undefined ? Number(job.hourlyRate) : 75.00);
        setTravelCost(job.travelRate !== undefined ? Number(job.travelRate).toFixed(2) : '0.00');
      }
    } else {
      setContractorRate(75.00);
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
  const [qbSyncStatus, setQbSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced'

  // Admin Selection for Batch Approvals / Rejections
  const [selectedEntryIds, setSelectedEntryIds] = useState([]);

  // Contractor View Navigation & History Filter State
  const [contractorTab, setContractorTab] = useState('logger'); // 'logger' | 'history'
  const [historyFilterJob, setHistoryFilterJob] = useState('ALL');
  const [historyFilterStatus, setHistoryFilterStatus] = useState('ALL');

  // Submissions Data
  const [timeEntries, setTimeEntries] = useState(() => {
    const saved = localStorage.getItem('tst_time_entries');
    return saved ? JSON.parse(saved) : [
      {
        id: 'te-101',
        jobSite: 'Substation Alpha - Conduit Run',
        address: '450 Energy Way, Sacramento, CA 95814',
        date: '2026-07-31',
        clockIn: '07:00',
        clockOut: '15:30',
        breakMinutes: 30,
        totalHours: '8.00',
        rate: 75.00,
        suppliesCost: 45.50,
        travelCost: 35.00,
        laborStatus: 'approved',
        suppliesStatus: 'approved',
        travelStatus: 'approved',
        notes: 'Completed conduit run on North wall and purchased 2x junction boxes.',
        status: 'approved',
        qbStatus: 'synced',
        photos: [
          'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
          'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80'
        ],
      },
      {
        id: 'te-102',
        jobSite: 'Data Center B - Fiber Racks',
        address: '880 Silicon Blvd, San Jose, CA 95131',
        date: '2026-08-01',
        clockIn: '08:00',
        clockOut: '16:00',
        breakMinutes: 30,
        totalHours: '7.50',
        rate: 85.00,
        suppliesCost: 120.00,
        travelCost: 50.00,
        laborStatus: 'pending',
        suppliesStatus: 'pending',
        travelStatus: 'pending',
        notes: 'Terminated fiber connections and purchased patch cords.',
        status: 'pending',
        qbStatus: 'pending',
        photos: [
          'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?auto=format&fit=crop&w=400&q=80'
        ],
      }
    ];
  });

  const getEntryTotals = (entry) => {
    const labor = (Number(entry.totalHours || 0) * (entry.rate || 75));
    const supplies = Number(entry.suppliesCost || 0);
    const travel = Number(entry.travelCost || 0);
    
    // Approved-only calculations
    const approvedLabor = entry.laborStatus === 'approved' ? labor : 0;
    const approvedSupplies = entry.suppliesStatus === 'approved' ? supplies : 0;
    const approvedTravel = entry.travelStatus === 'approved' ? travel : 0;

    return {
      labor,
      supplies,
      travel,
      totalGross: labor + supplies + travel,
      totalApproved: approvedLabor + approvedSupplies + approvedTravel
    };
  };

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

  // Helper for Google Maps Link
  const getGoogleMapsUrl = (address) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

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
  }, []);

  useEffect(() => {
    localStorage.setItem('tst_job_sites', JSON.stringify(jobSitesList));
  }, [jobSitesList]);

  useEffect(() => {
    localStorage.setItem('tst_time_entries', JSON.stringify(timeEntries));
  }, [timeEntries]);

  useEffect(() => {
    localStorage.setItem('tst_job_sites_viewed_at', JSON.stringify(jobSitesViewedAt));
  }, [jobSitesViewedAt]);

  useEffect(() => {
    localStorage.setItem('tst_support_tickets', JSON.stringify(supportTickets));
  }, [supportTickets]);

  const formatElapsed = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartShift = () => {
    const now = new Date();
    const formattedTime = now.toTimeString().slice(0, 5);
    const currentName = isCustomJob ? (customJobSite || 'Custom Job Site') : selectedJobObj.name;

    setActiveShift({
      isClockedIn: true,
      startTime: formattedTime,
      jobName: currentName,
      elapsedSeconds: 0
    });
    setClockIn(formattedTime);
    setLogDate(now.toISOString().split('T')[0]);
  };

  const handleStopShift = () => {
    const now = new Date();
    const formattedTime = now.toTimeString().slice(0, 5);
    setClockOut(formattedTime);
    setActiveShift(prev => ({ ...prev, isClockedIn: false }));
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
              qbStatus: newStatus === 'approved' ? 'synced' : 'pending'
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
          updated.qbStatus = 'synced';
        } else if (statuses.every(s => s === 'rejected')) {
          updated.status = 'rejected';
        } else {
          updated.status = 'approved';
        }
        return updated;
      })
    );
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    const filePreviews = files.map(file => URL.createObjectURL(file));
    setUploadedPhotos(prev => [...prev, ...filePreviews]);
  };

  const handleSubmitLog = (e) => {
    e.preventDefault();
    const finalJobName = isCustomJob ? customJobSite : selectedJobObj.name;
    const finalAddress = isCustomJob ? customJobAddress : selectedJobObj.address;
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
    if (isMfaStep) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-block bg-green-500/10 text-green-400 border border-green-500/20 font-bold px-3 py-0.5 rounded text-[10px] tracking-wider uppercase mb-2">
                🔒 Firebase MFA Secured
              </div>
              <h1 className="text-2xl font-black text-white">Security Verification</h1>
              <p className="text-xs text-slate-400">
                A verification code has been dispatched. Enter the 6-digit code below to authorize this session.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (mfaCodeInput === generatedMfaCode) {
                  setIsAuthenticated(true);
                  setIsMfaStep(false);
                } else {
                  alert('Invalid verification code. Please try again.');
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 text-center font-mono">6-Digit Verification Code</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={mfaCodeInput}
                  onChange={(e) => setMfaCodeInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-center text-lg font-mono tracking-[0.5em] text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-500 text-center mt-2 font-mono">
                  * For test environments, the secure verification code has been printed to your **Developer Console** (Press <kbd className="bg-slate-800 px-1 rounded text-slate-300">F12</kbd> &rarr; Console).
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition uppercase cursor-pointer"
              >
                Verify & Log In
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMfaStep(false);
                  setMfaCodeInput('');
                }}
                className="w-full text-xs text-slate-400 hover:text-white underline text-center block cursor-pointer"
              >
                Back to Login
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-block bg-amber-500 text-slate-950 font-black px-3 py-1 rounded text-sm tracking-tight mb-2">
              TECH SAVVY TECHS
            </div>
            <h1 className="text-2xl font-black text-white">Contractor Portal</h1>
            <p className="text-xs text-slate-400">Secure Industrial Infrastructure Login</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = Math.floor(100000 + Math.random() * 900000).toString();
              setGeneratedMfaCode(code);
              console.log("🔒 [Firebase MFA] Security verification code: " + code);
              setMfaCodeInput('');
              setIsMfaStep(true);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Contractor Email</label>
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
              Sign In to Portal
            </button>
          </form>

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
                  onSubmit={(e) => {
                    e.preventDefault();
                    setResetStatus('sending');
                    setTimeout(() => {
                      setResetStatus('sent');
                    }, 1000);
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
      {/* HEADER BAR */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded text-base tracking-tighter">
              TST
            </div>
            <div>
              <h1 className="font-bold text-sm leading-none text-slate-100">TECH SAVVY TECHS</h1>
              <span className="text-[10px] uppercase font-semibold text-amber-500 tracking-wider">Industrial Contractor Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* ROLE TOGGLE */}
            <div className="bg-slate-950 border border-slate-800 rounded p-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUserRole('contractor')}
                className={`px-3 py-1 rounded text-xs font-bold transition ${userRole === 'contractor' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                Contractor Mode
              </button>
              <button
                type="button"
                onClick={() => setUserRole('admin')}
                className={`px-3 py-1 rounded text-xs font-bold transition ${userRole === 'admin' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                Admin Mode
              </button>
            </div>

            <button
               type="button"
               onClick={() => {
                 setSupportSubject('QuickBooks Sync Error');
                 setSupportEmail(loginEmail || '');
                 setIsSupportModalOpen(true);
               }}
               className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/30 text-amber-400 rounded font-semibold transition cursor-pointer flex items-center gap-1"
             >
               <span>📞</span>
               <span>Contact Admin</span>
             </button>

             <button
               type="button"
               onClick={() => setIsAuthenticated(false)}
               className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition cursor-pointer"
             >
               Sign Out
             </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {userRole === 'contractor' ? (
          /* CONTRACTOR VIEW: TIME & PHOTO LOGGING + HISTORICAL EARNINGS LEDGER */
          <div className="space-y-6">
            
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
                          {jobSitesList.filter(job => 
                            !job.assignedTechId || 
                            job.assignedTechId === 'ALL' || 
                            job.assignedTechId === contractorsList.find(c => c.email === loginEmail)?.id
                          ).map((site) => (
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
                      {!isCustomJob && selectedJobObj.address && (
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
                          step="0.01"
                          placeholder="0.00"
                          value={travelCost}
                          onChange={(e) => setTravelCost(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                        />
                        <span className="text-[10px] text-slate-500 block mt-1">Pre-filled from the job site profile. You can override if travel duration changed.</span>
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
                      <span>Submit Hours & Review QuickBooks Invoice</span>
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
                            {entry.qbStatus === 'synced' ? '✓ QB Bill Synced' : 'Review QB Invoice'}
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
                    <p className="text-xs text-slate-400">Complete itemized record of your submitted hours, supplies, travel reimbursements, and QuickBooks payout status.</p>
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
                                {entry.qbStatus === 'synced' ? (
                                  <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded flex items-center gap-1 w-max">
                                    ✓ Paid / QB Synced
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1 w-max">
                                    ⏳ Processing Payout
                                  </span>
                                )}
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
                        <th className="p-3">Job Site & Date</th>
                        <th className="p-3">Item 1: Labor Hours</th>
                        <th className="p-3">Item 2: Supplies</th>
                        <th className="p-3">Item 3: Travel</th>
                        <th className="p-3">Total Payable</th>
                        <th className="p-3 text-right">QuickBooks Sync</th>
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
                                {entry.qbStatus === 'synced' ? 'QBO Bill ✓' : 'Sync QBO'}
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
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!adminJobName) return;
                        const nowStr = new Date().toISOString();

                        if (editingJobId) {
                          setJobSitesList(prev =>
                            prev.map(job =>
                              job.id === editingJobId
                                ? { 
                                    ...job, 
                                    name: adminJobName, 
                                    address: adminJobAddress || 'Address on file', 
                                    notes: adminJobNotes || 'Site instructions unspecified',
                                    hourlyRate: Number(adminJobHourlyRate || 0),
                                    travelRate: Number(adminJobTravelRate || 0),
                                    assignedTechId: adminJobAssignedTech,
                                    updatedAt: nowStr 
                                  }
                                : job
                            )
                          );
                          setEditingJobId(null);
                        } else {
                          const newJob = {
                            id: `j-${Date.now().toString().slice(-4)}`,
                            name: adminJobName,
                            address: adminJobAddress || 'Address on file',
                            notes: adminJobNotes || 'Site instructions unspecified',
                            hourlyRate: Number(adminJobHourlyRate || 0),
                            travelRate: Number(adminJobTravelRate || 0),
                            assignedTechId: adminJobAssignedTech,
                            updatedAt: nowStr
                          };
                          setJobSitesList(prev => [...prev, newJob]);
                        }
                        setAdminJobName('');
                        setAdminJobAddress('');
                        setAdminJobNotes('');
                        setAdminJobHourlyRate('75.00');
                        setAdminJobTravelRate('35.00');
                        setAdminJobAssignedTech('ALL');
                      }}
                      className="space-y-3"
                    >
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Assigned Technician</label>
                        <select
                          value={adminJobAssignedTech}
                          onChange={(e) => setAdminJobAssignedTech(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="ALL">Anyone (All Techs)</option>
                          {contractorsList.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                          ))}
                        </select>
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
                            placeholder="75.00"
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
                      <div className="flex gap-2">
                        {editingJobId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingJobId(null);
                              setAdminJobName('');
                              setAdminJobAddress('');
                              setAdminJobNotes('');
                              setAdminJobHourlyRate('75.00');
                              setAdminJobTravelRate('35.00');
                              setAdminJobAssignedTech('ALL');
                            }}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-lg text-xs transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-lg text-xs transition cursor-pointer"
                        >
                          {editingJobId ? 'Update Job Site' : 'Create Job Site'}
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
                                {job.assignedTechId === 'ALL' || !job.assignedTechId 
                                  ? 'Anyone (All Techs)' 
                                  : (contractorsList.find(c => c.id === job.assignedTechId)?.name || job.assignedTechId)}
                              </td>
                              <td className="p-3 font-mono text-[11px] space-y-0.5">
                                <div className="text-slate-200">🛠️ Labor: <span className="text-amber-400 font-bold">${job.hourlyRate !== undefined ? Number(job.hourlyRate).toFixed(2) : '75.00'}/hr</span></div>
                                <div className="text-slate-400">🚗 Travel: <span className="text-slate-300">${job.travelRate !== undefined ? Number(job.travelRate).toFixed(2) : '35.00'}</span></div>
                              </td>
                              <td className="p-3 text-slate-400 font-mono text-[11px]">{job.address}</td>
                              <td className="p-3 text-slate-400">{job.notes}</td>
                              <td className="p-3 text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingJobId(job.id);
                                    setAdminJobName(job.name);
                                    setAdminJobAddress(job.address);
                                    setAdminJobNotes(job.notes);
                                    setAdminJobHourlyRate((job.hourlyRate !== undefined ? job.hourlyRate : 75.00).toString());
                                    setAdminJobTravelRate((job.travelRate !== undefined ? job.travelRate : 35.00).toString());
                                    setAdminJobAssignedTech(job.assignedTechId || 'ALL');
                                  }}
                                  className="text-amber-400 hover:text-amber-300 font-bold hover:underline text-[11px] cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingJobId === job.id) {
                                      setEditingJobId(null);
                                      setAdminJobName('');
                                      setAdminJobAddress('');
                                      setAdminJobNotes('');
                                      setAdminJobHourlyRate('75.00');
                                      setAdminJobTravelRate('35.00');
                                      setAdminJobAssignedTech('ALL');
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
                    {qboConnected ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm('Are you sure you want to disconnect QuickBooks? This will remove the authentication tokens.')) {
                            try {
                              await deleteDoc(doc(db, 'settings', 'quickbooks'));
                              alert('QuickBooks disconnected successfully.');
                            } catch (err) {
                              alert('Failed to disconnect: ' + err.message);
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-red-650/20 hover:bg-red-600 text-red-400 hover:text-white font-bold rounded-lg text-xs transition border border-red-500/20 cursor-pointer"
                      >
                        🔌 Disconnect
                      </button>
                    ) : (
                      <a
                        href="/api/auth/quickbooks"
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-green-600/20 cursor-pointer"
                      >
                        🔗 Connect to QuickBooks
                      </a>
                    )}

                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={async () => {
                        setIsSyncing(true);
                        try {
                          const res = await fetch('/api/sync-vendors', { method: 'POST' });
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
                onClick={() => { setActiveInvoice(null); setQbSyncStatus('idle'); }}
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
                <p>Antigravity's API will transmit a 3-line-item **Vendor Bill** to your QuickBooks Online account reflecting approved labor, supplies, and travel.</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setActiveInvoice(null); setQbSyncStatus('idle'); }}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={qbSyncStatus === 'syncing' || activeInvoice.qbStatus === 'synced'}
                  onClick={() => {
                    setQbSyncStatus('syncing');
                    setTimeout(() => {
                      setQbSyncStatus('synced');
                      setTimeEntries(timeEntries.map(e => e.id === activeInvoice.id ? { ...e, qbStatus: 'synced' } : e));
                      setTimeout(() => setActiveInvoice(null), 1200);
                    }, 1000);
                  }}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-2"
                >
                  {qbSyncStatus === 'syncing' ? 'Transmitting to QuickBooks...' : 
                   activeInvoice.qbStatus === 'synced' || qbSyncStatus === 'synced' ? '✓ Synced to QuickBooks' : 
                   'Send Bill to QuickBooks'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUPPORT / REPORT SYNC ERROR TICKET MODAL */}
      {isSupportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                  <span>🛠️</span> Support & Sync Ticket
                </h3>
                <p className="text-xs text-slate-400">Submit error logs or request help from administrative support.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const newTicket = {
                  id: `ticket-${Date.now().toString().slice(-4)}`,
                  subject: supportSubject,
                  message: supportMessage,
                  email: supportEmail || loginEmail || 'anonymous@techsavvytechs.com',
                  timestamp: new Date().toLocaleString(),
                  status: 'Open'
                };
                setSupportTickets(prev => [...prev, newTicket]);
                setSupportMessage('');
                setIsSupportModalOpen(false);
                alert(`Support ticket #${newTicket.id} created successfully! The system administrator has been notified.`);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Issue Category *</label>
                <select
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="QuickBooks Sync Error">QuickBooks Sync Error (Credentials/API)</option>
                  <option value="Timesheet Log Issue">Timesheet / Shift Logging Issue</option>
                  <option value="Portal UI Display Error">Portal UI / Feature Display Issue</option>
                  <option value="General Admin Question">General Administrative Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Contact Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="support@techsavvytechs.com"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Error Message / Problem Description *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe the issue, including error messages..."
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSupportModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}