import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import type { SupportTicket } from "../contractor/types";

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
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>🛠️</span> Support &amp; Sync Tickets Ledger
          </h3>
          <p className="text-xs text-slate-400">View and resolve support requests submitted by portal contractors.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="text-xs font-mono bg-slate-900 border border-slate-800 hover:border-amber-500 px-3 py-1.5 rounded-lg text-slate-300 transition cursor-pointer"
          >
            Refresh
          </button>
          <div className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            Total Tickets: <span className="text-amber-500 font-bold">{tickets.length}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs text-slate-400">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 bg-slate-950/20 border border-slate-800/40 rounded-xl space-y-2">
          <span className="text-2xl">🎉</span>
          <p className="text-xs text-slate-400 font-medium">All clear! No support tickets have been reported.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="p-3 w-40">Ticket ID</th>
                <th className="p-3 w-40">Submitted At</th>
                <th className="p-3">User Email</th>
                <th className="p-3">Issue Category</th>
                <th className="p-3">Message Details</th>
                <th className="p-3 w-28 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-950/40 align-top">
                  <td className="p-3 font-mono font-bold text-amber-500">#{ticket.id.slice(0, 8)}</td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">{new Date(ticket.createdAt).toLocaleString()}</td>
                  <td className="p-3 font-mono text-slate-200">{ticket.email}</td>
                  <td className="p-3 font-semibold text-slate-100">{ticket.subject}</td>
                  <td className="p-3 text-slate-400 max-w-xs whitespace-pre-wrap">{ticket.message}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        ticket.status === "Resolved"
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {ticket.status === "Open" ? (
                      <button
                        type="button"
                        onClick={() => resolve(ticket.id)}
                        className="px-2 py-1 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white font-bold rounded text-[10px] transition cursor-pointer"
                      >
                        Resolve
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => remove(ticket.id)}
                        className="text-red-400 hover:text-red-300 font-bold hover:underline text-[11px] cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
