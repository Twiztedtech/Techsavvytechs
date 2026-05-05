import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Phone, MapPin, Send, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
  }
}

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: null // Public form, no auth
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    try {
      const path = 'contacts';
      // 1. Save the contact record
      await addDoc(collection(db, path), {
        ...formData,
        createdAt: serverTimestamp()
      });

      // 2. Trigger the email notification
      // Replace 'willjac1@gmail.com' with your preferred notification email if different
      await addDoc(collection(db, 'mail'), {
        to: 'willjac1@gmail.com',
        message: {
          subject: `New Contact Submission from ${formData.name}`,
          text: `You have a new message from your website.\n\nName: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #ff5722;">New Website Lead</h2>
              <p><strong>Name:</strong> ${formData.name}</p>
              <p><strong>Email:</strong> ${formData.email}</p>
              <hr />
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-wrap;">${formData.message}</p>
            </div>
          `,
        }
      });

      setStatus('success');
      setFormData({ name: '', email: '', message: '' });
    } catch (error) {
      console.error("Submission error:", error);
      setStatus('error');
      try {
        handleFirestoreError(error, OperationType.CREATE, 'contacts');
      } catch (err) {
        if (err instanceof Error) setErrorMessage(err.message);
      }
    }
  };

  return (
    <div className="pt-32 pb-40 px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-safety-orange/5 rounded-full blur-[140px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-24">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <p className="font-mono text-tech-green text-[10px] uppercase tracking-[0.4em] mb-6 font-bold italic">Communications Hub</p>
            <h1 className="font-display font-extrabold text-6xl md:text-8xl uppercase tracking-tighter text-brand-white leading-[0.85] mb-10">
              Direct <br /> <span className="text-slate-500">Interface.</span>
            </h1>
            <p className="text-slate-400 text-lg font-light leading-relaxed mb-16 max-w-md">
              Initialize connection for technical inquiries, site audits, or partnership integrations. Our response units monitor this channel 24/7.
            </p>

            <div className="space-y-8">
              <div className="flex items-center gap-6 group">
                <div className="w-12 h-12 glass-card flex items-center justify-center text-tech-green border-tech-green/20 group-hover:bg-tech-green/10 transition-colors">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">Response Line</p>
                  <p className="text-lg font-bold text-brand-white uppercase leading-none">(707) 555-TECH</p>
                </div>
              </div>

              <div className="flex items-center gap-6 group">
                <div className="w-12 h-12 glass-card flex items-center justify-center text-tech-green border-tech-green/20 group-hover:bg-tech-green/10 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">Direct Email</p>
                  <p className="text-lg font-bold text-brand-white uppercase leading-none">ops@techsavvy.io</p>
                </div>
              </div>

              <div className="flex items-center gap-6 group">
                <div className="w-12 h-12 glass-card flex items-center justify-center text-tech-green border-tech-green/20 group-hover:bg-tech-green/10 transition-colors">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">Command HQ</p>
                  <p className="text-lg font-bold text-brand-white uppercase leading-none">Fairfield, CA 94533</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-10 md:p-16 border-t-4 border-tech-green relative"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Send className="w-24 h-24 text-tech-green" />
            </div>

            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-20"
                >
                  <div className="w-20 h-20 bg-tech-green/20 text-tech-green rounded-full flex items-center justify-center mx-auto mb-8">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h3 className="text-3xl font-display font-bold text-white uppercase tracking-tight mb-4">Transmission Received</h3>
                  <p className="text-slate-400 font-light mb-10">Our deployment units have been notified. Stand by for contact.</p>
                  <Button variant="glass" onClick={() => setStatus('idle')}>Send Another Message</Button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit}
                  className="space-y-8"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-tech-green uppercase tracking-[0.3em] font-bold">Full Name</label>
                    <input 
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 text-brand-white focus:outline-none focus:border-tech-green/50 transition-colors font-sans"
                      placeholder="Enter identity..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-tech-green uppercase tracking-[0.3em] font-bold">Email Address</label>
                    <input 
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 text-brand-white focus:outline-none focus:border-tech-green/50 transition-colors font-sans"
                      placeholder="ops@client-domain.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-tech-green uppercase tracking-[0.3em] font-bold">Project Scope / Message</label>
                    <textarea 
                      required
                      rows={6}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-sm px-6 py-4 text-brand-white focus:outline-none focus:border-tech-green/50 transition-colors font-sans resize-none"
                      placeholder="Describe technical requirements..."
                    />
                  </div>

                  {status === 'error' && (
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-sm text-xs font-mono">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <div>
                        <p className="font-bold uppercase tracking-wider mb-1">Transmission Failure</p>
                        <p className="opacity-80">{errorMessage || "Check your link and try again."}</p>
                      </div>
                    </div>
                  )}

                  <Button 
                    variant="orange" 
                    className="w-full py-6 text-sm flex items-center justify-center gap-4"
                    disabled={status === 'submitting'}
                  >
                    {status === 'submitting' ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Initializing Uplink...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Dispatch Message</span>
                      </>
                    )}
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
