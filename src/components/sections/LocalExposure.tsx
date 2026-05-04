import React from 'react';
import { motion } from 'motion/react';
import { MapPin, ArrowRight } from 'lucide-react';

const cities = [
  "Fairfield & Vacaville",
  "Sacramento & Roseville",
  "Davis & Woodland",
  "Napa & Sonoma"
];

export const LocalExposure = () => {
  return (
    <section className="py-32 px-6 bg-brand-slate/10 border-y border-brand-slate relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-safety-orange/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2" />
      
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-24 items-center">
        <div className="order-2 lg:order-1 relative">
          <div className="glass-card p-8 aspect-square relative flex items-center justify-center overflow-hidden group">
            {/* Stylized Technical Map Background */}
            <div className="absolute inset-0 opacity-20 blueprint-grid pointer-events-none" />
            
            {/* North Cal Map Silhouette / Schema */}
            <svg viewBox="0 0 400 400" className="w-full h-full text-slate-800 transition-transform duration-1000 group-hover:scale-110">
              <path d="M100,50 L150,80 L200,60 L250,90 L280,150 L260,250 L220,320 L180,350 L120,330 L80,280 L60,180 Z" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
              
              {/* Nodes */}
              <circle cx="150" cy="120" r="4" fill="#22C55E" className="animate-pulse" /> {/* Fairfield */}
              <circle cx="210" cy="90" r="4" fill="#22C55E" /> {/* Sacramento */}
              <circle cx="110" cy="200" r="4" fill="#22C55E" /> {/* Bay Area */}
              <circle cx="90" cy="280" r="4" fill="#22C55E" /> {/* South Bay */}

              {/* Connections */}
              <line x1="150" y1="120" x2="210" y2="90" stroke="#22C55E" strokeWidth="0.5" opacity="0.3" />
              <line x1="150" y1="120" x2="110" y2="200" stroke="#22C55E" strokeWidth="0.5" opacity="0.3" />
              <line x1="110" y1="200" x2="90" y2="280" stroke="#22C55E" strokeWidth="0.5" opacity="0.3" />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="glass-card px-4 py-2 border-l-2 border-tech-green bg-brand-black/40 backdrop-blur-sm -translate-x-12 -translate-y-24">
                <span className="text-[8px] font-mono text-tech-green block">HUB 01</span>
                <span className="text-[10px] font-bold text-brand-white uppercase">Sacramento Metro</span>
              </div>
              <div className="glass-card px-4 py-2 border-l-2 border-tech-green bg-brand-black/40 backdrop-blur-sm translate-x-16 translate-y-8">
                <span className="text-[8px] font-mono text-tech-green block">HUB 02</span>
                <span className="text-[10px] font-bold text-brand-white uppercase">Bay Area / South Bay</span>
              </div>
            </div>
          </div>
          
          <div className="absolute -bottom-6 -left-6 glass-card p-4 border-l-2 border-safety-orange z-20 hidden md:block">
            <span className="font-mono text-[9px] text-safety-orange uppercase tracking-[.4em] font-bold">Logistics Feed</span>
            <p className="text-xs font-medium text-brand-white">Unified Regional Grid Coverage</p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="font-mono text-safety-orange text-[10px] uppercase tracking-[0.4em] mb-8 font-bold">Regional Operations</p>
          <h2 className="font-display font-extrabold text-5xl md:text-6xl uppercase tracking-tighter text-brand-white leading-none mb-10">
            Northern California <br /> <span className="text-slate-500">Service Coverage.</span>
          </h2>
          <p className="text-slate-400 text-lg mb-10 leading-relaxed font-light">
            Strategically headquartered in <span className="text-brand-white font-medium">Fairfield</span>, our units provide total specialized coverage spanning from the Sacramento Valley to the core of the South Bay technological corridor.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div>
              <h4 className="text-[10px] font-mono text-tech-green uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Sacramento & Valley</h4>
              <ul className="space-y-3">
                {["Sacramento", "Fairfield", "Vacaville", "Roseville", "Davis"].map((city) => (
                  <li key={city} className="flex items-center gap-3 text-xs font-mono text-slate-300">
                    <MapPin className="w-3 h-3 text-tech-green shrink-0" />
                    <span>{city}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-mono text-safety-orange uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Bay Area / South Bay</h4>
              <ul className="space-y-3">
                {["San Francisco", "Oakland", "San Jose", "Santa Clara", "Sunnyvale"].map((city) => (
                  <li key={city} className="flex items-center gap-3 text-xs font-mono text-slate-300">
                    <MapPin className="w-3 h-3 text-safety-orange shrink-0" />
                    <span>{city}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button className="text-tech-green font-bold text-[10px] uppercase tracking-[0.4em] flex items-center gap-3 group transition-all hover:gap-5">
            Full Service Area Roadmap <ArrowRight className="w-4 h-4 group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
};
