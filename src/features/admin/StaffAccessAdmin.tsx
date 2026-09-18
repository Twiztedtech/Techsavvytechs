import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import { auth } from "../../lib/firebase";
import { CrmBadge, CrmButton, CrmCard, CrmInput, CrmModalShell, CrmPageHeader, CrmTable, CrmTableHead } from "../crm/ui";

type StaffRole = "assistant_admin" | "dispatcher" | "office_billing";
type StaffAccount = {
  id: string;
  name: string;
  email: string;
  staffRole: StaffRole;
  status: "active" | "disabled";
  invitedAt?: string;
};

const roleLabels: Record<StaffRole, string> = {
  assistant_admin: "Assistant Admin",
  dispatcher: "Dispatcher",
  office_billing: "Office / Billing",
};

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

export function StaffAccessAdmin() {
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("dispatcher");
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await authedFetch("/api/admin/contractors/invite?adminOperation=staff");
      setStaff(data.staff || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load staff accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await authedFetch("/api/admin/contractors/invite?adminOperation=staff", {
        method: "POST",
        body: JSON.stringify({ operation: "invite", name, email, staffRole }),
      });
      setIsInviteOpen(false);
      setName("");
      setEmail("");
      setStaffRole("dispatcher");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invitation.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateRole = async (staffId: string, nextRole: StaffRole) => {
    setEditingId(staffId);
    try {
      await authedFetch("/api/admin/contractors/invite?adminOperation=staff", {
        method: "POST",
        body: JSON.stringify({ operation: "update-role", staffId, staffRole: nextRole }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the role.");
    } finally {
      setEditingId(null);
    }
  };

  const revoke = async (member: StaffAccount) => {
    if (!confirm(`Revoke CRM access for ${member.name || member.email}?`)) return;
    setRevokingId(member.id);
    try {
      await authedFetch("/api/admin/contractors/invite?adminOperation=staff", {
        method: "POST",
        body: JSON.stringify({ operation: "revoke", staffId: member.id }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke access.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <CrmPageHeader
        eyebrow="Team"
        title="Team & Access"
        action={
          <CrmButton onClick={() => setIsInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Invite staff
          </CrmButton>
        }
      />
      {error && (
        <div className="rounded-lg border border-crm-error/20 bg-crm-error/10 p-3 text-xs text-crm-error">{error}</div>
      )}
      <CrmCard>
        {loading ? (
          <p className="p-4 text-sm text-crm-muted">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="p-4 text-sm text-crm-muted">No staff accounts yet. Invite a Dispatcher, Assistant Admin, or Office/Billing teammate above.</p>
        ) : (
          <CrmTable>
            <CrmTableHead>
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </CrmTableHead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t border-crm-hairline-soft">
                  <td className="px-4 py-3 text-sm font-medium text-crm-ink">{member.name}</td>
                  <td className="px-4 py-3 text-sm text-crm-body">{member.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={member.staffRole}
                      disabled={member.status === "disabled" || editingId === member.id}
                      onChange={(e) => void updateRole(member.id, e.target.value as StaffRole)}
                      className="rounded border border-crm-hairline bg-crm-canvas px-2 py-1 text-xs text-crm-ink disabled:opacity-50"
                    >
                      {(Object.keys(roleLabels) as StaffRole[]).map((role) => (
                        <option key={role} value={role}>{roleLabels[role]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <CrmBadge tone={member.status === "active" ? "success" : "neutral"}>
                      {member.status === "active" ? "Active" : "Revoked"}
                    </CrmBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.status === "active" && (
                      <button
                        onClick={() => void revoke(member)}
                        disabled={revokingId === member.id}
                        className="text-xs font-semibold text-crm-error hover:underline disabled:opacity-50"
                      >
                        {revokingId === member.id ? "Revoking…" : "Revoke access"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        )}
      </CrmCard>

      {isInviteOpen && (
        <CrmModalShell title="Invite staff" onClose={() => setIsInviteOpen(false)}>
          <form onSubmit={invite} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-crm-muted">Name</label>
              <CrmInput value={name} onChange={(e: any) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-crm-muted">Email</label>
              <CrmInput type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-crm-muted">Role</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                className="w-full rounded-lg border border-crm-hairline bg-crm-canvas px-3 py-2 text-sm text-crm-ink"
              >
                {(Object.keys(roleLabels) as StaffRole[]).map((role) => (
                  <option key={role} value={role}>{roleLabels[role]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-crm-hairline-soft bg-crm-surface-soft p-3 text-xs text-crm-muted">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Only Admin can invite staff or change roles — this page is not visible to any other role.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setIsInviteOpen(false)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-crm-muted hover:bg-crm-surface-soft">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <CrmButton type="submit" disabled={isSaving}>
                {isSaving ? "Sending…" : "Send invitation"}
              </CrmButton>
            </div>
          </form>
        </CrmModalShell>
      )}
    </div>
  );
}
