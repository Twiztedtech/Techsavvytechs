import React from 'react';
import { motion } from 'motion/react';
import { MapPin, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../ui/Button';

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
          <div className="glass-card p-0 aspect-[4/3] relative flex items-center justify-center overflow-hidden group">
            <img 
              src="/technician-server-install.jpg" 
              alt="Enterprise Infrastructure Installation" 
              className="object-cover w-full h-full transition-transform duration-1000 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-black/50 via-transparent to-transparent pointer-events-none" />

            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="glass-card px-4 py-2 border-l-2 border-tech-green bg-brand-black/60 backdrop-blur-sm -translate-x-10">
                <span className="text-[10px] font-bold text-brand-white uppercase leading-none">Regional Grid Coverage</span>
              </div>
            </div>
          </div>
          
          <div className="absolute -bottom-6 -left-6 glass-card p-4 border-l-2 border-safety-orange z-20 hidden md:block">
            <span className="font-mono text-[9px] text-safety-orange uppercase tracking-[.4em] font-bold">Operational Map</span>
            <p className="text-xs font-medium text-brand-white">Fairfield • Sacramento • South Bay</p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="font-mono text-safety-orange text-[10px] uppercase tracking-[0.4em] mb-8 font-bold">Local Authority</p>
          <h2 className="font-display font-extrabold text-5xl md:text-6xl uppercase tracking-tighter text-brand-white leading-none mb-10">
            Regional <br /> <span className="text-slate-500">Scale.</span>
          </h2>
          <p className="text-slate-400 text-lg mb-10 leading-relaxed font-light">
            Headquartered in Fairfield, we deploy high-performance technical infrastructure across the Sacramento Valley and down into the South Bay technical corridor.
          </p>
          
          <Link to="/about/service-areas">
            <Button variant="orange" size="md" className="group">
              Explore Our Service Map <ArrowRight className="w-4 h-4 ml-3 group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
