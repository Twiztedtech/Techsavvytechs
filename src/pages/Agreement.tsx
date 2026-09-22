import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { jsPDF } from "jspdf";
import { CheckCircle2, Download, ShieldCheck, XCircle } from "lucide-react";
import {
  AGREEMENT_TITLE,
  COMPANY,
  DEFAULT_MINIMUM_HOURS,
  STANDARD_HOURS_LABEL,
  buildAgreementSections,
  type AgreementSection,
} from "../features/contracts/serviceAgreementTemplate";

function useSignaturePad(onChange: (dataUrl: string) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const begin = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.strokeStyle = "#12160f";
    ctx.lineWidth = 2.25;
    ctx.lineCap = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasStroke(true);
    onChange(canvasRef.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange("");
  };

  return { canvasRef, hasStroke, begin, draw, finish, clear };
}

function InitialBox({
  sectionLabel,
  onChange,
}: {
  sectionLabel: string;
  onChange: (dataUrl: string) => void;
}) {
  const pad = useSignaturePad(onChange);
  return (
    <div className="flex w-[132px] shrink-0 flex-col items-center gap-1.5 self-start rounded-sm border border-slate-300 bg-white/70 px-2.5 pb-2 pt-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <span className="font-mono text-[7.5px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Initial
      </span>
      <canvas
        ref={pad.canvasRef}
        width={130}
        height={44}
        onPointerDown={pad.begin}
        onPointerMove={pad.draw}
        onPointerUp={pad.finish}
        onPointerCancel={pad.finish}
        className="h-[44px] w-[112px] touch-none cursor-crosshair"
        aria-label={`Initial to confirm: ${sectionLabel}`}
      />
      <div className="h-px w-full bg-slate-300" />
      {pad.hasStroke ? (
        <button
          type="button"
          onClick={pad.clear}
          className="text-[8px] font-bold uppercase tracking-wide text-tech-green-deep underline"
        >
          Clear
        </button>
      ) : (
        <span className="text-[8px] italic text-slate-400">sign here</span>
      )}
    </div>
  );
}

function SignatureLine({
  label,
  height = 120,
  onChange,
}: {
  label: string;
  height?: number;
  onChange: (dataUrl: string) => void;
}) {
  const pad = useSignaturePad(onChange);
  return (
    <div>
      <canvas
        ref={pad.canvasRef}
        width={420}
        height={height}
        onPointerDown={pad.begin}
        onPointerMove={pad.draw}
        onPointerUp={pad.finish}
        onPointerCancel={pad.finish}
        style={{ height }}
        className="w-full touch-none cursor-crosshair"
        aria-label={label}
      />
      <div className="flex items-center justify-between border-t-2 border-slate-800 pt-1.5">
        <span className="font-serif text-[10px] italic text-slate-500">{label}</span>
        {pad.hasStroke && (
          <button
            type="button"
            onClick={pad.clear}
            className="text-[9px] font-bold uppercase tracking-wide text-tech-green-deep underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

type LoadedAgreement = {
  signed: boolean;
  customer: { name: string; businessName: string; email: string; phone: string; address: string };
  standardRate: number;
  nightRate: number;
  minimumHours: number;
};

function PaperShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#e8e6df] px-4 py-10 sm:py-16">
      <main className="mx-auto max-w-3xl border-t-[3px] border-tech-green-deep bg-[#fffdf9] shadow-[0_30px_70px_-25px_rgba(11,15,12,0.45)]">
        {children}
      </main>
    </div>
  );
}

function Letterhead({ eyebrow, kicker }: { eyebrow: string; kicker?: string }) {
  return (
    <header className="border-b-4 border-double border-slate-800 px-6 pb-6 pt-9 sm:px-12">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="font-display text-[15px] font-extrabold uppercase tracking-[0.28em] text-slate-900">
            {COMPANY.legalName}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-tech-green-deep">
            Field Services
          </p>
        </div>
        <div className="text-left font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500 sm:text-right">
          <p>{COMPANY.hq}</p>
          <p>
            {COMPANY.phone} · {COMPANY.email}
          </p>
        </div>
      </div>
      <h1 className="mt-9 text-center font-serif text-[22px] font-semibold uppercase tracking-[0.06em] text-slate-900">
        {eyebrow}
      </h1>
      {kicker && (
        <p className="mt-2 text-center font-serif text-[12px] italic text-slate-500">{kicker}</p>
      )}
    </header>
  );
}

export default function Agreement() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const [loaded, setLoaded] = useState<LoadedAgreement | null>(null);
  const [loadError, setLoadError] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!token) {
      setLoadError("This signing link is incomplete. Please ask TechSavvy to resend it.");
      return;
    }
    fetch(`/api/contact?operation=customer-agreement&token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "This signing link could not be loaded.");
        setLoaded(value);
        setCustomerName(value.customer.name || "");
        setBusinessName(value.customer.businessName || "");
        setPhone(value.customer.phone || "");
        setAddress(value.customer.address || "");
      })
      .catch((reason) => setLoadError(reason.message));
  }, [token]);

  const sections = useMemo(
    () =>
      buildAgreementSections({
        customerName,
        businessName,
        address,
        standardRate: loaded?.standardRate || 0,
        nightRate: loaded?.nightRate || 0,
        minimumHours: loaded?.minimumHours || DEFAULT_MINIMUM_HOURS,
      }),
    [customerName, businessName, address, loaded],
  );
  const initialSections = sections.filter((section) => section.requiresInitial);

  const [initials, setInitials] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<{ pdfDataUrl: string; fileName: string } | null>(
    null,
  );

  const missingInitials = initialSections.filter((section) => !initials[section.id]);
  const canSubmit =
    customerName.trim() &&
    address.trim() &&
    missingInitials.length === 0 &&
    signature &&
    agreed;

  const buildPdf = (allSections: AgreementSection[]) => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const ink: [number, number, number] = [17, 22, 18];
    const muted: [number, number, number] = [100, 104, 96];
    const green: [number, number, number] = [21, 128, 61];
    const margin = 50;
    const pageBottom = 736;
    let y = 0;
    let firstPage = true;

    const header = () => {
      doc.setDrawColor(...green);
      doc.setLineWidth(1.4);
      doc.line(margin, 38, 562, 38);
      doc.setLineWidth(0.5);
      doc.setDrawColor(...ink);
      doc.line(margin, 41, 562, 41);
      doc.setTextColor(...ink);
      doc.setFont("times", "bold");
      doc.setFontSize(15);
      doc.text(COMPANY.legalName.toUpperCase(), margin, 32);
      doc.setFont("times", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(`${COMPANY.hq}  ·  ${COMPANY.phone}  ·  ${COMPANY.email}`, 562, 32, {
        align: "right",
      });
      y = 62;
      if (firstPage) {
        doc.setTextColor(...ink);
        doc.setFont("times", "bold");
        doc.setFontSize(16);
        doc.text(AGREEMENT_TITLE.toUpperCase(), 306, y + 12, { align: "center" });
        doc.setFont("times", "italic");
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text(`Prepared for ${loaded?.customer.email || ""}  ·  ${todayLabel}`, 306, y + 26, {
          align: "center",
        });
        y += 46;
        firstPage = false;
      } else {
        doc.setFont("times", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(`${AGREEMENT_TITLE} (continued)`, margin, y);
        y += 16;
      }
    };
    const ensureSpace = (height: number) => {
      if (y + height <= pageBottom) return;
      doc.addPage();
      header();
    };

    header();

    doc.setTextColor(...ink);
    doc.setFontSize(10);
    const partyLines = [
      ["Customer", businessName.trim() || customerName.trim()],
      ["Signer", customerName.trim()],
      ["Email", loaded?.customer.email || ""],
      ["Phone", phone.trim() || "Not provided"],
      ["Service address", address.trim()],
      ["Date", todayLabel],
    ];
    partyLines.forEach(([label, value]) => {
      ensureSpace(16);
      doc.setFont("times", "bold");
      doc.text(`${label}:`, margin, y);
      doc.setFont("times", "normal");
      const lines = doc.splitTextToSize(value || "-", 380);
      doc.text(lines, 155, y);
      y += Math.max(14, lines.length * 12);
    });
    y += 10;
    doc.setDrawColor(190, 190, 182);
    doc.setLineWidth(0.5);
    doc.line(margin, y, 562, y);
    y += 22;

    allSections.forEach((section) => {
      ensureSpace(30);
      doc.setTextColor(...ink);
      doc.setFont("times", "bold");
      doc.setFontSize(11.5);
      const headingLines = doc.splitTextToSize(section.heading.toUpperCase(), 512);
      doc.text(headingLines, margin, y);
      y += headingLines.length * 14 + 5;

      doc.setFont("times", "normal");
      doc.setFontSize(10);
      section.paragraphs.forEach((paragraph) => {
        const lines = doc.splitTextToSize(paragraph, 512);
        ensureSpace(lines.length * 13 + 6);
        doc.text(lines, margin, y);
        y += lines.length * 13 + 6;
      });

      if (section.requiresInitial) {
        ensureSpace(42);
        doc.setDrawColor(210, 210, 202);
        doc.setLineWidth(0.5);
        doc.line(margin, y, 562, y);
        y += 4;
        doc.setFont("times", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text("Customer initials:", margin, y + 13);
        const initialImg = initials[section.id];
        if (initialImg) doc.addImage(initialImg, "PNG", 150, y - 4, 66, 22);
        else {
          doc.setDrawColor(...muted);
          doc.line(150, y + 13, 216, y + 13);
        }
        y += 28;
      }
      y += 8;
    });

    ensureSpace(150);
    doc.setDrawColor(...ink);
    doc.setLineWidth(1);
    doc.line(margin, y, 562, y);
    y += 24;
    doc.setTextColor(...ink);
    doc.setFont("times", "bolditalic");
    doc.setFontSize(10.5);
    doc.text(
      `IN WITNESS WHEREOF, ${customerName.trim() || "the undersigned"} agrees to be bound by the terms of this ${AGREEMENT_TITLE}, executed electronically on ${todayLabel}.`,
      margin,
      y,
      { maxWidth: 512 },
    );
    y += 34;
    if (signature) doc.addImage(signature, "PNG", margin, y - 8, 220, 56);
    y += 56;
    doc.setDrawColor(...ink);
    doc.setLineWidth(1);
    doc.line(margin, y, 300, y);
    y += 12;
    doc.setFont("times", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text("Customer signature", margin, y);
    y += 20;
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...ink);
    doc.text(`${customerName.trim()}`, margin, y);
    doc.setFont("times", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text("Print name", margin, y + 12);
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...ink);
    doc.text(todayLabel, 340, y);
    doc.setFont("times", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text("Date", 340, y + 12);

    return doc;
  };

  const submit = async () => {
    setError("");
    if (!canSubmit) {
      setError(
        missingInitials.length
          ? "Please initial every highlighted section before signing."
          : "Please complete all required fields, sign, and confirm you agree.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const doc = buildPdf(sections);
      const completedAt = new Date().toISOString();
      const safeName = (businessName.trim() || customerName.trim() || "customer").replace(
        /[^a-zA-Z0-9_-]/g,
        "-",
      );
      const fileName = `TechSavvy-Service-Agreement-${safeName}-${completedAt.slice(0, 10)}.pdf`;
      const pdfDataUrl = doc.output("datauristring");
      const pdfBase64 = pdfDataUrl.split(",")[1];

      const response = await fetch("/api/contact?operation=submit-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          customerName: customerName.trim(),
          businessName: businessName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          completedAt,
          fileName,
          pdfBase64,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "The agreement could not be submitted.");
      }
      setCompleted({ pdfDataUrl, fileName });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The agreement could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError)
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b0f0c] p-5">
        <div className="max-w-md rounded-sm border border-red-500/20 bg-[#151916] p-8 text-center text-white">
          <XCircle className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-4 font-display text-xl uppercase tracking-wide">
            Signing link unavailable
          </h1>
          <p className="mt-3 font-serif text-sm text-slate-400">{loadError}</p>
          <a
            href={`mailto:${COMPANY.email}`}
            className="mt-5 inline-block text-xs font-bold uppercase tracking-wide text-tech-green"
          >
            Contact {COMPANY.legalName}
          </a>
        </div>
      </div>
    );

  if (!loaded)
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b0f0c] font-serif text-sm italic text-slate-400">
        Verifying secure signing link…
      </div>
    );

  if (loaded.signed && !completed) {
    return (
      <PaperShell>
        <Letterhead eyebrow="Already Signed" />
        <div className="px-6 py-14 text-center sm:px-12">
          <CheckCircle2 className="mx-auto h-11 w-11 text-tech-green-deep" />
          <p className="mx-auto mt-5 max-w-sm font-serif text-[13px] leading-relaxed text-slate-700">
            This service agreement has already been signed. If you need another copy, contact
            TechSavvy and we'll resend it.
          </p>
          <p className="mt-8 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
            <ShieldCheck className="h-4 w-4 text-tech-green-deep" /> {COMPANY.email} ·{" "}
            {COMPANY.phone}
          </p>
        </div>
      </PaperShell>
    );
  }

  if (completed) {
    return (
      <PaperShell>
        <Letterhead eyebrow="Agreement Executed" kicker={`Signed ${todayLabel}`} />
        <div className="px-6 py-14 text-center sm:px-12">
          <CheckCircle2 className="mx-auto h-11 w-11 text-tech-green-deep" />
          <p className="mx-auto mt-5 max-w-sm font-serif text-[13px] leading-relaxed text-slate-700">
            Thanks, {customerName.trim().split(" ")[0] || "there"} — your signed service
            agreement is ready. A copy has also been emailed to{" "}
            <strong>{loaded.customer.email}</strong> and to TechSavvy.
          </p>
          <a
            href={completed.pdfDataUrl}
            download={completed.fileName}
            className="mt-8 inline-flex items-center gap-2 rounded-sm bg-tech-green px-7 py-3 text-xs font-bold uppercase tracking-wide text-brand-black hover:bg-tech-green-deep hover:text-white"
          >
            <Download className="h-4 w-4" /> Download signed PDF
          </a>
          <p className="mt-8 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
            <ShieldCheck className="h-4 w-4 text-tech-green-deep" /> {COMPANY.email} ·{" "}
            {COMPANY.phone}
          </p>
        </div>
      </PaperShell>
    );
  }

  return (
    <PaperShell>
      <Letterhead eyebrow={AGREEMENT_TITLE} kicker={`Prepared for ${loaded.customer.email} · ${todayLabel}`} />

      <div className="px-6 py-8 sm:px-12 sm:py-10">
        <p className="border border-slate-200 bg-slate-50/70 px-5 py-4 font-serif text-[12px] leading-relaxed text-slate-600">
          Review the complete agreement below. Each section marked <strong>Initial</strong>{" "}
          requires your initials before you can sign. Your completed, signed copy is emailed to
          you immediately and can be downloaded here as a PDF.
        </p>

        <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Full legal name *
            </span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="mt-1 w-full border-b border-slate-400 bg-transparent py-1.5 font-serif text-[14px] text-slate-900 focus:border-tech-green-deep focus:outline-none"
              placeholder="Jane Smith"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Business name (if applicable)
            </span>
            <input
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              className="mt-1 w-full border-b border-slate-400 bg-transparent py-1.5 font-serif text-[14px] text-slate-900 focus:border-tech-green-deep focus:outline-none"
              placeholder="Acme Corp"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Phone
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full border-b border-slate-400 bg-transparent py-1.5 font-serif text-[14px] text-slate-900 focus:border-tech-green-deep focus:outline-none"
              placeholder="(707) 555-0100"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Service address *
            </span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-1 w-full border-b border-slate-400 bg-transparent py-1.5 font-serif text-[14px] text-slate-900 focus:border-tech-green-deep focus:outline-none"
              placeholder="123 Main St, Fairfield, CA"
            />
          </label>
        </div>

        <div className="mt-6 grid grid-cols-3 divide-x divide-slate-300 border border-slate-300 bg-slate-50/60">
          <div className="px-4 py-3 text-center">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
              Standard rate
            </p>
            <p className="mt-1 font-serif text-[17px] font-semibold text-slate-900">
              ${loaded.standardRate.toLocaleString()}/hr
            </p>
            <p className="mt-0.5 font-serif text-[9px] italic text-slate-500">
              {STANDARD_HOURS_LABEL}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
              Night rate
            </p>
            <p className="mt-1 font-serif text-[17px] font-semibold text-slate-900">
              ${loaded.nightRate.toLocaleString()}/hr
            </p>
            <p className="mt-0.5 font-serif text-[9px] italic text-slate-500">Outside standard hours</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
              Minimum
            </p>
            <p className="mt-1 font-serif text-[17px] font-semibold text-slate-900">
              {loaded.minimumHours}
              {loaded.minimumHours === 1 ? " hr" : " hrs"}
            </p>
            <p className="mt-0.5 font-serif text-[9px] italic text-slate-500">Per dispatch</p>
          </div>
        </div>

        <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
          {sections.map((section, index) => (
            <article key={section.id} className="flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
              <div className="flex-1">
                <h2 className="font-serif text-[13px] font-semibold uppercase tracking-[0.06em] text-slate-900">
                  <span className="mr-1 text-tech-green-deep">§{index + 1}</span>
                  {section.heading.replace(/^\d+\.\s*/, "")}
                </h2>
                {section.paragraphs.map((paragraph, pIndex) => (
                  <p key={pIndex} className="mt-2.5 font-serif text-[13px] leading-[1.8] text-slate-700">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.requiresInitial && (
                <InitialBox
                  sectionLabel={section.heading}
                  onChange={(value) =>
                    setInitials((current) => ({ ...current, [section.id]: value }))
                  }
                />
              )}
            </article>
          ))}
        </div>

        <div className="mt-10 border-t-4 border-double border-slate-800 pt-8">
          <p className="font-serif text-[12.5px] italic leading-relaxed text-slate-700">
            In witness whereof, the undersigned agrees to be bound by the terms of this{" "}
            {AGREEMENT_TITLE} above, executed electronically as of the date below.
          </p>
          <div className="mt-7 grid gap-8 sm:grid-cols-2">
            <SignatureLine label="Customer signature" onChange={setSignature} />
            <div className="flex flex-col justify-end gap-6">
              <div>
                <p className="border-b-2 border-slate-800 pb-1.5 font-serif text-[14px] text-slate-900">
                  {customerName || " "}
                </p>
                <p className="mt-1 font-serif text-[10px] italic text-slate-500">Print name</p>
              </div>
              <div>
                <p className="border-b-2 border-slate-800 pb-1.5 font-serif text-[14px] text-slate-900">
                  {todayLabel}
                </p>
                <p className="mt-1 font-serif text-[10px] italic text-slate-500">Date</p>
              </div>
            </div>
          </div>
        </div>

        <label className="mt-8 flex gap-3 border border-slate-300 bg-slate-50/60 px-5 py-4 font-serif text-[12.5px] leading-relaxed text-slate-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-tech-green-deep"
          />
          <span>
            I have read and agree to the {AGREEMENT_TITLE} above, and I am authorized to sign
            on behalf of the customer named.
          </span>
        </label>

        {error && (
          <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 font-serif text-[12px] text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-6 w-full rounded-sm bg-tech-green px-5 py-3.5 text-xs font-bold uppercase tracking-[0.12em] text-brand-black hover:bg-tech-green-deep hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? "Generating signed PDF…" : "Execute & Sign Agreement"}
        </button>
      </div>
    </PaperShell>
  );
}
