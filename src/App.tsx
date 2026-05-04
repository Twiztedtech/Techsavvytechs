/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "motion/react";
import { 
  Cable, 
  Network, 
  ShieldCheck, 
  ArrowRight, 
  MapPin, 
  Phone, 
  Mail, 
  Cpu, 
  Server, 
  Zap 
} from "lucide-react";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-safety-orange selection:text-white">
      {/* Blueprint Grid Overlay */}
      <div className="fixed inset-0 blueprint-grid pointer-events-none z-0 opacity-50" />

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cobalt flex items-center justify-center rounded-sm glow-cobalt">
              <Cpu className="text-white w-6 h-6" />
            </div>
            <span className="font-display font-extrabold text-xl tracking-tighter uppercase">
              Tech Savvy <span className="text-cobalt">Techs</span>
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest text-slate-400">
            <a href="#services" className="hover:text-cobalt transition-colors">Services</a>
            <a href="#about" className="hover:text-cobalt transition-colors">About</a>
            <a href="#contact" className="hover:text-cobalt transition-colors">Contact</a>
            <button className="bg-safety-orange text-white px-5 py-2 rounded-sm font-bold glow-orange hover:scale-105 transition-transform cursor-pointer">
              Get Quote
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow relative z-10">
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 px-6 overflow-hidden">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cobalt/10 border border-cobalt/20 text-cobalt text-xs font-mono mb-6">
                <Zap className="w-3 h-3" />
                <span>NOW SERVING FAIRFIELD & SACRAMENTO</span>
              </div>
              <h1 className="font-display font-extrabold text-6xl md:text-7xl leading-[0.9] mb-6 uppercase tracking-tighter">
                The <span className="text-cobalt">Infrastructure</span> <br /> 
                Of Trust.
              </h1>
              <p className="text-slate-400 text-lg md:text-xl max-w-lg mb-10 font-light leading-relaxed">
                Precision low-voltage cabling, high-performance network infrastructure, 
                and managed IT solutions for businesses that demand zero downtime.
              </p>
              <div className="flex flex-wrap gap-4">
                <button className="bg-safety-orange text-white px-8 py-4 rounded-sm font-bold text-sm uppercase tracking-widest glow-orange flex items-center gap-3 hover:translate-x-1 transition-transform cursor-pointer">
                  Request a Site Survey <ArrowRight className="w-4 h-4" />
                </button>
                <button className="border border-slate-700 hover:border-cobalt px-8 py-4 rounded-sm font-bold text-sm uppercase tracking-widest transition-colors cursor-pointer">
                  Our Portfolio
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative aspect-square lg:aspect-video rounded-lg overflow-hidden border border-slate-800 shadow-2xl bg-black"
            >
              {/* Video with Invert Filter to match Dark Theme */}
              <video 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="object-contain w-full h-full invert brightness-110 contrast-125"
              >
                <source src="https://storage.googleapis.com/creators-ai-studio-public/willjac1%40gmail.com/techsavaytechs.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-6 left-6 right-6 p-4 bg-slate-900/60 backdrop-blur-md border-l-2 border-cobalt">
                <p className="font-mono text-[10px] text-cobalt uppercase tracking-[0.2em] mb-1">Brand Identity</p>
                <p className="text-sm font-medium uppercase tracking-tighter">Tech Savvy Techs - Sacramento Valley</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Technical Stats */}
        <div className="border-y border-slate-800/50 bg-slate-900/20 py-12">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "Uptime Guaranteed", value: "99.9%" },
              { label: "Response Time", value: "< 2HR" },
              { label: "Miles of Cable", value: "500+" },
              { label: "Satisfied Clients", value: "250+" }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-cobalt font-display font-extrabold text-3xl mb-1">{stat.value}</p>
                <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Services Section */}
        <section id="services" className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
              <div>
                <p className="font-mono text-cobalt text-xs uppercase tracking-[0.3em] mb-4">Core Capabilities</p>
                <h2 className="font-display font-extrabold text-4xl md:text-5xl uppercase tracking-tight">
                  Engineered <br /> <span className="text-slate-500">Solutions.</span>
                </h2>
              </div>
              <p className="text-slate-400 max-w-md text-sm leading-relaxed">
                From the physical layer to the cloud, we provide end-to-end technical infrastructure 
                that scales with your business growth.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Low-Voltage Cabling",
                  icon: <Cable className="w-8 h-8" />,
                  desc: "Category 6/6A, Fiber Optic, and Coaxial installations. We specialize in clean, labeled, and certified cable management.",
                  tags: ["Cat6/6A", "Fiber", "Patch Panels"]
                },
                {
                  title: "Network Infrastructure",
                  icon: <Network className="w-8 h-8" />,
                  desc: "Enterprise-grade switching, routing, and wireless solutions. Optimized for speed, security, and redundancy.",
                  tags: ["SD-WAN", "WiFi 6E", "Firewalls"]
                },
                {
                  title: "Managed IT Services",
                  icon: <ShieldCheck className="w-8 h-8" />,
                  desc: "Proactive monitoring, security patching, and 24/7 helpdesk support. Your outsourced IT department.",
                  tags: ["RMM", "Backup/DR", "Security"]
                }
              ].map((service, i) => (
                <motion.div 
                  key={i}
                  whileHover={{ y: -10 }}
                  className="p-8 bg-slate-900/40 border border-slate-800 hover:border-cobalt transition-colors group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                    {service.icon}
                  </div>
                  <div className="text-cobalt mb-6 group-hover:scale-110 transition-transform origin-left">
                    {service.icon}
                  </div>
                  <h3 className="font-display font-bold text-xl mb-4 uppercase tracking-tight">{service.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6">{service.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {service.tags.map((tag, j) => (
                      <span key={j} className="text-[10px] font-mono text-slate-500 border border-slate-800 px-2 py-1 uppercase">{tag}</span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Local Authority Section */}
        <section className="py-32 px-6 bg-slate-900/30 border-y border-slate-800/50">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1">
              <div className="grid grid-cols-2 gap-4">
                <img src="https://picsum.photos/seed/tech1/400/500" alt="Work 1" className="rounded-sm desaturate grayscale hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
                <img src="https://picsum.photos/seed/tech2/400/500" alt="Work 2" className="rounded-sm mt-8 desaturate grayscale hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="font-mono text-safety-orange text-xs uppercase tracking-[0.3em] mb-4">Local Expertise</p>
              <h2 className="font-display font-extrabold text-4xl md:text-5xl uppercase tracking-tight mb-8">
                Serving the <br /> <span className="text-cobalt">Sacramento Valley.</span>
              </h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                Based in Fairfield, we provide rapid-response technical services across the Greater Sacramento area. 
                We understand the local business landscape—from small offices to large industrial complexes.
              </p>
              <ul className="space-y-4 mb-10">
                {[
                  "Fairfield & Vacaville",
                  "Sacramento & Roseville",
                  "Davis & Woodland",
                  "Napa & Sonoma Valley"
                ].map((area, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-mono text-slate-300">
                    <MapPin className="w-4 h-4 text-cobalt" />
                    {area}
                  </li>
                ))}
              </ul>
              <button className="text-cobalt font-bold text-sm uppercase tracking-widest flex items-center gap-2 group cursor-pointer">
                View Service Area Map <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
              </button>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section id="contact" className="py-32 px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <Server className="w-12 h-12 text-cobalt mx-auto mb-8 animate-pulse" />
            <h2 className="font-display font-extrabold text-5xl md:text-6xl uppercase tracking-tighter mb-8">
              Ready to <span className="text-safety-orange">Upgrade?</span>
            </h2>
            <p className="text-slate-400 text-lg mb-12">
              Don't let legacy infrastructure hold your business back. 
              Schedule a site survey today and get a technical roadmap for your success.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <button className="w-full sm:w-auto bg-safety-orange text-white px-10 py-5 rounded-sm font-bold text-sm uppercase tracking-widest glow-orange cursor-pointer">
                Book Site Survey
              </button>
              <div className="flex items-center gap-4 text-slate-400 font-mono text-sm">
                <Phone className="w-4 h-4 text-cobalt" />
                <span>(707) 555-TECH</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800/50 py-20 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-cobalt flex items-center justify-center rounded-sm">
                <Cpu className="text-white w-5 h-5" />
              </div>
              <span className="font-display font-extrabold text-lg tracking-tighter uppercase">
                Tech Savvy <span className="text-cobalt">Techs</span>
              </span>
            </div>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-8">
              Professional Low-Voltage, Networking, and Managed IT Services. 
              Built on precision, secured by expertise.
            </p>
            <div className="flex gap-4">
              <a href="#" className="p-2 border border-slate-800 text-slate-500 hover:text-cobalt hover:border-cobalt transition-all">
                <Mail className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 border border-slate-800 text-slate-500 hover:text-cobalt hover:border-cobalt transition-all">
                <Phone className="w-4 h-4" />
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-6">Services</h4>
            <ul className="space-y-4 text-sm text-slate-500 font-mono">
              <li><a href="#" className="hover:text-off-white transition-colors">Cabling</a></li>
              <li><a href="#" className="hover:text-off-white transition-colors">Networking</a></li>
              <li><a href="#" className="hover:text-off-white transition-colors">MSP</a></li>
              <li><a href="#" className="hover:text-off-white transition-colors">Security</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-slate-500 font-mono">
              <li><a href="#" className="hover:text-off-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-off-white transition-colors">Portfolio</a></li>
              <li><a href="#" className="hover:text-off-white transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-off-white transition-colors">Privacy</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono uppercase tracking-widest">
            © 2026 Tech Savvy Techs. All Rights Reserved.
          </p>
          <div className="flex items-center gap-2 text-slate-600 text-[10px] font-mono uppercase tracking-widest">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            System Status: Operational
          </div>
        </div>
      </footer>
    </div>
  );
}
