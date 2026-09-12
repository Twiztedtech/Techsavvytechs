import { useEffect, useState, type FormEvent } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { getEntryTotals } from "../contractor/timesheets/calculations";

type ContractorRecord = Record<string, any> & { id: string; name?: string; email?: string };

async function authedFetch(path: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

const contractorAccessStatus = (contractor: ContractorRecord) =>
  contractor.accessStatus || (contractor.active === false ? "Suspended" : "Active");

const getAssignedTechIds = (job: Record<string, any>): string[] => {
  if (Array.isArray(job.assignedTechIds) && job.assignedTechIds.length > 0) return job.assignedTechIds;
  return [job.assignedTechId || "ALL"];
};
const terminalJobStatuses = new Set(["complete", "completed", "closed", "cancelled", "canceled", "voided"]);

export function ContractorRosterAdmin({ contractors, jobs }: { contractors: ContractorRecord[]; jobs: Record<string, any>[] }) {
  const [qboConnected, setQboConnected] = useState(false);
  const [qboRealmId, setQboRealmId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRate, setNewRate] = useState("75");
  const [newSpecialty, setNewSpecialty] = useState("");
  const [newEmploymentType, setNewEmploymentType] = useState<"1099_contractor" | "w2_employee">("1099_contractor");
  const [isSaving, setIsSaving] = useState(false);

  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [checkingInvitationId, setCheckingInvitationId] = useState<string | null>(null);
  const [reviewingOnboardingId, setReviewingOnboardingId] = useState<string | null>(null);
  const [viewingTimecardsFor, setViewingTimecardsFor] = useState<ContractorRecord | null>(null);

  const [lifecycleTarget, setLifecycleTarget] = useState<ContractorRecord | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState<"Active" | "Suspended" | "Offboarded">("Active");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleReassignToId, setLifecycleReassignToId] = useState("");
  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await authedFetch("/api/admin/quickbooks/status");
        setQboConnected(data.connected === true);
        setQboRealmId(data.realmId || "");
      } catch {
        setQboConnected(false);
        setQboRealmId("");
      }
    })();
    (async () => {
      try {
        const data = await authedFetch("/api/portal/time-clock");
        setTimeEntries(data.entries || []);
      } catch {
        setTimeEntries([]);
      }
    })();
  }, []);

  const assignableContractors = contractors.filter((c) => contractorAccessStatus(c) === "Active");
  const openJobsForContractor = lifecycleTarget
    ? jobs.filter((job) => {
        const status = String(job.status || "").toLowerCase();
        return !terminalJobStatuses.has(status) && getAssignedTechIds(job).includes(lifecycleTarget.id);
      })
    : [];

  const handleAddContractor = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      alert("Please enter a contractor name and email.");
      return;
    }
    setIsSaving(true);
    try {
      await addDoc(collection(db, "contractors"), {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        rate: Number(newRate) || 75,
        specialty: newSpecialty.trim(),
        employmentType: newEmploymentType,
        status: "pending",
        accessStatus: "Pending",
        active: false,
        createdAt: serverTimestamp(),
        onboarding: { status: "not_started" },
      });
      setNewName("");
      setNewEmail("");
      setNewRate("75");
      setNewSpecialty("");
      setNewEmploymentType("1099_contractor");
      setIsAddOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not add this contractor.");
    } finally {
      setIsSaving(false);
    }
  };

  const openContractorW9 = async (contractor: ContractorRecord) => {
    try {
      const data = await authedFetch(`/api/admin/contractors/onboarding?contractorId=${encodeURIComponent(contractor.id)}`);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not open this W-9.");
    }
  };

  const reviewContractorOnboarding = async (contractor: ContractorRecord, status: "approved" | "needs_update") => {
    let reviewNote = "";
    if (status === "needs_update") {
      const note = window.prompt("What needs to be corrected on this W-9? This note will be shown to the contractor.");
      if (note === null) return;
      reviewNote = note;
    }
    setReviewingOnboardingId(contractor.id);
    try {
      await authedFetch("/api/admin/contractors/onboarding", {
        method: "POST",
        body: JSON.stringify({ contractorId: contractor.id, status, reviewNote }),
      });
      alert(status === "approved" ? "W-9 onboarding approved." : "The contractor has been asked to update their W-9.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save the onboarding review.");
    } finally {
      setReviewingOnboardingId(null);
    }
  };

  const openLifecycleDialog = (contractor: ContractorRecord, status: "Active" | "Suspended" | "Offboarded") => {
    setLifecycleTarget(contractor);
    setLifecycleStatus(status);
    setLifecycleReason("");
    setLifecycleReassignToId("");
  };

  const saveLifecycleStatus = async () => {
    if (!lifecycleTarget) return;
    setIsSavingLifecycle(true);
    try {
      const data = await authedFetch("/api/admin/contractors/invite?adminOperation=lifecycle", {
        method: "POST",
        body: JSON.stringify({
          contractorId: lifecycleTarget.id,
          status: lifecycleStatus,
          reason: lifecycleReason,
          reassignToId: lifecycleStatus === "Active" ? "" : lifecycleReassignToId,
        }),
      });
      alert(`${lifecycleTarget.name || "Technician"} is now ${lifecycleStatus.toLowerCase()}.${data.affectedJobCount ? ` ${data.affectedJobCount} open work order(s) were updated.` : ""}`);
      setLifecycleTarget(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update technician access.");
    } finally {
      setIsSavingLifecycle(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800 flex-wrap gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>🔗</span> QuickBooks Online Sync Engine
          </h3>
          <p className="text-xs text-slate-400">Sync and link QBO Vendors to your local contractor portal profiles.</p>
          <div className="pt-1.5 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${qboConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
            <span className="text-[11px] font-semibold text-slate-300">
              {qboConnected ? `Connected to Realm ID: ${qboRealmId}` : "Not Connected to QuickBooks"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setIsAddOpen(true)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer">
            ➕ Add Contractor
          </button>
          {qboConnected ? (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Are you sure you want to disconnect QuickBooks? This will remove the authentication tokens.")) return;
                try {
                  await authedFetch("/api/admin/quickbooks/status?operation=disconnect", { method: "POST" });
                  setQboConnected(false);
                  setQboRealmId("");
                  alert("QuickBooks disconnected successfully.");
                } catch (err) {
                  alert("Failed to disconnect: " + (err instanceof Error ? err.message : "Unknown error"));
                }
              }}
              className="px-3 py-1.5 bg-red-650/20 hover:bg-red-600 text-red-400 hover:text-white font-bold rounded-lg text-xs transition border border-red-500/20 cursor-pointer"
            >
              🔌 Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                try {
                  const data = await authedFetch("/api/auth/quickbooks", { method: "POST" });
                  window.location.assign(data.authorizationUrl);
                } catch (err) {
                  alert("QuickBooks connection failed: " + (err instanceof Error ? err.message : "Unknown error"));
                }
              }}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-lg shadow-green-600/20 cursor-pointer"
            >
              🔗 Connect to QuickBooks
            </button>
          )}
          <button
            type="button"
            disabled={isSyncing}
            onClick={async () => {
              setIsSyncing(true);
              try {
                const data = await authedFetch("/api/sync-vendors", { method: "POST" });
                alert(data.message || "Sync complete.");
              } catch (err) {
                alert("Sync failed: " + (err instanceof Error ? err.message : "Unknown error"));
              } finally {
                setIsSyncing(false);
              }
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isSyncing ? "🔄 Syncing QBO..." : "🔄 Run Sync Script"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
            <tr>
              <th className="p-3">Contractor Name</th>
              <th className="p-3">Email Address</th>
              <th className="p-3">Type</th>
              <th className="p-3">Default Rate</th>
              <th className="p-3">QBO Vendor ID</th>
              <th className="p-3 text-right">Status</th>
              <th className="p-3 text-right">W-9 Onboarding</th>
              <th className="p-3 text-right">Portal Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {contractors.map((cont) => (
              <tr key={cont.id} className="hover:bg-slate-950/40">
                <td className="p-3 font-semibold text-slate-100">{cont.name}</td>
                <td className="p-3 font-mono">{cont.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cont.employmentType === "w2_employee" ? "bg-violet-500/10 text-violet-300 border-violet-500/20" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                    {cont.employmentType === "w2_employee" ? "W-2 Employee" : "1099 Contractor"}
                  </span>
                </td>
                <td className="p-3 font-mono">${cont.rate || 75}/hr</td>
                <td className="p-3 font-mono text-amber-500 font-bold">{cont.qboVendorId ? `#${cont.qboVendorId}` : "Not Linked"}</td>
                <td className="p-3 text-right">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      contractorAccessStatus(cont) === "Active"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : contractorAccessStatus(cont) === "Suspended"
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          : contractorAccessStatus(cont) === "Pending"
                            ? "bg-sky-500/10 text-sky-300 border-sky-500/20"
                            : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                    }`}
                  >
                    {contractorAccessStatus(cont)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {(() => {
                    const onboardingStatus = cont.onboarding?.status || "not_started";
                    const isReviewing = reviewingOnboardingId === cont.id;
                    const hasW9 = Boolean(cont.onboarding?.w9?.storagePath);
                    const statusClass =
                      onboardingStatus === "approved"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : onboardingStatus === "submitted"
                          ? "bg-sky-500/10 text-sky-300 border-sky-500/20"
                          : onboardingStatus === "needs_update"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700";
                    return (
                      <div className="flex min-w-[190px] flex-col items-end gap-1.5">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${statusClass}`}>{onboardingStatus.replace("_", " ")}</span>
                        {hasW9 ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <button type="button" onClick={() => void openContractorW9(cont)} className="rounded border border-slate-600 px-2 py-1 text-[10px] font-bold text-slate-200 hover:border-slate-400">Open W-9</button>
                            {onboardingStatus !== "approved" ? <button type="button" disabled={isReviewing} onClick={() => void reviewContractorOnboarding(cont, "approved")} className="rounded border border-green-500/40 px-2 py-1 text-[10px] font-bold text-green-300 hover:bg-green-500 hover:text-slate-950 disabled:opacity-50">Approve</button> : null}
                            {onboardingStatus !== "needs_update" ? <button type="button" disabled={isReviewing} onClick={() => void reviewContractorOnboarding(cont, "needs_update")} className="rounded border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-50">Request update</button> : null}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500">No W-9 submitted</span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="p-3 text-right">
                  <div className="flex min-w-[165px] flex-col items-end gap-1.5 font-sans">
                    <button type="button" onClick={() => setViewingTimecardsFor(cont)} className="px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition cursor-pointer">
                      📅 View History
                    </button>
                    <button
                      type="button"
                      disabled={!cont.email || invitingId === cont.id || ["Suspended", "Offboarded"].includes(contractorAccessStatus(cont))}
                      onClick={async () => {
                        if (!confirm(`Send a branded TechSavvy portal invitation to ${cont.email}?`)) return;
                        setInvitingId(cont.id);
                        try {
                          const data = await authedFetch("/api/admin/contractors/invite", {
                            method: "POST",
                            body: JSON.stringify({ contractorId: cont.id }),
                          });
                          alert(`Branded portal invitation sent to ${data.email}.`);
                        } catch (error) {
                          alert(error instanceof Error ? error.message : "Could not send the contractor invitation.");
                        } finally {
                          setInvitingId(null);
                        }
                      }}
                      className="px-2.5 py-1 rounded border border-amber-500/30 text-[10px] font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {["Suspended", "Offboarded"].includes(contractorAccessStatus(cont))
                        ? "Activate Before Inviting"
                        : invitingId === cont.id
                          ? "Sending…"
                          : cont.invitationStatus === "sent"
                            ? "Resend Branded Invite"
                            : "Send Branded Invite"}
                    </button>
                    <div className="flex flex-wrap justify-end gap-1">
                      {contractorAccessStatus(cont) !== "Active" ? <button type="button" onClick={() => openLifecycleDialog(cont, "Active")} className="rounded border border-green-500/40 px-2 py-1 text-[10px] font-bold text-green-300 hover:bg-green-500 hover:text-slate-950">Activate</button> : null}
                      {contractorAccessStatus(cont) === "Active" ? <button type="button" onClick={() => openLifecycleDialog(cont, "Suspended")} className="rounded border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500 hover:text-slate-950">Suspend</button> : null}
                      {contractorAccessStatus(cont) !== "Offboarded" ? <button type="button" onClick={() => openLifecycleDialog(cont, "Offboarded")} className="rounded border border-rose-500/40 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-500 hover:text-white">Offboard</button> : null}
                    </div>
                    {cont.invitationDelivery?.emailId ? (
                      <button
                        type="button"
                        disabled={checkingInvitationId === cont.id}
                        onClick={async () => {
                          setCheckingInvitationId(cont.id);
                          try {
                            const data = await authedFetch(`/api/admin/contractors/invitation-status?contractorId=${encodeURIComponent(cont.id)}`);
                            alert(`Email provider status: ${String(data.status).replace("_", " ")}.`);
                          } catch (error) {
                            alert(error instanceof Error ? error.message : "Could not check invitation delivery.");
                          } finally {
                            setCheckingInvitationId(null);
                          }
                        }}
                        className="text-[10px] font-bold text-sky-300 underline underline-offset-2 hover:text-sky-200 disabled:opacity-50"
                      >
                        {checkingInvitationId === cont.id ? "Checking delivery…" : `Delivery: ${String(cont.invitationDelivery.status || "accepted").replace("_", " ")}`}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden backdrop-blur-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                <span>➕</span> Add New Tech to Contractors Pool
              </h3>
              <button type="button" onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 transition flex items-center justify-center">✕</button>
            </div>
            <form onSubmit={handleAddContractor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
                <input type="text" required placeholder="e.g. John Doe" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Email Address</label>
                <input type="email" required placeholder="e.g. john@tech5avvy.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Hourly Rate ($/hr)</label>
                  <input type="number" required min="1" placeholder="75" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Tech Specialty</label>
                  <input type="text" placeholder="e.g. Network, DevOps" value={newSpecialty} onChange={(e) => setNewSpecialty(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Employment Type</label>
                <select value={newEmploymentType} onChange={(e) => setNewEmploymentType(e.target.value as "1099_contractor" | "w2_employee")} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition">
                  <option value="1099_contractor">1099 Contractor (paid via QuickBooks Bills)</option>
                  <option value="w2_employee">W-2 Employee (payroll — never synced to QuickBooks Bills)</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsAddOpen(false)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-650 to-violet-650 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition shadow-lg shadow-indigo-600/20 cursor-pointer">
                  {isSaving ? "Saving..." : "Add Contractor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingTimecardsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden backdrop-blur-md">
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                  <span>📅</span> Timesheets: {viewingTimecardsFor.name}
                </h3>
                <p className="text-xs text-slate-400">Viewing work history and submitted times for this technician.</p>
              </div>
              <button type="button" onClick={() => setViewingTimecardsFor(null)} className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 transition flex items-center justify-center cursor-pointer">✕</button>
            </div>
            <div className="overflow-x-auto max-h-[400px] border border-slate-800 rounded-xl bg-slate-950/40">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Job Site</th>
                    <th className="p-3 font-mono">Hours</th>
                    <th className="p-3 font-mono">Rate</th>
                    <th className="p-3 font-mono">Supplies</th>
                    <th className="p-3 font-mono">Travel</th>
                    <th className="p-3 font-mono">Total</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {timeEntries.filter((entry) => entry.technicianUid === viewingTimecardsFor.authUid).map((entry) => {
                    const totals = getEntryTotals(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-950/60">
                        <td className="p-3 font-bold text-amber-400">{entry.date}</td>
                        <td className="p-3 font-sans text-slate-100">{entry.jobSite}</td>
                        <td className="p-3">{entry.totalHours} hrs</td>
                        <td className="p-3">${entry.rate}/hr</td>
                        <td className="p-3 text-slate-400">${totals.supplies.toFixed(2)}</td>
                        <td className="p-3 text-slate-400">${totals.travel.toFixed(2)}</td>
                        <td className="p-3 font-bold text-green-400">${totals.totalGross.toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              entry.status === "approved"
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : entry.status === "rejected"
                                  ? "bg-red-500/10 text-red-400 border-red-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {timeEntries.filter((entry) => entry.technicianUid === viewingTimecardsFor.authUid).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">No time entries found for this contractor.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setViewingTimecardsFor(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      {lifecycleTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">Technician access</p>
              <h3 className="mt-1 text-lg font-bold text-slate-100">{lifecycleStatus} {lifecycleTarget.name}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {lifecycleStatus === "Active"
                  ? "This re-enables sign-in and makes the technician available for new assignments."
                  : "Sign-in will be disabled, current sessions revoked, and this technician will be removed from new assignment lists."}
              </p>
            </div>
            {lifecycleStatus !== "Active" ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-300">Reason</label>
                  <textarea value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} maxLength={500} rows={3} placeholder="Required for the audit record and technician notice" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none" />
                </div>
                {openJobsForContractor.length ? (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-xs font-bold text-amber-300">{openJobsForContractor.length} open work order(s) need an assignment decision</p>
                    <ul className="max-h-24 list-inside list-disc overflow-y-auto text-xs text-slate-400">
                      {openJobsForContractor.map((job) => <li key={job.id}>{job.name || job.jobName || job.workOrderNumber || job.id}</li>)}
                    </ul>
                    <select value={lifecycleReassignToId} onChange={(event) => setLifecycleReassignToId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none">
                      <option value="">Choose what happens to open work</option>
                      {assignableContractors.filter((c) => c.id !== lifecycleTarget.id).map((c) => <option key={c.id} value={c.id}>Reassign to {c.name}</option>)}
                      <option value="UNASSIGNED">Leave unassigned for dispatch</option>
                    </select>
                  </div>
                ) : (
                  <p className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs text-green-300">No open work orders are assigned to this technician.</p>
                )}
              </>
            ) : null}
            <p className="text-xs text-slate-500">Completed jobs, timecards, invoices, payment history, and the QuickBooks vendor link will be preserved.</p>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={isSavingLifecycle} onClick={() => setLifecycleTarget(null)} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">Cancel</button>
              <button
                type="button"
                disabled={isSavingLifecycle || (lifecycleStatus !== "Active" && (!lifecycleReason.trim() || (openJobsForContractor.length > 0 && !lifecycleReassignToId)))}
                onClick={() => void saveLifecycleStatus()}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${lifecycleStatus === "Active" ? "bg-green-600 hover:bg-green-500" : lifecycleStatus === "Suspended" ? "bg-amber-600 hover:bg-amber-500" : "bg-rose-600 hover:bg-rose-500"}`}
              >
                {isSavingLifecycle ? "Saving…" : `Confirm ${lifecycleStatus.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
