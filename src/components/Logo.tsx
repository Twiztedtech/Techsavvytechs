import React from 'react';

interface LogoProps {
  variant?: 'icon' | 'horizontal' | 'stacked';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ variant = 'horizontal', className = '' }) => {
  const IconOnly = (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      {/* T Top Bar */}
      <path d="M10 10H90V25H10V10Z" fill="#22C55E" />
      
      {/* The Styled S part (Recreated approximately) */}
      <path 
        d="M25 35H75V50H40V65H75V85H25V70H60V55H25V35Z" 
        fill="#F9FAFB" 
      />
      
      {/* The Stem part that interlocks */}
      <path d="M42 25H58V50H42V25Z" fill="#22C55E" />
      <path d="M42 55H58V75H42V55Z" fill="#22C55E" />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <div className={`aspect-square ${className}`}>
        {IconOnly}
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <div className="w-12 h-12">
          {IconOnly}
        </div>
        <div className="flex flex-col">
          <div className="text-3xl font-display font-bold tracking-tighter leading-none">
            <span className="text-brand-white">Tech</span><span className="text-tech-green">Savvy</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-[1px] flex-grow bg-tech-green/50"></div>
            <span className="text-[10px] font-mono text-brand-white tracking-[0.4em] uppercase">LLC</span>
            <div className="h-[1px] flex-grow bg-tech-green/50"></div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="w-16 h-16 mb-4">
          {IconOnly}
        </div>
        <div className="text-4xl font-display font-bold tracking-tighter leading-none text-center">
          <span className="text-brand-white">Tech</span><span className="text-tech-green">Savvy</span>
        </div>
        <div className="flex items-center gap-3 mt-2 w-full max-w-[120px]">
          <div className="h-[1px] flex-grow bg-tech-green/50"></div>
          <span className="text-xs font-mono text-brand-white tracking-[0.4em] uppercase">LLC</span>
          <div className="h-[1px] flex-grow bg-tech-green/50"></div>
        </div>
      </div>
    );
  }

  return null;
};
