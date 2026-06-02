import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Shield, Cpu, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const vendor = searchParams.get('vendor') || 'Infrastructure';
  const [stage, setStage] = useState<'initializing' | 'ready'>('initializing');

  useEffect(() => {
    const timer = setTimeout(() => setStage('ready'), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <AnimatePresence mode="wait">
        {stage === 'initializing' ? (
          <motion.div 
            key="initializing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 glass-card mx-auto mb-10 flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-tech-green animate-spin" />
            </div>
            <p className="font-mono text-[10px] text-tech-green uppercase tracking-[0.4em] mb-2">System Diagnostic</p>
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">
              Initializing Secure Handshake...
            </h2>
            <div className="mt-4 flex gap-1 justify-center">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 bg-tech-green/30 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="ready"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <div className="glass-card p-10 relative overflow-hidden border border-tech-green/30">
              <div className="absolute top-0 right-0 p-4">
                <Lock className="w-4 h-4 text-tech-green" />
              </div>

              <div className="text-center mb-10">
                <div className="w-12 h-12 glass-card mx-auto mb-6 flex items-center justify-center border-tech-green/20">
                  <Shield className="w-6 h-6 text-tech-green" />
                </div>
                <h3 className="text-2xl font-bold text-white uppercase tracking-tight mb-2">Secure Link Established</h3>
                <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Target: {vendor} Cloud</p>
              </div>

              <div className="space-y-4">
                <Button 
                  variant="glass" 
                  className="w-full py-4 flex items-center justify-center gap-4 bg-white/5 hover:bg-white/10"
                  onClick={() => {
                    if (vendor === 'ATG') {
                      window.location.href = "/ghilotti_site_survey_form.html";
                    } else {
                      window.location.href = "https://accounts.google.com";
                    }
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </Button>
                
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-brand-black px-4 text-[10px] font-mono text-slate-600 uppercase tracking-widest">Enterprise Only</span>
                  </div>
                </div>

                <Button variant="secondary" className="w-full py-4 text-slate-500 border-white/5 cursor-not-allowed">
                  Partner SSO Link
                </Button>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5 flex items-center gap-3 text-[9px] font-mono text-slate-600 uppercase tracking-widest">
                <Cpu className="w-3 h-3" />
                <span>Encrypted Path: Tunnel_AES_v2</span>
              </div>
            </div>
            
            <button 
              onClick={() => navigate('/portal')}
              className="mt-6 text-[10px] font-mono text-slate-500 hover:text-tech-green transition-colors uppercase tracking-[0.2em] w-full text-center"
            >
              ← Return to Gateway Selection
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auth;
