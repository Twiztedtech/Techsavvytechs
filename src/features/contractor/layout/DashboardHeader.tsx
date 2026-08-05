import type { PortalRole } from '../types';

interface DashboardHeaderProps {
  role: PortalRole;
  canAccessAdmin: boolean;
  onRoleChange: (role: PortalRole) => void;
  onContactAdmin: () => void;
  onSignOut: () => void;
}

export function DashboardHeader({ role, canAccessAdmin, onRoleChange, onContactAdmin, onSignOut }: DashboardHeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded text-base tracking-tighter">TST</div>
          <div>
            <h1 className="font-bold text-sm leading-none text-slate-100">TECH SAVVY TECHS</h1>
            <span className="text-[10px] uppercase font-semibold text-amber-500 tracking-wider">Industrial Contractor Portal</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {canAccessAdmin && (
            <div className="bg-slate-950 border border-slate-800 rounded p-1 flex items-center gap-1">
              <button type="button" onClick={() => onRoleChange('contractor')} className={`px-3 py-1 rounded text-xs font-bold transition ${role === 'contractor' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>Contractor View</button>
              <button type="button" onClick={() => onRoleChange('admin')} className={`px-3 py-1 rounded text-xs font-bold transition ${role === 'admin' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>Admin Mode</button>
            </div>
          )}
          <button type="button" onClick={onContactAdmin} className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/30 text-amber-400 rounded font-semibold transition cursor-pointer flex items-center gap-1"><span>📞</span><span>Contact Admin</span></button>
          <button type="button" onClick={onSignOut} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition cursor-pointer">Sign Out</button>
        </div>
      </div>
    </header>
  );
}
