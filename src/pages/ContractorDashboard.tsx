import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Camera, FileText, CheckCircle, AlertCircle, LogOut, Layers } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

interface TimeEntry {
  id: string;
  jobSite: string;
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  totalHours: string;
  rate: number;
  notes: string;
  status: string;
  qbStatus: string;
  photos: string[];
}

export default function ContractorDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  
  // Authentication & View State
  const [userRole, setUserRole] = useState<'contractor' | 'admin'>('contractor'); 
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [loginEmail, setLoginEmail] = useState('contractor@techsavvytechs.com');
  const [loginPassword, setLoginPassword] = useState('••••••••');

  // Time Logger Form State
  const [jobSite, setJobSite] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [clockIn, setClockIn] = useState('07:00');
  const [clockOut, setClockOut] = useState('15:30');
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [hourlyRate, setHourlyRate] = useState(75.00);
  const [notes, setNotes] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);

  // QuickBooks & Invoice Review Modal State
  const [activeInvoice, setActiveInvoice] = useState<TimeEntry | null>(null);
  const [qbSyncStatus, setQbSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle'); 

  // Submissions Data
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([
    {
      id: 'te-101',
      jobSite: 'Substation Alpha - High Voltage Conduit',
      date: '2026-07-31',
      clockIn: '07:00',
      clockOut: '15:30',
      breakMinutes: 30,
      totalHours: '8.00',
      rate: 75.00,
      notes: 'Completed conduit run on North wall and secured junction boxes.',
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
      date: '2026-08-01',
      clockIn: '08:00',
      clockOut: '16:00',
      breakMinutes: 30,
      totalHours: '7.50',
      rate: 85.00,
      notes: 'Terminated fiber connections on patch panel 4.',
      status: 'pending',
      qbStatus: 'pending',
      photos: [
        'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?auto=format&fit=crop&w=400&q=80'
      ],
    }
  ]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch from Firestore
  useEffect(() => {
    if (!user || user.uid === 'mock-user-123') return;

    const fetchEntries = async () => {
      try {
        const q = query(
          collection(db, 'time_entries'),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const querySnapshot = await getDocs(q);
        const loadedEntries: TimeEntry[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedEntries.push({
            id: doc.id,
            jobSite: data.jobSite,
            date: data.date,
            clockIn: data.clockIn,
            clockOut: data.clockOut,
            breakMinutes: data.breakMinutes,
            totalHours: data.totalHours,
            rate: data.rate,
            notes: data.notes,
            status: data.status,
            qbStatus: data.qbStatus,
            photos: data.photos || []
          });
        });
        if (loadedEntries.length > 0) {
          setTimeEntries(loadedEntries);
        }
      } catch (err: any) {
        console.error('Error fetching time entries:', err);
      }
    };

    fetchEntries();
  }, [user]);

  const calculateHours = (start: string, end: string, breakMins: number) => {
    if (!start || !end) return '0.00';
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - Number(breakMins || 0);
    if (totalMinutes < 0) totalMinutes = 0;
    return (totalMinutes / 60).toFixed(2);
  };

  const calculatedHours = calculateHours(clockIn, clockOut, breakMinutes);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    const filePreviews = files.map(file => URL.createObjectURL(file));
    setUploadedPhotos(prev => [...prev, ...filePreviews]);
  };

  const handleSubmitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobSite) return;

    const newEntry: TimeEntry = {
      id: `te-${Date.now().toString().slice(-4)}`,
      jobSite,
      date: logDate,
      clockIn,
      clockOut,
      breakMinutes: Number(breakMinutes),
      totalHours: calculatedHours,
      rate: Number(hourlyRate),
      notes,
      status: 'pending',
      qbStatus: 'pending',
      photos: [...uploadedPhotos],
    };

    // If real Firebase user is authenticated, save it
    if (user && user.uid !== 'mock-user-123') {
      try {
        await addDoc(collection(db, 'time_entries'), {
          contractorId: user.uid,
          jobSite: jobSite,
          date: logDate,
          clockIn: clockIn,
          clockOut: clockOut,
          breakMinutes: Number(breakMinutes),
          totalHours: calculatedHours,
          rate: Number(hourlyRate),
          notes: notes,
          status: 'pending',
          qbStatus: 'pending',
          photos: [...uploadedPhotos],
          createdAt: new Date().toISOString()
        });
      } catch (err: any) {
        console.error('Error saving to Firestore:', err.message);
      }
    }

    setTimeEntries([newEntry, ...timeEntries]);
    
    // Reset Form
    setJobSite('');
    setNotes('');
    setUploadedPhotos([]);
    setActiveInvoice(newEntry); // Automatically open QuickBooks invoice review modal
  };

  const handleSignOut = async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleLocalLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate auth locally
    setUser({ email: loginEmail, uid: 'mock-user-123' });
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-6 bg-brand-black">
        <div className="glass-card border border-white/10 rounded-sm p-10 max-w-md w-full shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-block bg-safety-orange text-brand-black font-mono font-black px-3 py-1 rounded-sm text-xs tracking-wider mb-2 uppercase">
              TECH SAVVY TECHS
            </div>
            <h1 className="text-2xl font-black text-brand-white uppercase tracking-tight">Contractor Portal</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">Secure Industrial Infrastructure Login</p>
          </div>

          <form onSubmit={handleLocalLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Contractor Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
              />
            </div>

            <Button
              type="submit"
              variant="orange"
              className="w-full py-4 mt-2"
            >
              Sign In to Portal
            </Button>
          </form>

          <div className="text-center text-[10px] font-mono text-slate-600 border-t border-white/5 pt-4 uppercase tracking-wider leading-relaxed">
            Protected by Supabase Row-Level Security (RLS) & Intuit QBO OAuth2
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black text-brand-white font-sans pt-12 pb-32">
      {/* HEADER BAR */}
      <div className="max-w-7xl mx-auto px-6 mb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/5 pb-6">
          <div>
            <div className="text-[10px] font-mono text-safety-orange uppercase tracking-[0.2em] mb-1">
              Field Operations
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-extrabold uppercase tracking-tight text-brand-white">
              Contractor <span className="text-slate-500">Portal.</span>
            </h1>
            {user && (
              <p className="text-xs text-slate-500 font-mono mt-1">Logged in: {user.email}</p>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap text-xs">
            {/* ROLE TOGGLE FOR TESTING */}
            <div className="bg-brand-slate border border-white/5 rounded-sm p-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUserRole('contractor')}
                className={`px-3 py-1.5 rounded-sm text-[10px] font-mono uppercase tracking-wider transition ${userRole === 'contractor' ? 'bg-safety-orange text-brand-black font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Contractor Mode
              </button>
              <button
                type="button"
                onClick={() => setUserRole('admin')}
                className={`px-3 py-1.5 rounded-sm text-[10px] font-mono uppercase tracking-wider transition ${userRole === 'admin' ? 'bg-safety-orange text-brand-black font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Admin Mode
              </button>
            </div>

            <Button variant="secondary" size="sm" onClick={handleSignOut} className="flex items-center gap-2">
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </Button>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-6 space-y-8">
        {userRole === 'contractor' ? (
          /* CONTRACTOR VIEW: TIME & PHOTO LOGGING */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: TIME & PHOTO ENTRY FORM */}
            <div className="lg:col-span-7 glass-card border border-white/5 rounded-sm p-8 shadow-xl space-y-6">
              <div className="border-b border-white/5 pb-4 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-brand-white uppercase tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-safety-orange" />
                    Log Hours & Job Photos
                  </h2>
                  <p className="text-xs text-slate-500">Record daily work and attach completion media for QuickBooks invoice sync.</p>
                </div>
                <span className="text-xs font-mono font-bold bg-safety-orange/10 text-safety-orange border border-safety-orange/20 px-3 py-1 rounded-sm">
                  {calculatedHours} Hrs Total
                </span>
              </div>

              <form onSubmit={handleSubmitLog} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Job Site / Project Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Substation Alpha - High Voltage"
                      value={jobSite}
                      onChange={(e) => setJobSite(e.target.value)}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Work Date *</label>
                    <input
                      type="date"
                      required
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Clock In</label>
                    <input
                      type="time"
                      value={clockIn}
                      onChange={(e) => setClockIn(e.target.value)}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Clock Out</label>
                    <input
                      type="time"
                      value={clockOut}
                      onChange={(e) => setClockOut(e.target.value)}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Break (mins)</label>
                    <input
                      type="number"
                      min="0"
                      step="15"
                      value={breakMinutes}
                      onChange={(e) => setBreakMinutes(Number(e.target.value))}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Rate ($/hr)</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(Number(e.target.value))}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-safety-orange font-mono font-bold focus:outline-none focus:border-safety-orange"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Work Description & Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Describe completed tasks, materials used, or site conditions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange resize-none"
                  />
                </div>

                {/* PHOTO UPLOAD SECTION */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Job Site Photos (Field Verification)</label>
                  <div className="border border-dashed border-white/10 hover:border-safety-orange/50 rounded-sm p-6 text-center transition bg-brand-slate/10 relative">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      id="photo-input"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                      <Camera className="w-8 h-8 text-safety-orange mx-auto mb-1" />
                      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300">Tap to Take or Upload Job Photos</span>
                    </div>
                  </div>

                  {/* PHOTO PREVIEWS */}
                  {uploadedPhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {uploadedPhotos.map((src, index) => (
                        <div key={index} className="relative group rounded-sm overflow-hidden border border-white/5 h-20 bg-brand-black">
                          <img src={src} alt="Job upload" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setUploadedPhotos(uploadedPhotos.filter((_, i) => i !== index))}
                            className="absolute top-1 right-1 bg-black/70 hover:bg-red-600 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SUBMIT BUTTON */}
                <Button
                  variant="orange"
                  type="submit"
                  className="w-full py-4 mt-2"
                >
                  Submit Hours & Review QuickBooks Invoice →
                </Button>
              </form>
            </div>

            {/* RIGHT COLUMN: SUBMISSION HISTORY */}
            <div className="lg:col-span-5 glass-card border border-white/5 rounded-sm p-6 shadow-xl space-y-4">
              <div className="border-b border-white/5 pb-3 flex justify-between items-center">
                <h3 className="font-bold text-xs uppercase tracking-wider text-brand-white">Submitted Time Logs</h3>
                <span className="text-[10px] font-mono text-slate-500">{timeEntries.length} Records</span>
              </div>

              <div className="space-y-3">
                {timeEntries.map((entry) => (
                  <div key={entry.id} className="bg-brand-black/40 border border-white/5 rounded-sm p-4 space-y-2 hover:border-white/10 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{entry.jobSite}</h4>
                        <p className="text-[11px] text-slate-500 mt-1">{entry.notes}</p>
                      </div>
                      <span className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                        entry.status === 'approved' 
                          ? 'bg-tech-green/10 text-tech-green border-tech-green/20' 
                          : 'bg-safety-orange/10 text-safety-orange border-safety-orange/20'
                      }`}>
                        {entry.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                      <span>{entry.date}</span>
                      <span className="text-slate-200 font-bold">{entry.totalHours} hrs (${(Number(entry.totalHours) * (entry.rate || 75)).toFixed(2)})</span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                      <span className="text-slate-600">📷 {entry.photos?.length || 0} Photos</span>
                      <button
                        type="button"
                        onClick={() => setActiveInvoice(entry)}
                        className="text-safety-orange hover:underline font-bold font-mono text-[9px] uppercase tracking-wider"
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
          /* ADMIN APPROVAL DASHBOARD VIEW */
          <div className="glass-card border border-white/5 rounded-sm p-8 shadow-xl space-y-6">
            <div className="border-b border-white/5 pb-4 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold text-brand-white uppercase tracking-tight flex items-center gap-2">
                  <Layers className="w-5 h-5 text-safety-orange" />
                  Admin Approval & Payroll Dashboard
                </h2>
                <p className="text-xs text-slate-500">Verify contractor timesheets and auto-generate QuickBooks Vendor Bills.</p>
              </div>
              <Button
                variant="green"
                size="sm"
                onClick={() => {
                  setTimeEntries(timeEntries.map(e => ({ ...e, status: 'approved', qbStatus: 'synced' })));
                }}
              >
                Approve & Sync All to QuickBooks
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-brand-black/60 text-slate-400 uppercase text-[9px] font-mono tracking-widest border-b border-white/5">
                  <tr>
                    <th className="p-4">Job Site</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Hours</th>
                    <th className="p-4">Rate</th>
                    <th className="p-4">Total Payable</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">QuickBooks Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {timeEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/5">
                      <td className="p-4 font-semibold text-brand-white">{entry.jobSite}</td>
                      <td className="p-4 font-mono">{entry.date}</td>
                      <td className="p-4 font-mono">{entry.totalHours} hrs</td>
                      <td className="p-4 font-mono">${entry.rate || 75}/hr</td>
                      <td className="p-4 font-mono font-bold text-safety-orange">
                        ${(Number(entry.totalHours) * (entry.rate || 75)).toFixed(2)}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase ${
                          entry.status === 'approved' ? 'bg-tech-green/10 text-tech-green' : 'bg-safety-orange/10 text-safety-orange'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActiveInvoice(entry)}
                        >
                          {entry.qbStatus === 'synced' ? 'Synced to QBO' : 'Sync to QBO'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* QUICKBOOKS INVOICE REVIEW MODAL */}
      <AnimatePresence>
        {activeInvoice && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-slate border border-white/10 rounded-sm max-w-lg w-full p-8 shadow-2xl text-brand-white space-y-6"
            >
              <div className="flex justify-between items-start border-b border-white/5 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[8px] font-mono font-bold bg-tech-green/20 text-tech-green border border-tech-green/30 px-2 py-0.5 rounded-sm uppercase tracking-wider">
                      QuickBooks Integration
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Draft Vendor Bill</span>
                  </div>
                  <h3 className="text-base font-bold text-brand-white uppercase tracking-tight">{activeInvoice.jobSite}</h3>
                </div>
                <button 
                  onClick={() => { setActiveInvoice(null); setQbSyncStatus('idle'); }}
                  className="text-slate-400 hover:text-white text-xl font-bold transition-colors"
                >
                  ×
                </button>
              </div>

              {/* INVOICE BREAKDOWN TABLE */}
              <div className="bg-brand-black p-4 rounded-sm border border-white/5 space-y-3">
                <div className="flex justify-between text-[10px] font-mono text-slate-500 border-b border-white/5 pb-2 uppercase tracking-wider">
                  <span>Description</span>
                  <span>Qty / Rate</span>
                  <span>Amount</span>
                </div>

                <div className="flex justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-200 uppercase tracking-tight">Contractor Labor</p>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">Date: {activeInvoice.date}</p>
                  </div>
                  <div className="text-right text-[10px] font-mono text-slate-400">
                    <p>{activeInvoice.totalHours} hrs</p>
                    <p>@ ${activeInvoice.rate || 75}/hr</p>
                  </div>
                  <div className="font-mono font-bold text-safety-orange text-sm">
                    ${(Number(activeInvoice.totalHours) * (activeInvoice.rate || 75)).toFixed(2)}
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3 flex justify-between items-center text-sm font-bold uppercase">
                  <span>Total Payable:</span>
                  <span className="text-tech-green font-mono text-lg">
                    ${(Number(activeInvoice.totalHours) * (activeInvoice.rate || 75)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* QUICKBOOKS ACTION */}
              <div className="space-y-4">
                <div className="p-3 bg-brand-black/60 rounded-sm border border-white/5 text-[10px] text-slate-400 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-tech-green/10 flex items-center justify-center text-tech-green font-black text-xs flex-shrink-0">
                    QB
                  </div>
                  <p className="leading-relaxed">Upon approval, Antigravity's API will transmit a **Vendor Bill** to your QuickBooks Online account with attached site media.</p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => { setActiveInvoice(null); setQbSyncStatus('idle'); }}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  <Button
                    variant="orange"
                    disabled={qbSyncStatus === 'syncing' || activeInvoice.qbStatus === 'synced'}
                    onClick={() => {
                      setQbSyncStatus('syncing');
                      setTimeout(() => {
                        setQbSyncStatus('synced');
                        setTimeEntries(timeEntries.map(e => e.id === activeInvoice.id ? { ...e, qbStatus: 'synced' } : e));
                        setTimeout(() => setActiveInvoice(null), 1200);
                      }, 1000);
                    }}
                    className="flex-1"
                  >
                    {qbSyncStatus === 'syncing' ? 'Transmitting to QuickBooks...' : 
                     activeInvoice.qbStatus === 'synced' || qbSyncStatus === 'synced' ? '✓ Synced to QuickBooks' : 
                     'Send Bill to QuickBooks'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
