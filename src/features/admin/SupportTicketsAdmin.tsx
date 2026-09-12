import { useEffect, useState } from "react";
import { PartyPopper, Wrench } from "lucide-react";
import { auth } from "../../lib/firebase";
import type { SupportTicket } from "../contractor/types";
import { CrmBadge, CrmButton, CrmCard, CrmTable, CrmTableHead } from "../crm/ui";

async function ticketsApi(action: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/support-tickets?action=${action}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Support ticket request failed.");
  return data;
}

export function SupportTicketsAdmin() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await ticketsApi("list");
      setTickets(data.tickets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load support tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolve = async (id: string) => {
    try {
      await ticketsApi("update-status", { method: "POST", body: JSON.stringify({ id, status: "Resolved" }) });
      setTickets((prev) => prev.map((ticket) => (ticket.id === id ? { ...ticket, status: "Resolved" } : ticket)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not resolve the ticket.");
    }
  };

  const remove = async (id: string) => {
    try {
      await ticketsApi("delete", { method: "POST", body: JSON.stringify({ id }) });
      setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete the ticket.");
    }
  };

  return (
    <div className="space-y-4">
      <CrmCard className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-crm-ink">
            <Wrench className="h-4 w-4 text-crm-muted" /> Support &amp; Sync Tickets Ledger
          </h3>
          <p className="mt-0.5 text-xs text-crm-muted">View and resolve support requests submitted by portal contractors.</p>
        </div>
        <div className="flex items-center gap-2">
          <CrmButton variant="secondary" onClick={load} className="h-9 px-3 text-xs">Refresh</CrmButton>
          <div className="rounded-lg border border-crm-hairline px-3 py-2 text-xs text-crm-body">
            Total Tickets: <span className="font-bold text-crm-ink">{tickets.length}</span>
          </div>
        </div>
      </CrmCard>

      {error && <CrmCard className="border-crm-error/30 bg-crm-error/5 text-xs text-crm-error">{error}</CrmCard>}

      {loading ? (
        <div className="py-12 text-center text-xs text-crm-muted">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <CrmCard className="flex flex-col items-center gap-2 py-12 text-center">
          <PartyPopper className="h-6 w-6 text-crm-muted" />
          <p className="text-xs font-medium text-crm-muted">All clear! No support tickets have been reported.</p>
        </CrmCard>
      ) : (
        <CrmTable>
          <CrmTableHead>
            <th className="p-3 w-40">Ticket ID</th>
            <th className="p-3 w-40">Submitted At</th>
            <th className="p-3">User Email</th>
            <th className="p-3">Issue Category</th>
            <th className="p-3">Message Details</th>
            <th className="p-3 w-28 text-center">Status</th>
            <th className="p-3 text-right">Actions</th>
          </CrmTableHead>
          <tbody className="divide-y divide-crm-hairline-soft">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="align-top hover:bg-crm-surface-soft">
                <td className="p-3 font-mono font-bold text-crm-ink">#{ticket.id.slice(0, 8)}</td>
                <td className="p-3 font-mono text-[11px] text-crm-muted">{new Date(ticket.createdAt).toLocaleString()}</td>
                <td className="p-3 font-mono text-crm-body">{ticket.email}</td>
                <td className="p-3 font-semibold text-crm-ink">{ticket.subject}</td>
                <td className="p-3 max-w-xs whitespace-pre-wrap text-crm-muted">{ticket.message}</td>
                <td className="p-3 text-center">
                  <CrmBadge tone={ticket.status === "Resolved" ? "success" : "warning"}>{ticket.status}</CrmBadge>
                </td>
                <td className="p-3 text-right">
                  {ticket.status === "Open" ? (
                    <CrmButton variant="secondary" onClick={() => resolve(ticket.id)} className="h-8 px-2.5 text-[11px]">Resolve</CrmButton>
                  ) : (
                    <button type="button" onClick={() => remove(ticket.id)} className="text-[11px] font-bold text-crm-error hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </CrmTable>
      )}
    </div>
  );
}
