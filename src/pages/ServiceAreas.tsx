import React from 'react';
import { motion } from 'motion/react';
import { MapPin, ArrowRight, Shield, Globe } from 'lucide-react';
import { Button } from '../components/ui/Button';

const regions = [
  {
    name: "Sacramento & Valley",
    color: "text-tech-green",
    borderColor: "border-tech-green/30",
    glowColor: "bg-tech-green",
    cities: ["Sacramento", "Fairfield", "Vacaville", "Roseville", "Davis", "Woodland", "Rocklin"]
  },
  {
    name: "Bay Area & South Bay",
    color: "text-safety-orange",
    borderColor: "border-safety-orange/30",
    glowColor: "bg-safety-orange",
    cities: ["San Francisco", "Oakland", "San Jose", "Santa Clara", "Sunnyvale", "Palo Alto", "Mountain View"]
  }
];

const ServiceAreas = () => {
  return (
    <div className="pt-32 pb-24 px-6 relative overflow-hidden">
      {/* Decorative HUD Background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
        <div className="blueprint-grid absolute inset-0" />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-20 items-center mb-32">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <p className="font-mono text-tech-green text-[10px] uppercase tracking-[0.4em] mb-6 font-bold italic">Regional Grid v2.4</p>
            <h1 className="font-display font-extrabold text-6xl md:text-8xl uppercase tracking-tighter text-brand-white leading-[0.85] mb-10">
              Coverage <br /> <span className="text-slate-500">Infrastructure.</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-light leading-relaxed mb-12">
              Our technical deployment units are strategically positioned in Fairfield to provide sub-2-hour onsite response times across the entire Northern California technical corridor.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button variant="orange" size="lg">Check Availability</Button>
              <div className="flex items-center gap-3 px-6 py-4 glass-card rounded-sm text-xs font-mono text-slate-400 uppercase tracking-widest">
                <Globe className="w-4 h-4 text-tech-green animate-spin-slow" />
                <span>Active Network Coverage</span>
              </div>
            </div>
          </motion.div>

          <div className="glass-card p-12 aspect-square relative flex items-center justify-center overflow-hidden group">
            <div className="absolute inset-0 opacity-20 blueprint-grid pointer-events-none" />
            
            <svg viewBox="0 0 400 400" className="w-full h-full text-slate-800 transition-transform duration-1000 group-hover:scale-105">
              <path d="M100,50 L150,80 L200,60 L250,90 L280,150 L260,250 L220,320 L180,350 L120,330 L80,280 L60,180 Z" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
              
              <circle cx="150" cy="120" r="6" fill="#22C55E" className="animate-pulse" />
              <circle cx="210" cy="90" r="4" fill="#22C55E" />
              <circle cx="110" cy="200" r="4" fill="#22C55E" />
              <circle cx="90" cy="280" r="4" fill="#FF8C00" />

              <line x1="150" y1="120" x2="210" y2="90" stroke="#22C55E" strokeWidth="1" opacity="0.4" />
              <line x1="150" y1="120" x2="110" y2="200" stroke="#22C55E" strokeWidth="1" opacity="0.4" />
              <line x1="110" y1="200" x2="90" y2="280" stroke="#FF8C00" strokeWidth="1" opacity="0.4" />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="glass-card px-4 py-2 border-l-2 border-tech-green bg-brand-black/60 backdrop-blur-md -translate-x-16 -translate-y-28">
                <span className="text-[8px] font-mono text-tech-green block">HQ / HUB 01</span>
                <span className="text-[10px] font-bold text-brand-white uppercase whitespace-nowrap">Fairfield Hub</span>
              </div>
              <div className="glass-card px-4 py-2 border-l-2 border-safety-orange bg-brand-black/60 backdrop-blur-md translate-x-20 translate-y-16">
                <span className="text-[8px] font-mono text-safety-orange block">HUB 02</span>
                <span className="text-[10px] font-bold text-brand-white uppercase whitespace-nowrap">South Bay Annex</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          {regions.map((region, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className={`glass-card p-12 border-t-2 ${region.borderColor}`}
            >
              <h3 className={`font-display font-bold text-3xl uppercase tracking-tighter mb-8 ${region.color}`}>{region.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                {region.cities.map((city) => (
                  <div key={city} className="flex items-center gap-3 text-sm font-mono text-slate-400 hover:text-brand-white transition-colors">
                    <MapPin className={`w-3 h-3 ${region.color}`} />
                    <span>{city}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dispatch HUD */}
        <div className="mt-32 p-10 glass-card flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex items-center gap-6">
            <Shield className="w-12 h-12 text-tech-green/30" />
            <div>
              <p className="text-[10px] font-mono text-tech-green uppercase tracking-[0.2em] mb-1">On-Site Standards</p>
              <h4 className="text-lg font-bold text-brand-white uppercase tracking-tight">Rapid Response Deployment Protocol</h4>
            </div>
          </div>
          <p className="text-slate-500 text-sm font-light max-w-sm">
            We maintain fully-equipped service vehicles across the valley to ensure parts and expertise are always within reach.
          </p>
          <Button variant="glass" size="sm">
            Service SLA Details <ArrowRight className="ml-2 w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ServiceAreas;
