import React, { useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { auth, storage } from '../../../lib/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { JobSite } from '../types';

type SignaturePadProps = {
  label: string;
  onChange: (dataUrl: string) => void;
};

function SignaturePad({ label, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const finish = () => {
    if (!isDrawing || !canvasRef.current) return;
    setIsDrawing(false);
    setHasSignature(true);
    onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[11px] font-semibold text-slate-700">{label}</label>
        {hasSignature && <button type="button" onClick={clear} className="text-[10px] font-bold text-green-700 hover:text-green-900 underline">Clear</button>}
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={180}
        onPointerDown={begin}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="h-28 w-full touch-none rounded border border-slate-300 bg-white cursor-crosshair"
        aria-label={label}
      />
      <p className="text-[10px] text-slate-500">Sign above using a finger, stylus, or mouse.</p>
    </div>
  );
}

type Props = {
  job: JobSite;
  technicianName: string;
  savedTechnicianSignature?: string;
  onSaveTechnicianSignature?: (signatureDataUrl: string) => Promise<void>;
  onClose: () => void;
  onComplete: () => void;
};

const templates: Record<NonNullable<JobSite['workOrderTemplate']>, string> = {
  general: 'General field service',
  nextivity: 'Nextivity / Cel-Fi deployment',
  security: 'Security camera deployment',
  'low-voltage': 'Low-voltage cabling',
  network: 'Network / Wi-Fi service',
};

export function WorkOrderSigningModal({ job, technicianName, savedTechnicianSignature = '', onSaveTechnicianSignature, onClose, onComplete }: Props) {
  const scopeTasks = job.scopeTasks?.filter(Boolean) ?? [];
  const checklistItems = job.qaChecklist?.filter(Boolean).length
    ? job.qaChecklist.filter(Boolean)
    : ['Scope completed or exceptions noted.', 'Work area cleared and equipment secured.', 'Customer walkthrough completed.'];
  const equipment = job.equipment?.filter((item) => item.description.trim()) ?? [];
  const [leadName, setLeadName] = useState(technicianName);
  const [customerName, setCustomerName] = useState('');
  const [technicianSignature, setTechnicianSignature] = useState(savedTechnicianSignature);
  const [customerSignature, setCustomerSignature] = useState('');
  const [checks, setChecks] = useState(() => checklistItems.map(() => false));
  const [customerAccepted, setCustomerAccepted] = useState(false);
  const [useSavedTechnicianSignature, setUseSavedTechnicianSignature] = useState(Boolean(savedTechnicianSignature));
  const [saveTechnicianSignature, setSaveTechnicianSignature] = useState(!savedTechnicianSignature && Boolean(onSaveTechnicianSignature));
  const [isSaving, setIsSaving] = useState(false);

  const complete = async () => {
    if (!leadName.trim() || !customerName.trim() || !technicianSignature || !customerSignature || !customerAccepted || checks.some((checked) => !checked)) {
      alert('Complete the checklist, enter both names, capture both signatures, and confirm customer acceptance.');
      return;
    }

    setIsSaving(true);
    try {
      if (!useSavedTechnicianSignature && saveTechnicianSignature && onSaveTechnicianSignature) {
        await onSaveTechnicianSignature(technicianSignature);
      }
      const completedAt = new Date().toISOString();
      const document = new jsPDF({ unit: 'pt', format: 'letter' });
      const green: [number, number, number] = [22, 163, 74];
      const dark: [number, number, number] = [15, 23, 42];
      const margin = 44;
      let y = 54;
      const ensureSpace = (height: number) => {
        if (y + height <= 730) return;
        document.addPage();
        y = 54;
        document.setTextColor(...green);
        document.setFont('helvetica', 'bold');
        document.setFontSize(12);
        document.text(`TECHSAVVY FIELD WORK ORDER · ${job.workOrderNumber || job.id}`, margin, y);
        y += 28;
        document.setTextColor(...dark);
      };

      document.setFillColor(...dark);
      document.rect(0, 0, 612, 82, 'F');
      document.setTextColor(...green);
      document.setFont('helvetica', 'bold');
      document.setFontSize(22);
      document.text('TECHSAVVY LLC', margin, 38);
      document.setTextColor(255, 255, 255);
      document.setFontSize(14);
      document.text('FIELD SERVICE WORK ORDER - COMPLETED', margin, 62);
      y = 112;

      const details = [
        ['Work order', job.workOrderNumber || job.id],
        ['Work type', templates[job.workOrderTemplate || 'general']],
        ['Vendor / customer', job.vendorName || 'Not specified'],
        ['Site name', job.name],
        ['Address', job.address],
        ['Site contact', job.siteContact || 'Not specified'],
        ['Date issued', job.dateIssued || 'Not specified'],
        ['Target completion', job.targetCompletion || 'Not specified'],
        ['Technician lead', leadName],
      ];

      document.setTextColor(...dark);
      document.setFontSize(11);
      details.forEach(([label, value]) => {
        ensureSpace(32);
        document.setFont('helvetica', 'bold');
        document.text(`${label}:`, margin, y);
        document.setFont('helvetica', 'normal');
        const lines = document.splitTextToSize(value, 360);
        document.text(lines, 170, y);
        y += Math.max(18, lines.length * 13);
      });

      y += 10;
      document.setDrawColor(...green);
      document.line(margin, y, 568, y);
      y += 25;
      document.setTextColor(...green);
      document.setFont('helvetica', 'bold');
      document.setFontSize(15);
      document.text('Scope of Work', margin, y);
      y += 20;
      document.setTextColor(...dark);
      document.setFont('helvetica', 'normal');
      document.setFontSize(10);
      const scopeEntries = scopeTasks.length ? scopeTasks : [job.notes || 'Scope confirmed at the job site.'];
      scopeEntries.forEach((task, index) => {
        const scopeLines = document.splitTextToSize(`${index + 1}. ${task}`, 510);
        ensureSpace(scopeLines.length * 13 + 5);
        document.text(scopeLines, margin, y);
        y += scopeLines.length * 13 + 5;
      });
      y += 17;

      if (equipment.length) {
        ensureSpace(45);
        document.setTextColor(...green);
        document.setFont('helvetica', 'bold');
        document.setFontSize(15);
        document.text('Equipment & Materials', margin, y);
        y += 20;
        document.setTextColor(...dark);
        document.setFont('helvetica', 'normal');
        document.setFontSize(10);
        equipment.forEach((item) => {
          const description = `${item.quantity ? `${item.quantity} × ` : ''}${item.description}${item.notes ? ` — ${item.notes}` : ''}`;
          const lines = document.splitTextToSize(`• ${description}`, 510);
          ensureSpace(lines.length * 13 + 4);
          document.text(lines, margin, y);
          y += lines.length * 13 + 4;
        });
        y += 15;
      }

      ensureSpace(95);
      document.setTextColor(...green);
      document.setFont('helvetica', 'bold');
      document.setFontSize(15);
      document.text('Completion Checklist', margin, y);
      y += 21;
      document.setTextColor(...dark);
      document.setFont('helvetica', 'normal');
      document.setFontSize(10);
      checklistItems.forEach((item) => {
        ensureSpace(22);
        document.text('✓', margin + 4, y);
        document.text(item, margin + 20, y);
        y += 17;
      });

      y += 16;
      ensureSpace(150);
      document.setDrawColor(...green);
      document.line(margin, y, 568, y);
      y += 23;
      document.setTextColor(...green);
      document.setFont('helvetica', 'bold');
      document.setFontSize(15);
      document.text('Completion & Acceptance', margin, y);
      y += 18;
      document.setTextColor(...dark);
      document.setFont('helvetica', 'normal');
      document.setFontSize(9);
      document.text(`Signed electronically on ${new Date(completedAt).toLocaleString()}.`, margin, y);
      y += 14;
      document.text('The site representative confirms that the completed work was reviewed and accepted.', margin, y);
      y += 16;
      document.addImage(technicianSignature, 'PNG', margin, y, 230, 55);
      document.addImage(customerSignature, 'PNG', 315, y, 230, 55);
      y += 68;
      document.setDrawColor(100, 116, 139);
      document.line(margin, y, 274, y);
      document.line(315, y, 545, y);
      y += 13;
      document.setFont('helvetica', 'bold');
      document.text(`Lead technician: ${leadName}`, margin, y);
      document.text(`Site representative: ${customerName}`, 315, y);

      const blob = document.output('blob');
      const safeNumber = (job.workOrderNumber || job.id).replace(/[^a-zA-Z0-9_-]/g, '-');
      const fileName = `${safeNumber}-signed-${completedAt.slice(0, 10)}.pdf`;
      const fileRef = ref(storage, `signed-work-orders/${job.id}/${Date.now()}-${fileName}`);
      await uploadBytes(fileRef, blob, { contentType: 'application/pdf' });
      const url = await getDownloadURL(fileRef);
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/jobs/complete-work-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId: job.id,
          fileName,
          url,
          completedAt,
          technicianName: leadName.trim(),
          customerName: customerName.trim(),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save the signed work order.');
      alert('Signed work order saved. You can open the PDF from this job at any time.');
      onComplete();
    } catch (error) {
      console.error('Could not complete work order:', error);
      alert(error instanceof Error ? error.message : 'The signed work order could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/85 p-3 sm:p-6">
      <div className="mx-auto my-4 max-w-2xl overflow-hidden rounded-2xl border border-green-500/40 bg-white shadow-2xl">
        <div className="bg-slate-950 px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400">TechSavvy Field Service</p><h2 className="mt-1 text-lg font-black text-white">Complete & Sign Work Order</h2><p className="mt-1 text-xs text-slate-400">{job.workOrderNumber || job.id} · {job.name}</p></div>
            <button type="button" onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">✕</button>
          </div>
        </div>
        <div className="space-y-5 p-5 text-slate-900 sm:p-7">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-slate-700"><strong className="text-green-800">Scope:</strong>{scopeTasks.length ? <ol className="mt-2 list-decimal space-y-1 pl-4">{scopeTasks.map((task, index) => <li key={`${index}-${task}`}>{task}</li>)}</ol> : <span> {job.notes || 'Scope confirmed at the job site.'}</span>}</div>
          {equipment.length ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><p className="font-bold text-slate-900">Equipment & materials</p><ul className="mt-2 space-y-1">{equipment.map((item, index) => <li key={`${index}-${item.description}`}><strong>{item.quantity ? `${item.quantity} × ` : ''}{item.description}</strong>{item.notes ? ` — ${item.notes}` : ''}</li>)}</ul></div> : null}
          <div className="space-y-2"><p className="text-sm font-bold">Completion checklist</p>{checklistItems.map((label, index) => <label key={label} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={checks[index]} onChange={(event) => setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} className="h-4 w-4 accent-green-600" />{label}</label>)}</div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Lead technician<input value={leadName} onChange={(event) => setLeadName(event.target.value)} className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">Site representative<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer's printed name" className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm" /></label></div>
          {useSavedTechnicianSignature && savedTechnicianSignature ? <div className="rounded border border-green-200 bg-green-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-green-900">Saved technician signature</p><p className="mt-0.5 text-[10px] text-green-800">This signature will be applied to this work order.</p></div><button type="button" onClick={() => { setUseSavedTechnicianSignature(false); setTechnicianSignature(''); }} className="rounded border border-green-700 px-2.5 py-1.5 text-[10px] font-bold text-green-800 hover:bg-green-100">Replace</button></div><img src={savedTechnicianSignature} alt="Saved technician signature" className="mt-3 h-20 w-full rounded border border-green-200 bg-white object-contain" /></div> : <><SignaturePad label="Lead technician signature" onChange={setTechnicianSignature} />{onSaveTechnicianSignature ? <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={saveTechnicianSignature} onChange={(event) => setSaveTechnicianSignature(event.target.checked)} className="h-4 w-4 accent-green-600" />Save this as my signature for future work orders</label> : null}</>}
          <SignaturePad label="Site representative signature" onChange={setCustomerSignature} />
          <label className="flex gap-2 rounded border border-green-200 bg-green-50 p-3 text-xs text-slate-700"><input type="checkbox" checked={customerAccepted} onChange={(event) => setCustomerAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-green-600" /><span>I confirm that I am authorized to accept this work on behalf of the site and that the scope above has been reviewed.</span></label>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={isSaving} className="rounded px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={complete} disabled={isSaving} className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Generating signed PDF…' : 'Generate & Save Signed PDF'}</button></div>
        </div>
      </div>
    </div>
  );
}
