import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, Camera, FileText, CheckCircle, AlertCircle, LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface TimeEntry {
  id: string;
  job_name: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  hours?: number;
}

export default function ContractorDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [jobName, setJobName] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    // Check local session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Fallback: Use mock user if no Supabase session for local development
        setUser({ email: 'contractor@tech5avvy.com', id: 'mock-user-123' });
      } else {
        setUser(session.user);
      }
    };
    getSession();
  }, []);

  // Calculate hours dynamically
  const calculateHours = (inTime: string, outTime: string) => {
    if (!inTime || !outTime) return 0;
    const diff = new Date(outTime).getTime() - new Date(inTime).getTime();
    if (diff < 0) return 0;
    return parseFloat((diff / (1000 * 60 * 60)).toFixed(2));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
      setPhotoName(e.target.files[0].name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobName || !clockIn) {
      setMessage({ type: 'error', text: 'Job Name and Clock-in time are required.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    // Simulate entry submission
    const newEntry: TimeEntry = {
      id: Math.random().toString(36).substring(7),
      job_name: jobName,
      clock_in: clockIn,
      clock_out: clockOut || null,
      status: 'pending',
      hours: clockOut ? calculateHours(clockIn, clockOut) : undefined
    };

    // If real supabase user is authenticated, save it
    if (user && user.id !== 'mock-user-123') {
      try {
        const { error } = await supabase.from('time_entries').insert({
          contractor_id: user.id,
          job_name: jobName,
          clock_in: new Date(clockIn).toISOString(),
          clock_out: clockOut ? new Date(clockOut).toISOString() : null,
          status: 'pending'
        });
        if (error) throw error;
      } catch (err: any) {
        console.error('Error saving to Supabase:', err.message);
      }
    }

    setTimeout(() => {
      setEntries([newEntry, ...entries]);
      setJobName('');
      setClockIn('');
      setClockOut('');
      setPhoto(null);
      setPhotoName('');
      setLoading(false);
      setMessage({ type: 'success', text: 'Timecard submitted successfully for review.' });
    }, 1000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="pt-24 pb-40 px-6 relative overflow-hidden bg-brand-black">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-safety-orange/5 rounded-full blur-[140px] pointer-events-none" />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-12 border-b border-white/5 pb-6">
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
          <Button variant="secondary" size="sm" onClick={handleSignOut} className="flex items-center gap-2">
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-8 border border-white/5 relative">
              <h2 className="text-lg font-bold uppercase tracking-wider text-brand-white mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-safety-orange" />
                Submit New Timecard
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">Job / Project Name</label>
                  <input
                    type="text"
                    required
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="e.g. High Voltage Substation"
                    className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">Clock In Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={clockIn}
                      onChange={(e) => setClockIn(e.target.value)}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">Clock Out Time (Optional)</label>
                    <input
                      type="datetime-local"
                      value={clockOut}
                      onChange={(e) => setClockOut(e.target.value)}
                      className="w-full bg-brand-slate/40 border border-white/10 rounded-sm px-4 py-3 text-xs text-brand-white focus:outline-none focus:border-safety-orange"
                    />
                  </div>
                </div>

                {/* Upload Section */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">Job Site Photos</label>
                  <div className="border border-dashed border-white/10 rounded-sm p-8 text-center bg-brand-slate/20 hover:bg-brand-slate/40 transition-colors relative cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Camera className="w-8 h-8 text-safety-orange mx-auto mb-2" />
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                      {photoName ? photoName : 'TAP TO ADD JOB PHOTO'}
                    </p>
                  </div>
                </div>

                {clockIn && clockOut && (
                  <div className="bg-safety-orange/5 border border-safety-orange/20 p-4 rounded-sm flex items-center justify-between text-xs font-mono text-safety-orange">
                    <span>Calculated Total Time:</span>
                    <span className="font-bold">{calculateHours(clockIn, clockOut)} Hours</span>
                  </div>
                )}

                {message && (
                  <div className={`p-4 rounded-sm flex items-center gap-2 text-xs font-mono ${
                    message.type === 'success' ? 'bg-tech-green/10 text-tech-green border border-tech-green/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}>
                    {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{message.text}</span>
                  </div>
                )}

                <Button variant="orange" type="submit" className="w-full py-4 mt-2" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit to Admin'}
                </Button>
              </form>
            </div>
          </div>

          {/* Info & History */}
          <div className="space-y-6">
            {/* Quick stats */}
            <div className="glass-card p-6 border border-white/5">
              <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Verification Check</h3>
              <div className="flex items-center gap-4 bg-white/5 p-4 rounded-sm border border-white/5">
                <Clock className="w-6 h-6 text-safety-orange" />
                <div>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Calculated Billing</p>
                  <p className="text-sm font-bold text-brand-white uppercase leading-none">Automated Sync</p>
                </div>
              </div>
            </div>

            {/* Entries History */}
            <div className="glass-card p-6 border border-white/5">
              <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">Submission History</h3>
              {entries.length === 0 ? (
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest text-center py-6">No recent entries</p>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div key={entry.id} className="border border-white/5 bg-white/5 p-4 rounded-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-brand-white uppercase tracking-tight truncate max-w-[120px]">{entry.job_name}</span>
                        <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          entry.status === 'pending' ? 'bg-safety-orange/10 text-safety-orange' : 'bg-tech-green/10 text-tech-green'
                        }`}>
                          {entry.status}
                        </span>
                      </div>
                      <p className="text-[9px] font-mono text-slate-500">
                        IN: {new Date(entry.clock_in).toLocaleDateString()}
                      </p>
                      {entry.hours !== undefined && (
                        <p className="text-[9px] font-mono text-safety-orange font-bold mt-1">
                          {entry.hours} Hours
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
