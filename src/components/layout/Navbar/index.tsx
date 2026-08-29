import React, { useState } from 'react';
import { Logo } from '../../Logo';
import { Button } from '../../ui/Button';
import { NavItem, NavDropdownItem } from './NavItem';
import { Link } from 'react-router';
import { Menu, X } from 'lucide-react';

export const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav className="sticky top-0 z-50 bg-brand-black/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
        <Link to="/">
          <Logo variant="horizontal" className="scale-90 md:scale-100 origin-left" />
        </Link>
        
        <div className="hidden lg:flex items-center gap-8 font-mono text-[13px] uppercase tracking-[0.18em] text-slate-400 h-full">
          <NavItem label="Services">
            <NavDropdownItem 
              label="Low-Voltage Cabling" 
              href="/services/low-voltage" 
              description="Cat6, Cat6A, & Fiber Certifications"
            />
            <NavDropdownItem 
              label="Infrastructure" 
              href="/services/infrastructure" 
              description="Enterprise Switching & Topology"
            />
            <NavDropdownItem 
              label="MSP Solutions" 
              href="/services/msp" 
              description="24/7 Managed Support Systems"
            />
          </NavItem>

          <NavItem label="Cell Signal Boosting">
            <NavDropdownItem 
              label="Commercial Boosting" 
              href="/services/cell-boosting" 
              description="Multi-story Signal Distribution"
            />
            <NavDropdownItem 
              label="Residential Solutions" 
              href="/services/cell-boosting" 
              description="Unified Home Coverage"
            />
          </NavItem>

          <NavItem label="About TechSavvy">
            <NavDropdownItem 
              label="Our Mission" 
              href="/about/mission" 
              description="Quality & Performance First"
            />
            <NavDropdownItem 
              label="Service Areas" 
              href="/about/service-areas" 
              description="Serving the Sacramento Region"
            />
            <NavDropdownItem 
              label="Client Portal" 
              href="/portal" 
              description="Access Management Console"
            />
            <NavDropdownItem
              label="CRM Command Center"
              href="/crm"
              description="Customers, Pipeline & Field Operations"
            />
          </NavItem>

          <NavItem label="Contractor Portal">
            <NavDropdownItem 
              label="Contractor Login" 
              href="/contractor/dashboard" 
              description="Access Subcontractor Resources"
            />
            <NavDropdownItem 
              label="Work Orders" 
              href="/portal" 
              description="Active Field Service Tickets"
            />
          </NavItem>

          <Link to="/contact" className="hover:text-tech-green transition-colors py-2">Contact</Link>
          <Link to="/blog" className="hover:text-tech-green transition-colors py-2">Blog</Link>
          
          <Link to="/contact">
            <Button variant="orange" size="sm">
              Get Quote
            </Button>
          </Link>
        </div>

        <div className="lg:hidden">
          <button
            type="button"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="glass-button inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-white"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            {isMobileMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div id="mobile-navigation" className="lg:hidden border-t border-white/5 bg-brand-black/95 px-6 py-6 shadow-2xl">
          <div className="mx-auto grid max-w-7xl gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            <p className="mb-2 text-[10px] font-mono tracking-[0.3em] text-tech-green">Services</p>
            <Link to="/services/low-voltage" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Low-Voltage Cabling</Link>
            <Link to="/services/infrastructure" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Infrastructure</Link>
            <Link to="/services/msp" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">MSP Solutions</Link>
            <Link to="/services/cell-boosting" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Cell Signal Boosting</Link>

            <div className="my-3 border-t border-white/5" />
            <Link to="/about/mission" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">About TechSavvy</Link>
            <Link to="/about/service-areas" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Service Areas</Link>
            <Link to="/contractor/dashboard" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Contractor Portal</Link>
            <Link to="/crm" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">CRM Command Center</Link>
            <Link to="/contact" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Contact</Link>
            <Link to="/blog" onClick={closeMobileMenu} className="rounded-sm px-4 py-3 hover:bg-white/5 hover:text-tech-green">Blog</Link>
            <Link to="/contact" onClick={closeMobileMenu} className="mt-3 bg-safety-orange px-4 py-3 text-center text-brand-black hover:bg-orange-400">Get a Quote</Link>
          </div>
        </div>
      )}
    </nav>
  );
};
