import React from 'react';
import { Logo } from '../../Logo';
import { Button } from '../../ui/Button';
import { NavItem, NavDropdownItem } from './NavItem';
import { Link } from 'react-router-dom';

export const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 bg-brand-black/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
        <Link to="/">
          <Logo variant="horizontal" className="scale-90 md:scale-100 origin-left" />
        </Link>
        
        <div className="hidden lg:flex items-center gap-8 font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400 h-full">
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
          </NavItem>

          <a href="#contact" className="hover:text-tech-green transition-colors py-2">Contact</a>
          
          <Button variant="orange" size="sm">
            Get Quote
          </Button>
        </div>

        {/* Mobile menu trigger could go here */}
        <div className="lg:hidden">
          <Button variant="glass" size="sm">Menu</Button>
        </div>
      </div>
    </nav>
  );
};
