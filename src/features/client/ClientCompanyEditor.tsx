import React, { useMemo, useState } from 'react';
import { Building2, Plus, Trash2, Users } from 'lucide-react';

type PersonnelRole = 'requester' | 'sales' | 'project_manager' | 'payroll' | 'accounts_payable' | 'manager' | 'other';
type Personnel = { id?: string; name: string; email: string; role: PersonnelRole; active?: boolean };
type Organization = {
  id: string;
  name?: string;
  approvedDomains?: string[];
  referencePrefixes?: string[];
  personnel?: Personnel[];
  billingRecipientEmails?: string[];
  billingEmail?: string;
  defaultContactPolicy?: string;
};

const blankPerson = (): Personnel => ({ name: '', email: '', role: 'sales', active: true });
const blankCompany = () => ({ organizationId: '', name: '', approvedDomains: '', referencePrefixes: '', personnel: [blankPerson()], billingRecipientEmails: [] as string[], defaultContactPolicy: 'techsavvy_only' });

const roleLabels: Record<PersonnelRole, string> = {
  requester: 'Requester', sales: 'Sales', project_manager: 'Project manager', payroll: 'Payroll', accounts_payable: 'Accounts payable', manager: 'Manager', other: 'Other',
};

export function ClientCompanyEditor({ organizations, post }: { organizations: Organization[]; post: (action: string, body: unknown) => Promise<void> }) {
  const [company, setCompany] = useState(blankCompany);
  const personnelEmails = useMemo(() => company.personnel.map((person) => person.email.trim().toLowerCase()).filter(Boolean), [company.personnel]);

  const chooseCompany = (organizationId: string) => {
    if (!organizationId) { setCompany(blankCompany()); return; }
    const selected = organizations.find((organization) => organization.id === organizationId);
    if (!selected) return;
    setCompany({
      organizationId: selected.id,
      name: selected.name || '',
      approvedDomains: (selected.approvedDomains || []).join(', '),
      referencePrefixes: (selected.referencePrefixes || []).join(', '),
      personnel: selected.personnel?.length ? selected.personnel.map((person) => ({ ...person, active: person.active !== false })) : [blankPerson()],
      billingRecipientEmails: selected.billingRecipientEmails || [selected.billingEmail].filter(Boolean) as string[],
      defaultContactPolicy: selected.defaultContactPolicy || 'techsavvy_only',
    });
  };

  const updatePerson = (index: number, field: keyof Personnel, value: string) => setCompany((current) => ({
    ...current,
    personnel: current.personnel.map((person, personIndex) => personIndex === index ? { ...person, [field]: value } : person),
  }));

  const removePerson = (index: number) => setCompany((current) => {
    const removedEmail = current.personnel[index]?.email.trim().toLowerCase();
    const personnel = current.personnel.filter((_, personIndex) => personIndex !== index);
    return { ...current, personnel: personnel.length ? personnel : [blankPerson()], billingRecipientEmails: current.billingRecipientEmails.filter((email) => email !== removedEmail) };
  });

  const toggleBillingRecipient = (email: string) => setCompany((current) => ({
    ...current,
    billingRecipientEmails: current.billingRecipientEmails.includes(email)
      ? current.billingRecipientEmails.filter((value) => value !== email)
      : [...current.billingRecipientEmails, email],
  }));

  const save = async () => {
    const personnel = company.personnel.filter((person) => person.name.trim() || person.email.trim());
    await post('organization', {
      organizationId: company.organizationId || undefined,
      name: company.name,
      approvedDomains: company.approvedDomains.split(',').map((value) => value.trim()).filter(Boolean),
      referencePrefixes: company.referencePrefixes.split(',').map((value) => value.trim()).filter(Boolean),
      personnel,
      billingRecipientEmails: company.billingRecipientEmails.filter((email) => personnelEmails.includes(email)),
      defaultContactPolicy: company.defaultContactPolicy,
    });
    if (!company.organizationId) setCompany(blankCompany());
  };

  return <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white"><Building2 className="h-4 w-4 text-green-400"/>Client company & personnel</h3>
    <div className="grid gap-3">
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Company record
        <select value={company.organizationId} onChange={(event) => chooseCompany(event.target.value)} className="mt-1 w-full rounded border border-slate-800 bg-slate-900 p-2.5 text-xs text-white">
          <option value="">Create a new company</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>
      </label>
      <input value={company.name} onChange={(event) => setCompany((current) => ({ ...current, name: event.target.value }))} placeholder="Company name" className="rounded bg-slate-900 p-2.5 text-xs text-white"/>
      <input value={company.approvedDomains} onChange={(event) => setCompany((current) => ({ ...current, approvedDomains: event.target.value }))} placeholder="Domains, comma separated" className="rounded bg-slate-900 p-2.5 text-xs text-white"/>
      <input value={company.referencePrefixes} onChange={(event) => setCompany((current) => ({ ...current, referencePrefixes: event.target.value }))} placeholder="Prefixes, comma separated" className="rounded bg-slate-900 p-2.5 text-xs text-white"/>

      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="flex items-center gap-2 text-xs font-bold text-white"><Users className="h-4 w-4 text-green-400"/>Company personnel</p><p className="mt-1 text-[10px] text-slate-500">Add each salesperson, requester, project contact, and payroll contact once.</p></div>
          <button type="button" onClick={() => setCompany((current) => ({ ...current, personnel: [...current.personnel, blankPerson()] }))} className="flex items-center gap-1 rounded border border-green-500/30 px-2.5 py-1.5 text-[10px] font-bold text-green-300"><Plus className="h-3 w-3"/>Add person</button>
        </div>
        <div className="space-y-2">{company.personnel.map((person, index) => <div key={person.id || index} className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-2 md:grid-cols-[1fr_1.35fr_1fr_auto]">
          <input value={person.name} onChange={(event) => updatePerson(index, 'name', event.target.value)} placeholder="Name" className="rounded bg-slate-900 p-2 text-xs text-white"/>
          <input type="email" value={person.email} onChange={(event) => updatePerson(index, 'email', event.target.value)} placeholder="Email" className="rounded bg-slate-900 p-2 text-xs text-white"/>
          <select value={person.role} onChange={(event) => updatePerson(index, 'role', event.target.value)} className="rounded bg-slate-900 p-2 text-xs text-white">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="button" aria-label={`Remove ${person.name || 'person'}`} onClick={() => removePerson(index)} className="rounded border border-red-500/20 p-2 text-red-300"><Trash2 className="h-4 w-4"/></button>
        </div>)}</div>
      </div>

      <details className="rounded border border-slate-800 bg-slate-900 text-xs text-white">
        <summary className="cursor-pointer px-3 py-2.5 font-semibold">Default billing recipients ({company.billingRecipientEmails.length} selected)</summary>
        <div className="space-y-2 border-t border-slate-800 p-3">
          {personnelEmails.length === 0 ? <p className="text-[10px] text-slate-500">Add personnel with valid email addresses first.</p> : company.personnel.filter((person) => person.email.trim()).map((person) => {
            const email = person.email.trim().toLowerCase();
            return <label key={email} className="flex items-start gap-2 rounded bg-slate-950 p-2"><input type="checkbox" checked={company.billingRecipientEmails.includes(email)} onChange={() => toggleBillingRecipient(email)} className="mt-0.5 accent-green-500"/><span><strong className="block text-slate-200">{person.name || email}</strong><span className="text-[10px] text-slate-500">{roleLabels[person.role]} · {email}</span></span></label>;
          })}
        </div>
      </details>
      <p className="text-[10px] text-slate-500">Billing recipients are stored with the company. You can select the requester, salesperson, payroll, or any combination when creating each work order.</p>
      <button type="button" onClick={() => void save()} className="mt-1 rounded bg-green-500 p-2.5 text-xs font-bold text-slate-950">{company.organizationId ? 'Update company' : 'Save company'}</button>
    </div>
  </section>;
}
