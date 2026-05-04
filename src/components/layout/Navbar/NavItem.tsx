import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Link } from 'react-router-dom';

interface NavItemProps {
  label: string;
  href?: string;
  children?: React.ReactNode;
}

export const NavItem: React.FC<NavItemProps> = ({ label, href, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const content = (
    <div className={cn(
      "flex items-center gap-1.5 hover:text-tech-green transition-colors py-2",
      isOpen && "text-tech-green"
    )}>
      {label}
      {children && (
        <ChevronDown 
          className={cn(
            "w-3 h-3 transition-transform duration-300",
            isOpen && "rotate-180"
          )} 
        />
      )}
    </div>
  );

  return (
    <div 
      className="relative group h-full flex items-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {href ? (
        <Link to={href}>{content}</Link>
      ) : (
        <button className="cursor-default">{content}</button>
      )}

      <AnimatePresence>
        {isOpen && children && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full left-0 mt-0 pt-2 z-50 min-w-[240px]"
          >
            <div className="glass-card bg-brand-black/95 backdrop-blur-xl p-4 rounded-sm border border-white/5 shadow-2xl">
              <div className="flex flex-col gap-1">
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const NavDropdownItem: React.FC<{ label: string; href: string; description?: string }> = ({ label, href, description }) => (
  <Link 
    to={href} 
    className="group/item p-3 flex flex-col hover:bg-white/5 rounded-sm transition-all border border-transparent hover:border-white/5"
  >
    <span className="text-[11px] font-bold text-brand-white group-hover/item:text-tech-green transition-colors uppercase tracking-widest">{label}</span>
    {description && (
      <span className="text-[9px] text-slate-500 font-medium mt-1 leading-tight group-hover/item:text-slate-400 transition-colors">{description}</span>
    )}
  </Link>
);
