import { useEffect, useRef, useState } from "react";
import { auth } from "../../lib/firebase";
import { CrmButton, CrmCard } from "./ui";

type Message = {
  id: string;
  message: string;
  authorName?: string;
  authorRole?: string;
  visibility?: string;
  createdAt?: string;
};

const POLL_MS = 15000;

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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function CrmJobMessagesPanel({ jobId, canSendClientVisible }: { jobId: string; canSendClientVisible: boolean }) {
  const [tab, setTab] = useState<"internal" | "client">("internal");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await authedFetch(`/api/portal/job-events?action=messages&jobId=${encodeURIComponent(jobId)}`);
      setMessages(data.messages || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    setLoaded(false);
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, tab]);

  const visible = messages.filter((msg) => (tab === "client" ? msg.visibility === "client" || msg.visibility === "portal" || msg.visibility === "email" : msg.visibility === "internal"));

  const send = async () => {
    const text = draft.trim();
    if (!text || !jobId) return;
    setSending(true);
    try {
      await authedFetch("/api/portal/job-events?action=messages", {
        method: "POST",
        body: JSON.stringify({ jobId, message: text, visibility: tab }),
      });
      setDraft("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <CrmCard className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("internal")}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${tab === "internal" ? "bg-crm-primary text-crm-on-primary" : "bg-crm-surface-card text-crm-muted"}`}
        >
          Team
        </button>
        {canSendClientVisible && (
          <button
            type="button"
            onClick={() => setTab("client")}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${tab === "client" ? "bg-crm-primary text-crm-on-primary" : "bg-crm-surface-card text-crm-muted"}`}
          >
            Customer
          </button>
        )}
      </div>
      {tab === "client" && (
        <p className="mb-2 text-[11px] text-crm-muted">Visible to the customer — sent as an email and shown in their client portal.</p>
      )}
      {error && <div className="mb-2 rounded border border-crm-error/20 bg-crm-error/10 p-2 text-[11px] text-crm-error">{error}</div>}
      <div ref={listRef} className="mb-3 max-h-56 space-y-2 overflow-y-auto">
        {!loaded ? (
          <p className="text-xs text-crm-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-crm-muted">No messages yet.</p>
        ) : (
          visible.map((msg) => (
            <div key={msg.id} className="rounded-lg bg-crm-surface-soft p-2.5">
              <div className="flex items-center gap-2 text-[10px] text-crm-muted">
                <span className="font-bold text-crm-ink">{msg.authorName || "Unknown"}</span>
                {msg.createdAt && <span>{new Date(msg.createdAt).toLocaleString()}</span>}
              </div>
              <p className="mt-1 text-xs text-crm-body">{msg.message}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={tab === "client" ? "Reply to the customer…" : "Add a note for the team…"}
          className="h-9 flex-1 rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs text-crm-ink outline-none focus:border-crm-ink"
        />
        <CrmButton type="button" disabled={sending || !draft.trim()} onClick={() => void send()} className="h-9 px-3 text-xs">
          {sending ? "Sending…" : "Send"}
        </CrmButton>
      </div>
    </CrmCard>
  );
}
