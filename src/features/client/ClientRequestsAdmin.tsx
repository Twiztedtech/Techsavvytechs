import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Inbox,
  Paperclip,
  RefreshCw,
  Settings as SettingsIcon,
  UserPlus,
} from "lucide-react";
import { ClientPortalConfiguration } from "./ClientPortalConfiguration";
import { ClientCompanyEditor } from "./ClientCompanyEditor";
import { CrmButton, CrmModalShell } from "../crm/ui";

type ClientTab = "requests" | "approvals" | "scheduling" | "organizations" | "settings";
type RequestFilter = "all" | "requested" | "clarification_needed";

const ACCESS_ROLE_OPTIONS: [string, string][] = [
  ["company_admin", "Company administrator (sees all company jobs, manages their team)"],
  ["billing", "Billing (sees invoices and billing documents)"],
  ["dispatcher", "Dispatcher"],
  ["sales", "Sales"],
  ["site_contact", "Site contact"],
  ["project_viewer", "Viewer (their own jobs only)"],
];

function failureReason(raw: unknown) {
  const text = String(raw || "");
  try {
    const parsed = JSON.parse(text);
    return parsed.message || text || "No error details recorded.";
  } catch {
    return text || "No error details recorded.";
  }
}

export type AdminActionResult = { ok: true } | { ok: false; error?: string };

type RequestRecord = Record<string, any> & {
  id: string;
  requestNumber: string;
  companyName: string;
  siteName: string;
  status: string;
  requestedWindows: Array<{ date: string; start: string; end: string }>;
};
type ContractorOption = { id: string; name: string; email: string };

async function adminApi(action: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/admin/client-portal?action=${action}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Admin request failed.");
  return data;
}

export function ClientRequestsAdmin({
  contractors,
}: {
  contractors: ContractorOption[];
}) {
  const [data, setData] = useState<any>({
    requests: [],
    organizations: [],
    users: [],
    appointments: [],
    failedNotifications: [],
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<ClientTab>("requests");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");
  const [approvalRoles, setApprovalRoles] = useState<Record<string, string>>({});
  const [accessDraft, setAccessDraft] = useState<Record<string, string>>({});
  const [noteDialog, setNoteDialog] = useState<{
    request: RequestRecord;
    status: "clarification_needed" | "declined";
    note: string;
  } | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const [convert, setConvert] = useState({
    requestId: "",
    technicianLeadId: "",
    hourlyRate: "55",
    travelRate: "35",
    directContactApproved: false,
  });
  const [schedule, setSchedule] = useState({
    appointmentId: "",
    start: "",
    end: "",
    technicianId: "",
  });
  const load = async () => {
    setLoading(true);
    try {
      setData(await adminApi("dashboard"));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load requests.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const post = async (
    action: string,
    body: unknown,
  ): Promise<AdminActionResult> => {
    setNotice("");
    try {
      await adminApi(action, { method: "POST", body: JSON.stringify(body) });
      await load();
      setNotice("Saved successfully.");
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save.";
      setNotice(message);
      return { ok: false, error: message };
    }
  };
  if (loading)
    return (
      <div className="grid min-h-64 place-items-center text-sm text-crm-muted">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  const pendingUsers = data.users.filter(
    (user: any) => (user.status || "pending") === "pending",
  );
  const activeUsers = data.users.filter(
    (user: any) => user.status === "active" || user.status === "suspended",
  );
  const sendWelcome = async (user: any) => {
    const result = await post("resend-welcome", { uid: user.id });
    return result.ok;
  };
  const roleFor = (user: any) =>
    approvalRoles[user.id] ||
    user.suggestedRoles?.[0] ||
    user.requestedRoles?.[0] ||
    "project_viewer";
  const openRequests = data.requests.filter(
    (request: RequestRecord) => !["declined"].includes(request.status),
  );
  const visibleRequests =
    requestFilter === "all"
      ? openRequests
      : openRequests.filter(
          (request: RequestRecord) => request.status === requestFilter,
        );
  const tabs: { id: ClientTab; label: string; icon: typeof Inbox; count?: number; urgent?: boolean }[] = [
    { id: "requests", label: "Requests", icon: Inbox, count: openRequests.length },
    { id: "approvals", label: "Approvals", icon: UserPlus, count: pendingUsers.length, urgent: pendingUsers.length > 0 },
    { id: "scheduling", label: "Scheduling", icon: CalendarClock, count: data.appointments.length },
    { id: "organizations", label: "Organizations", icon: Building2 },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];
  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded border border-crm-warning/30 bg-crm-warning-soft-bg p-3 text-xs text-crm-warning-soft-text">
          {notice}
        </div>
      )}
      {data.failedNotifications.length > 0 && (
        <div className="rounded-xl border border-crm-error/30 bg-crm-error-soft-bg p-4 text-sm text-crm-error-soft-text">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <strong>
                {data.failedNotifications.length} notification deliver
                {data.failedNotifications.length === 1 ? "y needs" : "ies need"}{" "}
                attention.
              </strong>
              <p className="mt-1 text-xs text-crm-error-soft-text/80">
                Review provider configuration or delivery errors before relying
                on alerts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFailures((v) => !v)}
              className="rounded-lg border border-crm-error/40 px-3 py-1.5 text-[10px] font-bold"
            >
              {showFailures ? "Hide details" : "Show details"}
            </button>
            <button
              type="button"
              onClick={() =>
                void post("dismiss-notifications", {
                  ids: data.failedNotifications.map((f: any) => f.id),
                })
              }
              className="rounded-lg border border-crm-error/40 px-3 py-1.5 text-[10px] font-bold"
            >
              Dismiss all
            </button>
          </div>
          {showFailures && (
            <ul className="mt-3 space-y-2">
              {[...data.failedNotifications]
                .sort((a: any, b: any) =>
                  String(b.createdAt).localeCompare(String(a.createdAt)),
                )
                .map((item: any) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-crm-error/20 bg-crm-canvas p-3 text-xs text-crm-body"
                  >
                    <div>
                      <p className="font-bold text-crm-ink">
                        {item.channel === "sms" ? "Text message" : "Email"} ·{" "}
                        {String(item.type || "").replace(/_/g, " ")} ·{" "}
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString()
                          : ""}
                      </p>
                      {Array.isArray(item.recipients) &&
                        item.recipients.length > 0 && (
                          <p className="text-[10px] text-crm-muted">
                            To: {item.recipients.join(", ")}
                          </p>
                        )}
                      <p className="mt-1 text-[11px] text-crm-muted">
                        {failureReason(item.error)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void post("dismiss-notifications", { ids: [item.id] })
                      }
                      className="shrink-0 rounded-lg border border-crm-hairline px-2.5 py-1 text-[10px] font-bold text-crm-ink"
                    >
                      Dismiss
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {pendingUsers.length > 0 && tab !== "approvals" && (
        <button
          type="button"
          onClick={() => setTab("approvals")}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-crm-error bg-crm-error/10 p-4 text-left text-sm font-bold text-crm-error hover:bg-crm-error/15"
        >
          <UserPlus className="h-5 w-5 shrink-0" />
          <span>
            {pendingUsers.length} portal access request
            {pendingUsers.length === 1 ? "" : "s"} waiting on your approval
          </span>
          <span className="ml-auto text-xs font-bold underline underline-offset-2">
            Review now →
          </span>
        </button>
      )}
      <div className="grid gap-4 md:grid-cols-4">
        {(
          [
            {
              label: "New requests",
              value: data.requests.filter(
                (r: RequestRecord) => r.status === "requested",
              ).length,
              tab: "requests" as ClientTab,
              filter: "requested" as RequestFilter,
            },
            {
              label: "Needs clarification",
              value: data.requests.filter(
                (r: RequestRecord) => r.status === "clarification_needed",
              ).length,
              tab: "requests" as ClientTab,
              filter: "clarification_needed" as RequestFilter,
            },
            {
              label: "Pending users",
              value: pendingUsers.length,
              tab: "approvals" as ClientTab,
              filter: "all" as RequestFilter,
            },
            {
              label: "Appointments",
              value: data.appointments.length,
              tab: "scheduling" as ClientTab,
              filter: "all" as RequestFilter,
            },
          ]
        ).map(({ label, value, tab: target, filter }) => {
          const isPendingUsers = label === "Pending users";
          const isUrgent = isPendingUsers && Number(value) > 0;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setRequestFilter(filter);
                setTab(target);
              }}
              className={`rounded-xl border p-4 text-left transition ${
                isUrgent
                  ? "border-crm-error bg-crm-error/10 hover:bg-crm-error/15"
                  : "border-crm-hairline bg-crm-canvas hover:bg-crm-surface-soft"
              }`}
            >
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isUrgent ? "text-crm-error" : "text-crm-muted"
                }`}
              >
                {label}
              </p>
              <p className={`crm-display-md mt-2 ${isUrgent ? "text-crm-error" : "text-crm-ink"}`}>
                {value}
              </p>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-crm-hairline bg-crm-surface-soft p-1">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setRequestFilter("all");
                setTab(item.id);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                active
                  ? "bg-crm-canvas text-crm-ink shadow-sm"
                  : "text-crm-muted hover:text-crm-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              {typeof item.count === "number" && item.count > 0 && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                    item.urgent
                      ? "bg-crm-error text-white"
                      : "bg-crm-hairline text-crm-muted"
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tab === "requests" && (
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold text-crm-ink">Job requests</h3>
          {requestFilter !== "all" && (
            <button
              type="button"
              onClick={() => setRequestFilter("all")}
              className="rounded-full bg-crm-surface-soft px-3 py-1 text-[10px] font-bold text-crm-body hover:bg-crm-hairline"
            >
              Showing:{" "}
              {requestFilter === "requested" ? "new requests" : "needs clarification"}{" "}
              ✕ show all
            </button>
          )}
        </div>
        {visibleRequests.length === 0 && (
          <p className="text-xs text-crm-muted">Nothing here right now.</p>
        )}
        <div className="space-y-3">
          {visibleRequests.map((request: RequestRecord) => (
            <article
              key={request.id}
              className="rounded-xl border border-crm-hairline bg-crm-canvas p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-crm-success">
                      {request.requestNumber}
                    </span>
                    {request.urgent && (
                      <span className="rounded bg-crm-error/15 px-2 py-0.5 text-[9px] font-bold text-crm-error">
                        URGENT
                      </span>
                    )}
                  </div>
                  <h4 className="mt-1 text-lg font-bold text-crm-ink">
                    {request.siteName}
                  </h4>
                  <p className="text-xs text-crm-muted">
                    {request.companyName} · {request.clientReference} ·{" "}
                    {request.requesterName}
                  </p>
                  <p className="mt-2 text-xs text-crm-body">
                    {request.scopeSummary}
                  </p>
                  {request.scopeTasks?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">
                        Scope tasks
                      </p>
                      <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-crm-body">
                        {request.scopeTasks.map(
                          (task: string, index: number) => (
                            <li key={`${index}-${task}`}>{task}</li>
                          ),
                        )}
                      </ol>
                    </div>
                  )}
                  {request.equipment?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">
                        Equipment and materials
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-crm-body">
                        {request.equipment.map((item: any, index: number) => (
                          <li key={`${index}-${item.description}`}>
                            <span className="font-bold text-crm-ink">
                              {item.quantity ? `${item.quantity} × ` : ""}
                              {item.description}
                            </span>{" "}
                            <span className="text-crm-muted">
                              —{" "}
                              {item.providedBy === "techsavvy"
                                ? "TechSavvy provided"
                                : "Client provided"}
                              {item.upc ? ` · UPC ${item.upc}` : ""}
                              {item.serial ? ` · SN ${item.serial}` : ""}
                            </span>
                            {item.notes && (
                              <span className="block text-crm-muted">{item.notes}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {request.packages?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">
                        Packages / shipments
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-crm-body">
                        {request.packages.map((pkg: any, index: number) => (
                          <li key={`${index}-${pkg.trackingNumber || pkg.description}`}>
                            <span className="font-bold text-crm-ink">
                              {pkg.destination === "office" ? "To TechSavvy office" : "To site"}
                            </span>{" "}
                            <span className="text-crm-muted">
                              {pkg.carrier ? `— ${pkg.carrier}` : ""}
                              {pkg.trackingNumber ? ` #${pkg.trackingNumber}` : ""}
                            </span>
                            {pkg.description && (
                              <span className="block text-crm-muted">{pkg.description}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {request.deliverables?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-crm-muted">
                        Required deliverables
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-crm-body">
                        {request.deliverables.map(
                          (item: string, index: number) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  {request.attachments?.length > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-crm-warning">
                      <Paperclip className="h-3.5 w-3.5" /> {request.attachments.length} attached document
                      {request.attachments.length === 1 ? "" : "s"}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-crm-muted">
                    Preferred: {request.requestedWindows?.[0]?.date}{" "}
                    {request.requestedWindows?.[0]?.start}–
                    {request.requestedWindows?.[0]?.end}
                  </p>
                </div>
                <span className="rounded-full bg-crm-warning/10 px-3 py-1 text-xs capitalize text-crm-warning">
                  {request.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    post("request-status", {
                      requestId: request.id,
                      status: "reviewing",
                    })
                  }
                  className="rounded border border-crm-hairline px-3 py-2 text-[10px] font-bold text-crm-body"
                >
                  Reviewing
                </button>
                <button
                  onClick={() =>
                    setNoteDialog({
                      request,
                      status: "clarification_needed",
                      note: "",
                    })
                  }
                  className="rounded-lg border border-crm-warning/30 px-3 py-2 text-[10px] font-bold text-crm-warning"
                >
                  Request clarification
                </button>
                <button
                  onClick={() =>
                    setConvert((v) => ({ ...v, requestId: request.id }))
                  }
                  disabled={Boolean(request.convertedJobId)}
                  className="rounded-lg bg-crm-primary px-3 py-2 text-[10px] font-bold text-crm-on-primary hover:bg-crm-primary-active disabled:opacity-40"
                >
                  {request.convertedJobId
                    ? "Converted"
                    : "Convert to work order"}
                </button>
                <button
                  onClick={() =>
                    setNoteDialog({ request, status: "declined", note: "" })
                  }
                  className="rounded-lg border border-crm-error/30 px-3 py-2 text-[10px] font-bold text-crm-error"
                >
                  Decline
                </button>
              </div>
              {convert.requestId === request.id && (
                <div className="mt-4 grid gap-2 rounded-lg border border-crm-hairline bg-crm-surface-soft p-4 md:grid-cols-4">
                  <select
                    value={convert.technicianLeadId}
                    onChange={(e) =>
                      setConvert((v) => ({
                        ...v,
                        technicianLeadId: e.target.value,
                      }))
                    }
                    className="rounded border border-crm-hairline bg-crm-canvas p-2 text-xs text-crm-ink"
                  >
                    <option value="">Choose technician</option>
                    {contractors.map((contractor) => (
                      <option key={contractor.id} value={contractor.id}>
                        {contractor.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={convert.hourlyRate}
                    onChange={(e) =>
                      setConvert((v) => ({ ...v, hourlyRate: e.target.value }))
                    }
                    className="rounded border border-crm-hairline bg-crm-canvas p-2 text-xs text-crm-ink"
                    placeholder="Hourly rate"
                  />
                  <input
                    type="number"
                    value={convert.travelRate}
                    onChange={(e) =>
                      setConvert((v) => ({ ...v, travelRate: e.target.value }))
                    }
                    className="rounded border border-crm-hairline bg-crm-canvas p-2 text-xs text-crm-ink"
                    placeholder="Travel rate"
                  />
                  <button
                    onClick={() =>
                      post("convert", {
                        ...convert,
                        assignedTechIds: convert.technicianLeadId
                          ? [convert.technicianLeadId]
                          : ["ALL"],
                      })
                    }
                    className="rounded-lg bg-crm-primary p-2 text-xs font-bold text-crm-on-primary hover:bg-crm-primary-active"
                  >
                    Create work order
                  </button>
                  <label className="md:col-span-4 flex gap-2 text-xs text-crm-body">
                    <input
                      type="checkbox"
                      checked={convert.directContactApproved}
                      onChange={(e) =>
                        setConvert((v) => ({
                          ...v,
                          directContactApproved: e.target.checked,
                        }))
                      }
                    />
                    Approve direct technician contact for this job
                  </label>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      )}
      {tab === "scheduling" && (
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-crm-ink">
          <CalendarClock className="h-4 w-4 text-crm-muted" /> Scheduling
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.appointments.map((appointment: any) => (
            <article
              key={appointment.id}
              className="rounded-xl border border-crm-hairline bg-crm-canvas p-4"
            >
              <p className="text-xs font-bold text-crm-ink">
                Appointment {appointment.id.slice(-6)}
              </p>
              <p className="mt-1 text-[10px] capitalize text-crm-muted">
                {appointment.status}
              </p>
              {appointment.confirmedStart && (
                <p className="mt-2 text-xs text-crm-success">
                  {new Date(appointment.confirmedStart).toLocaleString()}
                </p>
              )}
              <button
                onClick={() =>
                  setSchedule((v) => ({
                    ...v,
                    appointmentId: appointment.id,
                    technicianId: appointment.technicianId || "",
                  }))
                }
                className="mt-3 text-[10px] font-bold text-crm-ink hover:underline"
              >
                Confirm / change schedule
              </button>
              {schedule.appointmentId === appointment.id && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    value={schedule.start}
                    onChange={(e) =>
                      setSchedule((v) => ({ ...v, start: e.target.value }))
                    }
                    className="rounded border border-crm-hairline bg-crm-canvas p-2 text-[10px] text-crm-ink"
                  />
                  <input
                    type="datetime-local"
                    value={schedule.end}
                    onChange={(e) =>
                      setSchedule((v) => ({ ...v, end: e.target.value }))
                    }
                    className="rounded border border-crm-hairline bg-crm-canvas p-2 text-[10px] text-crm-ink"
                  />
                  <select
                    value={schedule.technicianId}
                    onChange={(e) =>
                      setSchedule((v) => ({
                        ...v,
                        technicianId: e.target.value,
                      }))
                    }
                    className="rounded border border-crm-hairline bg-crm-canvas p-2 text-[10px] text-crm-ink"
                  >
                    <option value="">Technician</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      post("schedule", {
                        appointmentId: appointment.id,
                        start: new Date(schedule.start).toISOString(),
                        end: new Date(schedule.end).toISOString(),
                        technicianId: schedule.technicianId,
                      })
                    }
                    className="rounded-lg bg-crm-warning p-2 text-[10px] font-bold text-white hover:brightness-90"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      )}
      {tab === "approvals" && (
        <section
          className={`rounded-xl border p-5 ${
            pendingUsers.length > 0
              ? "border-crm-error bg-crm-error/5"
              : "border-crm-hairline bg-crm-canvas"
          }`}
        >
          <h3
            className={`mb-4 flex items-center gap-2 text-sm font-bold ${
              pendingUsers.length > 0 ? "text-crm-error" : "text-crm-ink"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Pending memberships
            {pendingUsers.length > 0 && (
              <span className="rounded-full bg-crm-error px-2 py-0.5 text-[10px] text-white">
                {pendingUsers.length} waiting
              </span>
            )}
          </h3>
          {pendingUsers.length === 0 ? (
            <p className="text-xs text-crm-muted">No pending memberships.</p>
          ) : (
            pendingUsers.map((user: any) => (
              <div
                key={user.id}
                className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-crm-error/30 bg-crm-canvas p-3"
              >
                <div>
                  <p className="text-xs font-bold text-crm-ink">
                    {user.displayName}
                  </p>
                  <p className="text-[10px] text-crm-muted">
                    {user.email} · email {user.emailVerified ? "✓" : "—"} ·
                    phone{" "}
                    {user.phoneVerified
                      ? "✓"
                      : user.phoneVerificationDeferred
                        ? "deferred"
                        : "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <select
                    aria-label={`Access level for ${user.displayName}`}
                    value={roleFor(user)}
                    onChange={(event) =>
                      setApprovalRoles((current) => ({ ...current, [user.id]: event.target.value }))
                    }
                    className="max-w-[260px] rounded-lg border border-crm-hairline bg-crm-canvas px-2 py-1.5 text-[10px] text-crm-ink"
                  >
                    {ACCESS_ROLE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {user.suggestedRoles?.[0] === "company_admin" && (
                    <span className="text-[10px] font-semibold text-crm-warning">
                      Listed as this company's primary contact
                    </span>
                  )}
                  <button
                    disabled={
                      !user.emailVerified ||
                      (!user.phoneVerified && !user.phoneVerificationDeferred)
                    }
                    onClick={() =>
                      post("approve-member", {
                        uid: user.id,
                        roles: [roleFor(user)],
                      })
                    }
                    className="rounded-lg bg-crm-primary px-3 py-1.5 text-[10px] font-bold text-crm-on-primary hover:bg-crm-primary-active disabled:opacity-30"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}
      {tab === "approvals" && (
        <section className="rounded-xl border border-crm-hairline bg-crm-canvas p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-crm-ink">
            <UserPlus className="h-4 w-4 text-crm-muted" />
            Active portal users
          </h3>
          <p className="mb-4 text-[11px] text-crm-muted">
            Everyone who can sign in to the client portal. Change what someone can see, pause their
            access, or resend the welcome message (sign-in link and what they can do).
          </p>
          {activeUsers.length === 0 ? (
            <p className="text-xs text-crm-muted">No active portal users yet.</p>
          ) : (
            <div className="space-y-2">
              {activeUsers.map((user: any) => {
                const company =
                  data.organizations.find((org: any) => org.id === user.customerId)?.name || "Unknown company";
                const current = user.roles?.[0] || "project_viewer";
                const draft = accessDraft[user.id] ?? current;
                const paused = user.status === "suspended";
                const label = user.displayName || user.email;
                return (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crm-hairline bg-crm-surface-soft p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-crm-ink">
                        {label}
                        {paused && (
                          <span className="ml-2 rounded bg-crm-error/10 px-1.5 py-0.5 text-[9px] font-bold text-crm-error">
                            ACCESS PAUSED
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-crm-muted">
                        {user.email} · {company}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Access level for ${label}`}
                        value={draft}
                        onChange={(event) =>
                          setAccessDraft((currentDraft) => ({ ...currentDraft, [user.id]: event.target.value }))
                        }
                        className="max-w-[240px] rounded-lg border border-crm-hairline bg-crm-canvas px-2 py-1.5 text-[10px] text-crm-ink"
                      >
                        {ACCESS_ROLE_OPTIONS.map(([value, roleLabel]) => (
                          <option key={value} value={value}>{roleLabel}</option>
                        ))}
                      </select>
                      {draft !== current && (
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await post("update-member-access", { uid: user.id, change: "roles", roles: [draft] });
                            if (result.ok) {
                              setAccessDraft((d) => { const next = { ...d }; delete next[user.id]; return next; });
                              setNotice(`${label} is now: ${draft.replace(/_/g, " ")}.`);
                            }
                          }}
                          className="rounded-lg bg-crm-primary px-3 py-1.5 text-[10px] font-bold text-crm-on-primary hover:bg-crm-primary-active"
                        >
                          Save role
                        </button>
                      )}
                      {!paused && (
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await sendWelcome(user);
                            if (result) setNotice(`Welcome message sent to ${user.email}.`);
                          }}
                          className="rounded-lg border border-crm-hairline px-3 py-1.5 text-[10px] font-bold text-crm-ink hover:bg-crm-canvas"
                        >
                          Resend welcome
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await post("update-member-access", { uid: user.id, change: paused ? "restore" : "suspend" });
                          if (result.ok) setNotice(paused ? `${label}'s access was restored.` : `${label}'s access was paused.`);
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold ${paused ? "border-crm-hairline text-crm-ink" : "border-crm-error/30 text-crm-error"}`}
                      >
                        {paused ? "Restore access" : "Pause access"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {tab === "organizations" && (
        <ClientCompanyEditor organizations={data.organizations} post={post} />
      )}
      {tab === "settings" && (
        <ClientPortalConfiguration
          data={data}
          contractors={contractors}
          post={post}
        />
      )}
      {noteDialog && (
        <CrmModalShell
          title={
            noteDialog.status === "declined"
              ? "Decline request"
              : "Request clarification"
          }
          onClose={() => setNoteDialog(null)}
        >
          <p className="text-xs text-crm-muted">
            {noteDialog.request.requestNumber} · {noteDialog.request.siteName}
          </p>
          <label className="mt-4 block text-xs font-semibold text-crm-ink">
            {noteDialog.status === "declined"
              ? "Reason for declining"
              : "What clarification is needed?"}
            <textarea
              autoFocus
              rows={4}
              value={noteDialog.note}
              onChange={(e) =>
                setNoteDialog((d) => (d ? { ...d, note: e.target.value } : d))
              }
              className="mt-1 w-full rounded-lg border border-crm-hairline bg-crm-canvas p-3 text-sm font-normal text-crm-ink outline-none focus:border-crm-ink"
            />
          </label>
          <p className="mt-2 text-[11px] text-crm-muted">
            This note is emailed to the requester
            {noteDialog.request.requesterEmail
              ? ` (${noteDialog.request.requesterEmail})`
              : ""}
            .
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <CrmButton variant="secondary" onClick={() => setNoteDialog(null)}>
              Cancel
            </CrmButton>
            <CrmButton
              variant={noteDialog.status === "declined" ? "destructive" : "primary"}
              disabled={!noteDialog.note.trim() || savingNote}
              onClick={async () => {
                setSavingNote(true);
                const result = await post("request-status", {
                  requestId: noteDialog.request.id,
                  status: noteDialog.status,
                  reviewNote: noteDialog.note.trim(),
                });
                setSavingNote(false);
                if (result.ok) setNoteDialog(null);
              }}
            >
              {savingNote
                ? "Sending…"
                : noteDialog.status === "declined"
                  ? "Decline & notify"
                  : "Send request"}
            </CrmButton>
          </div>
        </CrmModalShell>
      )}
    </div>
  );
}
