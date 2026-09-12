import { useEffect, useMemo, useState } from "react";
import { auth } from "../../lib/firebase";
import { getEntryTotals } from "../contractor/timesheets/calculations";

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
  const totalOwed = filtered
    .filter((tc) => tc.status !== "voided" && tc.qbStatus !== "synced")
    .reduce((sum, tc) => sum + getEntryTotals(tc).totalGross, 0);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div>
          <label htmlFor="crm-admin-technician-filter" className="block text-xs font-bold text-slate-200">Technician</label>
          <p className="mt-0.5 text-[10px] text-slate-500">Choose one technician or view everyone.</p>
        </div>
        <select
          id="crm-admin-technician-filter"
          value={technicianFilter}
          onChange={(event) => setTechnicianFilter(event.target.value)}
          className="min-w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="ALL">All technicians ({entries.length} tasks)</option>
          {technicianOptions.map((technician) => (
            <option key={technician.uid} value={technician.uid}>
              {technician.name} ({entries.filter((entry) => entry.technicianUid === technician.uid).length})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Pending Timecards</div>
          <div className="text-2xl font-bold mt-1 text-amber-500">{filtered.filter((tc) => tc.status !== "approved" && tc.status !== "voided").length}</div>
        </div>
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fully Approved</div>
          <div className="text-2xl font-bold mt-1 text-green-400">{filtered.filter((tc) => tc.status === "approved").length}</div>
        </div>
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">QBO Sync Queue</div>
          <div className="text-2xl font-bold mt-1 text-blue-400">{filtered.filter((tc) => tc.qbStatus === "synced").length}</div>
        </div>
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sync Failures</div>
          <div className="text-2xl font-bold mt-1 text-red-500">{filtered.filter((tc) => tc.qbStatus === "failed").length}</div>
        </div>
        <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Owed to Tech</div>
          <div className="text-2xl font-bold mt-1 text-emerald-400">${totalOwed.toFixed(2)}</div>
        </div>
      </div>

      <div className="space-y-4">
        {loading && <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center text-sm text-slate-500">Loading timecards…</div>}
        {!loading && filtered.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center text-sm text-slate-500">No timecards were found for this technician.</div>}
        {filtered.map((entry) => {
          const totals = getEntryTotals(entry);
          const techName = entry.technicianName || contractors.find((c) => c.authUid === entry.technicianUid)?.name || "Unknown Tech";
          const techEmail = entry.technicianEmail || contractors.find((c) => c.authUid === entry.technicianUid)?.email || "No Email";
          const lineItem = (label: string, itemType: string, amountField: string, statusField: string, feedbackField: string, formatted: string) => {
            if (!(entry[amountField] && Number(entry[amountField]) > 0)) return null;
            return (
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 space-y-2" key={label}>
                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-semibold text-slate-300">{label}:</span>
                    <span className="text-slate-400 ml-1 font-mono">{formatted}</span>
                  </div>
                  <div className="flex gap-1.5 ml-4">
                    {entry.status === "voided" ? (
                      <span className="text-[9px] font-bold uppercase text-slate-500">Read only</span>
                    ) : entry[statusField] !== "approved" && entry[statusField] !== "rejected" ? (
                      <>
                        <button onClick={() => setItemStatus(entry.id, itemType, "approved")} className="px-2 py-0.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold rounded transition cursor-pointer">✓ Approve</button>
                        <button onClick={() => setItemStatus(entry.id, itemType, "rejected")} className="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-[9px] font-bold rounded transition cursor-pointer">✕ Reject</button>
                      </>
                    ) : (
                      <span className={`text-[9px] font-bold uppercase ${entry[statusField] === "approved" ? "text-emerald-400" : "text-rose-400"}`}>{entry[statusField] === "approved" ? "✓ Approved" : "✕ Rejected"}</span>
                    )}
                  </div>
                </div>
                {entry[statusField] === "rejected" && entry[feedbackField] && <div className="text-[10px] text-rose-500 italic">Reason: "{entry[feedbackField]}"</div>}
              </div>
            );
          };
          return (
            <div key={entry.id} className={`p-6 border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 transition ${entry.status === "voided" ? "border-slate-700 bg-slate-950/60 opacity-75" : `border-slate-800 ${entry.status === "approved" ? "bg-slate-900/10" : "bg-slate-900/20"}`}`}>
              <div className="space-y-1.5 max-w-md">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-100">{techName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{entry.date}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase ${entry.status === "voided" ? "bg-slate-700/40 text-slate-300 border border-slate-600" : entry.status === "approved" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : entry.status === "rejected" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>{entry.status}</span>
                </div>
                <div className="text-sm font-semibold text-slate-200">{entry.jobSite}</div>
                <div className="text-[10px] text-slate-500 font-mono">{techEmail}</div>
                <div className="flex gap-2 items-center mt-1">
                  <span className="text-[10px] text-slate-500">QBO status:</span>
                  {entry.status === "voided" ? (
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-semibold rounded">Not eligible — voided</span>
                  ) : entry.qbStatus === "synced" ? (
                    <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-semibold rounded">QBO Synced #{entry.qboBillId || entry.qboTimeActivityId}</span>
                  ) : entry.qbStatus === "failed" ? (
                    <span className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-semibold rounded cursor-help" title={entry.qboSyncError}>QBO Sync Failed</span>
                      <button type="button" onClick={() => retrySync(entry.id)} className="px-2 py-0.5 bg-indigo-650 hover:bg-indigo-600 text-white text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition shadow">🔄 Retry Sync</button>
                    </span>
                  ) : entry.status === "approved" && isFullyApproved(entry) ? (
                    <span className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[9px] font-semibold rounded">Ready for QBO Sync</span>
                      <button type="button" onClick={() => retrySync(entry.id)} className="px-2 py-0.5 bg-indigo-650 hover:bg-indigo-600 text-white text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition shadow">Sync to QuickBooks</button>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-500 text-[9px] font-semibold rounded">Awaiting full approval</span>
                  )}
                </div>
              </div>

              <div className="flex-1 max-w-lg space-y-2">
                {lineItem("Labor", "labor", "totalHours", "laborStatus", "laborFeedback", `${entry.totalHours} hrs @ $${entry.rate || 75}/hr`)}
                {lineItem("Supplies", "supplies", "suppliesCost", "suppliesStatus", "suppliesFeedback", `$${Number(entry.suppliesCost || 0).toFixed(2)}`)}
                {lineItem("Travel", "travel", "travelCost", "travelStatus", "travelFeedback", `$${Number(entry.travelCost || 0).toFixed(2)}`)}
                {entry.bonusCost && Number(entry.bonusCost) > 0 ? (
                  lineItem("Bonus / Misc", "bonus", "bonusCost", "bonusStatus", "bonusFeedback", `$${Number(entry.bonusCost).toFixed(2)}`)
                ) : (
                  <div className="bg-slate-950/20 p-2.5 rounded-xl border border-slate-900 border-dashed flex items-center justify-between gap-3">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Bonus / Misc</span>
                    {entry.status === "voided" ? (
                      <span className="text-[9px] font-bold uppercase text-slate-600">Read only</span>
                    ) : (
                      <div className="flex gap-1.5 items-center">
                        <input type="number" placeholder="$0.00" id={`crm-bonus-input-${entry.id}`} className="w-16 bg-slate-900 border border-slate-800 text-slate-200 text-xs px-2 py-0.5 rounded focus:outline-none focus:border-slate-700 font-mono text-right" />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById(`crm-bonus-input-${entry.id}`) as HTMLInputElement;
                            addBonus(entry, input?.value || "0");
                          }}
                          className="px-2 py-0.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-400 text-[9px] font-bold rounded transition cursor-pointer"
                        >
                          ➕ Add
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="text-right min-w-[120px]">
                <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Total Payable</span>
                <span className="text-xl font-bold text-slate-100 font-mono">${totals.totalGross.toFixed(2)}</span>
                {entry.status !== "voided" && entry.qbStatus === "synced" && (
                  <button type="button" onClick={() => voidOrReverse(entry, "reverse")} className="mt-3 block w-full rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20">Reverse approval &amp; QuickBooks sync</button>
                )}
                {entry.status !== "voided" && entry.qbStatus !== "synced" && entry.qbStatus !== "reversed" && (
                  <button type="button" onClick={() => voidOrReverse(entry, "void")} className="mt-3 block w-full rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20">{entry.voidStatus === "requested" ? "Approve void request" : "Void submission"}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
