import React from 'react';
import { motion } from 'motion/react';
import { Cable, Network, ShieldCheck } from 'lucide-react';

const services = [
  {
    title: "Low-Voltage",
    icon: <Cable className="w-10 h-10" />,
    desc: "Certified Cat6, Cat6A, and multi-mode fiber installations. Precision dressing and labeling for clean, manageable racks.",
    tags: ["Certified", "Fiber", "Rack Dressing"]
  },
  {
    title: "Infrastructure",
    icon: <Network className="w-10 h-10" />,
    desc: "Robust network architecture, SD-WAN deployments, and security appliance configuration. Built for fail-safe operations.",
    tags: ["SD-WAN", "Topology", "Wireless"]
  },
  {
    title: "MSP Solutions",
    icon: <ShieldCheck className="w-10 h-10" />,
    desc: "Proactive monitoring, remote firmware management, and holistic security auditing. We manage the tech so you don't have to.",
    tags: ["Monitoring", "Security", "Support"]
  }
];

export const Services = () => {
  return (
    <section id="services" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-24 gap-10">
          <div className="max-w-xl">
            <p className="font-mono text-tech-green text-[10px] uppercase tracking-[0.4em] mb-6 font-bold">Solutions Portfolio</p>
            <h2 className="font-display font-extrabold text-5xl md:text-6xl uppercase tracking-tighter text-brand-white leading-none">
              High-Value <br /> <span className="text-slate-500">Engineering.</span>
            </h2>
          </div>
          <p className="text-slate-400 max-w-sm text-sm leading-relaxed font-light">
            We operate at the intersection of performance and security, ensuring your business backbone is resilient, 
            scalable, and high-performance.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {services.map((service, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-10 glass-card group transition-all duration-500 hover:border-tech-green/30 relative overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-tech-green/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="text-tech-green mb-10 transform transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3">
                {service.icon}
              </div>
              <h3 className="font-display font-bold text-2xl mb-6 uppercase tracking-tight text-brand-white">{service.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 font-light">{service.desc}</p>
              <div className="flex flex-wrap gap-2">
                {service.tags.map((tag, j) => (
                  <span key={j} className="text-[9px] font-mono text-slate-500 border border-white/5 bg-white/5 px-2 py-1 uppercase font-bold">{tag}</span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
