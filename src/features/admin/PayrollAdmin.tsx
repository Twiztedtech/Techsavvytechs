import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { auth } from "../../lib/firebase";
import { CrmBadge, CrmButton, CrmCard, CrmInput, CrmKpiTile, CrmModalShell, CrmPageHeader, CrmTable, CrmTableHead } from "../crm/ui";
import { PAYMENT_METHODS, entriesInPeriod, entryPay, shiftWeek, summarizePayroll, weekRange } from "../../../api/_lib/payroll.js";

type Entry = Record<string, any> & { id: string };
type PayrollRun = Record<string, any> & { id: string };
type Job = { id: string; name?: string; workOrderNumber?: string };

const currency = (value: number) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const prettyDate = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

async function timeClockApi(body: Record<string, any>) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch("/api/portal/time-clock", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

// Payroll for 1099 technicians. Totals approved timecards for a week (or one
// job), sends any that are missing to QuickBooks, and records the week as paid
// once you have paid it in QuickBooks or your bank. No money moves from here.
export function PayrollAdmin({ contractors, jobs }: { contractors: Record<string, any>[]; jobs: Job[] }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"week" | "job">("week");
  const [week, setWeek] = useState(() => shiftWeek(weekRange(todayLocal()).from, -1));
  const [jobId, setJobId] = useState("");
  const [syncing, setSyncing] = useState<{ done: number; total: number } | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [showPay, setShowPay] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/portal/time-clock", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load timecards.");
      setEntries(data.entries || []);
      const runData = await timeClockApi({ action: "list_payroll_runs" });
      setRuns(runData.runs || []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const nameFor = (entry: Entry) => {
    const contractor = contractors.find((item) => item.authUid === entry.technicianUid);
    return contractor?.name || entry.technicianName || entry.technicianEmail || "Unknown technician";
  };

  // The app-store reviewer login and demo jobs are not real work, so they
  // never appear in payroll.
  const payableEntries = useMemo(() => {
    const testUids = new Set(contractors.filter((item) => item.isTestAccount === true).map((item) => item.authUid));
    const demoJobs = new Set(jobs.filter((job: any) => job.isDemo === true).map((job) => job.id));
    return entries.filter((entry) => !testUids.has(entry.technicianUid) && !demoJobs.has(entry.jobId));
  }, [entries, contractors, jobs]);

  // Jobs that have timecards, newest work first, for the "By job" picker.
  const jobOptions = useMemo(() => {
    const latest = new Map<string, string>();
    for (const entry of payableEntries) {
      if (!entry.jobId || entry.status === "voided") continue;
      if (String(entry.date || "") > (latest.get(entry.jobId) || "")) latest.set(entry.jobId, String(entry.date || ""));
    }
    return [...latest.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([id]) => {
        const job = jobs.find((item) => item.id === id);
        const sample = payableEntries.find((entry) => entry.jobId === id);
        return { id, label: [job?.workOrderNumber, job?.name || sample?.jobSite].filter(Boolean).join(" · ") || id };
      });
  }, [payableEntries, jobs]);

  const periodEntries = useMemo(() => {
    if (mode === "job") return jobId ? payableEntries.filter((entry) => entry.jobId === jobId) : [];
    return entriesInPeriod(payableEntries, week);
  }, [payableEntries, mode, week, jobId]);

  const range = useMemo(() => {
    if (mode === "week") return week;
    const dates = periodEntries.filter((entry) => entry.status !== "voided").map((entry) => String(entry.date || "")).filter(Boolean).sort();
    return { from: dates[0] || "", to: dates[dates.length - 1] || "" };
  }, [mode, week, periodEntries]);

  const summary = useMemo(() => summarizePayroll(periodEntries, nameFor), [periodEntries, contractors]);
  const { totals } = summary;
  const readyIds = summary.technicians.flatMap((person: any) => person.entryIds.ready);
  const notInQboIds = summary.technicians.flatMap((person: any) => person.entryIds.not_in_qbo);
  const readySet = new Set(readyIds);
  const readyTotal = periodEntries.filter((entry) => readySet.has(entry.id)).reduce((sum, entry) => sum + entryPay(entry).total, 0);

  // Sends timecards to QuickBooks one at a time and stops at the first error,
  // so a problem (an expired connection, a missing vendor) can't repeat across
  // the whole week or leave duplicates behind.
  const sendToQuickBooks = async () => {
    if (!notInQboIds.length) return;
    if (!window.confirm(`Send ${notInQboIds.length} timecard${notInQboIds.length === 1 ? "" : "s"} to QuickBooks?\n\nOnly do this if these hours were not already entered in QuickBooks by hand, or they will be counted twice.`)) return;
    setSyncMessage("");
    setSyncing({ done: 0, total: notInQboIds.length });
    let done = 0;
    try {
      for (const id of notInQboIds) {
        await timeClockApi({ action: "retry_qbo_sync", timecardId: id });
        done += 1;
        setSyncing({ done, total: notInQboIds.length });
      }
      setSyncMessage(`Sent ${done} timecard${done === 1 ? "" : "s"} to QuickBooks.`);
    } catch (error) {
      setSyncMessage(`Stopped after ${done} of ${notInQboIds.length}: ${error instanceof Error ? error.message : "QuickBooks sync failed."}`);
    } finally {
      setSyncing(null);
      await load();
    }
  };

  const undoRun = async (run: PayrollRun) => {
    if (!window.confirm(`Undo the payroll record for ${prettyDate(run.from)} to ${prettyDate(run.to)}?\n\nThis only clears the "paid" mark in the CRM. It does not change QuickBooks or reverse any payment, and it does not unsend notices.`)) return;
    try {
      await timeClockApi({ action: "undo_payroll_run", runId: run.id });
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not undo the payroll run.");
    }
  };

  return (
    <div className="space-y-5">
      <CrmPageHeader
        eyebrow="Team"
        title="Payroll"
        action={
          <CrmButton variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </CrmButton>
        }
      />

      <CrmCard className="space-y-4">
        <p className="text-xs text-crm-muted">
          Totals come from approved timecards. Pay your technicians in QuickBooks or your bank, then mark the period paid here so the CRM matches. Nothing on this page moves money.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-crm-hairline p-0.5 text-sm">
            {(["week", "job"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-md px-3 py-1.5 font-medium ${mode === value ? "bg-crm-primary text-crm-on-primary" : "text-crm-body hover:bg-crm-surface-soft"}`}
              >
                {value === "week" ? "By week" : "By job"}
              </button>
            ))}
          </div>
          {mode === "week" ? (
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous week" onClick={() => setWeek(shiftWeek(week.from, -1))} className="grid h-9 w-9 place-items-center rounded-lg border border-crm-hairline text-crm-ink hover:bg-crm-surface-soft">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[13rem] text-center text-sm font-semibold text-crm-ink">
                {prettyDate(week.from)} – {prettyDate(week.to)}
              </span>
              <button type="button" aria-label="Next week" onClick={() => setWeek(shiftWeek(week.from, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-crm-hairline text-crm-ink hover:bg-crm-surface-soft">
                <ChevronRight className="h-4 w-4" />
              </button>
              <CrmInput type="date" aria-label="Jump to week" className="w-auto" value={week.from} onChange={(event: any) => event.target.value && setWeek(weekRange(event.target.value))} />
            </div>
          ) : (
            <select
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              className="h-10 min-w-[16rem] rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-sm text-crm-ink"
            >
              <option value="">Choose a job…</option>
              {jobOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          )}
        </div>
      </CrmCard>

      {loadError && <p className="rounded border border-crm-error/30 bg-crm-error-soft-bg p-3 text-xs text-crm-error-soft-text">{loadError}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CrmKpiTile label="Total owed" value={currency(totals.total)} detail={`${totals.hours} hours · ${summary.technicians.length} technician${summary.technicians.length === 1 ? "" : "s"}`} />
        <CrmKpiTile label="Ready to pay" value={totals.ready} tone="accent" detail="In QuickBooks, not yet marked paid" />
        <CrmKpiTile label="Not in QuickBooks" value={totals.not_in_qbo} tone={totals.not_in_qbo ? "warning" : "neutral"} detail="Approved, needs sending" />
        <CrmKpiTile label="Paid" value={totals.paid} tone={totals.paid ? "success" : "neutral"} detail={totals.needs_review ? `${totals.needs_review} still need review` : "Timecards marked paid"} />
      </div>

      {totals.needs_review > 0 && (
        <p className="rounded border border-crm-warning/30 bg-crm-warning-soft-bg p-3 text-xs text-crm-warning-soft-text">
          {totals.needs_review} timecard{totals.needs_review === 1 ? "" : "s"} in this period {totals.needs_review === 1 ? "is" : "are"} not fully approved. Approve or reject {totals.needs_review === 1 ? "it" : "them"} in Timecard Approval before paying. {totals.needs_review === 1 ? "It is" : "They are"} included in the total above.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <CrmButton variant="secondary" onClick={sendToQuickBooks} disabled={!notInQboIds.length || Boolean(syncing)}>
          {syncing ? `Sending ${syncing.done} of ${syncing.total}…` : `Send ${notInQboIds.length} to QuickBooks`}
        </CrmButton>
        <CrmButton onClick={() => setShowPay(true)} disabled={!readyIds.length || Boolean(syncing)}>
          Mark {readyIds.length} paid{readyIds.length ? ` (${currency(readyTotal)})` : ""}
        </CrmButton>
        {syncMessage && <p className="text-xs text-crm-muted">{syncMessage}</p>}
      </div>

      <CrmTable>
        <CrmTableHead>
          <th className="px-4 py-3">Technician</th>
          <th className="px-4 py-3 text-right">Days</th>
          <th className="px-4 py-3 text-right">Hours</th>
          <th className="px-4 py-3 text-right">Rate</th>
          <th className="px-4 py-3 text-right">Labor</th>
          <th className="px-4 py-3 text-right">Bonus</th>
          <th className="px-4 py-3 text-right">Supplies &amp; travel</th>
          <th className="px-4 py-3 text-right">Total</th>
          <th className="px-4 py-3">Status</th>
        </CrmTableHead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-crm-muted">Loading timecards…</td></tr>
          ) : !summary.technicians.length ? (
            <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-crm-muted">{mode === "job" && !jobId ? "Choose a job to see its payroll." : "No timecards in this period."}</td></tr>
          ) : (
            summary.technicians.map((person: any) => (
              <tr key={person.technicianUid || person.name} className="border-b border-crm-hairline-soft last:border-0">
                <td className="px-4 py-3 font-medium text-crm-ink">{person.name}</td>
                <td className="px-4 py-3 text-right">{person.days}</td>
                <td className="px-4 py-3 text-right">{person.hours.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{person.rates.map((rate: number) => `$${rate}`).join(" / ") || "—"}</td>
                <td className="px-4 py-3 text-right">{currency(person.labor)}</td>
                <td className="px-4 py-3 text-right">{person.bonus ? currency(person.bonus) : "—"}</td>
                <td className="px-4 py-3 text-right">{person.supplies + person.travel ? currency(person.supplies + person.travel) : "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-crm-ink">{currency(person.total)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {person.counts.paid > 0 && <CrmBadge tone="success">{person.counts.paid} paid</CrmBadge>}
                    {person.counts.ready > 0 && <CrmBadge tone="accent">{person.counts.ready} ready</CrmBadge>}
                    {person.counts.not_in_qbo > 0 && <CrmBadge tone="warning">{person.counts.not_in_qbo} not in QuickBooks</CrmBadge>}
                    {person.counts.needs_review > 0 && <CrmBadge tone="error">{person.counts.needs_review} needs review</CrmBadge>}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {summary.technicians.length > 0 && !loading && (
          <tfoot className="border-t border-crm-hairline bg-crm-surface-soft text-sm font-semibold text-crm-ink">
            <tr>
              <td className="px-4 py-3">Total</td>
              <td />
              <td className="px-4 py-3 text-right">{totals.hours.toFixed(2)}</td>
              <td />
              <td className="px-4 py-3 text-right">{currency(totals.labor)}</td>
              <td className="px-4 py-3 text-right">{totals.bonus ? currency(totals.bonus) : "—"}</td>
              <td className="px-4 py-3 text-right">{totals.supplies + totals.travel ? currency(totals.supplies + totals.travel) : "—"}</td>
              <td className="px-4 py-3 text-right">{currency(totals.total)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </CrmTable>

      <CrmCard>
        <h3 className="text-sm font-semibold text-crm-ink">Recent payroll runs</h3>
        {!runs.length ? (
          <p className="mt-2 text-xs text-crm-muted">No payroll has been recorded here yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-crm-hairline-soft text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-medium text-crm-ink">
                    {prettyDate(run.from)} – {prettyDate(run.to)} · {currency(run.total)}
                    {run.status === "undone" && <span className="ml-2"><CrmBadge>Undone</CrmBadge></span>}
                  </p>
                  <p className="text-xs text-crm-muted">
                    Paid {prettyDate(run.paidDate)} by {run.method}{run.reference ? ` (ref ${run.reference})` : ""} · {(run.entryIds || []).length} timecards · {(run.technicians || []).length} technicians
                    {run.notify ? ` · notices: ${(run.notices || []).filter((notice: any) => notice.email || notice.sms).length} of ${(run.technicians || []).length} sent` : ""}
                  </p>
                </div>
                {run.status !== "undone" && (
                  <CrmButton variant="text" className="h-8 px-2 text-xs" onClick={() => undoRun(run)}>Undo</CrmButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </CrmCard>

      {showPay && (
        <MarkPaidModal
          ids={readyIds}
          total={readyTotal}
          range={range}
          technicians={summary.technicians.filter((person: any) => person.counts.ready > 0).map((person: any) => person.name)}
          onClose={() => setShowPay(false)}
          onDone={async () => {
            setShowPay(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function MarkPaidModal({ ids, total, range, technicians, onClose, onDone }: { ids: string[]; total: number; range: { from: string; to: string }; technicians: string[]; onClose: () => void; onDone: () => void }) {
  const [paidDate, setPaidDate] = useState(todayLocal());
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ notices: any[] } | null>(null);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await timeClockApi({ action: "mark_paid", timecardIds: ids, paidDate, method, reference, notify, from: range.from, to: range.to });
      setResult({ notices: data.notices || [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record the payment.");
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <CrmModalShell title="Payroll recorded" onClose={onDone}>
        <p className="text-sm text-crm-body">{ids.length} timecards marked paid ({currency(total)}).</p>
        {notify && (
          <ul className="mt-3 space-y-1 text-xs text-crm-muted">
            {result.notices.map((notice) => (
              <li key={notice.name}>
                {notice.name}: {[notice.email && "email", notice.sms && "text"].filter(Boolean).join(" and ") || "no notice sent"}{notice.note ? ` (${notice.note})` : ""}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end">
          <CrmButton onClick={onDone}>Done</CrmButton>
        </div>
      </CrmModalShell>
    );
  }

  return (
    <CrmModalShell title="Mark payroll paid" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-crm-body">
          Record that you paid <strong>{currency(total)}</strong> for {range.from === range.to ? prettyDate(range.from) : `${prettyDate(range.from)} – ${prettyDate(range.to)}`} to {technicians.join(", ")}. Do this after the money has been sent in QuickBooks or your bank.
        </p>
        <label className="block">
          <span className="text-xs font-semibold text-crm-muted">Date paid</span>
          <CrmInput type="date" value={paidDate} onChange={(event: any) => setPaidDate(event.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-crm-muted">How it was paid</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)} className="h-10 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-sm text-crm-ink">
            {PAYMENT_METHODS.map((option: string) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-crm-muted">Reference (optional)</span>
          <CrmInput value={reference} maxLength={120} placeholder="QuickBooks payment or batch number" onChange={(event: any) => setReference(event.target.value)} />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
          <span className="text-crm-body">
            Tell each technician they've been paid (email, plus a text if they've opted in). Each one sees only their own amount.
          </span>
        </label>
        {error && <p className="rounded border border-crm-error/30 bg-crm-error-soft-bg p-3 text-xs text-crm-error-soft-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <CrmButton variant="secondary" onClick={onClose} disabled={saving}>Cancel</CrmButton>
          <CrmButton onClick={save} disabled={saving || !paidDate}>{saving ? "Saving…" : `Mark ${ids.length} paid`}</CrmButton>
        </div>
      </div>
    </CrmModalShell>
  );
}
