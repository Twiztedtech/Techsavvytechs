import React from 'react';
import { motion } from 'motion/react';
import { Button } from '../ui/Button';
import { ArrowRight, Zap } from 'lucide-react';

export const Hero = () => {
  return (
    <section className="relative pt-32 pb-24 px-6 overflow-hidden min-h-[90vh] flex items-center">
      {/* Decorative Blur */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-tech-green/5 rounded-full blur-[120px] pointer-events-none translate-x-1/2 -translate-y-1/2" />
      
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass-card text-tech-green text-[10px] font-mono mb-10 tracking-[0.2em] uppercase">
            <Zap className="w-3 h-3 animate-pulse" />
            <span>Serving Fairfield, Sacramento & The Bay Area</span>
          </div>
          
          <h1 className="font-display font-extrabold text-7xl md:text-8xl leading-[0.85] mb-8 uppercase tracking-tighter text-brand-white">
            The <span className="text-tech-green">Tech</span> <br /> 
            Savvy <span className="text-slate-500">Way.</span>
          </h1>
          
          <p className="text-slate-400 text-lg md:text-xl max-w-xl mb-12 font-light leading-relaxed">
            High-performance low-voltage cabling, resilient network architecture, 
            and managed IT services for California businesses that outpace the status quo.
          </p>
          
          <div className="flex flex-wrap gap-5">
            <Button variant="orange" size="lg" className="group">
              Request site survey
              <ArrowRight className="w-4 h-4 ml-3 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button variant="glass" size="lg">
              Our Capabilities
            </Button>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="relative aspect-square lg:aspect-[4/3] glass-card p-2 rounded-lg shadow-2xl group overflow-hidden"
        >
          <div className="absolute inset-0 z-10 bg-gradient-to-tr from-brand-black/40 to-transparent pointer-events-none" />
          
          {/* Animated Scanning Line */}
          <motion.div 
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-[1px] bg-tech-green/40 z-30 shadow-[0_0_10px_rgba(34,197,94,0.5)] pointer-events-none"
          />

          {/* HUD Elements */}
          <div className="absolute top-8 left-8 z-30 font-mono text-[8px] text-tech-green/60 uppercase tracking-[0.2em] space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 bg-tech-green rounded-full animate-ping" />
              <span>Diagnostic Feed: Active</span>
            </div>
            <div>Secure Link: 256-bit AES</div>
          </div>

          <div className="absolute top-8 right-8 z-30 font-mono text-[8px] text-tech-green/60 uppercase tracking-[0.2em] text-right">
            <div>38.3498° N</div>
            <div>121.9818° W</div>
          </div>

          {/* Video with Invert Filter */}
          <video 
            autoPlay 
            loop 
            muted 
            playsInline 
            className="object-contain w-full h-full invert brightness-110 contrast-125 opacity-90 transition-transform duration-1000 group-hover:scale-105"
          >
            <source src="https://storage.googleapis.com/creators-ai-studio-public/willjac1%40gmail.com/techsavaytechs.mp4" type="video/mp4" />
          </video>
          
          <div className="absolute bottom-10 left-10 right-10 p-6 glass-card border-l-2 border-tech-green z-20">
            <p className="font-mono text-[9px] text-tech-green uppercase tracking-[0.4em] mb-2 font-bold italic">Operational Range</p>
            <p className="text-sm font-medium tracking-tight text-brand-white uppercase leading-tight">
              Fairfield • Sacramento • South Bay <br /> 
              Enterprise Systems Deployment
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
