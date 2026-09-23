import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from "lucide-react";
import { auth } from "../../lib/firebase";

async function api(path: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The bulk import request failed.");
  return data;
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

type PreviewJob = {
  jobCode: string;
  siteName: string;
  address: string;
  scopeSummary: string;
  equipment: unknown[];
  packages: unknown[];
  requestedWindows: { date: string; start: string; end: string }[];
  valid: boolean;
  errors: string[];
};

type PreviewResult = { jobs: PreviewJob[]; validCount: number; invalidCount: number };
type SubmitResult = {
  created: { jobCode: string; requestId: string; requestNumber: string }[];
  skipped: { jobCode: string; errors: string[] }[];
};

export function BulkJobImport() {
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null);
    setFileBase64("");
    setPreview(null);
    setResult(null);
    setError("");
  };

  const runPreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError("");
    setResult(null);
    try {
      const base64 = await readFileBase64(file);
      setFileBase64(base64);
      const data = await api("/api/client?action=bulk-import-preview", {
        method: "POST",
        body: JSON.stringify({ fileBase64: base64 }),
      });
      setPreview(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not preview this file.");
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    if (!fileBase64) return;
    setSubmitting(true);
    setError("");
    try {
      const data = await api("/api/client?action=bulk-import-submit", {
        method: "POST",
        body: JSON.stringify({ fileBase64 }),
      });
      setResult(data);
      setPreview(null);
      setFile(null);
      setFileBase64("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit these job requests.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="glass-card border-t-4 border-tech-green p-6 md:p-8">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-tech-green" />
          <div>
            <h2 className="text-xl font-bold text-white">Bulk job import</h2>
            <p className="mt-1 text-sm text-slate-400">
              Submit multiple job requests at once from a spreadsheet instead of the form --
              from a single job up to 200 in one file.
            </p>
          </div>
        </div>
        <a
          href="/templates/techsavvy-job-import-template.xlsx"
          download
          className="mt-5 inline-flex items-center gap-2 rounded border border-tech-green px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-tech-green hover:bg-tech-green hover:text-brand-black"
        >
          <Download className="h-4 w-4" /> Download template
        </a>
        <p className="mt-3 text-xs text-slate-500">
          Fill in the "Jobs" tab (one row per job); use the "Equipment" and "Packages" tabs
          for anything with a lot of line items, linking rows back to a job by its Job Code.
        </p>
        <label className="mt-6 block rounded border border-dashed border-white/15 p-4 text-xs text-slate-300">
          <span className="mb-2 flex items-center gap-2 font-bold">
            <Upload className="h-4 w-4 text-tech-green" /> Completed template
          </span>
          <input
            type="file"
            accept=".xlsx"
            onChange={onFileChange}
            className="w-full text-xs"
          />
        </label>
        {error && (
          <div className="mt-4 flex gap-3 rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}
        <button
          type="button"
          disabled={!file || previewing}
          onClick={() => void runPreview()}
          className="mt-5 w-full bg-safety-orange px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-brand-black disabled:opacity-60"
        >
          {previewing ? "Reading file…" : "Preview jobs"}
        </button>
      </div>

      {preview && (
        <div className="glass-card p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-white">
              {preview.jobs.length} job{preview.jobs.length === 1 ? "" : "s"} found
            </h3>
            <p className="text-xs text-slate-400">
              <span className="text-tech-green">{preview.validCount} ready</span>
              {preview.invalidCount > 0 && (
                <span className="text-red-300"> · {preview.invalidCount} need fixes</span>
              )}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {preview.jobs.map((job) => (
              <div
                key={job.jobCode}
                className={`rounded border p-4 ${job.valid ? "border-white/10 bg-white/5" : "border-red-500/30 bg-red-500/10"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {job.jobCode} · {job.siteName || "(no site name)"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{job.address}</p>
                  </div>
                  {job.valid ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-tech-green" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-red-400" />
                  )}
                </div>
                {job.scopeSummary && (
                  <p className="mt-2 text-xs text-slate-300">{job.scopeSummary}</p>
                )}
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
                  {job.requestedWindows[0]
                    ? `Preferred ${job.requestedWindows[0].date} ${job.requestedWindows[0].start}-${job.requestedWindows[0].end}`
                    : "No valid requested window"}
                  {job.equipment.length ? ` · ${job.equipment.length} equipment line(s)` : ""}
                  {job.packages.length ? ` · ${job.packages.length} package(s)` : ""}
                </p>
                {job.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-300">
                    {job.errors.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={preview.validCount === 0 || submitting}
            onClick={() => void submit()}
            className="mt-6 w-full bg-tech-green px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-brand-black disabled:opacity-60"
          >
            {submitting
              ? "Submitting…"
              : `Submit ${preview.validCount} job request${preview.validCount === 1 ? "" : "s"}`}
          </button>
          {preview.invalidCount > 0 && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Jobs that need fixes will be skipped -- fix them in the spreadsheet and preview
              again to include them.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="glass-card border-t-4 border-tech-green p-6 md:p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-tech-green" />
          <h3 className="text-lg font-bold text-white">
            {result.created.length} job request{result.created.length === 1 ? "" : "s"} submitted
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            TechSavvy will review your scope and requested windows before confirming
            appointments. A summary was emailed to you.
          </p>
          {result.created.length > 0 && (
            <ul className="mt-4 space-y-1 text-left text-xs text-slate-300">
              {result.created.map((job) => (
                <li key={job.requestId}>
                  {job.jobCode} → <span className="font-bold text-tech-green">{job.requestNumber}</span>
                </li>
              ))}
            </ul>
          )}
          {result.skipped.length > 0 && (
            <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-left text-xs text-red-200">
              <p className="mb-1 font-bold">{result.skipped.length} skipped:</p>
              <ul className="list-disc space-y-1 pl-4">
                {result.skipped.map((job) => (
                  <li key={job.jobCode}>
                    {job.jobCode}: {job.errors.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
