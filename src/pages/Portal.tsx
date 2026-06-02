import React from 'react';
import { motion } from 'motion/react';
import { 
  Shield, 
  Lock, 
  ArrowRight, 
  UserCheck, 
  Antenna, 
  Zap, 
  Cpu, 
  Network, 
  Cloud, 
  Radio, 
  Share2, 
  Microchip, 
  Activity, 
  Router, 
  Settings, 
  Camera, 
  Barcode 
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';

const vendors = [
  { name: "AT&T", category: "Carrier", icon: Antenna },
  { name: "T-Mobile", category: "Carrier", icon: Antenna },
  { name: "Nextivity", category: "Infrastructure", icon: Zap },
  { name: "Verizon", category: "Carrier", icon: Antenna },
  { name: "Wilson Connectivity", category: "Signal", icon: Radio },
  { name: "SureCall", category: "Signal", icon: Radio },
  { name: "ATG", category: "Infrastructure", icon: Cpu },
  { name: "Nokia", category: "Infrastructure", icon: Cpu },
  { name: "SOLiD", category: "Distributed Antenna", icon: Network },
  { name: "Highway 9 Networks", category: "Edge Computing", icon: Cloud },
  { name: "Moso Networks", category: "Private 5G", icon: Radio },
  { name: "GXC", category: "Mesh", icon: Share2 },
  { name: "Semtech", category: "LoRaWAN", icon: Microchip },
  { name: "Optical Zonu", category: "Transport", icon: Activity },
  { name: "Peplink", category: "SD-WAN", icon: Router },
  { name: "Simplifi", category: "Management", icon: Settings },
  { name: "Verkada", category: "Security", icon: Camera },
  { name: "Zebra", category: "Industrial IT", icon: Barcode }
];

const Portal = () => {
  return (
    <div className="pt-32 pb-40 px-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-tech-green/5 rounded-full blur-[140px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-20 gap-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tech-green/10 border border-tech-green/20 text-tech-green text-[10px] font-mono mb-6 uppercase tracking-widest">
              <Lock className="w-3 h-3" />
              <span>Multi-Tenant Access Gateway</span>
            </div>
            <h1 className="font-display font-extrabold text-6xl md:text-7xl uppercase tracking-tighter text-brand-white leading-none mb-8">
              Client <br /> <span className="text-slate-500">Access Portal.</span>
            </h1>
            <p className="text-slate-400 text-lg font-light leading-relaxed">
              Secure centralized management for your specialized infrastructure. Select your vendor ecosystem to initialize secure cross-platform synchronization.
            </p>
          </div>
          
          <div className="glass-card p-6 flex items-center gap-6 border-l-2 border-tech-green">
            <div className="w-10 h-10 rounded-full bg-tech-green/20 flex items-center justify-center text-tech-green">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none mb-1">Global Security</p>
              <p className="text-sm font-bold text-brand-white uppercase leading-none">AES-256 Cloud Link</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          {vendors.map((vendor, i) => (
            <Link 
              key={i} 
              to={`/auth?vendor=${encodeURIComponent(vendor.name)}`}
              className="group"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card aspect-square p-8 flex flex-col items-center justify-center text-center transition-all duration-300 group-hover:border-tech-green/40 group-hover:bg-white/5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-3 h-3 text-tech-green" />
                </div>
                
                <div className="mb-4 text-slate-500 group-hover:text-tech-green transition-colors">
                  <vendor.icon className="w-8 h-8" />
                </div>
                
                <span className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.2em] mb-2 group-hover:text-slate-400 transition-colors">
                  {vendor.category}
                </span>
                
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-tight leading-tight group-hover:text-white transition-colors">
                  {vendor.name}
                </h3>
              </motion.div>
            </Link>
          ))}
        </div>

        <div className="mt-32 p-12 glass-card bg-tech-green/5 border border-tech-green/10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 glass-card flex items-center justify-center text-tech-green border-tech-green/20">
              <UserCheck className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-xl font-bold text-brand-white uppercase tracking-tight">Need a Partner Portal?</h4>
              <p className="text-slate-500 text-sm font-light">Request a technical bridge for your project site deployment.</p>
            </div>
          </div>
          <Button variant="orange" className="w-full md:w-auto">Request Integration</Button>
        </div>
      </div>
    </div>
  );
};

export default Portal;
