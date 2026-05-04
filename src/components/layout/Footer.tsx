import React from 'react';
import { Logo } from '../Logo';
import { Mail, Phone } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="bg-brand-black border-t border-brand-slate py-24 px-6 overflow-hidden relative">
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-tech-green/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-16">
        <div className="col-span-2">
          <Logo variant="horizontal" className="mb-8" />
          <p className="text-slate-500 text-sm max-w-sm leading-relaxed mb-10 font-light">
            Providing high-performance technical infrastructure for Sacramento and Bay Area businesses. 
            From the data center to the device, we ensure your tech is an asset, not a burden.
          </p>
          <div className="flex gap-4">
            <a href="mailto:contact@techsavvytechs.com" className="p-3 glass-card rounded-sm text-slate-400 hover:text-tech-green hover:border-tech-green/50 transition-all">
              <Mail className="w-5 h-5" />
            </a>
            <a href="tel:7075558324" className="p-3 glass-card rounded-sm text-slate-400 hover:text-tech-green hover:border-tech-green/50 transition-all">
              <Phone className="w-5 h-5" />
            </a>
          </div>
        </div>
        
        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-[0.4em] text-tech-green mb-8">Capabilities</h4>
          <ul className="space-y-4 text-sm text-slate-500 font-mono">
            <li><a href="#services" className="hover:text-brand-white transition-colors">Low-Voltage</a></li>
            <li><a href="#services" className="hover:text-brand-white transition-colors">Infrastructure</a></li>
            <li><a href="#services" className="hover:text-brand-white transition-colors">MSP Solutions</a></li>
            <li><a href="#services" className="hover:text-brand-white transition-colors">Consulting</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-[0.4em] text-tech-green mb-8">Connect</h4>
          <ul className="space-y-4 text-sm text-slate-500 font-mono">
            <li><a href="#" className="hover:text-brand-white transition-colors">Client Portal</a></li>
            <li><a href="#" className="hover:text-brand-white transition-colors">Case Studies</a></li>
            <li><a href="#" className="hover:text-brand-white transition-colors">Technical Blog</a></li>
            <li><a href="#" className="hover:text-brand-white transition-colors">Privacy Policy</a></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-24 pt-10 border-t border-brand-slate flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
        <p className="text-slate-600 text-[10px] font-mono uppercase tracking-widest leading-none">
          © 2026 Tech Savvy LLC. All Rights Reserved.
        </p>
        <div className="flex items-center gap-3 text-slate-500 text-[10px] font-mono uppercase tracking-widest bg-brand-slate/30 px-4 py-2 rounded-full border border-white/5">
          <span className="w-2 h-2 bg-tech-green rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          Systems: Operational
        </div>
      </div>
    </footer>
  );
};
