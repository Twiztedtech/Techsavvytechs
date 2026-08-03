import React from 'react';

const stats = [
  { label: "Local service area", value: "NorCal" },
  { label: "Core service areas", value: "4" },
  { label: "Project planning", value: "On-site" },
  { label: "Support approach", value: "Practical" }
];

export const Stats = () => {
  return (
    <div className="border-y border-brand-slate bg-brand-slate/10 py-16 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-12">
        {stats.map((stat, i) => (
          <div key={i} className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="text-tech-green font-display font-extrabold text-4xl mb-2 tracking-tighter">
              {stat.value}
            </span>
            <span className="text-slate-500 font-mono text-[9px] uppercase tracking-[0.4em] font-bold">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
