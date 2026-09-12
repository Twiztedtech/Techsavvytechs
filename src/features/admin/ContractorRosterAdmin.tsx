import { useEffect, useState, type FormEvent } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Calendar, Link2, Plug, Plus, RefreshCw, X } from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { getEntryTotals } from "../contractor/timesheets/calculations";
import { CrmBadge, CrmButton, CrmCard } from "../crm/ui";

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
      <CrmCard className="flex justify-between items-center flex-wrap gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-crm-ink flex items-center gap-2">
            <Link2 className="h-4 w-4 text-crm-muted" /> QuickBooks Online Sync Engine
          </h3>
          <p className="text-xs text-crm-muted">Sync and link QBO Vendors to your local contractor portal profiles.</p>
          <div className="pt-1.5 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${qboConnected ? "bg-crm-success animate-pulse" : "bg-crm-error"}`}></span>
            <span className="text-[11px] font-semibold text-crm-body">
              {qboConnected ? `Connected to Realm ID: ${qboRealmId}` : "Not Connected to QuickBooks"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <CrmButton onClick={() => setIsAddOpen(true)} className="h-9 px-3 text-xs"><Plus className="h-3.5 w-3.5" /> Add Contractor</CrmButton>
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-crm-error/10 hover:bg-crm-error text-crm-error hover:text-white font-bold rounded-lg text-xs transition border border-crm-error/20 cursor-pointer"
            >
              <Plug className="h-3.5 w-3.5" /> Disconnect
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-crm-success hover:brightness-90 text-white font-bold rounded-lg text-xs transition cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5" /> Connect to QuickBooks
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
            className="flex items-center gap-1.5 px-4 py-2 bg-crm-warning hover:brightness-90 text-white font-bold rounded-lg text-xs transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} /> {isSyncing ? "Syncing QBO..." : "Run Sync Script"}
          </button>
        </div>
      </CrmCard>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-crm-body">
          <thead className="bg-crm-surface-soft text-crm-muted uppercase text-[10px] font-bold border-b border-crm-hairline">
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
          <tbody className="divide-y divide-crm-hairline-soft">
            {contractors.map((cont) => (
              <tr key={cont.id} className="hover:bg-crm-surface-soft">
                <td className="p-3 font-semibold text-crm-ink">{cont.name}</td>
                <td className="p-3 font-mono">{cont.email}</td>
                <td className="p-3">
                  <CrmBadge tone={cont.employmentType === "w2_employee" ? "violet" : "neutral"}>
                    {cont.employmentType === "w2_employee" ? "W-2 Employee" : "1099 Contractor"}
                  </CrmBadge>
                </td>
                <td className="p-3 font-mono">${cont.rate || 75}/hr</td>
                <td className="p-3 font-mono text-crm-warning font-bold">{cont.qboVendorId ? `#${cont.qboVendorId}` : "Not Linked"}</td>
                <td className="p-3 text-right">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      contractorAccessStatus(cont) === "Active"
                        ? "bg-crm-success/10 text-crm-success border-crm-success/20"
                        : contractorAccessStatus(cont) === "Suspended"
                          ? "bg-crm-warning/10 text-crm-warning border-crm-warning/20"
                          : contractorAccessStatus(cont) === "Pending"
                            ? "bg-crm-accent/10 text-crm-accent border-crm-accent/20"
                            : "bg-crm-error/10 text-crm-error border-crm-error/20"
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
                        ? "bg-crm-success/10 text-crm-success border-crm-success/20"
                        : onboardingStatus === "submitted"
                          ? "bg-crm-accent/10 text-crm-accent border-crm-accent/20"
                          : onboardingStatus === "needs_update"
                            ? "bg-crm-warning/10 text-crm-warning border-crm-warning/20"
                            : "bg-crm-surface-card text-crm-muted border-crm-hairline";
                    return (
                      <div className="flex min-w-[190px] flex-col items-end gap-1.5">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${statusClass}`}>{onboardingStatus.replace("_", " ")}</span>
                        {hasW9 ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <button type="button" onClick={() => void openContractorW9(cont)} className="rounded border border-crm-hairline px-2 py-1 text-[10px] font-bold text-crm-ink hover:border-crm-ink/40">Open W-9</button>
                            {onboardingStatus !== "approved" ? <button type="button" disabled={isReviewing} onClick={() => void reviewContractorOnboarding(cont, "approved")} className="rounded border border-crm-success/40 px-2 py-1 text-[10px] font-bold text-crm-success hover:bg-crm-success hover:text-white disabled:opacity-50">Approve</button> : null}
                            {onboardingStatus !== "needs_update" ? <button type="button" disabled={isReviewing} onClick={() => void reviewContractorOnboarding(cont, "needs_update")} className="rounded border border-crm-warning/40 px-2 py-1 text-[10px] font-bold text-crm-warning hover:bg-crm-warning hover:text-crm-on-primary disabled:opacity-50">Request update</button> : null}
                          </div>
                        ) : (
                          <span className="text-[10px] text-crm-muted">No W-9 submitted</span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="p-3 text-right">
                  <div className="flex min-w-[165px] flex-col items-end gap-1.5 font-sans">
                    <button type="button" onClick={() => setViewingTimecardsFor(cont)} className="flex items-center gap-1 px-2.5 py-1 rounded border border-crm-hairline hover:border-crm-ink/40 text-[10px] font-bold text-crm-body hover:bg-crm-surface-card transition cursor-pointer">
                      <Calendar className="h-3 w-3" /> View History
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
                      className="px-2.5 py-1 rounded border border-crm-warning/30 text-[10px] font-bold text-crm-warning hover:bg-crm-warning hover:text-crm-on-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                      {contractorAccessStatus(cont) !== "Active" ? <button type="button" onClick={() => openLifecycleDialog(cont, "Active")} className="rounded border border-crm-success/40 px-2 py-1 text-[10px] font-bold text-crm-success hover:bg-crm-success hover:text-white">Activate</button> : null}
                      {contractorAccessStatus(cont) === "Active" ? <button type="button" onClick={() => openLifecycleDialog(cont, "Suspended")} className="rounded border border-crm-warning/40 px-2 py-1 text-[10px] font-bold text-crm-warning hover:bg-crm-warning hover:text-crm-on-primary">Suspend</button> : null}
                      {contractorAccessStatus(cont) !== "Offboarded" ? <button type="button" onClick={() => openLifecycleDialog(cont, "Offboarded")} className="rounded border border-crm-error/40 px-2 py-1 text-[10px] font-bold text-crm-error hover:bg-crm-error hover:text-white">Offboard</button> : null}
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
                        className="text-[10px] font-bold text-crm-accent underline underline-offset-2 hover:brightness-90 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-crm-canvas border border-crm-hairline rounded-xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="crm-display-sm text-crm-ink flex items-center gap-2">
                <Plus className="h-4 w-4 text-crm-muted" /> Add New Tech to Contractors Pool
              </h3>
              <button type="button" onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-lg hover:bg-crm-surface-card border border-crm-hairline text-crm-muted hover:text-crm-ink transition flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleAddContractor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-crm-muted mb-1.5 uppercase tracking-wider">Full Name</label>
                <input type="text" required placeholder="e.g. John Doe" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 bg-crm-canvas border border-crm-hairline rounded-lg text-crm-ink text-xs focus:outline-none focus:border-crm-ink transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-crm-muted mb-1.5 uppercase tracking-wider">Email Address</label>
                <input type="email" required placeholder="e.g. john@tech5avvy.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-3 py-2 bg-crm-canvas border border-crm-hairline rounded-lg text-crm-ink text-xs focus:outline-none focus:border-crm-ink transition" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-crm-muted mb-1.5 uppercase tracking-wider">Hourly Rate ($/hr)</label>
                  <input type="number" required min="1" placeholder="75" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="w-full px-3 py-2 bg-crm-canvas border border-crm-hairline rounded-lg text-crm-ink text-xs focus:outline-none focus:border-crm-ink transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-crm-muted mb-1.5 uppercase tracking-wider">Tech Specialty</label>
                  <input type="text" placeholder="e.g. Network, DevOps" value={newSpecialty} onChange={(e) => setNewSpecialty(e.target.value)} className="w-full px-3 py-2 bg-crm-canvas border border-crm-hairline rounded-lg text-crm-ink text-xs focus:outline-none focus:border-crm-ink transition" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-crm-muted mb-1.5 uppercase tracking-wider">Employment Type</label>
                <select value={newEmploymentType} onChange={(e) => setNewEmploymentType(e.target.value as "1099_contractor" | "w2_employee")} className="w-full px-3 py-2 bg-crm-canvas border border-crm-hairline rounded-lg text-crm-ink text-xs focus:outline-none focus:border-crm-ink transition">
                  <option value="1099_contractor">1099 Contractor (paid via QuickBooks Bills)</option>
                  <option value="w2_employee">W-2 Employee (payroll — never synced to QuickBooks Bills)</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsAddOpen(false)} className="flex-1 px-4 py-2 bg-crm-surface-card hover:bg-crm-surface-strong text-crm-body font-bold rounded-lg text-xs transition cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-crm-primary hover:bg-crm-primary-active disabled:opacity-50 text-crm-on-primary font-semibold rounded-lg text-xs transition cursor-pointer">
                  {isSaving ? "Saving..." : "Add Contractor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingTimecardsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-4xl bg-crm-canvas border border-crm-hairline rounded-xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="space-y-1">
                <h3 className="crm-display-sm text-crm-ink flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-crm-muted" /> Timesheets: {viewingTimecardsFor.name}
                </h3>
                <p className="text-xs text-crm-muted">Viewing work history and submitted times for this technician.</p>
              </div>
              <button type="button" onClick={() => setViewingTimecardsFor(null)} className="w-8 h-8 rounded-lg hover:bg-crm-surface-card border border-crm-hairline text-crm-muted hover:text-crm-ink transition flex items-center justify-center cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-x-auto max-h-[400px] border border-crm-hairline rounded-xl bg-crm-surface-soft">
              <table className="w-full text-left text-xs text-crm-body">
                <thead className="bg-crm-surface-soft text-crm-muted uppercase text-[10px] font-bold border-b border-crm-hairline sticky top-0">
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
                <tbody className="divide-y divide-crm-hairline-soft font-mono">
                  {timeEntries.filter((entry) => entry.technicianUid === viewingTimecardsFor.authUid).map((entry) => {
                    const totals = getEntryTotals(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-crm-surface-soft">
                        <td className="p-3 font-bold text-crm-ink">{entry.date}</td>
                        <td className="p-3 font-sans text-crm-ink">{entry.jobSite}</td>
                        <td className="p-3">{entry.totalHours} hrs</td>
                        <td className="p-3">${entry.rate}/hr</td>
                        <td className="p-3 text-crm-muted">${totals.supplies.toFixed(2)}</td>
                        <td className="p-3 text-crm-muted">${totals.travel.toFixed(2)}</td>
                        <td className="p-3 font-bold text-crm-ink">${totals.totalGross.toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              entry.status === "approved"
                                ? "bg-crm-success/10 text-crm-success border-crm-success/20"
                                : entry.status === "rejected"
                                  ? "bg-crm-error/10 text-crm-error border-crm-error/20"
                                  : "bg-crm-warning/10 text-crm-warning border-crm-warning/20"
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
                      <td colSpan={8} className="p-8 text-center text-crm-muted font-sans">No time entries found for this contractor.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setViewingTimecardsFor(null)} className="px-4 py-2 bg-crm-surface-card hover:bg-crm-surface-strong text-crm-body font-bold rounded-lg text-xs transition cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      {lifecycleTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-crm-hairline bg-crm-canvas p-6 shadow-2xl">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-crm-muted">Technician access</p>
              <h3 className="mt-1 text-lg font-bold text-crm-ink">{lifecycleStatus} {lifecycleTarget.name}</h3>
              <p className="mt-1 text-sm text-crm-muted">
                {lifecycleStatus === "Active"
                  ? "This re-enables sign-in and makes the technician available for new assignments."
                  : "Sign-in will be disabled, current sessions revoked, and this technician will be removed from new assignment lists."}
              </p>
            </div>
            {lifecycleStatus !== "Active" ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold text-crm-body">Reason</label>
                  <textarea value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} maxLength={500} rows={3} placeholder="Required for the audit record and technician notice" className="w-full rounded-lg border border-crm-hairline bg-crm-canvas p-3 text-sm text-crm-ink placeholder-crm-muted-soft focus:border-crm-ink focus:outline-none" />
                </div>
                {openJobsForContractor.length ? (
                  <div className="space-y-2 rounded-xl border border-crm-warning/30 bg-crm-warning/5 p-4">
                    <p className="text-xs font-bold text-crm-warning">{openJobsForContractor.length} open work order(s) need an assignment decision</p>
                    <ul className="max-h-24 list-inside list-disc overflow-y-auto text-xs text-crm-muted">
                      {openJobsForContractor.map((job) => <li key={job.id}>{job.name || job.jobName || job.workOrderNumber || job.id}</li>)}
                    </ul>
                    <select value={lifecycleReassignToId} onChange={(event) => setLifecycleReassignToId(event.target.value)} className="w-full rounded-lg border border-crm-hairline bg-crm-canvas px-3 py-2 text-xs text-crm-ink focus:border-crm-ink focus:outline-none">
                      <option value="">Choose what happens to open work</option>
                      {assignableContractors.filter((c) => c.id !== lifecycleTarget.id).map((c) => <option key={c.id} value={c.id}>Reassign to {c.name}</option>)}
                      <option value="UNASSIGNED">Leave unassigned for dispatch</option>
                    </select>
                  </div>
                ) : (
                  <p className="rounded-lg border border-crm-success/20 bg-crm-success/5 p-3 text-xs text-crm-success">No open work orders are assigned to this technician.</p>
                )}
              </>
            ) : null}
            <p className="text-xs text-crm-muted">Completed jobs, timecards, invoices, payment history, and the QuickBooks vendor link will be preserved.</p>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={isSavingLifecycle} onClick={() => setLifecycleTarget(null)} className="rounded-xl bg-crm-surface-card px-4 py-2 text-sm font-medium text-crm-body hover:bg-crm-surface-strong">Cancel</button>
              <button
                type="button"
                disabled={isSavingLifecycle || (lifecycleStatus !== "Active" && (!lifecycleReason.trim() || (openJobsForContractor.length > 0 && !lifecycleReassignToId)))}
                onClick={() => void saveLifecycleStatus()}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${lifecycleStatus === "Active" ? "bg-crm-success hover:brightness-90" : lifecycleStatus === "Suspended" ? "bg-crm-warning hover:brightness-90" : "bg-crm-error hover:brightness-90"}`}
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
