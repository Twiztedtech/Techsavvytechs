import React from 'react';
import { ArrowRight, BriefcaseBusiness, LockKeyhole, UserCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/Button';

const Portal = () => {
  return (
    <div className="pt-32 pb-40 px-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-tech-green/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tech-green/10 border border-tech-green/20 text-tech-green text-[10px] font-mono mb-6 uppercase tracking-widest">
            <LockKeyhole className="w-3 h-3" />
            <span>Secure access</span>
          </div>
          <h1 className="font-display font-extrabold text-6xl md:text-7xl uppercase tracking-tighter text-brand-white leading-none mb-8">
            Access <span className="text-slate-500">portals.</span>
          </h1>
          <p className="text-slate-400 text-lg font-light leading-relaxed">
            Choose the access path that fits your relationship with TechSavvy. Contractor tools are available now; client access is issued for active projects.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <section className="glass-card p-10 border-t-2 border-tech-green">
            <UserCheck className="w-10 h-10 text-tech-green mb-8" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-tech-green mb-3">For contractors</p>
            <h2 className="text-3xl font-display font-bold uppercase text-brand-white mb-5">Contractor portal</h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              Log hours, review work assignments, and manage approved contractor resources.
            </p>
            <Link to="/contractor/dashboard">
              <Button variant="orange" className="group">
                Contractor login <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </section>

          <section className="glass-card p-10 border-t-2 border-slate-700">
            <BriefcaseBusiness className="w-10 h-10 text-slate-400 mb-8" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-3">For active clients</p>
            <h2 className="text-3xl font-display font-bold uppercase text-brand-white mb-5">Client access</h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              Client access is provided for active service engagements. Request access and we will confirm the right workspace for your project.
            </p>
            <Link to="/client">
              <Button variant="glass" className="group">
                Client login <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Portal;
