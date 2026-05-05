import React from 'react';
import { Server, Phone } from 'lucide-react';
import { Button } from '../ui/Button';
import { Link } from 'react-router-dom';

export const ContactCTA = () => {
  return (
    <section id="contact" className="py-40 px-6 text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-tech-green/5 rounded-full blur-[140px] pointer-events-none" />
      
      <div className="max-w-3xl mx-auto relative z-10">
        <div className="w-16 h-16 glass-card rounded-sm flex items-center justify-center mx-auto mb-10 border-tech-green/20">
          <Server className="w-8 h-8 text-tech-green animate-pulse" />
        </div>
        
        <h2 className="font-display font-extrabold text-6xl md:text-7xl uppercase tracking-tighter mb-10 text-brand-white leading-none">
          Legacy Tech <br /> <span className="text-safety-orange tracking-[-0.05em] drop-shadow-[0_0_15px_rgba(255,140,0,0.3)]">Ends Here.</span>
        </h2>
        
        <p className="text-slate-400 text-lg md:text-xl mb-16 font-light leading-relaxed max-w-xl mx-auto">
          Scale your operation without the technical debt. Schedule your high-impact site audit today.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-10">
          <Link to="/contact">
            <Button variant="orange" size="lg" className="w-full sm:w-auto px-12 py-6 text-sm">
              Book Site Audit
            </Button>
          </Link>
          
          <div className="flex flex-col items-center sm:items-start gap-3">
            <div className="flex items-center gap-3 text-slate-300 font-mono text-sm uppercase tracking-widest font-bold">
              <Phone className="w-4 h-4 text-tech-green" />
              <span>Direct Link</span>
            </div>
            <a href="tel:7075558324" className="text-slate-500 font-mono text-xs hover:text-tech-green transition-colors leading-none tracking-widest">
              (707) 555-TECH
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
