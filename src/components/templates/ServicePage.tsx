import React from 'react';
import { motion } from 'motion/react';
import { Shield, CheckCircle, Zap, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

interface ServicePageProps {
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  imageSeed: string;
}

const ServicePage: React.FC<ServicePageProps> = ({ title, subtitle, description, features, imageSeed }) => {
  return (
    <div className="pt-32 pb-24 px-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-tech-green/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid lg:grid-cols-2 gap-20 items-center mb-32"
        >
          <div>
            <p className="font-mono text-tech-green text-[10px] uppercase tracking-[0.4em] mb-6 font-bold">{subtitle}</p>
            <h1 className="font-display font-extrabold text-6xl md:text-7xl uppercase tracking-tighter text-brand-white leading-none mb-10">
              {title.split(' ').slice(0, -1).join(' ')} <span className="text-slate-500">{title.split(' ').slice(-1)}</span>
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-light leading-relaxed mb-12">
              {description}
            </p>
            <div className="flex gap-6">
              <Button variant="orange" size="lg">Consultation</Button>
              <Button variant="glass" size="lg">Case Studies</Button>
            </div>
          </div>
          
          <div className="glass-card p-1 rounded-sm relative group overflow-hidden aspect-video">
            <img 
              src={imageSeed.startsWith('http') ? imageSeed : `https://picsum.photos/seed/${imageSeed}/1200/800`} 
              alt={title} 
              className="w-full h-full object-cover desaturate brightness-75 hover:brightness-100 hover:desaturate-0 transition-all duration-700"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-brand-black/20 group-hover:bg-transparent transition-colors" />
            <div className="absolute bottom-6 left-6 glass-card p-4 border-l-2 border-tech-green">
              <p className="font-mono text-[8px] text-tech-green uppercase tracking-widest font-bold">Project Ref: 00491-X</p>
              <p className="text-xs text-brand-white font-medium">Standardized Deployment Hub</p>
            </div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-12">
          {features.map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-10 border-t-2 border-brand-slate hover:border-tech-green transition-all"
            >
              <CheckCircle className="w-8 h-8 text-tech-green mb-6" />
              <h3 className="text-xl font-bold uppercase tracking-tight text-brand-white mb-4">{feature}</h3>
              <p className="text-slate-400 text-sm font-light">
                Enterprise-grade implementation ensuring peak performance and total reliability in mission-critical environments.
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Decorative HUD Elements */}
      <div className="max-w-7xl mx-auto mt-32 p-10 glass-card flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Shield className="w-10 h-10 text-tech-green/40" />
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Industry Standard Compliance</p>
            <p className="text-sm font-medium text-brand-white uppercase">ISO 27001 & TIA-568 Certified Workflows</p>
          </div>
        </div>
        <Button variant="glass" size="sm" className="hidden md:flex">
          Download Site Specs <ArrowRight className="ml-2 w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

export default ServicePage;
