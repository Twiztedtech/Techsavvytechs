import { useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, BriefcaseBusiness, Building2, CalendarClock,
  CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, Clock3,
  FileText, Filter, Globe2, HardHat, History, Inbox, LayoutDashboard,
  Mail, MapPin, MessageSquareText, MoreHorizontal, Phone, Plus,
  Search, Send, Sparkles, Users, Wrench,
} from 'lucide-react';

type Section = 'overview' | 'customers' | 'pipeline' | 'jobs' | 'quotes' | 'followups' | 'intake' | 'technicians' | 'history';

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
  { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
  { id: 'customers', label: 'Leads & Customers', icon: Users, count: 48 },
  { id: 'pipeline', label: 'Opportunities', icon: CircleDollarSign, count: 12 },
  { id: 'jobs', label: 'Active Jobs', icon: BriefcaseBusiness, count: 7 },
  { id: 'quotes', label: 'Quotes', icon: FileText, count: 5 },
  { id: 'followups', label: 'Follow-ups', icon: CalendarClock, count: 6 },
  { id: 'intake', label: 'Web Intake', icon: Inbox, count: 3 },
  { id: 'technicians', label: 'Technician Activity', icon: HardHat },
  { id: 'history', label: 'Customer History', icon: History },
];

const opportunities = [
  { company: 'River City Dental', service: 'Network refresh', value: '$18,400', stage: 'Site survey', age: '2d', tone: 'green' },
  { company: 'Ghilotti Construction', service: 'Low-voltage buildout', value: '$42,800', stage: 'Quote sent', age: '1d', tone: 'orange' },
  { company: 'Oak Park Storage', service: 'Camera & access control', value: '$12,600', stage: 'Qualified', age: '4d', tone: 'blue' },
  { company: 'Sierra Commerce', service: 'Cell signal boosting', value: '$31,200', stage: 'Discovery', age: '6h', tone: 'purple' },
];

const jobs = [
  { code: 'WO-2026-1842', client: 'Ghilotti Construction', title: 'MDF / IDF fiber backbone', location: 'Sacramento, CA', tech: 'Marcus J.', progress: 72, status: 'On site' },
  { code: 'WO-2026-1839', client: 'River City Dental', title: 'Switch replacement & cutover', location: 'Roseville, CA', tech: 'Elena R.', progress: 46, status: 'In progress' },
  { code: 'WO-2026-1834', client: 'Oak Park Storage', title: 'Camera commissioning', location: 'Elk Grove, CA', tech: 'Devon K.', progress: 88, status: 'Testing' },
];

const intake = [
  { source: 'Contact form', name: 'Alicia Moreno', company: 'Northgate Pediatrics', request: 'Wi-Fi dead zones across two floors', time: '14 min ago', icon: Globe2 },
  { source: 'Quote request', name: 'Jordan Lee', company: 'Capitol Foods', request: '48-drop Cat6A warehouse installation', time: '1 hr ago', icon: FileText },
  { source: 'Booking', name: 'Sam Patel', company: 'Patel Property Group', request: 'Site survey · Tue, Sep 1 at 10:00 AM', time: '3 hrs ago', icon: CalendarClock },
];

const followups = [
  { time: '9:00 AM', person: 'Dana Wu', company: 'Sierra Commerce', task: 'Review DAS site survey', type: 'Call' },
  { time: '11:30 AM', person: 'Chris Moore', company: 'River City Dental', task: 'Confirm cutover window', type: 'Email' },
  { time: '2:00 PM', person: 'Alicia Moreno', company: 'Northgate Pediatrics', task: 'Qualify website request', type: 'Call' },
];

const metricCards = [
  { label: 'Open pipeline', value: '$186.4K', delta: '+18.2%', helper: 'vs. last month', icon: CircleDollarSign, color: 'text-tech-green' },
  { label: 'Active jobs', value: '7', delta: '3 on site', helper: '2 due this week', icon: Wrench, color: 'text-safety-orange' },
  { label: 'New inquiries', value: '14', delta: '+6 this week', helper: '3 need review', icon: Inbox, color: 'text-sky-400' },
  { label: 'Quote win rate', value: '68%', delta: '+4.5 pts', helper: 'rolling 90 days', icon: CheckCircle2, color: 'text-violet-400' },
];

export default function CRM() {
  const [active, setActive] = useState<Section>('overview');
  const [query, setQuery] = useState('');
  const filteredOpportunities = useMemo(() => opportunities.filter((item) => `${item.company} ${item.service}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <div className="min-h-screen bg-[#090d0a] text-brand-white">
      <div className="border-b border-white/5 bg-brand-slate/60">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.22em] text-slate-400">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-tech-green/30 bg-tech-green/10 text-tech-green"><Activity className="h-4 w-4" /></span>
            CRM Command Center <span className="hidden text-slate-700 sm:inline">/</span><span className="hidden text-slate-500 sm:inline">Operations live</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-tech-green"><span className="h-2 w-2 animate-pulse rounded-full bg-tech-green" /> All systems online</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-white/5 bg-[#0d120e]/85 p-4 lg:min-h-[calc(100vh-49px)] lg:border-b-0 lg:border-r lg:p-5">
          <div className="mb-5 hidden px-3 pt-2 lg:block">
            <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-slate-600">Workspace</p>
            <p className="mt-2 font-display text-sm uppercase">TechSavvy Ops</p>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1">
            {navItems.map(({ id, label, icon: Icon, count }) => (
              <button key={id} onClick={() => setActive(id)} className={`flex min-w-max items-center gap-3 rounded-sm border px-3 py-2.5 text-left text-xs font-medium transition lg:w-full ${active === id ? 'border-tech-green/25 bg-tech-green/10 text-tech-green' : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>
                <Icon className="h-4 w-4" /><span className="flex-1">{label}</span>{count && <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[9px] text-slate-500">{count}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-8 hidden rounded-sm border border-safety-orange/20 bg-safety-orange/[0.06] p-4 lg:block">
            <div className="mb-3 flex items-center gap-2 text-safety-orange"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-mono uppercase tracking-widest">Priority signal</span></div>
            <p className="text-xs leading-relaxed text-slate-300">3 new website inquiries are waiting for qualification.</p>
            <button onClick={() => setActive('intake')} className="mt-3 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-safety-orange">Review intake <ChevronRight className="h-3 w-3" /></button>
          </div>
        </aside>

        <main className="min-w-0 px-5 py-7 lg:px-8 lg:py-8">
          <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div><p className="mb-2 text-[10px] font-mono uppercase tracking-[0.3em] text-tech-green">Sales + field operations</p><h1 className="font-display text-2xl uppercase tracking-tight md:text-3xl">{navItems.find((item) => item.id === active)?.label}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">One view from first inquiry to completed work order.</p></div>
            <div className="flex flex-wrap gap-2"><label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2.5 text-slate-500"><Search className="h-4 w-4" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search CRM…" className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></label><button className="glass-button flex items-center gap-2 rounded-sm px-3 py-2 text-xs text-slate-300"><Filter className="h-4 w-4" /> Filter</button><button className="flex items-center gap-2 rounded-sm bg-tech-green px-4 py-2 text-xs font-bold uppercase tracking-wider text-brand-black hover:bg-green-400"><Plus className="h-4 w-4" /> New record</button></div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map(({ label, value, delta, helper, icon: Icon, color }) => <article key={label} className="glass-card rounded-sm p-5"><div className="mb-5 flex items-center justify-between"><span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">{label}</span><Icon className={`h-4 w-4 ${color}`} /></div><div className="flex items-end justify-between gap-3"><span className="font-display text-2xl">{value}</span><div className="text-right"><p className={`text-[11px] font-medium ${color}`}>{delta}</p><p className="text-[10px] text-slate-600">{helper}</p></div></div></article>)}
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
            <section className="glass-card overflow-hidden rounded-sm">
              <header className="flex items-center justify-between border-b border-white/5 px-5 py-4"><div><h2 className="text-sm font-bold">Opportunity pipeline</h2><p className="mt-1 text-[11px] text-slate-500">$105K represented in current view</p></div><button className="text-slate-500 hover:text-white"><MoreHorizontal className="h-5 w-5" /></button></header>
              <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="border-b border-white/5 bg-white/[0.015] text-[9px] font-mono uppercase tracking-[0.18em] text-slate-600"><tr><th className="px-5 py-3 font-normal">Account / Scope</th><th className="px-4 py-3 font-normal">Stage</th><th className="px-4 py-3 font-normal">Value</th><th className="px-4 py-3 font-normal">Age</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-white/5">{filteredOpportunities.map((item) => <tr key={item.company} className="group hover:bg-white/[0.025]"><td className="px-5 py-4"><p className="text-xs font-semibold text-slate-200">{item.company}</p><p className="mt-1 text-[11px] text-slate-500">{item.service}</p></td><td className="px-4 py-4"><span className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-300">{item.stage}</span></td><td className="px-4 py-4 font-mono text-xs text-slate-200">{item.value}</td><td className="px-4 py-4 text-[11px] text-slate-500">{item.age}</td><td className="px-4 py-4"><ArrowUpRight className="h-4 w-4 text-slate-600 group-hover:text-tech-green" /></td></tr>)}</tbody></table></div>
            </section>

            <section className="glass-card rounded-sm"><header className="flex items-center justify-between border-b border-white/5 px-5 py-4"><div><h2 className="text-sm font-bold">Today’s follow-ups</h2><p className="mt-1 text-[11px] text-slate-500">3 of 6 scheduled</p></div><CalendarClock className="h-4 w-4 text-safety-orange" /></header><div className="divide-y divide-white/5">{followups.map((item) => <div key={item.person} className="flex gap-4 px-5 py-4"><span className="w-16 pt-0.5 font-mono text-[10px] text-tech-green">{item.time}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-slate-200">{item.task}</p><span className="text-slate-600">{item.type === 'Call' ? <Phone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{item.person} · {item.company}</p></div></div>)}</div><button className="m-4 mt-3 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-sm border border-white/10 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:border-tech-green/30 hover:text-tech-green">View schedule <ChevronRight className="h-3 w-3" /></button></section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <section className="glass-card rounded-sm"><header className="flex items-center justify-between border-b border-white/5 px-5 py-4"><div><h2 className="text-sm font-bold">Active field jobs</h2><p className="mt-1 text-[11px] text-slate-500">Live status from technician assignments</p></div><span className="flex items-center gap-2 text-[10px] font-mono uppercase text-tech-green"><span className="h-1.5 w-1.5 rounded-full bg-tech-green" /> Live</span></header><div className="divide-y divide-white/5">{jobs.map((job) => <div key={job.code} className="px-5 py-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[9px] text-tech-green">{job.code}</span><span className="rounded-full bg-safety-orange/10 px-2 py-0.5 text-[9px] text-safety-orange">{job.status}</span></div><p className="mt-1.5 text-xs font-semibold text-slate-200">{job.title}</p><p className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{job.client}</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span></p></div><div className="min-w-[180px]"><div className="mb-2 flex justify-between text-[10px]"><span className="text-slate-500">{job.tech}</span><span className="font-mono text-slate-300">{job.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-tech-green" style={{ width: `${job.progress}%` }} /></div></div></div></div>)}</div></section>

            <section className="glass-card rounded-sm"><header className="flex items-center justify-between border-b border-white/5 px-5 py-4"><div><h2 className="text-sm font-bold">Website & booking intake</h2><p className="mt-1 text-[11px] text-slate-500">Automatically captured requests</p></div><Inbox className="h-4 w-4 text-sky-400" /></header><div className="divide-y divide-white/5">{intake.map(({ source, name, company, request, time, icon: Icon }) => <div key={name} className="px-5 py-4"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-sky-400"><Icon className="h-3 w-3" />{source}</span><span className="text-[9px] text-slate-600">{time}</span></div><p className="text-xs font-semibold text-slate-200">{name} <span className="font-normal text-slate-600">· {company}</span></p><p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{request}</p><div className="mt-3 flex gap-2"><button className="flex items-center gap-1 rounded-sm bg-tech-green/10 px-2 py-1 text-[9px] font-bold uppercase text-tech-green"><CheckCircle2 className="h-3 w-3" /> Qualify</button><button className="flex items-center gap-1 rounded-sm bg-white/5 px-2 py-1 text-[9px] font-bold uppercase text-slate-400"><MessageSquareText className="h-3 w-3" /> Reply</button></div></div>)}</div></section>
          </div>

          <footer className="mt-5 flex flex-col justify-between gap-2 border-t border-white/5 pt-5 text-[9px] font-mono uppercase tracking-widest text-slate-700 sm:flex-row"><span>TechSavvy CRM · Sacramento operations</span><span className="flex items-center gap-2"><Clock3 className="h-3 w-3" /> Last synchronized just now <Send className="ml-2 h-3 w-3" /></span></footer>
        </main>
      </div>
    </div>
  );
}
