import React, { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileUp,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";
import { auth } from "../lib/firebase";

type BookingForm = {
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  referencePrefix: string;
  clientReference: string;
  siteName: string;
  address: string;
  siteContact: string;
  serviceType: string;
  scopeSummary: string;
  accessInstructions: string;
  safetyRequirements: string;
  requestedDate: string;
  requestedStart: string;
  requestedEnd: string;
  alternateDate: string;
  alternateStart: string;
  alternateEnd: string;
  directContactRequested: boolean;
  smsConsent: boolean;
  website: string;
};

const initialForm: BookingForm = {
  companyName: "",
  requesterName: "",
  requesterEmail: "",
  requesterPhone: "",
  referencePrefix: "",
  clientReference: "",
  siteName: "",
  address: "",
  siteContact: "",
  serviceType: "low-voltage",
  scopeSummary: "",
  accessInstructions: "",
  safetyRequirements: "",
  requestedDate: "",
  requestedStart: "08:00",
  requestedEnd: "12:00",
  alternateDate: "",
  alternateStart: "13:00",
  alternateEnd: "17:00",
  directContactRequested: false,
  smsConsent: false,
  website: "",
};

function uploadFile(
  file: File,
  policy: { url: string; fields: Record<string, string> },
  progress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    Object.entries(policy.fields).forEach(([key, value]) =>
      body.append(key, value),
    );
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", policy.url);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Could not upload ${file.name}. Please retry.`));
    xhr.onerror = () =>
      reject(new Error(`Connection interrupted while uploading ${file.name}.`));
    xhr.ontimeout = () =>
      reject(new Error(`Upload timed out for ${file.name}.`));
    xhr.send(body);
  });
}

type BookJobProps = {
  embedded?: boolean;
  defaults?: Partial<BookingForm>;
  onSubmitted?: () => void;
};

export default function BookJob({
  embedded = false,
  defaults = {},
  onSubmitted,
}: BookJobProps) {
  const resetForm = () => ({ ...initialForm, ...defaults });
  const [form, setForm] = useState<BookingForm>(resetForm);
  const [scopeTasks, setScopeTasks] = useState([""]);
  const [deliverables, setDeliverables] = useState([""]);
  const [equipment, setEquipment] = useState([
    {
      description: "",
      quantity: "",
      notes: "",
      providedBy: "client" as "client" | "techsavvy",
    },
  ]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [result, setResult] = useState({
    requestNumber: "",
    urgent: false,
    error: "",
    statusUrl: "",
  });
  const field =
    (key: keyof BookingForm) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("sending");
    setResult({ requestNumber: "", urgent: false, error: "", statusUrl: "" });
    try {
      const uploadSession = crypto.randomUUID();
      const token = await auth.currentUser?.getIdToken();
      const attachments = [];
      for (const file of files) {
        if (!file.size || file.size > 50 * 1024 * 1024)
          throw new Error(`${file.name} must be between 1 byte and 50 MB.`);
      }
      for (const file of files) {
        setUploadProgress(`Preparing ${file.name}…`);
        const uploadResponse = await fetch("/api/client?action=request-file", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            uploadSession,
            file: {
              name: file.name,
              size: file.size,
              contentType:
                file.type ||
                (file.name.toLowerCase().endsWith(".txt")
                  ? "text/plain"
                  : "application/octet-stream"),
            },
          }),
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok)
          throw new Error(uploadData.error || `Could not upload ${file.name}.`);
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await uploadFile(file, uploadData.policy, (percent) =>
              setUploadProgress(
                `Uploading ${file.name}: ${percent}%${attempt ? " (retry)" : ""}`,
              ),
            );
            break;
          } catch (error) {
            if (attempt === 2) throw error;
          }
        }
        attachments.push({ receipt: uploadData.receipt });
      }
      setUploadProgress("Saving your job request…");
      const requestedWindows = [
        {
          date: form.requestedDate,
          start: form.requestedStart,
          end: form.requestedEnd,
        },
        ...(form.alternateDate
          ? [
              {
                date: form.alternateDate,
                start: form.alternateStart,
                end: form.alternateEnd,
              },
            ]
          : []),
      ];
      const response = await fetch("/api/client?action=request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          requestedWindows,
          scopeTasks,
          deliverables,
          equipment,
          attachments,
          uploadSession,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The request could not be submitted.");
      setResult({
        requestNumber: data.requestNumber,
        urgent: data.urgent,
        error: "",
        statusUrl: data.statusUrl,
      });
      setState("success");
      setForm(resetForm());
      setScopeTasks([""]);
      setDeliverables([""]);
      setEquipment([
        { description: "", quantity: "", notes: "", providedBy: "client" },
      ]);
      setFiles([]);
      onSubmitted?.();
    } catch (error) {
      setResult({
        requestNumber: "",
        urgent: false,
        error:
          error instanceof Error
            ? error.message
            : "The request could not be submitted.",
        statusUrl: "",
      });
      setState("error");
    }
  };

  if (state === "success")
    return (
      <div className={embedded ? "" : "min-h-[75vh] px-6 pb-32 pt-36"}>
        <div className="mx-auto max-w-2xl glass-card border-t-4 border-tech-green p-10 text-center">
          <CheckCircle2 className="mx-auto mb-6 h-16 w-16 text-tech-green" />
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-tech-green">
            Request received
          </p>
          <h1 className="text-4xl font-display font-bold text-white">
            {result.requestNumber}
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-slate-400">
            TechSavvy will review your scope and requested windows before
            confirming an appointment.
            {result.urgent
              ? " This request was flagged for urgent review."
              : ""}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setState("idle")}
              className="glass-button px-5 py-3 text-sm font-bold"
            >
              Submit another
            </button>
            {!embedded && result.statusUrl && (
              <a
                href={result.statusUrl}
                className="glass-button px-5 py-3 text-sm font-bold"
              >
                Track request
              </a>
            )}
            {!embedded && (
              <Link
                to="/client"
                className="bg-tech-green px-5 py-3 text-sm font-bold text-brand-black"
              >
                Client portal
              </Link>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div className={embedded ? "" : "px-6 pb-32 pt-32"}>
      <div className="mx-auto max-w-6xl">
        {!embedded && (
          <>
            <div className="mb-8 max-w-3xl">
              <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.4em] text-tech-green">
                New request or first-time client
              </p>
              <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight text-white md:text-7xl">
                Book a <span className="text-slate-500">job.</span>
              </h1>
              <p className="mt-6 text-lg text-slate-400">
                No account is required for your first request. Send the site,
                scope, documents, and preferred arrival windows; requested times
                remain tentative until TechSavvy confirms them.
              </p>
            </div>
            <section className="mb-10 flex flex-col justify-between gap-5 rounded border border-tech-green/25 bg-tech-green/5 p-5 md:flex-row md:items-center md:p-6">
              <div>
                <p className="text-sm font-bold text-white">
                  Already have client access?
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Sign in to see your company’s jobs, assignments, progress,
                  messages, rescheduling, and closeout.
                </p>
              </div>
              <Link
                to="/client"
                className="shrink-0 rounded border border-tech-green px-5 py-3 text-center text-xs font-bold uppercase tracking-wider text-tech-green transition-colors hover:bg-tech-green hover:text-brand-black"
              >
                Client login
              </Link>
            </section>
          </>
        )}
        <form
          onSubmit={submit}
          className="grid gap-6 lg:grid-cols-[1fr_1.35fr]"
        >
          <aside className="space-y-6">
            <section className="glass-card p-6">
              <h2 className="mb-5 flex items-center gap-2 font-bold text-white">
                <ShieldCheck className="h-5 w-5 text-tech-green" /> Company &
                requester
              </h2>
              <div className="grid gap-4">
                {[
                  ["companyName", "Company name"],
                  ["requesterName", "Your name"],
                  ["requesterEmail", "Business email"],
                  ["requesterPhone", "Mobile phone"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="text-xs font-semibold text-slate-300"
                  >
                    {label}
                    <input
                      required
                      type={
                        key === "requesterEmail"
                          ? "email"
                          : key === "requesterPhone"
                            ? "tel"
                            : "text"
                      }
                      value={String(form[key as keyof BookingForm])}
                      onChange={field(key as keyof BookingForm)}
                      className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-sm text-white focus:border-tech-green focus:outline-none"
                    />
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-300">
                    Reference prefix
                    <input
                      value={form.referencePrefix}
                      onChange={field("referencePrefix")}
                      placeholder="ATG-Zain-"
                      className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-300">
                    PO / work order
                    <input
                      value={form.clientReference}
                      onChange={field("clientReference")}
                      placeholder="Optional"
                      className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-sm text-white"
                    />
                  </label>
                </div>
              </div>
            </section>
            <section className="glass-card p-6">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
                <CalendarDays className="h-5 w-5 text-tech-green" /> Requested
                windows
              </h2>
              <p className="mb-4 text-xs text-slate-400">
                Monday–Friday, 8:00 AM–5:00 PM Pacific. Requests inside two
                business days are marked urgent.
              </p>
              {[
                [
                  "requestedDate",
                  "requestedStart",
                  "requestedEnd",
                  "Preferred",
                ],
                [
                  "alternateDate",
                  "alternateStart",
                  "alternateEnd",
                  "Alternate",
                ],
              ].map(([date, start, end, label], index) => (
                <div key={date} className="mb-4">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {label}
                  </p>
                  <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
                    <input
                      required={index === 0}
                      type="date"
                      value={String(form[date as keyof BookingForm])}
                      onChange={field(date as keyof BookingForm)}
                      className="rounded border border-white/10 bg-white/5 px-2 py-3 text-xs text-white"
                    />
                    <input
                      type="time"
                      min="08:00"
                      max="17:00"
                      value={String(form[start as keyof BookingForm])}
                      onChange={field(start as keyof BookingForm)}
                      className="rounded border border-white/10 bg-white/5 px-2 py-3 text-xs text-white"
                    />
                    <input
                      type="time"
                      min="08:00"
                      max="17:00"
                      value={String(form[end as keyof BookingForm])}
                      onChange={field(end as keyof BookingForm)}
                      className="rounded border border-white/10 bg-white/5 px-2 py-3 text-xs text-white"
                    />
                  </div>
                </div>
              ))}
            </section>
          </aside>
          <main className="space-y-6">
            <section className="glass-card border-t-4 border-tech-green p-6 md:p-8">
              <h2 className="mb-5 text-xl font-bold text-white">
                Site and scope
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300">
                  Site name
                  <input
                    required
                    value={form.siteName}
                    onChange={field("siteName")}
                    className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  Service type
                  <select
                    value={form.serviceType}
                    onChange={field("serviceType")}
                    className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-3 text-white"
                  >
                    <option value="low-voltage">Low-voltage</option>
                    <option value="network">Network / infrastructure</option>
                    <option value="msp">MSP support</option>
                    <option value="cell-boosting">Cellular enhancement</option>
                    <option value="survey">Site survey</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300 md:col-span-2">
                  Full site address
                  <input
                    required
                    value={form.address}
                    onChange={field("address")}
                    className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300 md:col-span-2">
                  Site contact
                  <input
                    value={form.siteContact}
                    onChange={field("siteContact")}
                    placeholder="Name, phone, and email"
                    className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-white"
                  />
                </label>
              </div>
              <label className="mt-4 block text-xs font-semibold text-slate-300">
                Scope summary
                <textarea
                  required
                  rows={5}
                  value={form.scopeSummary}
                  onChange={field("scopeSummary")}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-white"
                />
              </label>
              <div className="mt-5 space-y-2">
                <div className="flex justify-between">
                  <p className="text-xs font-bold text-tech-green">
                    Scope tasks
                  </p>
                  <button
                    type="button"
                    onClick={() => setScopeTasks((v) => [...v, ""])}
                    className="text-xs text-tech-green"
                  >
                    + Add task
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Add each distinct piece of work as its own task—for example,
                  “Remove the old UPS batteries,” “Install the replacement
                  batteries,” and “Photograph and test the completed work.” This
                  becomes the technician’s checklist in the CRM.
                </p>
                {scopeTasks.map((task, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={task}
                      onChange={(e) =>
                        setScopeTasks((v) =>
                          v.map((x, i) => (i === index ? e.target.value : x)),
                        )
                      }
                      placeholder={`Task ${index + 1}`}
                      className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                    {scopeTasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setScopeTasks((v) => v.filter((_, i) => i !== index))
                        }
                        className="text-red-400"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2">
                <div className="flex justify-between">
                  <p className="text-xs font-bold text-tech-green">
                    Equipment / materials
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setEquipment((v) => [
                        ...v,
                        {
                          description: "",
                          quantity: "",
                          notes: "",
                          providedBy: "client",
                        },
                      ])
                    }
                    className="text-xs text-tech-green"
                  >
                    + Add item
                  </button>
                </div>
                {equipment.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[150px_1fr_80px_32px]"
                  >
                    <select
                      value={item.providedBy}
                      onChange={(e) =>
                        setEquipment((v) =>
                          v.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  providedBy: e.target.value as
                                    | "client"
                                    | "techsavvy",
                                }
                              : x,
                          ),
                        )
                      }
                      aria-label={`Provider for equipment item ${index + 1}`}
                      className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="client">Client provided</option>
                      <option value="techsavvy">TechSavvy provided</option>
                    </select>
                    <input
                      value={item.description}
                      onChange={(e) =>
                        setEquipment((v) =>
                          v.map((x, i) =>
                            i === index
                              ? { ...x, description: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Description"
                      className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                    <input
                      value={item.quantity}
                      onChange={(e) =>
                        setEquipment((v) =>
                          v.map((x, i) =>
                            i === index
                              ? { ...x, quantity: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Qty"
                      className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                    {equipment.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEquipment((v) => v.filter((_, i) => i !== index))
                        }
                        aria-label={`Remove equipment item ${index + 1}`}
                        className="text-red-400"
                      >
                        ×
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className="glass-card p-6 md:p-8">
              <div className="mb-5 space-y-2">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-tech-green">
                      Required deliverables
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      List each report, photo set, test result, or signed form
                      expected at completion.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeliverables((items) => [...items, ""])}
                    className="shrink-0 text-xs text-tech-green"
                  >
                    + Add deliverable
                  </button>
                </div>
                {deliverables.map((deliverable, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={deliverable}
                      onChange={(event) =>
                        setDeliverables((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item,
                          ),
                        )
                      }
                      placeholder={`Deliverable ${index + 1}`}
                      className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                    {deliverables.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeliverables((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        aria-label={`Remove deliverable ${index + 1}`}
                        className="text-red-400"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["accessInstructions", "Access / check-in instructions"],
                  ["safetyRequirements", "Safety requirements"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className={`text-xs font-semibold text-slate-300 ${key === "safetyRequirements" ? "md:col-span-2" : ""}`}
                  >
                    {label}
                    <textarea
                      rows={3}
                      value={String(form[key as keyof BookingForm])}
                      onChange={field(key as keyof BookingForm)}
                      className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-3 text-white"
                    />
                  </label>
                ))}
              </div>
              <label className="mt-5 block rounded border border-dashed border-white/15 p-4 text-xs text-slate-300">
                <span className="mb-2 flex items-center gap-2 font-bold">
                  <FileUp className="h-4 w-4 text-tech-green" /> SOW and site
                  files
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,image/jpeg,image/png"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="w-full text-xs"
                />
                <span className="mt-2 block text-slate-500">
                  Add as many PDF, JPG, PNG, or text files as needed. Each file
                  can be up to 50 MB and uploads directly to secure storage.
                </span>
              </label>
              <div className="mt-5 space-y-3">
                <label className="flex gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.directContactRequested}
                    onChange={(e) =>
                      setForm((v) => ({
                        ...v,
                        directContactRequested: e.target.checked,
                      }))
                    }
                    className="accent-green-500"
                  />
                  This job requires direct coordination with the assigned
                  technician. TechSavvy approval is required.
                </label>
                <label className="flex gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.smsConsent}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, smsConsent: e.target.checked }))
                    }
                    className="accent-green-500"
                  />
                  <span>
                    By checking this box, I agree to receive recurring
                    transactional SMS from TechSavvy LLC about this service
                    request, including scheduling, technician arrival, progress,
                    and completion updates. Message frequency varies. Message
                    and data rates may apply. Reply STOP to opt out or HELP for
                    help. Consent is not a condition of purchase. View our{" "}
                    <Link
                      to="/terms"
                      className="text-tech-green hover:underline"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      className="text-tech-green hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                <input
                  aria-hidden="true"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={field("website")}
                  className="hidden"
                />
              </div>
            </section>
            {state === "error" && (
              <div className="flex gap-3 rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                {result.error}
              </div>
            )}
            {state === "sending" && (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-tech-green"
              >
                {uploadProgress}
              </p>
            )}
            <button
              disabled={state === "sending"}
              className="flex w-full items-center justify-center gap-3 bg-safety-orange px-6 py-5 font-bold uppercase tracking-wider text-brand-black disabled:opacity-60"
            >
              <Send className="h-5 w-5" />
              {state === "sending"
                ? "Submitting request…"
                : "Submit job request"}
            </button>
          </main>
        </form>
      </div>
    </div>
  );
}
