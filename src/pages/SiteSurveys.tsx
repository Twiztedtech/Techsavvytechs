import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Camera, Check, ChevronRight, ClipboardList, CloudOff, Plus, Radio, Save, Send, Trash2, Wifi } from 'lucide-react';
import { auth } from '../lib/firebase';
import { clearLocalDraft, flushSurveyQueue, loadLocalDraft, saveLocalDraft, surveyRequest } from '../features/surveys/api';
import { compressSurveyPhoto } from '../features/surveys/photo';
import type { DirectoryItem, EstimatePlan, EstimatePlanItem, SiteSurvey, SurveyBootstrap, SurveyFieldDefinition, SurveyModule, SurveyRecord, SurveyStatus } from '../features/surveys/types';

const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft', assigned: 'Assigned', in_progress: 'In progress', submitted: 'Submitted', needs_revision: 'Needs revision',
  approved: 'Approved', shared_with_customer: 'Shared', converted_to_estimate: 'Estimate created', archived: 'Archived',
};
const COMMON_FIELDS = [
  ['accessNotes', 'Access & check-in'], ['parkingNotes', 'Parking / loading'], ['ceilingType', 'Ceiling type'],
  ['ceilingHeight', 'Ceiling height'], ['powerNotes', 'Power availability'], ['networkNotes', 'Existing network'], ['safetyNotes', 'Safety / hazards'],
] as const;
const BUILTIN_MODULE_CHOICES = [
  { key: 'common_site', title: 'Site conditions', version: 1 },
  { key: 'structured_cabling', title: 'Structured cabling & devices', version: 1 },
  { key: 'camera_security', title: 'Cameras & physical security', version: 1 },
  { key: 'pos_register', title: 'POS & register infrastructure', version: 1 },
  { key: 'rf_signal', title: 'RF signal & antenna design', version: 1 },
  { key: 'floor_plan', title: 'Floor plan pins & markup', version: 1 },
];

function nameOf(item: DirectoryItem) {
  return item.name || item.companyName || item.displayName || item.customerName || item.title || item.email || item.id;
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string | number | undefined; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>{label}</span><input type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-amber-400" /></label>;
}

function TextArea({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>{label}</span><textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={3} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none transition focus:border-amber-400" /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-amber-500" />{label}</label>;
}

function StatusPill({ status }: { status: SurveyStatus }) {
  const color = status === 'approved' || status === 'shared_with_customer' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : status === 'needs_revision' ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>{STATUS_LABELS[status]}</span>;
}

function SurveyList({ data, canManage, isAdmin }: { data: SurveyBootstrap; canManage: boolean; isAdmin: boolean }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [form, setForm] = useState({ customerId: '', customerName: '', siteName: '', siteAddress: '', scheduledAt: '', contactName: '', contactPhone: '', workOrderId: '', moduleKeys: ['structured_cabling'] as string[], contractorId: '' });
  const [error, setError] = useState('');
  const user = auth.currentUser;

  async function create() {
    if (!user || !form.customerName || !form.siteName) return;
    setError('');
    try {
      const contractor = data.contractors.find((item) => item.id === form.contractorId);
      const survey = await surveyRequest<SiteSurvey>(user, '', { action: 'create', ...form, contractors: contractor ? [contractor] : [] });
      navigate(`/surveys/${survey.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create survey.');
    }
  }

  async function clone(survey: SiteSurvey) {
    if (!user) return;
    setError('');
    try { const copy = await surveyRequest<SiteSurvey>(user, '', { action: 'cloneSurvey', id: survey.id }); navigate(`/surveys/${copy.id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not clone survey.'); }
  }

  const customer = data.customers.find((item) => item.id === form.customerId);
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-400">Field operations</p><h1 className="mt-2 text-3xl font-black text-white">Site surveys</h1><p className="mt-2 text-slate-400">Build the scope once. Carry clean data into the estimate.</p></div>
      <div className="flex flex-wrap gap-2"><Link to={canManage ? '/crm' : '/contractor/dashboard'} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200">Back to portal</Link>{isAdmin && <button onClick={() => setBuilding((value) => !value)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200">Module builder</button>}{canManage && <button onClick={() => setCreating((value) => !value)} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950"><Plus size={17} /> New survey</button>}</div>
    </div>
    {building && user && <ModuleBuilder user={user} definitions={data.moduleDefinitions} />}
    {creating && <section className="mb-8 rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-2xl">
      <h2 className="mb-5 text-xl font-bold text-white">Set up a survey</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>Customer</span><select value={form.customerId} onChange={(event) => { const selected = data.customers.find((item) => item.id === event.target.value); setForm({ ...form, customerId: event.target.value, customerName: selected ? nameOf(selected) : '' }); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="">Choose customer</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</select></label>
        {!customer && <Field label="Customer name" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />}
        <Field label="Site name" value={form.siteName} onChange={(value) => setForm({ ...form, siteName: value })} placeholder="Main office" />
        <Field label="Site address" value={form.siteAddress} onChange={(value) => setForm({ ...form, siteAddress: value })} />
        <Field label="Date and time" type="datetime-local" value={form.scheduledAt} onChange={(value) => setForm({ ...form, scheduledAt: value })} />
        <Field label="Site contact" value={form.contactName} onChange={(value) => setForm({ ...form, contactName: value })} />
        <Field label="Contact phone" type="tel" value={form.contactPhone} onChange={(value) => setForm({ ...form, contactPhone: value })} />
        <label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>Assign technician</span><select value={form.contractorId} onChange={(event) => setForm({ ...form, contractorId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="">Assign later</option>{data.contractors.map((item) => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</select></label>
      </div>
      {data.templates.length > 0 && <label className="mt-5 grid max-w-md gap-1.5 text-sm font-medium text-slate-300"><span>Start from template</span><select value="" onChange={(event) => { const template = data.templates.find((item) => item.id === event.target.value); if (template) setForm({ ...form, moduleKeys: [...template.moduleKeys] }); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="">Choose a saved module set</option>{data.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
      <div className="mt-5"><p className="mb-2 text-sm font-medium text-slate-300">Job modules</p><div className="grid gap-2 md:grid-cols-2">{data.moduleDefinitions.filter((module) => module.key !== 'common_site').map((module) => <div key={module.key}><Toggle label={module.title} checked={form.moduleKeys.includes(module.key)} onChange={(checked) => setForm({ ...form, moduleKeys: checked ? [...new Set([...form.moduleKeys, module.key])] : form.moduleKeys.filter((key) => key !== module.key) })} /></div>)}</div></div>
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      <button onClick={create} disabled={!form.customerName || !form.siteName} className="mt-5 rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950 disabled:opacity-40">Create and open survey</button>
    </section>}
    <div className="grid gap-3">
      {data.surveys.map((survey) => <div key={survey.id} className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 transition hover:border-amber-500/50 sm:p-5"><Link to={`/surveys/${survey.id}`} className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><strong className="text-white">{survey.surveyNumber}</strong><StatusPill status={survey.status} /></div><p className="truncate font-semibold text-slate-200">{survey.customerName} · {survey.siteName}</p><p className="mt-1 truncate text-sm text-slate-500">{survey.siteAddress || 'Address not set'}</p></Link><div className="flex items-center gap-2">{canManage && <button onClick={() => clone(survey)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">Clone</button>}<ChevronRight className="shrink-0 text-slate-500 transition group-hover:text-amber-400" /></div></div>)}
      {!data.surveys.length && <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400">No site surveys yet.</div>}
    </div>
  </div>;
}

function ModuleBuilder({ user, definitions }: { user: User; definitions: SurveyBootstrap['moduleDefinitions'] }) {
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<SurveyFieldDefinition[]>([{ key: 'location', label: 'Location', type: 'text', required: true }]);
  const [templateName, setTemplateName] = useState('');
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const addField = () => setFields((current) => [...current, { key: `field_${current.length + 1}`, label: '', type: 'text' }]);
  const patchField = (index: number, patch: Partial<SurveyFieldDefinition>) => setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
  async function saveModule() {
    setMessage('');
    try { await surveyRequest(user, '', { action: 'saveModuleDefinition', title, fields }); setMessage('Module saved. Refreshing…'); window.location.reload(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save module.'); }
  }
  async function saveTemplate() {
    setMessage('');
    try { await surveyRequest(user, '', { action: 'saveTemplate', name: templateName, moduleKeys: templateKeys }); setMessage('Template saved. Refreshing…'); window.location.reload(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save template.'); }
  }
  return <section className="mb-8 grid gap-5 rounded-2xl border border-slate-700 bg-slate-900 p-5 lg:grid-cols-2"><div><h2 className="text-lg font-bold text-white">Custom module builder</h2><p className="mt-1 text-sm text-slate-400">Saved versions are snapshotted into new surveys, so later edits never change completed work.</p><div className="mt-4"><Field label="Module title" value={title} onChange={setTitle} placeholder="Warehouse assessment" /></div><div className="mt-4 grid gap-3">{fields.map((field, index) => <div key={`${field.key}-${index}`} className="grid gap-2 rounded-xl border border-slate-700 bg-slate-950 p-3 sm:grid-cols-[1fr_140px_auto]"><Field label="Field label" value={field.label} onChange={(value) => patchField(index, { label: value, key: value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || field.key })} /><label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>Type</span><select value={field.type} onChange={(event) => patchField(index, { type: event.target.value as SurveyFieldDefinition['type'] })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="text">Text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="checkbox">Checkbox</option><option value="select">Dropdown</option><option value="photo">Photo</option></select></label><button onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))} aria-label="Remove field" className="self-end rounded-xl border border-red-500/30 p-3 text-red-300"><Trash2 size={17} /></button><div className="sm:col-span-3"><Toggle label="Required before submit" checked={Boolean(field.required)} onChange={(checked) => patchField(index, { required: checked })} /></div>{field.type === 'select' && <div className="sm:col-span-3"><Field label="Dropdown choices (comma separated)" value={(field.options || []).join(', ')} onChange={(value) => patchField(index, { options: value.split(',').map((option) => option.trim()).filter(Boolean) })} /></div>}</div>)}</div><div className="mt-4 flex gap-2"><button onClick={addField} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">Add field</button><button onClick={saveModule} disabled={!title || !fields.length} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">Save module</button></div></div><div><h2 className="text-lg font-bold text-white">Survey template</h2><p className="mt-1 text-sm text-slate-400">Save a repeatable module combination for dispatch.</p><div className="mt-4"><Field label="Template name" value={templateName} onChange={setTemplateName} placeholder="Camera installation survey" /></div><div className="mt-4 grid gap-2">{definitions.filter((definition) => definition.key !== 'common_site').map((definition) => <div key={definition.key}><Toggle label={definition.title} checked={templateKeys.includes(definition.key)} onChange={(checked) => setTemplateKeys((current) => checked ? [...new Set([...current, definition.key])] : current.filter((key) => key !== definition.key))} /></div>)}</div><button onClick={saveTemplate} disabled={!templateName || !templateKeys.length} className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">Save template</button></div>{message && <p className="text-sm text-amber-200 lg:col-span-2">{message}</p>}</section>;
}

function DynamicRecordFields({ fields, value, onChange }: { fields: SurveyFieldDefinition[]; value: SurveyRecord; onChange: (key: keyof SurveyRecord, value: string | number | boolean) => void }) {
  return <>{fields.filter((field) => field.type !== 'photo').map((field) => <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>{field.type === 'checkbox' ? <Toggle label={field.label} checked={Boolean(value[field.key])} onChange={(next) => onChange(field.key, next)} /> : field.type === 'textarea' ? <TextArea label={field.label} value={String(value[field.key] || '')} onChange={(next) => onChange(field.key, next)} /> : field.type === 'select' ? <label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>{field.label}</span><select value={String(value[field.key] || '')} onChange={(event) => onChange(field.key, event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white"><option value="">Select</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select></label> : <Field label={field.label} type={field.type === 'number' ? 'number' : 'text'} value={value[field.key] as string | number | undefined} onChange={(next) => onChange(field.key, field.type === 'number' ? Number(next) : next)} />}</div>)}</>;
}

function FloorPlanEditor({ imageUrl, records, editable, onAdd, onDelete }: { imageUrl?: string; records: SurveyRecord[]; editable: boolean; onAdd: (record: SurveyRecord) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [label, setLabel] = useState('New location');
  const [pinType, setPinType] = useState('Cable drop');
  async function place(event: MouseEvent<HTMLButtonElement>) {
    if (!editable || !imageUrl) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    await onAdd({ id: `new-${Date.now()}`, label, pinType, x: Math.round(((event.clientX - bounds.left) / bounds.width) * 1000) / 10, y: Math.round(((event.clientY - bounds.top) / bounds.height) * 1000) / 10 });
  }
  return <div><div className="mb-4 grid gap-3 sm:grid-cols-2"><Field label="Next pin label" value={label} onChange={setLabel} /><label className="grid gap-1.5 text-sm font-medium text-slate-300"><span>Pin type</span><select value={pinType} onChange={(event) => setPinType(event.target.value)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">{['Cable drop', 'Camera', 'Register', 'Access point', 'Antenna', 'Pathway', 'Hazard', 'Other'].map((type) => <option key={type}>{type}</option>)}</select></label></div>{imageUrl ? <button type="button" onClick={place} className="relative block w-full cursor-crosshair overflow-hidden rounded-xl border border-slate-700 bg-white"><img src={imageUrl} alt="Uploaded floor plan" className="h-auto w-full" />{records.map((record, index) => <span key={record.id} title={`${record.pinType || 'Pin'}: ${record.label || ''}`} className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-amber-500 text-xs font-black text-slate-950 shadow-lg" style={{ left: `${Number(record.x || 0)}%`, top: `${Number(record.y || 0)}%` }}>{index + 1}</span>)}</button> : <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">Use “Add photo” above to upload a floor plan, then tap the plan to place pins.</div>}<div className="mt-4 grid gap-2">{records.map((record, index) => <div key={record.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><span><strong className="text-amber-300">{index + 1}. {record.label}</strong> <span className="text-slate-500">· {record.pinType}</span></span>{editable && <button onClick={() => onDelete(record.id)} aria-label={`Remove ${record.label}`} className="text-red-300"><Trash2 size={15} /></button>}</div>)}</div></div>;
}

function RecordEditor({ moduleKey, fields, record, photos, editable, onSave, onDelete, onPhoto, register }: { moduleKey: string; fields?: SurveyFieldDefinition[]; record: SurveyRecord; photos: NonNullable<SiteSurvey['attachments']>; editable: boolean; onSave: (record: SurveyRecord) => Promise<void>; onDelete: () => Promise<void>; onPhoto: (recordId: string, file?: File) => void; register: (id: string, save: (() => Promise<void>) | null) => void }) {
  const [value, setValue] = useState(record);
  const [busy, setBusy] = useState(false);
  const photoField = fields?.find((field) => field.type === 'photo');
  const isNew = record.id.startsWith('new-');
  const dirty = JSON.stringify(value) !== JSON.stringify(record) && Object.entries(value).some(([key, entry]) => key !== 'id' && entry !== '' && entry !== undefined && entry !== false);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => { register(record.id, dirty ? () => onSave(valueRef.current) : null); return () => register(record.id, null); }, [dirty, record.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (key: keyof SurveyRecord, next: string | number | boolean) => setValue((current) => ({ ...current, [key]: next }));
  async function save() { setBusy(true); try { await onSave(value); } finally { setBusy(false); } }
  return <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
    <div className="grid gap-3 md:grid-cols-2">
      {moduleKey === 'structured_cabling' ? <>
        <Field label="Run / device label" value={value.label} onChange={(next) => change('label', next)} placeholder="Camera 01" />
        <Field label="Target device" value={value.targetDevice} onChange={(next) => change('targetDevice', next)} placeholder="4MP bullet camera" />
        <Field label="Origin" value={value.origin} onChange={(next) => change('origin', next)} placeholder="MDF rack" />
        <Field label="Destination" value={value.destination} onChange={(next) => change('destination', next)} placeholder="North entrance" />
        <Field label="Cable type / part hook" value={value.cableType} onChange={(next) => change('cableType', next)} placeholder="CAT6-PLENUM-BOX" />
        <Field label="Estimated feet" type="number" value={value.estimatedFeet} onChange={(next) => change('estimatedFeet', Number(next))} />
        <Field label="Drop count" type="number" value={value.dropCount} onChange={(next) => change('dropCount', Number(next))} />
        <Field label="Additional part type" value={value.partType} onChange={(next) => change('partType', next)} placeholder="J-HOOK-2IN" />
        <Field label="Part quantity" type="number" value={value.quantity} onChange={(next) => change('quantity', Number(next))} />
        <Toggle label="PoE required" checked={Boolean(value.poeRequired)} onChange={(next) => change('poeRequired', next)} />
        <Toggle label="Conduit required" checked={Boolean(value.conduitRequired)} onChange={(next) => change('conduitRequired', next)} />
        <div className="md:col-span-2"><TextArea label="Pathway notes" value={value.pathwayNotes || ''} onChange={(next) => change('pathwayNotes', next)} /></div>
      </> : moduleKey === 'rf_signal' ? <>
        <Field label="Measurement point" value={value.measurementPoint} onChange={(next) => change('measurementPoint', next)} placeholder="Roof donor candidate A" />
        <Field label="Floor / area" value={value.floor} onChange={(next) => change('floor', next)} />
        <Field label="Carrier" value={value.carrier} onChange={(next) => change('carrier', next)} placeholder="Verizon" />
        <Field label="Technology" value={value.technology} onChange={(next) => change('technology', next)} placeholder="5G / LTE" />
        <Field label="Band" value={value.band} onChange={(next) => change('band', next)} placeholder="n77" />
        <Field label="RSRP (dBm)" type="number" value={value.rsrp} onChange={(next) => change('rsrp', Number(next))} />
        <Field label="RSRQ (dB)" type="number" value={value.rsrq} onChange={(next) => change('rsrq', Number(next))} />
        <Field label="SINR (dB)" type="number" value={value.sinr} onChange={(next) => change('sinr', Number(next))} />
        <Field label="Azimuth (degrees)" type="number" value={value.azimuth} onChange={(next) => change('azimuth', Number(next))} />
        <Toggle label="Donor antenna candidate" checked={Boolean(value.donorCandidate)} onChange={(next) => change('donorCandidate', next)} />
        <div className="md:col-span-2"><TextArea label="Notes" value={value.notes || ''} onChange={(next) => change('notes', next)} /></div>
      </> : <DynamicRecordFields fields={fields || []} value={value} onChange={change} />}
    </div>
    {(photos.length > 0 || editable) && <div className="mt-4"><div className="flex flex-wrap items-center gap-2">{photos.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.caption || 'Survey photo'} className="h-16 w-16 rounded-lg border border-slate-700 object-cover" /></a>)}{editable && (isNew ? <span className="text-xs text-slate-500">Save this item to add photos.</span> : <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200"><Camera size={15} /> Add photo<input type="file" accept="image/*" capture="environment" onChange={(event) => { onPhoto(record.id, event.target.files?.[0]); event.target.value = ''; }} className="hidden" /></label>)}</div>{photoField && <p className={`mt-2 text-xs ${photos.length ? 'text-emerald-300' : photoField.required ? 'text-amber-200' : 'text-slate-500'}`}>{photoField.label}{photoField.required ? ' (required)' : ''}: {photos.length ? `${photos.length} attached` : 'none yet'}</p>}</div>}
    <div className="mt-4 flex justify-end gap-2"><button onClick={onDelete} className="flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300"><Trash2 size={15} /> Remove</button><button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950"><Save size={15} /> {busy ? 'Saving…' : 'Save item'}</button></div>
  </div>;
}

function SurveyEditor({ user, initial, canReview, canEstimate }: { user: User; initial: SiteSurvey; canReview: boolean; canEstimate: boolean }) {
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(initial);
  const [active, setActive] = useState(initial.moduleKeys[0] || 'common_site');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const current = survey.modules?.find((module) => module.id === active);
  const editable = ['draft', 'assigned', 'in_progress', 'needs_revision'].includes(survey.status);
  const pending = useRef(new Map<string, () => Promise<void>>());
  const registerPending = useCallback((id: string, save: (() => Promise<void>) | null) => { if (save) pending.current.set(id, save); else pending.current.delete(id); }, []);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const reload = useCallback(async () => setSurvey(await surveyRequest<SiteSurvey>(user, `?action=get&id=${encodeURIComponent(survey.id)}`)), [survey.id, user]);
  useEffect(() => { const goOnline = async () => { setOnline(true); try { const count = await flushSurveyQueue(user); if (count) { setMessage(`Synced ${count} offline change${count === 1 ? '' : 's'}.`); await reload(); } } catch { setMessage('Some offline changes still need to sync. Keep this page open while connected.'); } }; const goOffline = () => setOnline(false); addEventListener('online', goOnline); addEventListener('offline', goOffline); if (navigator.onLine) void goOnline(); return () => { removeEventListener('online', goOnline); removeEventListener('offline', goOffline); }; }, [reload, user]);
  useEffect(() => { const module = survey.modules?.find((item) => item.id === active); const local = loadLocalDraft(survey.id, active); setAnswers({ ...(module?.answers || {}), ...(local || {}) } as Record<string, string | number | boolean>); }, [active, survey.id, survey.modules]);
  useEffect(() => {
    if (active === 'review' || !editable) return;
    const timer = window.setTimeout(() => saveLocalDraft(survey.id, active, answers), 500);
    return () => window.clearTimeout(timer);
  }, [active, answers, editable, survey.id]);

  async function saveAnswers() {
    saveLocalDraft(survey.id, active, answers);
    await surveyRequest(user, '', { action: 'saveModule', id: survey.id, moduleKey: active, answers });
    if (!online) { setMessage('Saved to the offline queue. It will sync automatically when this device reconnects.'); return; }
    clearLocalDraft(survey.id, active); setMessage('Saved'); await reload();
  }
  async function saveRecord(record: SurveyRecord) { await surveyRequest(user, '', { action: 'upsertRecord', id: survey.id, moduleKey: active, recordId: record.id.startsWith('new-') ? '' : record.id, record }); if (online) await reload(); else setMessage('Item saved to the offline queue.'); }
  async function deleteRecord(recordId: string) { if (recordId.startsWith('new-')) { setSurvey((value) => ({ ...value, modules: value.modules?.map((module) => module.id === active ? { ...module, records: module.records.filter((record) => record.id !== recordId) } : module) })); return; } await surveyRequest(user, '', { action: 'deleteRecord', id: survey.id, moduleKey: active, recordId }); if (online) await reload(); else setMessage('Removal saved to the offline queue.'); }
  function addRecord() { const record = { id: `new-${Date.now()}` }; setSurvey((value) => ({ ...value, modules: value.modules?.map((module) => module.id === active ? { ...module, records: [...module.records, record] } : module) })); }
  // Sends anything typed but not yet saved (site conditions and edited items) so nothing is lost
  // when the technician switches modules or submits.
  async function flushPending() {
    if (!editable) return;
    const saved = survey.modules?.find((module) => module.id === active)?.answers || {};
    if (active === 'common_site' && JSON.stringify(answersRef.current) !== JSON.stringify(saved)) await surveyRequest(user, '', { action: 'saveModule', id: survey.id, moduleKey: active, answers: answersRef.current });
    for (const save of [...pending.current.values()]) await save();
  }
  async function switchModule(key: string) {
    setMessage('');
    try { await flushPending(); if (online) await reload(); setActive(key); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save your changes before switching.'); }
  }
  async function setStatus(status: SurveyStatus) { setMessage(''); try { if (status === 'submitted') { await flushPending(); if (online) await reload(); } setSurvey(await surveyRequest<SiteSurvey>(user, '', { action: 'changeStatus', id: survey.id, status })); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Status update failed.'); } }
  async function uploadPhoto(file?: File, recordId = '') { if (!file) return; setMessage('Compressing photo…'); try { const dataUrl = await compressSurveyPhoto(file); await surveyRequest(user, '', { action: 'uploadAttachment', id: survey.id, moduleKey: active, recordId, dataUrl, caption: file.name }); if (online) { await reload(); setMessage('Photo uploaded'); } else setMessage('Photo saved to the offline queue.'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Photo upload failed.'); } }

  return <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
    <header className="mb-5 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><button onClick={() => navigate('/surveys')} className="mb-3 flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} /> All surveys</button><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-white">{survey.surveyNumber}</h1><StatusPill status={survey.status} /></div><p className="mt-2 font-semibold text-slate-200">{survey.customerName} · {survey.siteName}</p><p className="text-sm text-slate-500">{survey.siteAddress}</p></div><div className="flex flex-wrap gap-2">{editable && <button onClick={() => setStatus('submitted')} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-emerald-950"><Send size={16} /> Submit</button>}{canReview && survey.status === 'submitted' && <><button onClick={() => setStatus('needs_revision')} className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-bold text-red-300">Request revision</button><button onClick={() => setStatus('approved')} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-emerald-950"><Check size={16} /> Approve</button></>}{canReview && survey.status === 'approved' && <button onClick={() => setStatus('shared_with_customer')} className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-black text-sky-950">Share customer report</button>}</div></div></header>
    <div className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${online ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>{online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? 'Online — server sync available' : 'Offline — form drafts stay on this device'}</div>
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]"><nav className="flex gap-2 overflow-x-auto lg:grid lg:content-start">
      {survey.moduleKeys.map((key) => <button key={key} onClick={() => void switchModule(key)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold ${active === key ? 'bg-amber-500 text-slate-950' : 'border border-slate-800 bg-slate-900 text-slate-300'}`}>{survey.modules?.find((module) => module.id === key)?.definition.title || key}</button>)}
      <button onClick={() => void switchModule('review')} className={`whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold ${active === 'review' ? 'bg-amber-500 text-slate-950' : 'border border-slate-800 bg-slate-900 text-slate-300'}`}>Review & BOM</button>
    </nav><main className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
      {active === 'review' ? <Review survey={survey} user={user} canEstimate={canEstimate} onConverted={reload} /> : <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">{current?.definition.title || active}</h2><p className="mt-1 text-xs text-slate-500">Module version {current?.definition.version || 1}</p></div>{editable && <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200"><Camera size={16} /> Add photo<input type="file" accept="image/*" capture="environment" onChange={(event) => uploadPhoto(event.target.files?.[0])} className="hidden" /></label>}</div>
      {active === 'common_site' ? <div className="grid gap-4 md:grid-cols-2">{COMMON_FIELDS.map(([key, label]) => <div key={key}><TextArea label={label} value={String(answers[key] || '')} onChange={(value) => setAnswers((currentAnswers) => ({ ...currentAnswers, [key]: value }))} /></div>)}{editable && <button onClick={saveAnswers} className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-black text-slate-950 md:col-span-2"><Save size={17} /> Save site conditions</button>}</div> : active === 'floor_plan' ? <FloorPlanEditor imageUrl={survey.attachments?.find((attachment) => attachment.moduleKey === 'floor_plan')?.url} records={current?.records || []} editable={editable} onAdd={saveRecord} onDelete={deleteRecord} /> : <div className="grid gap-4">{current?.records.map((record) => <div key={record.id}><RecordEditor moduleKey={active} fields={current.definition.fields} record={record} photos={(survey.attachments || []).filter((photo) => photo.moduleKey === active && photo.recordId === record.id)} editable={editable} onSave={saveRecord} onDelete={() => deleteRecord(record.id)} onPhoto={(recordId, file) => void uploadPhoto(file, recordId)} register={registerPending} /></div>)}{editable && <button onClick={addRecord} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-500/50 p-4 font-bold text-amber-300"><Plus size={18} /> Add {active === 'structured_cabling' ? 'cable run or device' : active === 'rf_signal' ? 'RF measurement' : 'item'}</button>}</div>}</>}
      {active !== 'review' && active !== 'floor_plan' && (survey.attachments || []).some((photo) => photo.moduleKey === active && !photo.recordId) && <div className="mt-5"><p className="mb-2 text-sm font-medium text-slate-300">Module photos</p><div className="flex flex-wrap gap-2">{(survey.attachments || []).filter((photo) => photo.moduleKey === active && !photo.recordId).map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.caption || 'Survey photo'} className="h-20 w-20 rounded-lg border border-slate-700 object-cover" /></a>)}</div></div>}
      {message && <p className="mt-4 rounded-xl bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}
    </main></div>
  </div>;
}

function Review({ survey, user, canEstimate, onConverted }: { survey: SiteSurvey; user: User; canEstimate: boolean; onConverted: () => Promise<void> }) {
  const cabling = survey.modules?.find((module) => module.id === 'structured_cabling')?.records || [];
  const rf = survey.modules?.find((module) => module.id === 'rf_signal')?.records || [];
  const totalFeet = cabling.reduce((sum, record) => sum + Number(record.estimatedFeet || 0), 0);
  const drops = cabling.reduce((sum, record) => sum + Number(record.dropCount || 0), 0);
  const parts = useMemo(() => { const map = new Map<string, number>(); for (const record of cabling) { if (record.cableType && record.estimatedFeet) map.set(record.cableType, (map.get(record.cableType) || 0) + record.estimatedFeet); if (record.partType) map.set(record.partType, (map.get(record.partType) || 0) + Number(record.quantity || 1)); } return [...map.entries()]; }, [cabling]);
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-white">Survey review</h2><button onClick={() => window.print()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">Print customer report</button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Cable / device items" value={String(cabling.length)} /><Metric label="Total cable footage" value={String(totalFeet)} /><Metric label="RF measurements" value={String(rf.length)} /></div><SignOff survey={survey} user={user} onSigned={onConverted} /><section className="mt-6"><h3 className="font-bold text-white">Draft material hooks</h3><p className="mt-1 text-sm text-slate-400">Structured part types are aggregated and matched against the CRM catalog.</p><div className="mt-3 overflow-hidden rounded-xl border border-slate-700">{parts.map(([part, quantity]) => <div key={part} className="flex justify-between border-b border-slate-800 px-4 py-3 last:border-0"><span className="font-mono text-sm text-amber-300">{part}</span><span className="text-slate-200">{quantity}</span></div>)}{!parts.length && <p className="p-4 text-sm text-slate-500">Add part types to cable records to build the draft BOM.</p>}</div><p className="mt-3 text-sm text-slate-500">{drops} total drops · Cable quantities include a 15% waste allowance during estimate preparation.</p></section>{canEstimate && <EstimateHandoff survey={survey} user={user} onConverted={onConverted} />}<CustomerReport survey={survey} /></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-700 bg-slate-950 p-4"><p className="text-2xl font-black text-amber-400">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }

function SignOff({ survey, user, onSigned }: { survey: SiteSurvey; user: User; onSigned: () => Promise<void> }) {
  const [technician, setTechnician] = useState('');
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState('');
  async function sign(kind: 'technician' | 'customer', signedBy: string) { setBusy(kind); try { await surveyRequest(user, '', { action: 'saveSignature', id: survey.id, kind, signedBy }); await onSigned(); } finally { setBusy(''); } }
  return <section className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4"><h3 className="font-bold text-white">Sign-off</h3><div className="mt-3 grid gap-4 md:grid-cols-2"><div>{survey.signatures?.technician ? <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">Technician: {survey.signatures.technician.signedBy}</p> : <div className="flex items-end gap-2"><div className="flex-1"><Field label="Technician name" value={technician} onChange={setTechnician} /></div><button disabled={!technician || busy === 'technician'} onClick={() => sign('technician', technician)} className="mb-0.5 rounded-xl bg-amber-500 px-3 py-3 text-sm font-black text-slate-950 disabled:opacity-40">Sign</button></div>}</div><div>{survey.signatures?.customer ? <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">Customer: {survey.signatures.customer.signedBy}</p> : <div className="flex items-end gap-2"><div className="flex-1"><Field label="Customer sign-off (optional)" value={customer} onChange={setCustomer} /></div><button disabled={!customer || busy === 'customer'} onClick={() => sign('customer', customer)} className="mb-0.5 rounded-xl border border-slate-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-40">Sign</button></div>}</div></div></section>;
}

function CustomerReport({ survey }: { survey: SiteSurvey }) {
  return <article className="survey-print-report"><header><p className="report-kicker">TechSavvy Technologies</p><h1>Site Survey Report</h1><p>{survey.surveyNumber}</p></header><section className="report-grid"><div><strong>Customer</strong><p>{survey.customerName}</p></div><div><strong>Site</strong><p>{survey.siteName}</p><p>{survey.siteAddress}</p></div><div><strong>Scheduled</strong><p>{survey.scheduledAt || 'Not specified'}</p></div><div><strong>Status</strong><p>{STATUS_LABELS[survey.status]}</p></div></section>{survey.modules?.map((module) => <section key={module.id} className="report-section"><h2>{module.definition.title}</h2>{module.id === 'common_site' && <dl>{Object.entries(module.answers || {}).filter(([, value]) => value !== '').map(([key, value]) => <div key={key}><dt>{COMMON_FIELDS.find(([field]) => field === key)?.[1] || key}</dt><dd>{String(value)}</dd></div>)}</dl>}{(survey.attachments || []).some((photo) => photo.moduleKey === module.id && module.id !== 'floor_plan') && <div className="report-photos">{(survey.attachments || []).filter((photo) => photo.moduleKey === module.id && module.id !== 'floor_plan').map((photo) => <img key={photo.id} src={photo.url} alt={photo.caption || 'Site photo'} />)}</div>}{module.records.length > 0 && <table><thead><tr><th>Item / location</th><th>Details</th></tr></thead><tbody>{module.records.map((record) => <tr key={record.id}><td>{record.label || record.measurementPoint || record.location || record.destination || 'Survey item'}</td><td>{module.id === 'structured_cabling' ? `${record.dropCount || 0} drop(s), ${record.estimatedFeet || 0} ft, ${record.origin || 'origin TBD'} to ${record.destination || 'destination TBD'}` : module.id === 'rf_signal' ? `${record.carrier || ''} ${record.technology || ''} ${record.band || ''} — RSRP ${record.rsrp || 0} dBm` : Object.entries(record).filter(([key]) => !['id', 'notes', 'partType', 'quantity', 'unit', 'updatedBy', 'createdAt', 'updatedAt'].includes(key) && !key.toLowerCase().includes('internal')).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</td></tr>)}</tbody></table>}</section>) }<footer><p>This report documents observed site conditions and preliminary recommendations. Final installation scope and pricing are provided in the approved estimate.</p></footer></article>;
}

function EstimateHandoff({ survey, user, onConverted }: { survey: SiteSurvey; user: User; onConverted: () => Promise<void> }) {
  const [plan, setPlan] = useState<EstimatePlan | null>(null);
  const [items, setItems] = useState<EstimatePlanItem[]>([]);
  const [title, setTitle] = useState(`Installation at ${survey.siteName}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const eligible = survey.status === 'approved' || survey.status === 'shared_with_customer';
  const total = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  async function prepare() {
    setBusy(true); setError('');
    try { const next = await surveyRequest<EstimatePlan>(user, `?action=estimatePlan&id=${encodeURIComponent(survey.id)}`); setPlan(next); setItems(next.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not prepare the estimate.'); }
    finally { setBusy(false); }
  }
  function update(index: number, patch: Partial<EstimatePlanItem>) { setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function remove(index: number) { setItems((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  async function convert() {
    setBusy(true); setError('');
    try {
      await surveyRequest(user, '', { action: 'createEstimate', id: survey.id, title, lineItems: items, stipulations: ['Estimate prepared from an approved site survey.', 'Final quantities are subject to field verification before installation.'] });
      await onConverted();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the estimate.'); }
    finally { setBusy(false); }
  }
  if (survey.status === 'converted_to_estimate') return <section className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"><h3 className="font-bold text-emerald-200">Estimate created</h3><p className="mt-1 text-sm text-emerald-100/70">This survey is locked to prevent the approved scope from drifting.</p><Link to="/crm?module=quotes" className="mt-4 inline-block rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-emerald-950">Open estimates in CRM</Link></section>;
  return <section className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-white">Estimate handoff</h3><p className="mt-1 text-sm text-slate-400">Match survey SKUs to catalog pricing, review the BOM, then create a CRM draft.</p></div>{!plan && <button disabled={!eligible || busy} onClick={prepare} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">{busy ? 'Preparing…' : 'Prepare estimate'}</button>}</div>{!eligible && <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-400">Approve the survey before creating an estimate.</p>}{plan && <><Field label="Estimate title" value={title} onChange={setTitle} /><div className="mt-4 grid gap-3">{items.map((item, index) => <div key={`${item.sku}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950 p-3"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold text-amber-300">{item.sku || 'CUSTOM'}</p><p className={`mt-1 text-xs ${item.catalogMatched ? 'text-emerald-300' : 'text-amber-200'}`}>{item.catalogMatched ? 'Catalog price matched' : 'No catalog match — enter price manually'}</p></div><button onClick={() => remove(index)} aria-label={`Remove ${item.description}`} className="text-red-300"><Trash2 size={17} /></button></div><div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_110px_130px]"><Field label="Description" value={item.description} onChange={(value) => update(index, { description: value })} /><Field label="Quantity" type="number" value={item.quantity} onChange={(value) => update(index, { quantity: Number(value) })} /><Field label="Unit price" type="number" value={item.unitPrice} onChange={(value) => update(index, { unitPrice: Number(value) })} /></div></div>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-slate-500">Draft total</p><p className="text-2xl font-black text-white">{total.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p></div><button disabled={busy || !items.length || items.some((item) => !item.description || item.quantity <= 0)} onClick={convert} className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-emerald-950 disabled:opacity-40">{busy ? 'Creating…' : 'Create draft estimate'}</button></div></>}{error && <p className="mt-4 text-sm text-red-300">{error}</p>}</section>;
}

export default function SiteSurveys() {
  const { surveyId } = useParams();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<SurveyBootstrap | null>(null);
  const [survey, setSurvey] = useState<SiteSurvey | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  useEffect(() => onAuthStateChanged(auth, async (next) => { setUser(next); if (next) setClaims((await next.getIdTokenResult(true)).claims); else setLoading(false); }), []);
  useEffect(() => { if (!user) return; let active = true; setLoading(true); setError(''); (async () => { try { if (surveyId) setSurvey(await surveyRequest<SiteSurvey>(user, `?action=get&id=${encodeURIComponent(surveyId)}`)); else { const loaded = await surveyRequest<Partial<SurveyBootstrap>>(user); setData({ surveys: loaded.surveys || [], customers: loaded.customers || [], jobs: loaded.jobs || [], contractors: loaded.contractors || [], templates: loaded.templates || [], moduleDefinitions: loaded.moduleDefinitions?.length ? loaded.moduleDefinitions : BUILTIN_MODULE_CHOICES }); } } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load surveys.'); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [surveyId, user]);
  const canManage = claims.admin === true || claims.staffRole === 'assistant_admin' || claims.staffRole === 'dispatcher';
  const isAdmin = claims.admin === true;
  const canReview = claims.admin === true || claims.staffRole === 'assistant_admin';
  const canEstimate = claims.admin === true || claims.staffRole === 'assistant_admin' || claims.staffRole === 'office_billing';
  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-400"><ClipboardList className="mb-3 animate-pulse text-amber-400" /><span>Loading site surveys…</span></div>;
  if (!user) return <div className="min-h-screen grid place-items-center bg-slate-950 p-6 text-center"><div><h1 className="text-2xl font-black text-white">Sign in required</h1><p className="mt-2 text-slate-400">Use your staff or technician account to open site surveys.</p><Link to="/auth" className="mt-5 inline-block rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950">Sign in</Link></div></div>;
  if (error) return <div className="min-h-screen grid place-items-center bg-slate-950 p-6 text-center"><div><h1 className="text-xl font-bold text-white">Survey workspace unavailable</h1><p className="mt-2 max-w-lg text-red-300">{error}</p><Link to={canManage ? '/crm' : '/contractor/dashboard'} className="mt-5 inline-block text-amber-400">Return to portal</Link></div></div>;
  return <div className="min-h-screen bg-slate-950 text-white">{surveyId && survey ? <SurveyEditor user={user} initial={survey} canReview={canReview} canEstimate={canEstimate} /> : data ? <SurveyList data={data} canManage={canManage} isAdmin={isAdmin} /> : null}</div>;
}
