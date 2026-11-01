import { useState } from "react";
import { AlertTriangle, Bot, Copy, Loader2, RefreshCw } from "lucide-react";
import { auth } from "../../lib/firebase";
import { CrmButton } from "../crm/ui";

// Advice from the request triage assistant, shown on each open request. It only recommends:
// every button here fills in an existing form (convert, clarification) for the owner to review.

export type TriageFlag = { severity: "info" | "warning" | "problem"; text: string };
export type TriageRecord = {
  requestId: string;
  status: "pending" | "ready" | "failed" | "unavailable";
  error?: string;
  summary?: string;
  recommendation?: "create_job" | "ask_customer" | "decline" | "needs_review";
  customerMatch?: { customerId: string; name: string; confidence: string; reason: string };
  flags?: TriageFlag[];
  suggestedJob?: { name: string; date: string; start: string; end: string; technicianIds: string[]; payRate: number | null; billRate: number | null; estimatedHours: number | null };
  draftReply?: { subject: string; body: string };
  ownerNote?: string;
};
export type TriageSettings = { enabled: boolean; dailyCap: number };

export async function triageApi(action: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/portal/time-clock?portalOperation=triage&action=${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data.triage) throw new Error(data.error || "Triage request failed.");
  return data;
}

const RECOMMENDATION: Record<string, string> = {
  create_job: "Looks ready to convert",
  ask_customer: "Ask the customer first",
  decline: "Consider declining",
  needs_review: "Needs your review",
};
const FLAG_STYLE: Record<string, string> = {
  problem: "border-crm-error/30 bg-crm-error/10 text-crm-error",
  warning: "border-crm-warning/30 bg-crm-warning/10 text-crm-warning",
  info: "border-crm-hairline bg-crm-surface-soft text-crm-body",
};

export function TriageSwitch({ settings, onChange }: { settings: TriageSettings; onChange: (next: TriageSettings) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const data = await triageApi("settings", { enabled: !settings.enabled, dailyCap: settings.dailyCap });
      onChange(data.settings);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crm-hairline bg-crm-surface-soft px-4 py-3">
      <p className="flex items-center gap-2 text-xs text-crm-body">
        <Bot className="h-4 w-4 text-crm-muted" />
        <span><span className="font-bold text-crm-ink">Triage assistant</span> reads new requests and drafts a recommendation. It never creates jobs or sends messages. Limit {settings.dailyCap} a day.</span>
      </p>
      <CrmButton variant={settings.enabled ? "secondary" : "primary"} disabled={busy} onClick={toggle}>
        {busy ? "Saving..." : settings.enabled ? "Turn off" : "Turn on"}
      </CrmButton>
    </div>
  );
}

export function TriagePanel({
  triage,
  running,
  onRun,
  onUseTechnician,
  onUseClarification,
  technicianName,
}: {
  triage?: TriageRecord;
  running: boolean;
  onRun: (note?: string) => void;
  onUseTechnician: (technicianId: string) => void;
  onUseClarification: (body: string) => void;
  technicianName: (id: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (running || triage?.status === "pending") {
    return <p className="mt-4 flex items-center gap-2 text-xs text-crm-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Triage assistant is reading this request...</p>;
  }
  if (!triage || triage.status === "unavailable") {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-crm-muted">
        <span>{triage?.error || "No triage yet."}</span>
        <button onClick={() => onRun()} className="rounded border border-crm-hairline px-3 py-1.5 font-bold text-crm-body">Run triage</button>
      </div>
    );
  }
  if (triage.status === "failed") {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-crm-error">
        <span>Triage could not run: {triage.error}</span>
        <button onClick={() => onRun()} className="rounded border border-crm-hairline px-3 py-1.5 font-bold text-crm-body">Try again</button>
      </div>
    );
  }
  const job = triage.suggestedJob;
  const techIds = job?.technicianIds || [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${triage.draftReply?.subject || ""}\n\n${triage.draftReply?.body || ""}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the text is still on screen */ }
  };
  return (
    <section aria-label="Triage assistant" className="mt-4 space-y-3 rounded-lg border border-crm-hairline bg-crm-surface-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-crm-muted"><Bot className="h-3.5 w-3.5" /> Triage assistant · {RECOMMENDATION[triage.recommendation || "needs_review"]}</p>
        <button onClick={() => onRun()} title="Run again" className="text-crm-muted hover:text-crm-ink"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {triage.summary && <p className="text-sm text-crm-ink">{triage.summary}</p>}
      {(triage.flags?.length || 0) > 0 && (
        <ul className="space-y-1.5">
          {triage.flags!.map((flag, index) => (
            <li key={index} className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${FLAG_STYLE[flag.severity]}`}>
              {flag.severity !== "info" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{flag.text}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-xs text-crm-body md:grid-cols-2">
        {triage.customerMatch?.name && (
          <div><dt className="inline font-bold text-crm-ink">Customer: </dt><dd className="inline">{triage.customerMatch.name} ({triage.customerMatch.confidence} confidence)</dd></div>
        )}
        {job?.billRate != null && <div><dt className="inline font-bold text-crm-ink">Bill rate: </dt><dd className="inline">${job.billRate}/hr</dd></div>}
        {job?.date && <div><dt className="inline font-bold text-crm-ink">Suggested: </dt><dd className="inline">{job.date} {job.start}{job.end ? `–${job.end}` : ""}</dd></div>}
        {techIds.length > 0 && <div><dt className="inline font-bold text-crm-ink">Technician: </dt><dd className="inline">{techIds.map(technicianName).join(", ")}</dd></div>}
      </dl>
      {triage.draftReply?.body && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">Draft reply (not sent)</p>
          <pre className="mt-1 whitespace-pre-wrap rounded border border-crm-hairline bg-crm-canvas p-3 font-sans text-xs text-crm-body">{triage.draftReply.body}</pre>
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">Tell the assistant something it does not know</p>
        <textarea
          value={note ?? triage.ownerNote ?? ""}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. The package already arrived at the office on Oct 29."
          className="mt-1 w-full rounded border border-crm-hairline bg-crm-canvas p-2 text-xs text-crm-ink"
        />
        <button
          disabled={note === null || note === (triage.ownerNote ?? "")}
          onClick={() => { onRun(note ?? ""); setNote(null); }}
          className="mt-1 rounded border border-crm-hairline px-3 py-2 text-[10px] font-bold text-crm-body disabled:opacity-40"
        >
          Save note and re-check
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {techIds[0] && <button onClick={() => onUseTechnician(techIds[0])} className="rounded border border-crm-hairline px-3 py-2 text-[10px] font-bold text-crm-body">Use suggested technician in convert form</button>}
        {triage.draftReply?.body && <button onClick={() => onUseClarification(triage.draftReply!.body)} className="rounded border border-crm-hairline px-3 py-2 text-[10px] font-bold text-crm-body">Use reply as clarification message</button>}
        {triage.draftReply?.body && <button onClick={copy} className="flex items-center gap-1 rounded border border-crm-hairline px-3 py-2 text-[10px] font-bold text-crm-body"><Copy className="h-3 w-3" />{copied ? "Copied" : "Copy reply"}</button>}
      </div>
    </section>
  );
}
