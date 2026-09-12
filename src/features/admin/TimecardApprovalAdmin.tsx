import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { auth } from "../../lib/firebase";
import { getEntryTotals } from "../contractor/timesheets/calculations";
import { CrmBadge, CrmCard } from "../crm/ui";

type Entry = Record<string, any> & { id: string };

// Mirrors the server's timeEntryFullyApproved() in api/portal/time-clock.js --
// entry.status can read "approved" once any single active line item is
// approved (see setItemStatus below), so it alone does not mean every line
// item has cleared review and is safe to sync to QuickBooks.
function isFullyApproved(entry: Entry): boolean {
  const checks: [boolean, string][] = [
    [Number(entry.totalHours || 0) > 0, entry.laborStatus],
    [Number(entry.suppliesCost || 0) > 0, entry.suppliesStatus],
    [Number(entry.travelCost || 0) > 0, entry.travelStatus],
    [Number(entry.bonusCost || 0) > 0, entry.bonusStatus],
  ];
  return checks.every(([active, status]) => !active || status === "approved");
}

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

export function TimecardApprovalAdmin({ contractors }: { contractors: Record<string, any>[] }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [showVoided, setShowVoided] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/portal/time-clock", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error("Could not load time entries.");
      setEntries(data.entries || []);
    } catch (error) {
      console.error("Could not load timecards:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const technicianOptions = useMemo(
    () =>
      Array.from(
        new Map<string, { uid: string; name: string }>(
          entries
            .filter((entry) => entry.technicianUid)
            .map((entry) => {
              const contractor = contractors.find((item) => item.authUid === entry.technicianUid);
              return [
                entry.technicianUid,
                { uid: entry.technicianUid, name: entry.technicianName || contractor?.name || entry.technicianEmail || contractor?.email || "Unknown technician" },
              ] as [string, { uid: string; name: string }];
            }),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [entries, contractors],
  );

  const filtered = technicianFilter === "ALL" ? entries : entries.filter((entry) => entry.technicianUid === technicianFilter);
  const nonVoided = filtered.filter((tc) => tc.status !== "voided");
  const voidedCount = filtered.length - nonVoided.length;
  const visibleEntries = showVoided ? filtered : nonVoided;
  const totalOwed = nonVoided.reduce((sum, tc) => sum + getEntryTotals(tc).totalGross, 0);

  // Per-job-site breakdown for whichever technician is currently selected --
  // "All technicians" would mix pay across people, so this only makes sense
  // (and only renders) once one tech is picked from the filter above.
  const siteBreakdown = useMemo(() => {
    if (technicianFilter === "ALL") return [];
    const bySite = new Map<string, { jobSite: string; days: number; totalGross: number }>();
    nonVoided.forEach((entry) => {
      const key = entry.jobSite || "Unspecified job site";
      const existing = bySite.get(key) || { jobSite: key, days: 0, totalGross: 0 };
      existing.days += 1;
      existing.totalGross += getEntryTotals(entry).totalGross;
      bySite.set(key, existing);
    });
    return Array.from(bySite.values()).sort((a, b) => b.totalGross - a.totalGross);
  }, [technicianFilter, nonVoided]);

  const setItemStatus = async (entryId: string, itemType: string, status: "approved" | "rejected") => {
    let feedback = "";
    if (status === "rejected") {
      const note = window.prompt("Reason for rejecting this item? An email request for revision will be sent to the contractor.");
      if (note === null) return;
      feedback = note.trim();
    }
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const updated: Entry = { ...entry, [`${itemType}Status`]: status, ...(feedback ? { [`${itemType}Feedback`]: feedback } : {}) };
        const isActive = (field: string) => updated[field] && Number(updated[field]) > 0;
        const laborActive = updated.totalHours && Number(updated.totalHours) > 0;
        const approved = (!laborActive || updated.laborStatus === "approved") &&
          (!isActive("suppliesCost") || updated.suppliesStatus === "approved") &&
          (!isActive("travelCost") || updated.travelStatus === "approved") &&
          (!isActive("bonusCost") || updated.bonusStatus === "approved");
        const rejected = (laborActive && updated.laborStatus === "rejected") ||
          (isActive("suppliesCost") && updated.suppliesStatus === "rejected") ||
          (isActive("travelCost") && updated.travelStatus === "rejected") ||
          (isActive("bonusCost") && updated.bonusStatus === "rejected");
        if (approved) {
          updated.status = "approved";
          updated.qbStatus = "pending";
        } else if (rejected) {
          updated.status = "rejected";
        } else if (["approved"].includes(updated.laborStatus) || ["approved"].includes(updated.suppliesStatus) || ["approved"].includes(updated.travelStatus) || ["approved"].includes(updated.bonusStatus)) {
          updated.status = "approved";
        }
        return updated;
      }),
    );
    try {
      await timeClockApi({ action: "approve_item", timecardId: entryId, itemType, status, ...(feedback ? { feedback } : {}) });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update status on server.");
    }
  };

  const retrySync = async (timecardId: string) => {
    setEntries((prev) => prev.map((entry) => (entry.id === timecardId ? { ...entry, qbStatus: "pending", qboSyncError: null } : entry)));
    try {
      const data = await timeClockApi({ action: "retry_qbo_sync", timecardId });
      if (data.entry) setEntries((prev) => prev.map((entry) => (entry.id === timecardId ? data.entry : entry)));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Sync failed.");
      load();
    }
  };

  const voidOrReverse = async (entry: Entry, mode: "void" | "reverse") => {
    const reason = window.prompt(mode === "reverse" ? "Reason for reversing this synced QuickBooks transaction?" : "Reason for voiding this record?");
    if (!reason?.trim()) return;
    try {
      const data = await timeClockApi({ action: mode === "reverse" ? "reverse_synced_timecard" : "void_timecard", timecardId: entry.id, reason: reason.trim() });
      if (data.entry) setEntries((prev) => prev.map((item) => (item.id === entry.id ? data.entry : item)));
      alert(mode === "reverse" ? "The incorrect QuickBooks transaction was reversed. The technician has been asked to acknowledge the correction." : "The record was voided and retained in history.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not complete the void request.");
    }
  };

  const correctRate = async (entry: Entry) => {
    const input = window.prompt(`New pay rate for this shift (currently $${entry.rate || 75}/hr):`, String(entry.rate || ""));
    if (input === null) return;
    const rate = Number(input);
    if (!(rate > 0)) {
      alert("Please enter a valid positive hourly rate.");
      return;
    }
    const reason = window.prompt("Reason for this rate correction?");
    if (!reason?.trim()) return;
    try {
      const data = await timeClockApi({ action: "correct_rate", timecardId: entry.id, rate, reason: reason.trim() });
      if (data.entry) setEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, ...data.entry } : item)));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not correct the rate.");
    }
  };

  const addBonus = async (entry: Entry, amountStr: string) => {
    const amount = Number(amountStr);
    if (!(amount > 0)) {
      alert("Please enter a valid positive bonus amount.");
      return;
    }
    try {
      await timeClockApi({ action: "add_bonus", timecardId: entry.id, amount });
      load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to add bonus.");
    }
  };

  return (
    <div className="space-y-4">
      <CrmCard className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <label htmlFor="crm-admin-technician-filter" className="block text-xs font-semibold text-crm-ink">Technician</label>
          <p className="mt-0.5 text-[11px] text-crm-muted">Choose one technician or view everyone.</p>
        </div>
        <select
          id="crm-admin-technician-filter"
          value={technicianFilter}
          onChange={(event) => setTechnicianFilter(event.target.value)}
          className="min-w-56 h-10 rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs font-semibold text-crm-ink focus:border-crm-ink focus:outline-none"
        >
          <option value="ALL">All technicians ({entries.length} tasks)</option>
          {technicianOptions.map((technician) => (
            <option key={technician.uid} value={technician.uid}>
              {technician.name} ({entries.filter((entry) => entry.technicianUid === technician.uid).length})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-crm-hairline px-3 py-2 text-xs font-semibold text-crm-body cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} className="accent-crm-primary" />
          Show voided ({voidedCount})
        </label>
      </CrmCard>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <CrmCard>
          <div className="text-[11px] text-crm-muted uppercase font-semibold tracking-wider">Pending Timecards</div>
          <div className="crm-display-md mt-1 text-crm-warning">{filtered.filter((tc) => tc.status !== "approved" && tc.status !== "voided").length}</div>
        </CrmCard>
        <CrmCard>
          <div className="text-[11px] text-crm-muted uppercase font-semibold tracking-wider">Fully Approved</div>
          <div className="crm-display-md mt-1 text-crm-success">{filtered.filter((tc) => tc.status === "approved").length}</div>
        </CrmCard>
        <CrmCard>
          <div className="text-[11px] text-crm-muted uppercase font-semibold tracking-wider">QBO Sync Queue</div>
          <div className="crm-display-md mt-1 text-crm-accent">{filtered.filter((tc) => tc.qbStatus === "synced").length}</div>
        </CrmCard>
        <CrmCard>
          <div className="text-[11px] text-crm-muted uppercase font-semibold tracking-wider">Sync Failures</div>
          <div className="crm-display-md mt-1 text-crm-error">{filtered.filter((tc) => tc.qbStatus === "failed").length}</div>
        </CrmCard>
        <CrmCard>
          <div className="text-[11px] text-crm-muted uppercase font-semibold tracking-wider">Total Owed to Tech</div>
          <div className="crm-display-md mt-1 text-crm-ink">${totalOwed.toFixed(2)}</div>
        </CrmCard>
      </div>

      {technicianFilter !== "ALL" && siteBreakdown.length > 0 && (
        <CrmCard className="mb-6">
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-crm-muted">Totals by job site — {technicianOptions.find((t) => t.uid === technicianFilter)?.name || "technician"}</div>
          <div className="divide-y divide-crm-hairline-soft">
            {siteBreakdown.map((site) => (
              <div key={site.jobSite} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-semibold text-crm-ink">{site.jobSite}</div>
                  <div className="text-[11px] text-crm-muted">{site.days} {site.days === 1 ? "day" : "days"}</div>
                </div>
                <div className="text-base font-bold text-crm-ink">${site.totalGross.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-crm-hairline pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-crm-body">Total owed — all jobs</div>
            <div className="text-lg font-bold text-crm-ink">${totalOwed.toFixed(2)}</div>
          </div>
        </CrmCard>
      )}

      <div className="space-y-4">
        {loading && <div className="rounded-xl border border-dashed border-crm-hairline p-8 text-center text-sm text-crm-muted">Loading timecards…</div>}
        {!loading && visibleEntries.length === 0 && <div className="rounded-xl border border-dashed border-crm-hairline p-8 text-center text-sm text-crm-muted">No timecards were found for this technician.</div>}
        {visibleEntries.map((entry) => {
          const totals = getEntryTotals(entry);
          const techName = entry.technicianName || contractors.find((c) => c.authUid === entry.technicianUid)?.name || "Unknown Tech";
          const techEmail = entry.technicianEmail || contractors.find((c) => c.authUid === entry.technicianUid)?.email || "No Email";
          const lineItem = (label: string, itemType: string, amountField: string, statusField: string, feedbackField: string, formatted: string) => {
            if (!(entry[amountField] && Number(entry[amountField]) > 0)) return null;
            return (
              <div className="bg-crm-surface-soft p-3 rounded-lg border border-crm-hairline space-y-2" key={label}>
                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-semibold text-crm-body">{label}:</span>
                    <span className="text-crm-muted ml-1 font-mono">{formatted}</span>
                  </div>
                  <div className="flex gap-1.5 ml-4">
                    {entry.status === "voided" ? (
                      <span className="text-[10px] font-bold uppercase text-crm-muted">Read only</span>
                    ) : entry[statusField] !== "approved" && entry[statusField] !== "rejected" ? (
                      <>
                        <button onClick={() => setItemStatus(entry.id, itemType, "approved")} className="px-2 py-0.5 bg-crm-success/10 hover:bg-crm-success/20 text-crm-success border border-crm-success/30 text-[10px] font-bold rounded transition cursor-pointer">Approve</button>
                        <button onClick={() => setItemStatus(entry.id, itemType, "rejected")} className="px-2 py-0.5 bg-crm-error/10 hover:bg-crm-error/20 text-crm-error border border-crm-error/30 text-[10px] font-bold rounded transition cursor-pointer">Reject</button>
                      </>
                    ) : (
                      <span className={`text-[10px] font-bold uppercase ${entry[statusField] === "approved" ? "text-crm-success" : "text-crm-error"}`}>{entry[statusField] === "approved" ? "Approved" : "Rejected"}</span>
                    )}
                  </div>
                </div>
                {entry[statusField] === "rejected" && entry[feedbackField] && <div className="text-[11px] text-crm-error italic">Reason: "{entry[feedbackField]}"</div>}
              </div>
            );
          };
          return (
            <CrmCard key={entry.id} className={`flex flex-col md:flex-row md:items-center justify-between gap-6 ${entry.status === "voided" ? "opacity-60" : ""}`}>
              <div className="space-y-1.5 max-w-md">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-crm-ink">{techName}</span>
                  <span className="text-[11px] text-crm-muted font-mono">{entry.date}</span>
                  <CrmBadge tone={entry.status === "voided" ? "neutral" : entry.status === "approved" ? "success" : entry.status === "rejected" ? "error" : "neutral"}>{entry.status}</CrmBadge>
                </div>
                <div className="text-sm font-semibold text-crm-ink">{entry.jobSite}</div>
                <div className="text-[11px] text-crm-muted font-mono">{techEmail}</div>
                <div className="flex gap-2 items-center mt-1">
                  <span className="text-[11px] text-crm-muted">QBO status:</span>
                  {entry.status === "voided" ? (
                    <span className="px-2 py-0.5 bg-crm-surface-card text-crm-muted text-[10px] font-semibold rounded">Not eligible — voided</span>
                  ) : entry.qbStatus === "synced" ? (
                    <span className="px-2 py-0.5 bg-crm-accent/10 text-crm-accent text-[10px] font-semibold rounded">QBO Synced #{entry.qboBillId || entry.qboTimeActivityId}</span>
                  ) : entry.qbStatus === "failed" ? (
                    <span className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-crm-error/10 text-crm-error text-[10px] font-semibold rounded cursor-help" title={entry.qboSyncError}>QBO Sync Failed</span>
                      <button type="button" onClick={() => retrySync(entry.id)} className="px-2 py-0.5 bg-crm-primary hover:bg-crm-primary-active text-crm-on-primary text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition"><RefreshCw className="h-3 w-3" /> Retry Sync</button>
                    </span>
                  ) : entry.status === "approved" && isFullyApproved(entry) ? (
                    <span className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-crm-accent/10 text-crm-accent text-[10px] font-semibold rounded">Ready for QBO Sync</span>
                      <button type="button" onClick={() => retrySync(entry.id)} className="px-2 py-0.5 bg-crm-primary hover:bg-crm-primary-active text-crm-on-primary text-[10px] font-bold rounded cursor-pointer transition">Sync to QuickBooks</button>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-crm-surface-card text-crm-muted text-[10px] font-semibold rounded">Awaiting full approval</span>
                  )}
                </div>
              </div>

              <div className="flex-1 max-w-lg space-y-2">
                {lineItem("Labor", "labor", "totalHours", "laborStatus", "laborFeedback", `${entry.totalHours} hrs @ $${entry.rate || 75}/hr`)}
                {Number(entry.totalHours || 0) > 0 && entry.status !== "voided" && !entry.active && (
                  entry.qbStatus === "synced" ? (
                    <div className="px-1 text-[10px] text-crm-muted">Rate locked — already synced to QuickBooks</div>
                  ) : (
                    <div className="px-1 flex items-center justify-between gap-2">
                      <button type="button" onClick={() => correctRate(entry)} className="text-[10px] font-bold uppercase text-crm-ink hover:underline underline-offset-2">Correct rate</button>
                      {entry.rateCorrection && (
                        <span className="text-[10px] text-crm-muted" title={entry.rateCorrection.reason}>was ${entry.rateCorrection.previousRate}/hr</span>
                      )}
                    </div>
                  )
                )}
                {lineItem("Supplies", "supplies", "suppliesCost", "suppliesStatus", "suppliesFeedback", `$${Number(entry.suppliesCost || 0).toFixed(2)}`)}
                {lineItem("Travel", "travel", "travelCost", "travelStatus", "travelFeedback", `$${Number(entry.travelCost || 0).toFixed(2)}`)}
                {entry.bonusCost && Number(entry.bonusCost) > 0 ? (
                  lineItem("Bonus / Misc", "bonus", "bonusCost", "bonusStatus", "bonusFeedback", `$${Number(entry.bonusCost).toFixed(2)}`)
                ) : (
                  <div className="bg-crm-surface-soft p-2.5 rounded-lg border border-dashed border-crm-hairline flex items-center justify-between gap-3">
                    <span className="text-[11px] text-crm-muted font-semibold uppercase tracking-wider">Bonus / Misc</span>
                    {entry.status === "voided" ? (
                      <span className="text-[10px] font-bold uppercase text-crm-muted">Read only</span>
                    ) : (
                      <div className="flex gap-1.5 items-center">
                        <input type="number" placeholder="$0.00" id={`crm-bonus-input-${entry.id}`} className="w-16 bg-crm-canvas border border-crm-hairline text-crm-ink text-xs px-2 py-0.5 rounded focus:outline-none focus:border-crm-ink font-mono text-right" />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById(`crm-bonus-input-${entry.id}`) as HTMLInputElement;
                            addBonus(entry, input?.value || "0");
                          }}
                          className="px-2 py-0.5 bg-crm-surface-card hover:bg-crm-hairline border border-crm-hairline text-crm-body text-[10px] font-bold rounded transition cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="text-right min-w-[120px]">
                <span className="text-[11px] text-crm-muted block uppercase font-bold tracking-wider">Total Payable</span>
                <span className="text-xl font-bold text-crm-ink font-mono">${totals.totalGross.toFixed(2)}</span>
                {entry.status !== "voided" && entry.qbStatus === "synced" && (
                  <button type="button" onClick={() => voidOrReverse(entry, "reverse")} className="mt-3 block w-full rounded-lg border border-crm-warning/40 bg-crm-warning/10 px-2 py-1.5 text-[11px] font-bold text-crm-warning hover:bg-crm-warning/20">Reverse approval &amp; QuickBooks sync</button>
                )}
                {entry.status !== "voided" && entry.qbStatus !== "synced" && entry.qbStatus !== "reversed" && (
                  <button type="button" onClick={() => voidOrReverse(entry, "void")} className="mt-3 block w-full rounded-lg border border-crm-error/30 bg-crm-error/10 px-2 py-1.5 text-[11px] font-bold text-crm-error hover:bg-crm-error/20">{entry.voidStatus === "requested" ? "Approve void request" : "Void submission"}</button>
                )}
              </div>
            </CrmCard>
          );
        })}
      </div>
    </div>
  );
}
