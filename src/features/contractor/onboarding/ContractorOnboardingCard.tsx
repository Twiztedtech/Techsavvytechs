import { useState, useRef, useEffect } from 'react';
import { auth, storage } from '../../../lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export type OnboardingStatus = 'not_started' | 'submitted' | 'approved' | 'needs_update';

export interface OnboardingState {
  status: OnboardingStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string;
  agreementAcceptedAt?: string | null;
  hasW9?: boolean;
  w9FileName?: string | null;
}

export function ContractorOnboardingCard({ onboarding, onUpdated }: { onboarding: OnboardingState | null; onUpdated: (value: OnboardingState) => void }) {
  const current = onboarding || { status: 'not_started' as const };
  const needsAction = current.status === 'not_started' || current.status === 'needs_update';

  // Form State
  const [taxpayerName, setTaxpayerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [taxClass, setTaxClass] = useState('individual');
  const [llcCode, setLlcCode] = useState('');
  const [line3bChecked, setLine3bChecked] = useState(false);
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [exemptPayeeCode, setExemptPayeeCode] = useState('');
  const [exemptFatcaCode, setExemptFatcaCode] = useState('');
  
  const [tinType, setTinType] = useState<'ssn' | 'ein'>('ssn');
  const [tinInput, setTinInput] = useState('');
  const [tinValue, setTinValue] = useState('');
  const [tinMasked, setTinMasked] = useState(false);
  
  const [sigMethod, setSigMethod] = useState<'draw' | 'type'>('draw');
  const [sigDataUrl, setSigDataUrl] = useState('');
  const [sigTypedText, setSigTypedText] = useState('');
  const [sigDate, setSigDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Drawing Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (needsAction && sigMethod === 'draw') {
      initCanvas();
    }
  }, [needsAction, sigMethod]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset and scale resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a'; // slate-900

    const getCoordinates = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e) {
        if (e.touches.length === 0) return null;
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
        };
      } else {
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
    };

    const startDraw = (e: MouseEvent | TouchEvent) => {
      const coords = getCoordinates(e);
      if (!coords) return;
      isDrawing.current = true;
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current) return;
      const coords = getCoordinates(e);
      if (!coords) return;
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    };

    const stopDraw = () => {
      if (isDrawing.current) {
        isDrawing.current = false;
        setSigDataUrl(canvas.toDataURL('image/png'));
      }
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startDraw(e);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      draw(e);
    });
    canvas.addEventListener('touchend', stopDraw);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigDataUrl('');
  };

  const formatTin = (val: string, type: 'ssn' | 'ein') => {
    let clean = val.replace(/\D/g, '');
    if (clean.length > 9) clean = clean.substring(0, 9);
    setTinValue(clean);

    let formatted = '';
    if (type === 'ssn') {
      if (clean.length > 0) formatted += clean.substring(0, 3);
      if (clean.length > 3) formatted += '-' + clean.substring(3, 5);
      if (clean.length > 5) formatted += '-' + clean.substring(5, 9);
    } else {
      if (clean.length > 0) formatted += clean.substring(0, 2);
      if (clean.length > 2) formatted += '-' + clean.substring(2, 9);
    }
    setTinInput(formatted);
  };

  const submit = async () => {
    if (!taxpayerName.trim()) return alert('Line 1 Name is required.');
    if (!addressStreet.trim() || !addressCity.trim() || !addressState.trim() || !addressZip.trim()) {
      return alert('Complete physical address details are required.');
    }
    if (taxClass === 'llc' && !llcCode.trim()) {
      return alert('Specify the LLC tax classification code (C, S, or P).');
    }
    if (tinValue.length < 9) return alert('Provide a valid 9-digit SSN or EIN.');
    if (sigMethod === 'draw' && !sigDataUrl) return alert('Sign your signature first.');
    if (sigMethod === 'type' && !sigTypedText.trim()) return alert('Type your signature first.');
    if (!accepted) return alert('Please accept the contractor portal terms before submitting.');

    const user = auth.currentUser;
    if (!user) return;
    setIsSubmitting(true);

    try {
      // 1. Generate PDF from DOM preview
      const previewEl = previewRef.current;
      if (!previewEl) throw new Error('Could not find form preview element.');
      
      const canvas = await html2canvas(previewEl, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output('blob');

      // 2. Upload file to Firebase Storage
      const fileName = `W9-${taxpayerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const storagePath = `contractor-onboarding/${user.uid}/w9/${Date.now()}-${fileName}`;
      const fileRef = ref(storage, storagePath);
      
      await uploadBytes(fileRef, pdfBlob, { contentType: 'application/pdf' });

      // 3. Post to onboarding API
      const token = await user.getIdToken();
      const response = await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreementAccepted: true, w9: { storagePath, fileName } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit your onboarding.');
      
      onUpdated(data.onboarding);
      setAccepted(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not submit your onboarding.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const labels: Record<OnboardingStatus, { title: string; detail: string; color: string }> = {
    not_started: { title: 'W-9 onboarding required', detail: 'Complete and sign the secure interactive form below to submit your onboarding.', color: 'amber' },
    submitted: { title: 'W-9 submitted', detail: 'Your W-9 and acknowledgement are with TechSavvy for review.', color: 'blue' },
    approved: { title: 'Onboarding approved', detail: 'Your W-9 and portal acknowledgement are on file.', color: 'green' },
    needs_update: { title: 'W-9 update requested', detail: current.reviewNote || 'Please update your W-9 details below and submit again.', color: 'amber' },
  };

  const label = labels[current.status];
  const border = label.color === 'green' ? 'border-green-500/30 bg-green-500/5' : label.color === 'blue' ? 'border-sky-500/30 bg-sky-500/5' : 'border-amber-500/30 bg-amber-500/5';

  const renderW9Form = (refVar?: React.RefObject<HTMLDivElement | null>) => (
    <div ref={refVar} className="bg-white p-6 rounded text-[8.5px] text-slate-950 font-sans leading-tight shadow-md w-[500px] shrink-0 space-y-2 select-none border border-slate-300">
      {/* Header */}
      <div className="flex border-b-2 border-black pb-1.5">
        <div className="w-1/4 pr-1.5 border-r border-black font-bold flex flex-col justify-between">
          <div>Form <span className="text-sm font-extrabold block">W-9</span></div>
          <div className="text-[7px] font-normal">(Rev. March 2024)</div>
          <div className="text-[7px] font-normal">Department of the Treasury<br />IRS</div>
        </div>
        <div className="w-2/4 px-1.5 text-center flex flex-col justify-center">
          <div className="font-bold text-[9px] uppercase tracking-tight">Request for Taxpayer<br />Identification Number and Certification</div>
        </div>
        <div className="w-1/4 pl-1.5 border-l border-black text-center flex flex-col justify-center font-bold text-[7px]">
          Give Form to the requester. Do not send to the IRS.
        </div>
      </div>

      {/* Line 1 & 2 */}
      <div className="irs-border-b pb-0.5">
        <div className="font-bold">1 Name (as shown on your income tax return)</div>
        <div className="font-mono text-[9px] text-blue-900 min-h-[14px] px-1 bg-slate-50 uppercase font-semibold">{taxpayerName}</div>
      </div>

      <div className="irs-border-b pb-0.5">
        <div className="font-bold">2 Business name/disregarded entity name, if different from above</div>
        <div className="font-mono text-[9px] text-blue-900 min-h-[14px] px-1 bg-slate-50 uppercase">{businessName}</div>
      </div>

      {/* Line 3 & 4 */}
      <div className="grid grid-cols-12 irs-border-b pb-0.5">
        <div className="col-span-8 irs-border-r pr-1">
          <div className="font-bold">3a Federal tax classification:</div>
          <div className="grid grid-cols-2 gap-y-0.5 mt-0.5 text-[7.5px]">
            <div>{taxClass === 'individual' ? '[X]' : '[ ]'} Individual/sole proprietor</div>
            <div>{taxClass === 'ccorp' ? '[X]' : '[ ]'} C Corporation</div>
            <div>{taxClass === 'scorp' ? '[X]' : '[ ]'} S Corporation</div>
            <div>{taxClass === 'partnership' ? '[X]' : '[ ]'} Partnership</div>
            <div>{taxClass === 'trust' ? '[X]' : '[ ]'} Trust/estate</div>
            <div>{taxClass === 'llc' ? '[X]' : '[ ]'} LLC ({taxClass === 'llc' ? <u>{llcCode || '   '}</u> : ' '})</div>
          </div>
        </div>
        <div className="col-span-4 pl-1 text-[7px] space-y-0.5">
          <div className="font-bold">4 Exemptions:</div>
          <div>Exempt payee: <u>{exemptPayeeCode || '   '}</u></div>
          <div>FATCA code: <u>{exemptFatcaCode || '   '}</u></div>
        </div>
      </div>

      {/* Line 3b */}
      <div className="irs-border-b pb-0.5">
        <div>{line3bChecked ? '[X]' : '[ ]'} <strong>3b:</strong> Check if you have foreign partners, beneficiaries, or owners.</div>
      </div>

      {/* Line 5 & 6 */}
      <div className="irs-border-b pb-0.5">
        <div className="font-bold">5 Address (number, street, and apt. or suite no.)</div>
        <div className="font-mono text-[9px] text-blue-900 min-h-[14px] px-1 bg-slate-50">{addressStreet}</div>
      </div>

      <div className="irs-border-b pb-0.5">
        <div className="font-bold">6 City, state, and ZIP code</div>
        <div className="font-mono text-[9px] text-blue-900 min-h-[14px] px-1 bg-slate-50">
          {addressCity}{addressCity ? ', ' : ''}{addressState} {addressZip}
        </div>
      </div>

      {/* Part I */}
      <div className="bg-black text-white font-bold px-1.5 py-0.5 flex justify-between text-[8px]">
        <span>Part I</span>
        <span>Taxpayer Identification Number (TIN)</span>
      </div>
      <div className="p-1.5 border border-black space-y-1.5 text-[7px]">
        <p>Enter your TIN in the appropriate box.</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-1 border border-black">
            <div className="font-bold text-[7px] mb-0.5">Social Security Number (SSN)</div>
            <div className="font-mono text-[9px] font-bold text-center tracking-widest min-h-[14px]">
              {tinType === 'ssn' ? (tinMasked ? tinInput.replace(/\d/g, '*') : tinInput) : '___-__-____'}
            </div>
          </div>
          <div className="p-1 border border-black">
            <div className="font-bold text-[7px] mb-0.5">Employer Identification Number (EIN)</div>
            <div className="font-mono text-[9px] font-bold text-center tracking-widest min-h-[14px]">
              {tinType === 'ein' ? (tinMasked ? tinInput.replace(/\d/g, '*') : tinInput) : '__-_______'}
            </div>
          </div>
        </div>
      </div>

      {/* Part II */}
      <div className="bg-black text-white font-bold px-1.5 py-0.5 flex justify-between text-[8px]">
        <span>Part II</span>
        <span>Certification</span>
      </div>
      <div className="text-[7px] text-slate-700 leading-relaxed">
        Under penalties of perjury, I certify that: 1. The number shown on this form is my correct taxpayer identification number...
      </div>

      {/* Signature Block */}
      <div className="pt-2 flex items-end gap-2">
        <div className="w-2/3 border-b-2 border-black pb-0.5">
          <div className="text-[7px] font-bold">Signature of U.S. Person</div>
          <div className="h-8 flex items-end justify-start">
            {sigMethod === 'draw' && sigDataUrl ? (
              <img src={sigDataUrl} alt="Signature" className="max-h-7 object-contain" />
            ) : sigMethod === 'type' && sigTypedText ? (
              <span className="font-signature text-base text-blue-900 border-b border-slate-200 pb-0.5 font-semibold">
                {sigTypedText}
              </span>
            ) : null}
          </div>
        </div>
        <div className="w-1/3 border-b-2 border-black pb-0.5">
          <div className="text-[7px] font-bold">Date</div>
          <div className="font-mono text-[9px] text-blue-900 min-h-[14px] font-semibold">{sigDate}</div>
        </div>
      </div>
    </div>
  );

  return (
    <section className={`rounded-2xl border p-5 ${border} overflow-hidden relative`} aria-label="Contractor onboarding">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-tech-green">Contractor onboarding</p>
          <h2 className="mt-1 text-lg font-black text-white">{label.title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">{label.detail}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200">
          {current.status.replace('_', ' ')}
        </span>
      </div>

      {needsAction ? (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
          {/* Interactive Input Form */}
          <div className="lg:col-span-6 space-y-4 w-full">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Taxpayer Details</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">1. Legal Name *</label>
                <input
                  type="text"
                  value={taxpayerName}
                  onChange={(e) => setTaxpayerName(e.target.value)}
                  placeholder="e.g. Jane M. Doe or Tech Solutions LLC"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">2. Business Name (DBA) if different</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Doe Consulting"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">3a. Federal Tax Classification</label>
                <select
                  value={taxClass}
                  onChange={(e) => setTaxClass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="individual">Individual / Sole Proprietor or Single-Member LLC</option>
                  <option value="ccorp">C Corporation</option>
                  <option value="scorp">S Corporation</option>
                  <option value="partnership">Partnership</option>
                  <option value="trust">Trust / Estate</option>
                  <option value="llc">Limited Liability Company (LLC)</option>
                </select>
              </div>

              {taxClass === 'llc' && (
                <div className="p-3 bg-slate-900/50 border border-slate-850 rounded-lg flex items-center gap-3">
                  <label className="text-xs text-slate-300">LLC Tax Code (C, S, or P):</label>
                  <input
                    type="text"
                    maxLength={1}
                    value={llcCode}
                    onChange={(e) => setLlcCode(e.target.value.toUpperCase())}
                    placeholder="S"
                    className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center font-mono font-bold text-xs uppercase"
                  />
                </div>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 bg-slate-900/40 p-2.5 rounded-lg">
                <input
                  type="checkbox"
                  checked={line3bChecked}
                  onChange={(e) => setLine3bChecked(e.target.checked)}
                  className="mt-0.5"
                />
                <span><strong>Line 3b:</strong> Check if you have foreign partners, beneficiaries, or owners.</span>
              </label>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">2. Address & Exemptions</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Street Address *</label>
                <input
                  type="text"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  placeholder="123 Main St, Suite 100"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">City *</label>
                  <input
                    type="text"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    placeholder="Sacramento"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">State *</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={addressState}
                    onChange={(e) => setAddressState(e.target.value.toUpperCase())}
                    placeholder="CA"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 uppercase"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">ZIP *</label>
                  <input
                    type="text"
                    value={addressZip}
                    onChange={(e) => setAddressZip(e.target.value)}
                    placeholder="95814"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Exempt Payee Code</label>
                  <input
                    type="text"
                    value={exemptPayeeCode}
                    onChange={(e) => setExemptPayeeCode(e.target.value)}
                    placeholder="1-13"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">FATCA Code</label>
                  <input
                    type="text"
                    value={exemptFatcaCode}
                    onChange={(e) => setExemptFatcaCode(e.target.value)}
                    placeholder="A-M"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">3. Taxpayer ID Number</h3>
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-350">
                  <input
                    type="radio"
                    name="tinType"
                    checked={tinType === 'ssn'}
                    onChange={() => { setTinType('ssn'); setTinInput(''); setTinValue(''); }}
                  />
                  <span>SSN</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-355">
                  <input
                    type="radio"
                    name="tinType"
                    checked={tinType === 'ein'}
                    onChange={() => { setTinType('ein'); setTinInput(''); setTinValue(''); }}
                  />
                  <span>EIN</span>
                </label>
                <button
                  type="button"
                  onClick={() => setTinMasked(!tinMasked)}
                  className="ml-auto text-[10px] text-slate-400 hover:text-white underline"
                >
                  {tinMasked ? 'Show digits' : 'Mask digits'}
                </button>
              </div>

              <input
                type="text"
                value={tinInput}
                onChange={(e) => formatTin(e.target.value, tinType)}
                placeholder={tinType === 'ssn' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                className="w-full bg-slate-955 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 font-mono tracking-wider focus:outline-none focus:border-amber-500"
              />
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">4. Certification & Signature</h3>
            <div className="space-y-3">
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSigMethod('draw')}
                  className={`px-3 py-1 rounded ${sigMethod === 'draw' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setSigMethod('type')}
                  className={`px-3 py-1 rounded ${sigMethod === 'type' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`}
                >
                  Type
                </button>
              </div>

              {sigMethod === 'draw' ? (
                <div className="relative border-2 border-dashed border-slate-800 rounded-xl bg-slate-950 p-1">
                  <canvas ref={canvasRef} className="w-full h-24 cursor-crosshair rounded-lg bg-slate-950/20" />
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="absolute right-2 top-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] rounded"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={sigTypedText}
                  onChange={(e) => setSigTypedText(e.target.value)}
                  placeholder="Type legal name..."
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none"
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={sigDate}
                    onChange={(e) => setSigDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-300 select-none pb-1.5">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Accept Portal Terms.</span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={isSubmitting}
              className="w-full bg-green-500 hover:bg-green-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Generating & Submitting PDF...' : 'Sign & Submit W-9'}
            </button>
          </div>

          {/* Visual IRS Preview - Visible only on Desktop (lg screen baseline) */}
          <div className="hidden lg:block lg:col-span-6 bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-3 overflow-x-auto max-h-[85vh] sticky top-4">
            <h4 className="text-xs font-bold text-slate-400">Live Visual PDF Render Preview</h4>
            {renderW9Form()}
          </div>

          {/* Offscreen W-9 Container for HTML2Canvas PDF capture (guarantees perfect layout size on all devices) */}
          <div className="absolute left-[-9999px] top-[-9999px] pointer-events-none">
            {renderW9Form(previewRef)}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-slate-300">
          {current.w9FileName ? (
            <>Document on file: <span className="font-semibold text-white">{current.w9FileName}</span>.</>
          ) : null}{' '}
          {current.agreementAcceptedAt ? 'Terms acknowledgement recorded.' : null}
        </div>
      )}
    </section>
  );
}
