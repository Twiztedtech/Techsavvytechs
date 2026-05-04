import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '@/src/lib/utils'; // I'll create this helper in a second

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'glass' | 'green' | 'orange';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'glass', 
  size = 'md', 
  className, 
  children, 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-bold uppercase tracking-widest transition-all focus:outline-none rounded-sm cursor-pointer";
  
  const variants = {
    primary: "bg-tech-green text-brand-black glow-green hover:scale-[1.02]",
    secondary: "border border-brand-slate text-brand-white hover:border-tech-green",
    glass: "glass-button text-brand-white",
    green: "glass-button glass-green text-tech-green glow-green hover:scale-[1.02]",
    orange: "glass-button glass-orange text-safety-orange glow-orange hover:scale-[1.02]"
  };

  const sizes = {
    sm: "px-4 py-2 text-[10px]",
    md: "px-6 py-3 text-xs",
    lg: "px-8 py-4 text-sm"
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </motion.button>
  );
};
