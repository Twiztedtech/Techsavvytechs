import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  HardHat,
  Inbox,
  LayoutDashboard,
  MapPin,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, db } from "../lib/firebase";

type Module =
  | "dashboard"
  | "schedule"
  | "customers"
  | "quotes"
  | "jobs"
  | "invoices"
  | "catalog"
  | "assets"
  | "reports"
  | "reminders"
  | "audit";
const modules: {
  id: Module;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
}[] = [
  { id: "dashboard", label: "Operations", icon: LayoutDashboard },
  { id: "schedule", label: "Schedule & Dispatch", icon: CalendarDays },
  { id: "customers", label: "Customers & Sites", icon: Users },
  { id: "quotes", label: "Quotes", icon: FileText, count: 8 },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness, count: 14 },
  { id: "invoices", label: "Invoices", icon: ReceiptText, count: 6 },
  { id: "catalog", label: "Materials & Stock", icon: Boxes },
  { id: "assets", label: "Customer Assets", icon: Wrench },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "reminders", label: "Reminders", icon: Clock3 },
  { id: "audit", label: "Audit Trail", icon: ClipboardCheck },
];
const resources = [
  {
    name: "Marcus Johnson",
    trade: "Low Voltage",
    initials: "MJ",
    color: "bg-emerald-500",
    jobs: [
      { start: 1, span: 3, label: "WO-1842 · Ghilotti", tone: "green" },
      { start: 5, span: 2, label: "WO-1848 · Arden", tone: "orange" },
    ],
  },
  {
    name: "Elena Ruiz",
    trade: "Network Engineer",
    initials: "ER",
    color: "bg-sky-500",
    jobs: [
      { start: 0, span: 2, label: "WO-1839 · River City", tone: "blue" },
      { start: 3, span: 3, label: "WO-1851 · Sierra", tone: "green" },
    ],
  },
  {
    name: "Devon King",
    trade: "Security Systems",
    initials: "DK",
    color: "bg-violet-500",
    jobs: [{ start: 2, span: 3, label: "WO-1834 · Oak Park", tone: "purple" }],
  },
  {
    name: "Unassigned",
    trade: "Dispatch queue",
    initials: "—",
    color: "bg-slate-700",
    jobs: [{ start: 4, span: 2, label: "WO-1854 · Northgate", tone: "slate" }],
  },
];
const jobRows = [
  {
    no: "WO-2026-1842",
    customer: "Ghilotti Construction",
    site: "West Sacramento Yard",
    description: "MDF / IDF fiber backbone",
    stage: "In Progress",
    technician: "Marcus J.",
    due: "Aug 29",
    cost: "$18,460",
    margin: "38%",
  },
  {
    no: "WO-2026-1839",
    customer: "River City Dental",
    site: "Roseville Clinic",
    description: "Switch replacement & cutover",
    stage: "Scheduled",
    technician: "Elena R.",
    due: "Aug 30",
    cost: "$7,825",
    margin: "42%",
  },
  {
    no: "WO-2026-1834",
    customer: "Oak Park Storage",
    site: "Elk Grove Facility",
    description: "Camera commissioning",
    stage: "Field Complete",
    technician: "Devon K.",
    due: "Aug 29",
    cost: "$11,200",
    margin: "34%",
  },
  {
    no: "WO-2026-1854",
    customer: "Northgate Pediatrics",
    site: "Midtown Office",
    description: "Wireless site survey",
    stage: "New",
    technician: "Unassigned",
    due: "Sep 1",
    cost: "$1,450",
    margin: "51%",
  },
];
const activity = [
  {
    icon: CheckCircle2,
    title: "Job marked field complete",
    detail: "WO-2026-1834 · Oak Park Storage",
    time: "8 min ago",
    color: "text-tech-green",
  },
  {
    icon: PackageCheck,
    title: "Materials allocated",
    detail: "620 ft Cat6A added to WO-2026-1842",
    time: "24 min ago",
    color: "text-sky-500",
  },
  {
    icon: FileCheck2,
    title: "Quote accepted",
    detail: "QT-1028 · Sierra Commerce · $31,200",
    time: "42 min ago",
    color: "text-safety-orange",
  },
  {
    icon: Clock3,
    title: "Technician started travel",
    detail: "Elena Ruiz → River City Dental",
    time: "1 hr ago",
    color: "text-violet-500",
  },
];
const customers = [
  {
    name: "Ghilotti Construction",
    sites: 4,
    openJobs: 3,
    assets: 26,
    value: "$142,800",
    contact: "Dana Wu",
  },
  {
    name: "River City Dental",
    sites: 3,
    openJobs: 2,
    assets: 18,
    value: "$86,420",
    contact: "Chris Moore",
  },
  {
    name: "Oak Park Storage",
    sites: 6,
    openJobs: 1,
    assets: 64,
    value: "$74,210",
    contact: "Jordan Lee",
  },
  {
    name: "Sierra Commerce",
    sites: 2,
    openJobs: 1,
    assets: 8,
    value: "$58,900",
    contact: "Sam Patel",
  },
];
const tones: Record<string, string> = {
  sky: "border-sky-400/20 bg-sky-400/10 text-sky-600",
  orange: "border-orange-400/20 bg-orange-400/10 text-orange-600",
  green: "border-green-500/20 bg-green-500/10 text-green-700",
  violet: "border-violet-400/20 bg-violet-400/10 text-violet-600",
  red: "border-red-400/20 bg-red-400/10 text-red-600",
  blue: "border-sky-400/30 bg-sky-400/20 text-sky-800",
  purple: "border-violet-400/30 bg-violet-400/20 text-violet-800",
  slate: "border-slate-400/20 bg-slate-500/15 text-slate-700",
};

type LiveCustomer = {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  sites?: string[];
  assets?: number;
  lifetimeValue?: number;
  portalDelivery?: { status: string; email: string; sentAt: string; expiresAt?: string; revokedAt?: string };
  reminderPreferences?: { enabled?: boolean; appointment?: boolean; quote?: boolean; invoice?: boolean; maintenance?: boolean };
};
type LiveJob = {
  id: string;
  workOrderNumber?: string;
  name?: string;
  vendorName?: string;
  address?: string;
  status?: string;
  assignedTechName?: string;
  assignedTechId?: string;
  assignedTechIds?: string[];
  assignedTechNames?: string[];
  targetCompletion?: string;
  quotedValue?: number;
  margin?: number;
  notes?: string;
  hourlyRate?: number;
  estimatedHours?: number;
  actualHours?: number;
  equipment?: { description: string; quantity?: string; unitPrice?: number }[];
  scopeTasks?: string[];
  schedule?: { date?: string; start?: string; end?: string };
};
type LiveQuote = {
  id: string;
  quoteNumber?: string;
  customer: string;
  site: string;
  title: string;
  status: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  total: number;
  createdAt?: unknown;
  customerDelivery?: { status: string; email: string; sentAt: string };
};
type Technician = {
  id: string;
  name?: string;
  companyName?: string;
  specialty?: string;
  authUid?: string;
  accessStatus?: "Pending" | "Active" | "Suspended" | "Offboarded";
  active?: boolean;
};
type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  kind?: "labor" | "material" | "service";
};
type LiveInvoice = {
  id: string;
  invoiceNumber?: string;
  jobId?: string;
  workOrderNumber?: string;
  customer: string;
  site?: string;
  status: string;
  issueDate: string;
  dueDate: string;
  paymentTerms?: string;
  customerMessage?: string;
  discount?: number;
  lineItems: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  payments?: {
    amount: number;
    method: string;
    reference?: string;
    receivedAt: string;
  }[];
  qboSync?: {
    status: string;
    id?: string;
    syncToken?: string;
    lastSyncedAt?: string;
    lastReconciledAt?: string;
    reconciliationStatus?: string;
    error?: string;
  };
  customerDelivery?: { status: string; email: string; sentAt: string };
};
type BillingTimeEntry = {
  id: string; jobId?: string; technicianUid?: string; technicianName?: string; totalHours?: string | number; rate?: number;
  suppliesCost?: string | number; suppliesItems?: Array<{ description?: string; amount?: number; cost?: number }>;
  travelCost?: string | number; laborStatus?: string; suppliesStatus?: string; travelStatus?: string; status?: string; qboReadyAt?: string;
};
type CustomerAsset = {
  id: string;
  customerId: string;
  customerName: string;
  site: string;
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installDate?: string;
  warrantyExpiration?: string;
  status: "Active" | "Out of Service" | "Retired";
  maintenance?: {
    enabled: boolean;
    frequencyMonths: number;
    nextServiceDate: string;
    description: string;
    estimatedHours: number;
  };
  lastGeneratedDueDate?: string;
  serviceHistory?: {
    date: string;
    jobId?: string;
    workOrderNumber?: string;
    notes?: string;
  }[];
};

type AuditLog = {
  id: string;
  actorUid?: string;
  actorEmail?: string;
  actorLabel?: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  source?: string;
  createdAt?: unknown;
};
type ReminderDelivery = { id: string; type: string; entityId: string; email: string; status: string; manual?: boolean; sentAt?: string; createdAt?: string; error?: string };

async function recordAudit(action: string, entityType: string, entityId: string, summary: string, details: Record<string, unknown> = {}) {
  const user = auth.currentUser;
  try {
    await addDoc(collection(db, "audit_logs"), {
      actorUid: user?.uid || null,
      actorEmail: user?.email || "Administrator",
      actorLabel: user?.email || "Administrator",
      action,
      entityType,
      entityId,
      summary,
      details,
      source: "crm",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}

export default function CRM() {
  const [module, setModule] = useState<Module>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState<
    "checking" | "signed-out" | "denied" | "admin"
  >("checking");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [liveCustomers, setLiveCustomers] = useState<LiveCustomer[]>([]);
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([]);
  const [liveQuotes, setLiveQuotes] = useState<LiveQuote[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [liveInvoices, setLiveInvoices] = useState<LiveInvoice[]>([]);
  const [billingTimeEntries, setBillingTimeEntries] = useState<BillingTimeEntry[]>([]);
  const [assets, setAssets] = useState<CustomerAsset[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reminderDeliveries, setReminderDeliveries] = useState<ReminderDelivery[]>([]);
  const [createType, setCreateType] = useState<"customer" | "job" | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [scheduleJob, setScheduleJob] = useState<LiveJob | null>(null);
  const [selectedJob, setSelectedJob] = useState<LiveJob | null>(null);
  const [invoiceJob, setInvoiceJob] = useState<LiveJob | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<LiveInvoice | null>(
    null,
  );
  const [assetOpen, setAssetOpen] = useState(false);
  const assignableTechnicians = technicians.filter(
    (technician) =>
      technician.accessStatus === undefined ||
      (technician.accessStatus === "Active" && technician.active !== false),
  );
  const currentLabel = modules.find((item) => item.id === module)?.label;
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setAccess("signed-out");
          return;
        }
        let token = await user.getIdTokenResult();
        if (token.claims.admin !== true) {
          const response = await fetch("/api/admin/bootstrap", {
            method: "POST",
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          });
          if (response.ok) token = await user.getIdTokenResult(true);
        }
        setAccess(token.claims.admin === true ? "admin" : "denied");
      }),
    [],
  );
  useEffect(() => {
    if (access !== "admin") return;
    const stopCustomers = onSnapshot(collection(db, "customers"), (snapshot) =>
      setLiveCustomers(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as LiveCustomer,
        ),
      ),
    );
    const stopJobs = onSnapshot(collection(db, "jobs"), (snapshot) =>
      setLiveJobs(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as LiveJob)
          .filter((item) => item.status !== "voided"),
      ),
    );
    const stopQuotes = onSnapshot(collection(db, "quotes"), (snapshot) =>
      setLiveQuotes(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as LiveQuote,
        ),
      ),
    );
    const stopTechnicians = onSnapshot(
      collection(db, "contractors"),
      (snapshot) =>
        setTechnicians(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Technician,
          ),
        ),
    );
    const stopInvoices = onSnapshot(collection(db, "invoices"), (snapshot) =>
      setLiveInvoices(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as LiveInvoice,
        ),
      ),
    );
    const stopBillingTimeEntries = onSnapshot(collection(db, "time_entries"), (snapshot) => setBillingTimeEntries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as BillingTimeEntry)));
    const stopAssets = onSnapshot(
      collection(db, "customer_assets"),
      (snapshot) =>
        setAssets(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as CustomerAsset,
          ),
        ),
    );
    const stopAuditLogs = onSnapshot(collection(db, "audit_logs"), (snapshot) =>
      setAuditLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as AuditLog)),
    );
    const stopReminderDeliveries = onSnapshot(collection(db, "reminder_deliveries"), (snapshot) =>
      setReminderDeliveries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ReminderDelivery)),
    );
    return () => {
      stopCustomers();
      stopJobs();
      stopQuotes();
      stopTechnicians();
      stopInvoices();
      stopBillingTimeEntries();
      stopAssets();
      stopAuditLogs();
      stopReminderDeliveries();
    };
  }, [access]);
  const jobsForTable = useMemo(
    () =>
      liveJobs
        .map((job) => ({
          no: job.workOrderNumber || job.id,
          customer: job.vendorName || "Customer not assigned",
          site: job.address || "Site address pending",
          description: job.name || "Untitled work order",
          stage: job.status || "New",
          technician: job.assignedTechName || "Unassigned",
          due: job.targetCompletion || "Not set",
          cost: job.quotedValue
            ? `$${job.quotedValue.toLocaleString()}`
            : "Not costed",
          margin: job.margin ? `${job.margin}%` : "—",
        }))
        .filter((job) =>
          Object.values(job)
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    [liveJobs, query],
  );
  const liveLifecycle = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const invoicedJobs = new Set(liveInvoices.map((invoice) => invoice.jobId).filter(Boolean));
    const newJobs = liveJobs.filter((job) => (job.status || "New") === "New");
    const pendingQuotes = liveQuotes.filter((quote) => !["Accepted", "Rejected"].includes(quote.status));
    const activeJobs = liveJobs.filter((job) => !["Complete", "Completed", "Closed", "Cancelled"].includes(job.status || ""));
    const readyToInvoice = liveJobs.filter((job) => job.status === "Ready to Invoice" && !invoicedJobs.has(job.id));
    const overdue = liveInvoices.filter((invoice) => invoice.balance > 0 && invoice.dueDate && new Date(`${invoice.dueDate}T00:00:00`) < today);
    const currency = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    return [
      { label: "New requests", value: newJobs.length, icon: Inbox, tone: "sky", sub: `${newJobs.filter((job) => !job.assignedTechId && !job.assignedTechName).length} unassigned` },
      { label: "Quotes pending", value: pendingQuotes.length, icon: FileText, tone: "orange", sub: currency(pendingQuotes.reduce((sum, quote) => sum + Number(quote.total || 0), 0)) },
      { label: "Jobs in progress", value: activeJobs.length, icon: HardHat, tone: "green", sub: `${activeJobs.filter((job) => job.schedule?.date).length} scheduled` },
      { label: "Ready to invoice", value: readyToInvoice.length, icon: ReceiptText, tone: "violet", sub: currency(readyToInvoice.reduce((sum, job) => sum + Number(job.quotedValue || 0), 0)) },
      { label: "Overdue", value: overdue.length, icon: AlertTriangle, tone: "red", sub: currency(overdue.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0)) },
    ];
  }, [liveInvoices, liveJobs, liveQuotes]);
  const go = (target: Module) => {
    setModule(target);
    setMobileNav(false);
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setIsSigningIn(true);
    setLoginError("");
    try {
      await signInWithEmailAndPassword(
        auth,
        login.email.trim(),
        login.password,
      );
    } catch {
      setLoginError(
        "The email or password is incorrect, or this account does not have CRM access.",
      );
    } finally {
      setIsSigningIn(false);
    }
  };
  if (access !== "admin")
    return (
      <AccessGate
        access={access}
        login={login}
        setLogin={setLogin}
        error={loginError}
        pending={isSigningIn}
        onSubmit={submitLogin}
      />
    );
  return (
    <div className="min-h-screen bg-[#f3f5f4] text-slate-900">
      <header className="sticky top-0 z-40 flex h-14 items-center border-b border-white/10 bg-[#101812] px-3 text-white shadow-lg lg:px-5">
        <button
          onClick={() => setMobileNav(!mobileNav)}
          className="mr-2 rounded p-2 text-slate-400 lg:hidden"
          aria-label="Toggle CRM navigation"
        >
          {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-3 border-r border-white/10 pr-4">
          <span className="grid h-8 w-8 place-items-center rounded bg-tech-green text-brand-black">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-xs uppercase tracking-wider">
              TechSavvy
            </p>
            <p className="text-[9px] uppercase tracking-[.22em] text-tech-green">
              Field Operations
            </p>
          </div>
        </div>
        <div className="hidden flex-1 items-center px-5 md:flex">
          <label className="flex w-full max-w-xl items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
              placeholder="Search customers, sites, jobs, quotes, assets…"
            />
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCreateType("job")}
            className="hidden items-center gap-2 rounded border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-300 sm:flex"
          >
            <Plus className="h-3.5 w-3.5" /> Quick create
          </button>
          <button className="rounded p-2 text-slate-400">
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => void signOut(auth)}
            className="grid h-8 w-8 place-items-center rounded-full bg-safety-orange text-[10px] font-bold text-brand-black"
            title="Sign out"
          >
            TT
          </button>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <aside
          className={`${mobileNav ? "fixed inset-y-14 left-0 z-30 flex" : "hidden"} w-64 flex-col border-r border-slate-200 bg-white shadow-xl lg:static lg:flex lg:shadow-none`}
        >
          <div className="border-b border-slate-100 p-3">
            <button
              onClick={() =>
                setCreateType(module === "customers" ? "customer" : "job")
              }
              className="flex w-full items-center justify-between rounded bg-tech-green px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-brand-black"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Create new
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {modules.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-xs font-medium ${module === id ? "bg-[#e8f7ed] text-tech-green-deep" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {count ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">
                    {count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-tech-green" /> Live
              operations sync
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="border-b border-slate-200 bg-white px-4 py-4 lg:px-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
                  <span>Field Operations</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-tech-green-deep">{currentLabel}</span>
                </div>
                <h1 className="mt-1 font-display text-xl uppercase tracking-tight">
                  {currentLabel}
                </h1>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">
                  <Archive className="h-3.5 w-3.5" /> Export
                </button>
                <button
                  onClick={() =>
                    setCreateType(module === "customers" ? "customer" : "job")
                  }
                  className="flex items-center gap-2 rounded bg-[#17251b] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Add{" "}
                  {module === "customers" ? "customer" : "job"}
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-5 p-4 lg:p-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {liveLifecycle.map(({ label, value, icon: Icon, tone, sub }) => (
                <button
                  key={label}
                  className="rounded border border-slate-200 bg-white p-4 text-left shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {label}
                    </span>
                    <span className={`rounded border p-1.5 ${tones[tone as keyof typeof tones]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="font-display text-2xl">{value}</span>
                    <span className="text-[10px] text-slate-400">{sub}</span>
                  </div>
                </button>
              ))}
            </section>
            {module === "schedule" ? (
              <>
                <LiveSchedulingQueue
                  jobs={liveJobs}
                  onSchedule={setScheduleJob}
                />
                <LiveScheduleBoard
                  jobs={liveJobs}
                  technicians={assignableTechnicians}
                  onSchedule={setScheduleJob}
                />
              </>
            ) : module === "customers" ? (
              <CustomersView
                customers={liveCustomers}
                jobs={liveJobs}
                onCreate={() => setCreateType("customer")}
              />
            ) : module === "quotes" ? (
              <QuotesView
                quotes={liveQuotes}
                onCreate={() => setQuoteOpen(true)}
              />
            ) : module === "jobs" ? (
              <LiveJobsView
                jobs={liveJobs}
                onOpen={setSelectedJob}
                onSchedule={setScheduleJob}
              />
            ) : module === "invoices" ? (
              <InvoicesView
                invoices={liveInvoices}
                jobs={liveJobs}
                timeEntries={billingTimeEntries}
                onCreate={setInvoiceJob}
                onPayment={setPaymentInvoice}
              />
            ) : module === "assets" ? (
              <AssetsView assets={assets} onCreate={() => setAssetOpen(true)} />
            ) : module === "reports" ? (
              <ReportsView
                jobs={liveJobs}
                quotes={liveQuotes}
                invoices={liveInvoices}
                assets={assets}
                technicians={technicians}
              />
            ) : module === "audit" ? (
              <AuditTrailView logs={auditLogs} />
            ) : module === "reminders" ? (
              <RemindersView customers={liveCustomers} jobs={liveJobs} quotes={liveQuotes} invoices={liveInvoices} assets={assets} deliveries={reminderDeliveries} />
            ) : module === "dashboard" ? (
              <DashboardView jobs={jobsForTable} go={go} />
            ) : (
              <WorkModuleView module={module} jobs={jobsForTable} />
            )}
          </div>
        </main>
      </div>
      {createType && (
        <CreateRecordModal
          type={createType}
          customers={liveCustomers}
          onClose={() => setCreateType(null)}
        />
      )}
      {quoteOpen && (
        <QuoteModal
          customers={liveCustomers}
          onClose={() => setQuoteOpen(false)}
        />
      )}
      {scheduleJob && (
        <ScheduleModal
          job={scheduleJob}
          technicians={assignableTechnicians}
          onClose={() => setScheduleJob(null)}
        />
      )}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
      {invoiceJob && (
        <InvoiceModal job={invoiceJob} timeEntries={billingTimeEntries.filter((entry)=>entry.jobId===invoiceJob.id)} onClose={() => setInvoiceJob(null)} />
      )}
      {paymentInvoice && (
        <PaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
        />
      )}
      {assetOpen && (
        <AssetModal
          customers={liveCustomers}
          onClose={() => setAssetOpen(false)}
        />
      )}
    </div>
  );
}

function ScheduleView() {
  const hours = [
    "7 AM",
    "8 AM",
    "9 AM",
    "10 AM",
    "11 AM",
    "12 PM",
    "1 PM",
    "2 PM",
  ];
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-bold">Dispatch board</h2>
          <p className="mt-1 text-[10px] text-slate-400">
            Saturday, August 29 · Sacramento region
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded border border-slate-200 p-2">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button className="rounded border border-slate-200 px-3 text-[10px] font-semibold">
            Today
          </button>
          <button className="rounded border border-slate-200 p-2">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <div className="min-w-[950px]">
          <div className="grid grid-cols-[190px_repeat(8,minmax(90px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="border-r border-slate-200 px-4 py-3 text-[9px] font-bold uppercase text-slate-400">
              Technician
            </div>
            {hours.map((h) => (
              <div
                key={h}
                className="border-r border-slate-200 py-3 text-center text-[9px] text-slate-400"
              >
                {h}
              </div>
            ))}
          </div>
          {resources.map((r) => (
            <div
              key={r.name}
              className="grid min-h-20 grid-cols-[190px_repeat(8,minmax(90px,1fr))] border-b border-slate-100"
            >
              <div className="flex items-center gap-3 border-r border-slate-200 px-4">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full ${r.color} text-[9px] font-bold text-white`}
                >
                  {r.initials}
                </span>
                <div>
                  <p className="text-[11px] font-semibold">{r.name}</p>
                  <p className="text-[9px] text-slate-400">{r.trade}</p>
                </div>
              </div>
              <div className="relative col-span-8 grid grid-cols-8 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px)] bg-[size:12.5%_100%]">
                {r.jobs.map((j) => (
                  <div
                    key={j.label}
                    style={{ gridColumn: `${j.start + 1} / span ${j.span}` }}
                    className={`m-2 flex items-center rounded border px-3 text-[10px] font-semibold ${tones[j.tone]}`}
                  >
                    <Truck className="mr-2 h-3.5 w-3.5" />
                    {j.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardView({
  jobs,
  go,
}: {
  jobs: typeof jobRows;
  go: (m: Module) => void;
}) {
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
        <JobTable jobs={jobs} onAll={() => go("jobs")} />
        <section className="rounded border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 p-4">
            <div>
              <h2 className="text-sm font-bold">Live activity</h2>
              <p className="text-[10px] text-slate-400">
                Office and field updates
              </p>
            </div>
            <Activity className="h-4 w-4 text-tech-green" />
          </header>
          <div className="divide-y divide-slate-100">
            {activity.map(({ icon: Icon, title, detail, time, color }) => (
              <div key={title} className="flex gap-3 p-4">
                <span className="grid h-8 w-8 place-items-center rounded bg-slate-50">
                  <Icon className={`h-4 w-4 ${color}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold">{title}</p>
                  <p className="truncate text-[10px] text-slate-400">
                    {detail}
                  </p>
                  <p className="text-[9px] text-slate-300">{time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <MiniPanel
          icon={CircleDollarSign}
          title="Job profitability"
          value="38.6%"
          detail="Average gross margin"
          progress={72}
        />
        <MiniPanel
          icon={ClipboardCheck}
          title="Quote conversion"
          value="68%"
          detail="24 accepted of 35"
          progress={68}
        />
        <MiniPanel
          icon={ShieldCheck}
          title="Asset compliance"
          value="92%"
          detail="118 of 128 current"
          progress={92}
        />
      </div>
    </>
  );
}

function JobTable({
  jobs,
  onAll,
}: {
  jobs: typeof jobRows;
  onAll?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <h2 className="text-sm font-bold">Job control</h2>
          <p className="text-[10px] text-slate-400">
            Cost, schedule and delivery status
          </p>
        </div>
        <button
          onClick={onAll}
          className="text-[10px] font-semibold text-tech-green-deep"
        >
          View all jobs
        </button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase text-slate-400">
            <tr>
              {[
                "Job / Customer",
                "Site",
                "Stage",
                "Technician",
                "Due",
                "Value / Margin",
                "",
              ].map((h) => (
                <th key={h} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((j) => (
              <tr key={j.no} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-mono text-[9px] text-tech-green-deep">
                    {j.no}
                  </p>
                  <p className="text-[11px] font-semibold">{j.customer}</p>
                  <p className="text-[9px] text-slate-400">{j.description}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-[10px]">{j.site}</p>
                  <p className="flex items-center gap-1 text-[9px] text-slate-400">
                    <MapPin className="h-3 w-3" />
                    Sacramento region
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px]">
                    {j.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-[10px]">{j.technician}</td>
                <td className="px-4 py-3 text-[10px]">{j.due}</td>
                <td className="px-4 py-3">
                  <p className="text-[10px] font-semibold">{j.cost}</p>
                  <p className="text-[9px] text-tech-green-deep">
                    {j.margin} margin
                  </p>
                </td>
                <td className="px-4 py-3">
                  <MoreHorizontal className="h-4 w-4 text-slate-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomersView({
  customers: records,
  jobs,
  onCreate,
}: {
  customers: LiveCustomer[];
  jobs: LiveJob[];
  onCreate: () => void;
}) {
  const [inviting, setInviting] = useState("");
  const [managing, setManaging] = useState("");
  const [portalDays, setPortalDays] = useState(90);
  const invite = async (customer: LiveCustomer) => {
    setInviting(customer.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/contact?operation=send-customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerId: customer.id, expiresInDays: portalDays }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Portal invitation could not be sent.");
      alert(`Customer portal sent to ${result.email}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Portal invitation could not be sent.");
    } finally {
      setInviting("");
    }
  };
  const managePortal = async (customer: LiveCustomer, action: "preview" | "revoke") => {
    if (action === "revoke" && !confirm(`Revoke portal access for ${customer.name}? Their current link will stop working immediately.`)) return;
    setManaging(`${action}-${customer.id}`);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/contact?operation=manage-customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerId: customer.id, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Portal access could not be updated.");
      if (action === "preview") window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Portal access could not be updated.");
    } finally {
      setManaging("");
    }
  };
  return (
    <section className="rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-bold">Customer card files</h2>
          <p className="text-[10px] text-slate-400">
            Live contacts, sites, assets and transaction history
          </p>
        </div>
        <label className="flex items-center gap-2 text-[9px] font-bold uppercase text-slate-400">New access expires<select value={portalDays} onChange={(event) => setPortalDays(Number(event.target.value))} className="rounded border border-slate-200 px-2 py-1.5 text-[10px] font-semibold normal-case text-slate-700"><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option></select></label>
      </header>
      {records.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {records.map((c) => {
            const openJobs = jobs.filter(
              (job) => job.vendorName === c.name,
            ).length;
            return (
              <article
                key={c.id}
                className="rounded border border-slate-200 p-4 hover:border-tech-green/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded bg-[#e8f7ed] text-tech-green-deep">
                  <Building2 className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-xs font-bold">{c.name}</h3>
                <p className="text-[10px] text-slate-400">
                  Primary: {c.contact || "Not set"}
                </p>
                {(() => {
                  const expiresAt = c.portalDelivery?.expiresAt;
                  const expired = Boolean(expiresAt && expiresAt < new Date().toISOString());
                  const revoked = c.portalDelivery?.status === "revoked";
                  const active = c.portalDelivery?.status === "sent" && !expired;
                  return <div className="mt-3 flex items-center justify-between rounded bg-slate-50 px-2.5 py-2"><span className={`text-[8px] font-bold uppercase ${active ? "text-green-700" : revoked ? "text-red-600" : "text-slate-400"}`}>{active ? "Portal active" : revoked ? "Portal revoked" : expired ? "Portal expired" : "Not invited"}</span><span className="text-[8px] text-slate-400">{active && expiresAt ? `Expires ${new Date(expiresAt).toLocaleDateString()}` : c.portalDelivery?.email || ""}</span></div>;
                })()}
                <div className="mt-4 grid grid-cols-3 border-y border-slate-100 py-3 text-center">
                  <div>
                    <b className="block text-xs">{c.sites?.length || 0}</b>
                    <span className="text-[8px] text-slate-400">SITES</span>
                  </div>
                  <div>
                    <b className="block text-xs">{openJobs}</b>
                    <span className="text-[8px] text-slate-400">JOBS</span>
                  </div>
                  <div>
                    <b className="block text-xs">{c.assets || 0}</b>
                    <span className="text-[8px] text-slate-400">ASSETS</span>
                  </div>
                </div>
                <div className="mt-3 flex justify-between text-[9px]">
                  <span className="text-slate-400">Lifetime value</span>
                  <b className="text-tech-green-deep">
                    ${(c.lifetimeValue || 0).toLocaleString()}
                  </b>
                </div>
                <button
                  onClick={() => void invite(c)}
                  disabled={inviting === c.id || !c.email}
                  className="mt-3 w-full rounded border border-tech-green/30 bg-[#e8f7ed] px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-tech-green-deep disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {inviting === c.id ? "Sending…" : c.portalDelivery?.status === "sent" ? "Resend portal access" : "Invite to customer portal"}
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => void managePortal(c, "preview")} disabled={managing === `preview-${c.id}`} className="rounded border border-slate-200 px-2 py-2 text-[8px] font-bold uppercase text-slate-600 disabled:opacity-40">{managing === `preview-${c.id}` ? "Opening…" : "Admin preview"}</button>
                  <button onClick={() => void managePortal(c, "revoke")} disabled={managing === `revoke-${c.id}` || c.portalDelivery?.status !== "sent"} className="rounded border border-red-200 px-2 py-2 text-[8px] font-bold uppercase text-red-600 disabled:opacity-30">{managing === `revoke-${c.id}` ? "Revoking…" : "Revoke access"}</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          label="No customers yet"
          detail="Create your first customer card to begin building sites and jobs."
          onCreate={onCreate}
        />
      )}
    </section>
  );
}

function RemindersView({ customers, jobs, quotes, invoices, assets, deliveries }: { customers: LiveCustomer[]; jobs: LiveJob[]; quotes: LiveQuote[]; invoices: LiveInvoice[]; assets: CustomerAsset[]; deliveries: ReminderDelivery[] }) {
  const [sending, setSending] = useState("");
  const [preferenceCustomer, setPreferenceCustomer] = useState("");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const maintenanceLimit = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const items = [
    ...jobs.filter((job) => (job.schedule?.date || job.targetCompletion) === tomorrow).map((job) => ({ type: "appointment", id: job.id, title: job.workOrderNumber || job.id, detail: `${job.vendorName || "Customer"} · ${job.schedule?.date || job.targetCompletion}` })),
    ...quotes.filter((quote) => ["Pending", "Sent", "Draft"].includes(quote.status)).map((quote) => ({ type: "quote", id: quote.id, title: quote.quoteNumber || quote.id, detail: `${quote.customer} · ${quote.total.toLocaleString(undefined, { style: "currency", currency: "USD" })}` })),
    ...invoices.filter((invoice) => invoice.balance > 0 && invoice.dueDate && new Date(`${invoice.dueDate}T00:00:00`) < today).map((invoice) => ({ type: "invoice", id: invoice.id, title: invoice.invoiceNumber || invoice.id, detail: `${invoice.customer} · ${invoice.balance.toLocaleString(undefined, { style: "currency", currency: "USD" })} overdue` })),
    ...assets.filter((asset) => asset.status === "Active" && asset.maintenance?.enabled && asset.maintenance.nextServiceDate >= today.toISOString().slice(0, 10) && asset.maintenance.nextServiceDate <= maintenanceLimit).map((asset) => ({ type: "maintenance", id: asset.id, title: asset.name, detail: `${asset.customerName} · due ${asset.maintenance?.nextServiceDate}` })),
  ];
  const send = async (item: { type: string; id: string }) => {
    setSending(`${item.type}-${item.id}`);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/contact?operation=send-reminder", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ type: item.type, entityId: item.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Reminder could not be sent.");
      alert(`Reminder sent to ${result.email}.`);
    } catch (error) { alert(error instanceof Error ? error.message : "Reminder could not be sent."); }
    finally { setSending(""); }
  };
  const selected = customers.find((customer) => customer.id === preferenceCustomer);
  const togglePreference = async (key: "enabled" | "appointment" | "quote" | "invoice" | "maintenance") => {
    if (!selected) return;
    const current = selected.reminderPreferences || {};
    const next = { ...current, [key]: current[key] === false };
    await updateDoc(doc(db, "customers", selected.id), { reminderPreferences: next, updatedAt: serverTimestamp() });
    await recordAudit("reminder-preferences-updated", "customer", selected.id, `Updated reminder preferences for ${selected.name}`, { preference: key, enabled: next[key] });
  };
  const recent = [...deliveries].sort((a, b) => String(b.sentAt || b.createdAt || "").localeCompare(String(a.sentAt || a.createdAt || ""))).slice(0, 12);
  return <div className="space-y-5">
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded bg-[#e8f7ed] text-tech-green-deep"><Clock3 className="h-5 w-5"/></span><div><h2 className="text-sm font-bold">Automated customer reminders</h2><p className="mt-1 text-[10px] text-slate-400">Daily at 8:00 AM Pacific · appointments, quotes, overdue invoices and recurring maintenance</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-4">{["appointment", "quote", "invoice", "maintenance"].map((type) => <div key={type} className="rounded bg-slate-50 p-3"><p className="text-[8px] font-bold uppercase text-slate-400">{type}</p><p className="mt-1 font-display text-xl">{items.filter((item) => item.type === type).length}</p><p className="text-[8px] text-slate-400">currently actionable</p></div>)}</div></section>
    <div className="grid gap-5 xl:grid-cols-2"><section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 p-4"><h3 className="text-sm font-bold">Send reminder now</h3><p className="mt-1 text-[9px] text-slate-400">Manual sends are separately recorded and do not disable scheduled duplicate protection.</p></header>{items.length ? <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">{items.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 p-4"><div><span className="rounded bg-slate-100 px-2 py-1 text-[8px] font-bold uppercase text-slate-500">{item.type}</span><p className="mt-2 text-[11px] font-bold">{item.title}</p><p className="mt-1 text-[9px] text-slate-400">{item.detail}</p></div><button onClick={() => void send(item)} disabled={sending === `${item.type}-${item.id}`} className="whitespace-nowrap rounded bg-[#17251b] px-3 py-2 text-[9px] font-bold text-white disabled:opacity-40">{sending === `${item.type}-${item.id}` ? "Sending…" : "Send now"}</button></div>)}</div> : <ReportEmpty text="No reminders currently require action."/>}</section>
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-bold">Customer preferences</h3><p className="mt-1 text-[9px] text-slate-400">All reminder types are enabled unless explicitly turned off.</p><select value={preferenceCustomer} onChange={(event) => setPreferenceCustomer(event.target.value)} className="mt-4 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>{selected && <div className="mt-4 divide-y divide-slate-100">{(["enabled", "appointment", "quote", "invoice", "maintenance"] as const).map((key) => { const enabled = selected.reminderPreferences?.[key] !== false; return <button key={key} onClick={() => void togglePreference(key)} className="flex w-full items-center justify-between py-3 text-left"><span className="text-[10px] font-semibold capitalize">{key === "enabled" ? "All reminders" : `${key} reminders`}</span><span className={`rounded-full px-2.5 py-1 text-[8px] font-bold uppercase ${enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Enabled" : "Off"}</span></button>; })}</div>}</section></div>
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 p-4"><h3 className="text-sm font-bold">Recent reminder delivery</h3></header>{recent.length ? <div className="divide-y divide-slate-100">{recent.map((delivery) => <div key={delivery.id} className="grid gap-2 p-4 sm:grid-cols-[120px_1fr_120px] sm:items-center"><span className="text-[8px] font-bold uppercase text-slate-400">{delivery.type}{delivery.manual ? " · manual" : ""}</span><div><p className="text-[10px] font-semibold">{delivery.email}</p>{delivery.error && <p className="mt-1 text-[8px] text-red-600">{delivery.error}</p>}</div><span className={`text-[9px] font-bold uppercase sm:text-right ${delivery.status === "sent" ? "text-green-700" : delivery.status === "failed" ? "text-red-600" : "text-orange-600"}`}>{delivery.status}</span></div>)}</div> : <ReportEmpty text="No reminders have been delivered yet."/>}</section>
  </div>;
}

function AuditTrailView({ logs }: { logs: AuditLog[] }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const timestamp = (value: unknown) => {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate();
    const date = new Date(typeof value === "string" ? value : 0);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  };
  const visible = logs
    .filter((log) => filter === "all" || log.entityType === filter)
    .filter((log) => `${log.summary} ${log.actorEmail} ${log.action} ${log.entityType}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => timestamp(b.createdAt).getTime() - timestamp(a.createdAt).getTime());
  const categories = Array.from(new Set(logs.map((log) => log.entityType).filter(Boolean))).sort();
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.18em] text-tech-green-deep"><ShieldCheck className="h-3.5 w-3.5" /> Immutable history</div>
          <h2 className="mt-2 text-base font-bold">Administrator audit trail</h2>
          <p className="mt-1 text-[10px] text-slate-400">Creation, changes, approvals, scheduling, billing, customer delivery and QuickBooks activity.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity…" className="rounded border border-slate-200 px-3 py-2 text-xs outline-none focus:border-tech-green" />
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded border border-slate-200 px-3 py-2 text-xs"><option value="all">All records</option>{categories.map((category) => <option key={category} value={category}>{category.replace(/-/g, " ")}</option>)}</select>
        </div>
      </header>
      {visible.length ? <div className="divide-y divide-slate-100">{visible.slice(0, 250).map((log) => {
        const date = timestamp(log.createdAt);
        return <article key={log.id} className="grid gap-3 p-4 sm:grid-cols-[150px_1fr_180px] sm:items-center">
          <div><p className="text-[10px] font-semibold text-slate-600">{date.getTime() ? date.toLocaleDateString() : "Pending"}</p><p className="text-[9px] text-slate-400">{date.getTime() ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Saving…"}</p></div>
          <div><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-[#e8f7ed] px-2 py-1 text-[8px] font-bold uppercase text-tech-green-deep">{log.entityType}</span><span className="text-[9px] font-semibold uppercase text-slate-400">{log.action.replace(/-/g, " ")}</span></div><p className="mt-2 text-[11px] font-semibold">{log.summary}</p>{log.entityId && <p className="mt-1 font-mono text-[8px] text-slate-400">{log.entityId}</p>}</div>
          <div className="sm:text-right"><p className="truncate text-[10px] font-semibold">{log.actorLabel || log.actorEmail || "System"}</p><p className="mt-1 text-[8px] uppercase text-slate-400">{log.source || "CRM"}</p></div>
        </article>;
      })}</div> : <div className="grid min-h-56 place-items-center p-6 text-center"><div><ClipboardCheck className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-xs font-semibold">No matching audit activity</p><p className="mt-1 text-[10px] text-slate-400">New administrator actions will appear here automatically.</p></div></div>}
    </section>
  );
}

function ReportsView({
  jobs,
  quotes,
  invoices,
  assets,
  technicians,
}: {
  jobs: LiveJob[];
  quotes: LiveQuote[];
  invoices: LiveInvoice[];
  assets: CustomerAsset[];
  technicians: Technician[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const money = (value = 0) =>
    value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const accepted = quotes.filter((quote) => quote.status === "Accepted");
  const decidedQuotes = quotes.filter((quote) => ["Accepted", "Rejected"].includes(quote.status));
  const quoteConversion = decidedQuotes.length ? (accepted.length / decidedQuotes.length) * 100 : 0;
  const receivables = invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.balance || 0)), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.balance > 0 && invoice.dueDate && new Date(`${invoice.dueDate}T00:00:00`) < today);
  const overdueBalance = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
  const billed = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const collected = invoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid || 0), 0);
  const activeJobs = jobs.filter((job) => !["Complete", "Completed", "Cancelled", "Closed"].includes(job.status || ""));
  const completedJobs = jobs.filter((job) => ["Complete", "Completed", "Closed"].includes(job.status || ""));
  const marginJobs = jobs.filter((job) => Number.isFinite(Number(job.margin)) && Number(job.margin) !== 0);
  const averageMargin = marginJobs.length ? marginJobs.reduce((sum, job) => sum + Number(job.margin || 0), 0) / marginJobs.length : 0;
  const unassigned = activeJobs.filter((job) => !job.assignedTechId && !job.assignedTechName).length;
  const maintenanceAssets = assets.filter((asset) => asset.maintenance?.enabled);
  const dueMaintenance = maintenanceAssets.filter((asset) => asset.maintenance?.nextServiceDate && new Date(`${asset.maintenance.nextServiceDate}T00:00:00`) <= new Date(today.getTime() + 30 * 86400000));

  const stages = ["New", "Scheduled", "In Progress", "Complete"].map((label) => ({
    label,
    value: jobs.filter((job) => {
      const status = (job.status || "New").toLowerCase();
      if (label === "In Progress") return status.includes("progress") || status.includes("onsite") || status.includes("on site");
      if (label === "Complete") return status.includes("complete") || status.includes("closed");
      return status === label.toLowerCase();
    }).length,
  }));
  const maxStage = Math.max(1, ...stages.map((stage) => stage.value));
  const workloads = technicians.map((technician) => {
    const name = technician.name || technician.companyName || "Technician";
    const assigned = activeJobs.filter((job) => job.assignedTechIds?.includes(technician.id) || job.assignedTechId === technician.id || job.assignedTechName === name);
    const scheduledHours = assigned.reduce((sum, job) => sum + Number(job.estimatedHours || 0), 0);
    return { id: technician.id, name, jobs: assigned.length, hours: scheduledHours };
  }).sort((a, b) => b.jobs - a.jobs);
  const aging = [
    { label: "Current", min: -Infinity, max: 0 },
    { label: "1–30 days", min: 1, max: 30 },
    { label: "31–60 days", min: 31, max: 60 },
    { label: "61+ days", min: 61, max: Infinity },
  ].map((bucket) => ({
    label: bucket.label,
    value: invoices.reduce((sum, invoice) => {
      if (!invoice.balance) return sum;
      const due = invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`) : today;
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
      return days >= bucket.min && days <= bucket.max ? sum + Number(invoice.balance) : sum;
    }, 0),
  }));
  const maxAging = Math.max(1, ...aging.map((bucket) => bucket.value));

  const exportCsv = () => {
    const rows = [
      ["TechSavvy live operations report", new Date().toISOString()],
      ["Active jobs", activeJobs.length],
      ["Completed jobs", completedJobs.length],
      ["Unassigned jobs", unassigned],
      ["Average job margin", `${averageMargin.toFixed(1)}%`],
      ["Quote conversion", `${quoteConversion.toFixed(1)}%`],
      ["Total billed", billed],
      ["Collected", collected],
      ["Receivables", receivables],
      ["Overdue receivables", overdueBalance],
      ["Maintenance due within 30 days", dueMaintenance.length],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `techsavvy-operations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-3 rounded border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.18em] text-tech-green-deep"><Activity className="h-3.5 w-3.5" /> Live Firestore data</div>
          <h2 className="mt-2 text-base font-bold">Operational performance</h2>
          <p className="mt-1 text-[10px] text-slate-400">Updated automatically from CRM jobs, quotes, invoices, technicians and assets.</p>
        </div>
        <button onClick={exportCsv} className="flex items-center justify-center gap-2 rounded bg-[#17251b] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-white"><Archive className="h-3.5 w-3.5" /> Download snapshot</button>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <ReportKpi label="Active jobs" value={String(activeJobs.length)} detail={`${unassigned} unassigned`} tone={unassigned ? "orange" : "green"} />
        <ReportKpi label="Average margin" value={`${averageMargin.toFixed(1)}%`} detail={`${marginJobs.length} costed jobs`} tone={averageMargin >= 30 ? "green" : "orange"} />
        <ReportKpi label="Quote conversion" value={`${quoteConversion.toFixed(1)}%`} detail={`${accepted.length} accepted of ${decidedQuotes.length} decided`} tone="sky" />
        <ReportKpi label="Receivables" value={money(receivables)} detail={`${money(overdueBalance)} overdue`} tone={overdueBalance ? "red" : "green"} />
        <ReportKpi label="Maintenance due" value={String(dueMaintenance.length)} detail={`Next 30 days · ${maintenanceAssets.length} plans`} tone={dueMaintenance.length ? "violet" : "green"} />
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportPanel title="Job pipeline" subtitle={`${jobs.length} total work orders`}>
          <div className="space-y-4">{stages.map((stage) => <ReportBar key={stage.label} label={stage.label} value={stage.value} width={(stage.value / maxStage) * 100} display={String(stage.value)} />)}</div>
        </ReportPanel>
        <ReportPanel title="Accounts receivable aging" subtitle={`${money(collected)} collected of ${money(billed)} billed`}>
          <div className="space-y-4">{aging.map((bucket) => <ReportBar key={bucket.label} label={bucket.label} value={bucket.value} width={(bucket.value / maxAging) * 100} display={money(bucket.value)} danger={bucket.label === "61+ days" && bucket.value > 0} />)}</div>
        </ReportPanel>
        <ReportPanel title="Technician workload" subtitle="Active assigned work and estimated hours">
          {workloads.length ? <div className="divide-y divide-slate-100">{workloads.slice(0, 8).map((tech) => <div key={tech.id} className="flex items-center justify-between py-3"><div><p className="text-[11px] font-bold">{tech.name}</p><p className="text-[9px] text-slate-400">{tech.hours ? `${tech.hours.toFixed(1)} estimated hours` : "Hours not estimated"}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${tech.jobs >= 5 ? "bg-red-100 text-red-700" : tech.jobs ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>{tech.jobs} jobs</span></div>)}</div> : <ReportEmpty text="No technician records are available." />}
        </ReportPanel>
        <ReportPanel title="Maintenance forecast" subtitle="Recurring customer service due within 30 days">
          {dueMaintenance.length ? <div className="divide-y divide-slate-100">{dueMaintenance.slice(0, 8).map((asset) => <div key={asset.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-[11px] font-bold">{asset.name}</p><p className="text-[9px] text-slate-400">{asset.customerName} · {asset.site}</p></div><span className="whitespace-nowrap text-[9px] font-bold text-tech-green-deep">{asset.maintenance?.nextServiceDate}</span></div>)}</div> : <ReportEmpty text="No recurring maintenance is due in the next 30 days." />}
        </ReportPanel>
      </div>
      {overdueInvoices.length > 0 && <ReportPanel title="Receivables requiring attention" subtitle={`${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}`}><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Balance</th></tr></thead><tbody className="divide-y divide-slate-100">{overdueInvoices.map((invoice) => <tr key={invoice.id}><td className="px-3 py-3 text-[10px] font-bold">{invoice.invoiceNumber || invoice.id}</td><td className="px-3 py-3 text-[10px]">{invoice.customer}</td><td className="px-3 py-3 text-[10px] text-red-600">{invoice.dueDate}</td><td className="px-3 py-3 text-right text-[10px] font-bold">{money(invoice.balance)}</td></tr>)}</tbody></table></div></ReportPanel>}
    </div>
  );
}

function ReportKpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: keyof typeof tones }) {
  return <section className="rounded border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><span className={`h-2 w-2 rounded-full border ${tones[tone]}`} /></div><p className="mt-3 font-display text-xl">{value}</p><p className="mt-1 text-[9px] text-slate-400">{detail}</p></section>;
}
function ReportPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded border border-slate-200 bg-white p-5 shadow-sm"><header className="mb-5 border-b border-slate-100 pb-4"><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-[9px] text-slate-400">{subtitle}</p></header>{children}</section>;
}
function ReportBar({ label, width, display, danger = false }: { key?: string; label: string; value: number; width: number; display: string; danger?: boolean }) {
  return <div><div className="mb-1.5 flex justify-between text-[10px]"><span className="font-semibold text-slate-600">{label}</span><b>{display}</b></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${danger ? "bg-red-500" : "bg-tech-green"}`} style={{ width: `${Math.max(width, width > 0 ? 3 : 0)}%` }} /></div></div>;
}
function ReportEmpty({ text }: { text: string }) { return <div className="grid min-h-36 place-items-center rounded border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-[10px] text-slate-400">{text}</div>; }

function WorkModuleView({
  module,
  jobs,
}: {
  module: Module;
  jobs: typeof jobRows;
}) {
  if (module === "jobs") return <JobTable jobs={jobs} />;
  const config: Record<
    string,
    {
      icon: typeof FileText;
      title: string;
      description: string;
      stats: [string, string][];
    }
  > = {
    quotes: {
      icon: FileText,
      title: "Quote & estimate workspace",
      description:
        "Build labor, materials, service fees and options, then convert accepted work directly into jobs.",
      stats: [
        ["Draft", "3"],
        ["Awaiting approval", "5"],
        ["Accepted this month", "12"],
        ["Quoted value", "$128K"],
      ],
    },
    invoices: {
      icon: ReceiptText,
      title: "Billing & payments",
      description:
        "Turn completed work into itemized invoices with labor, materials and purchase orders reconciled.",
      stats: [
        ["Ready to invoice", "5"],
        ["Sent", "8"],
        ["Overdue", "3"],
        ["Receivable", "$38.4K"],
      ],
    },
    catalog: {
      icon: Boxes,
      title: "Materials, stock & purchasing",
      description:
        "Manage catalog pricing, warehouse and truck stock, supplier purchase orders and job allocations.",
      stats: [
        ["Catalog items", "1,248"],
        ["Low stock", "14"],
        ["Open POs", "6"],
        ["Stock value", "$82.6K"],
      ],
    },
    assets: {
      icon: Wrench,
      title: "Customer asset management",
      description:
        "Track installed equipment by site, maintenance schedules, serial numbers and service history.",
      stats: [
        ["Assets", "128"],
        ["Due service", "10"],
        ["Overdue", "4"],
        ["Compliance", "92%"],
      ],
    },
    reports: {
      icon: BarChart3,
      title: "Operations & financial reporting",
      description:
        "Monitor job profitability, technician productivity, quote conversion and labor recovery.",
      stats: [
        ["Gross margin", "38.6%"],
        ["Labor utilization", "84%"],
        ["Quote conversion", "68%"],
        ["Revenue MTD", "$94.2K"],
      ],
    },
  };
  const item = config[module] ?? config.quotes;
  const Icon = item.icon;
  return (
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex gap-4 border-b border-slate-100 pb-5">
        <span className="grid h-11 w-11 place-items-center rounded bg-[#e8f7ed] text-tech-green-deep">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-bold">{item.title}</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            {item.description}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {item.stats.map(([l, v]) => (
          <div
            key={l}
            className="rounded border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-[9px] font-semibold uppercase text-slate-400">
              {l}
            </p>
            <p className="mt-2 font-display text-xl">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid min-h-56 place-items-center rounded border border-dashed border-slate-200 bg-slate-50 text-center">
        <div>
          <Icon className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-xs font-semibold">
            Select or create a record to begin
          </p>
          <p className="text-[10px] text-slate-400">
            Ready for your live operational data.
          </p>
        </div>
      </div>
    </section>
  );
}
function MiniPanel({
  icon: Icon,
  title,
  value,
  detail,
  progress,
}: {
  icon: typeof CircleDollarSign;
  title: string;
  value: string;
  detail: string;
  progress: number;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-tech-green-deep" />
          <h3 className="text-[11px] font-bold">{title}</h3>
        </div>
        <span className="font-display text-lg">{value}</span>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-tech-green"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-[9px] text-slate-400">{detail}</p>
    </section>
  );
}

function QuotesView({
  quotes,
  onCreate,
}: {
  quotes: LiveQuote[];
  onCreate: () => void;
}) {
  const [working, setWorking] = useState("");
  const emailQuote = async (quote: LiveQuote) => {
    setWorking(`email-${quote.id}`);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(
        "/api/contact?operation=send-customer-document",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: "quote", documentId: quote.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Quote email could not be sent.");
      alert(`Quote sent to ${result.email}.`);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Quote email could not be sent.",
      );
    } finally {
      setWorking("");
    }
  };
  const convert = async (quote: LiveQuote) => {
    setWorking(quote.id);
    try {
      const created = await addDoc(collection(db, "jobs"), {
        workOrderNumber: `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,
        sourceQuoteId: quote.id,
        vendorName: quote.customer,
        name: quote.title,
        address: quote.site,
        status: "New",
        quotedValue: quote.total,
        equipment: quote.lineItems.map((item) => ({
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: item.unitPrice,
        })),
        assignedTechIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "quotes", quote.id), {
        status: "Converted",
        convertedJobId: created.id,
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAudit("converted", "quote", quote.id, `Converted ${quote.quoteNumber || quote.id} to job ${created.id}`, { jobId: created.id, customer: quote.customer });
    } finally {
      setWorking("");
    }
  };
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <h2 className="text-sm font-bold">Quotes & estimates</h2>
          <p className="text-[10px] text-slate-400">
            Live pricing, approval and job conversion
          </p>
        </div>
        <button
          onClick={onCreate}
          className="rounded bg-[#17251b] px-3 py-2 text-[10px] font-bold text-white"
        >
          <Plus className="mr-1 inline h-3 w-3" /> New quote
        </button>
      </header>
      {quotes.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400">
              <tr>
                {[
                  "Quote",
                  "Customer / Site",
                  "Scope",
                  "Status",
                  "Total",
                  "Action",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-3 font-mono text-[10px] text-tech-green-deep">
                    {q.quoteNumber || q.id}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[11px] font-semibold">{q.customer}</p>
                    <p className="text-[9px] text-slate-400">{q.site}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[10px]">{q.title}</p>
                    <p className="text-[9px] text-slate-400">
                      {q.lineItems?.length || 0} line items
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-orange-50 px-2 py-1 text-[9px] text-orange-700">
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-bold">
                    ${(q.total || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        disabled={
                          working === `email-${q.id}` ||
                          q.status === "Converted"
                        }
                        onClick={() => void emailQuote(q)}
                        className="rounded border border-slate-200 px-2 py-1.5 text-[9px] font-bold disabled:opacity-40"
                      >
                        {working === `email-${q.id}`
                          ? "Sending…"
                          : q.customerDelivery?.status === "sent"
                            ? "Resend"
                            : "Email"}
                      </button>
                      <button
                        disabled={q.status !== "Accepted" || working === q.id}
                        onClick={() => void convert(q)}
                        title={
                          q.status !== "Accepted"
                            ? "Customer approval is required before job conversion."
                            : "Create work order"
                        }
                        className="rounded bg-tech-green px-3 py-1.5 text-[9px] font-bold text-brand-black disabled:opacity-40"
                      >
                        {q.status === "Converted"
                          ? "Job created"
                          : working === q.id
                            ? "Converting…"
                            : "Create job"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          label="No quotes yet"
          detail="Create an itemized estimate and convert it into a work order when accepted."
          onCreate={onCreate}
        />
      )}
    </section>
  );
}

function LiveSchedulingQueue({
  jobs,
  onSchedule,
}: {
  jobs: LiveJob[];
  onSchedule: (job: LiveJob) => void;
}) {
  const queue = jobs.filter((job) => !job.assignedTechName);
  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Live dispatch queue</h2>
          <p className="text-[10px] text-slate-400">
            Jobs awaiting a technician or schedule
          </p>
        </div>
        <span className="rounded-full bg-orange-50 px-2 py-1 text-[9px] font-bold text-orange-700">
          {queue.length} unassigned
        </span>
      </div>
      {queue.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {queue.map((job) => (
            <button
              key={job.id}
              onClick={() => onSchedule(job)}
              className="min-w-52 rounded border border-slate-200 p-3 text-left hover:border-tech-green"
            >
              <p className="font-mono text-[9px] text-tech-green-deep">
                {job.workOrderNumber || job.id}
              </p>
              <p className="mt-1 text-[11px] font-semibold">
                {job.name || "Untitled job"}
              </p>
              <p className="mt-1 text-[9px] text-slate-400">
                {job.vendorName || "Customer pending"}
              </p>
              <span className="mt-2 inline-block text-[9px] font-bold text-tech-green-deep">
                Assign & schedule →
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-slate-400">
          All active jobs have a technician assignment.
        </p>
      )}
    </section>
  );
}

function LiveScheduleBoard({
  jobs,
  technicians,
  onSchedule,
}: {
  jobs: LiveJob[];
  technicians: Technician[];
  onSchedule: (job: LiveJob) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const hours = Array.from({ length: 10 }, (_, i) => `${i + 7}:00`);
  const scheduled = jobs.filter(
    (job) => job.schedule?.date === date && (job.assignedTechIds?.length || job.assignedTechId),
  );
  const position = (time = "08:00") =>
    Math.max(
      0,
      Math.min(10, Number(time.slice(0, 2)) + Number(time.slice(3)) / 60 - 7),
    );
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-bold">Live schedule board</h2>
          <p className="text-[10px] text-slate-400">
            Assignments update in real time across CRM and contractor operations
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-slate-200 px-3 py-2 text-xs"
        />
      </header>
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[190px_1fr] border-b border-slate-200 bg-slate-50">
            <div className="border-r border-slate-200 px-4 py-3 text-[9px] font-bold uppercase text-slate-400">
              Technician
            </div>
            <div className="grid grid-cols-10">
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-r border-slate-200 py-3 text-center text-[9px] text-slate-400"
                >
                  {h}
                </div>
              ))}
            </div>
          </div>
          {technicians.map((tech) => {
            const techJobs = scheduled.filter(
              (job) => job.assignedTechIds?.includes(tech.id) || job.assignedTechId === tech.id,
            );
            return (
              <div
                key={tech.id}
                className="grid min-h-20 grid-cols-[190px_1fr] border-b border-slate-100"
              >
                <div className="flex items-center gap-3 border-r border-slate-200 px-4">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-tech-green-deep text-[9px] font-bold text-white">
                    {(tech.name || tech.companyName || "T")
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold">
                      {tech.name || tech.companyName || "Technician"}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {tech.specialty || "Field technician"}
                    </p>
                  </div>
                </div>
                <div className="relative bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px)] bg-[size:10%_100%]">
                  {techJobs.map((job) => {
                    const left = position(job.schedule?.start) * 10;
                    const width = Math.max(
                      5,
                      (position(job.schedule?.end) -
                        position(job.schedule?.start)) *
                        10,
                    );
                    return (
                      <button
                        key={job.id}
                        onClick={() => onSchedule(job)}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className="absolute top-2 bottom-2 overflow-hidden rounded border border-green-500/30 bg-green-100 px-2 text-left text-[9px] font-semibold text-green-800"
                      >
                        <span className="block truncate">
                          {job.workOrderNumber || job.id}
                        </span>
                        <span className="block truncate font-normal">
                          {job.vendorName}
                        </span>
                        <span className="block truncate font-normal">
                          {job.schedule?.start}–{job.schedule?.end}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!technicians.length && (
            <div className="p-8 text-center text-xs text-slate-400">
              Add contractors in the Contractor Portal before scheduling jobs.
            </div>
          )}
        </div>
      </div>
      <footer className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[9px] text-slate-400">
        {scheduled.length} scheduled job{scheduled.length === 1 ? "" : "s"} on
        this date · Click a block to reassign or reschedule
      </footer>
    </section>
  );
}

function LiveJobsView({
  jobs,
  onOpen,
  onSchedule,
}: {
  jobs: LiveJob[];
  onOpen: (job: LiveJob) => void;
  onSchedule: (job: LiveJob) => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <h2 className="text-sm font-bold">Detailed job records</h2>
          <p className="text-[10px] text-slate-400">
            Scope, labor, materials, cost, schedule and field status
          </p>
        </div>
        <span className="text-[10px] text-slate-400">{jobs.length} active</span>
      </header>
      {jobs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400">
              <tr>
                {[
                  "Work order",
                  "Customer / Site",
                  "Status",
                  "Technician",
                  "Schedule",
                  "Quoted",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onOpen(job)}
                      className="font-mono text-[10px] font-bold text-tech-green-deep hover:underline"
                    >
                      {job.workOrderNumber || job.id}
                    </button>
                    <p className="mt-1 text-[10px]">
                      {job.name || "Untitled job"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[10px] font-semibold">
                      {job.vendorName || "Not assigned"}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {job.address || "Address pending"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px]">
                      {job.status || "New"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px]">
                    {job.assignedTechName || "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-[9px]">
                    {job.schedule?.date ? (
                      <>
                        {job.schedule.date}
                        <br />
                        {job.schedule.start}–{job.schedule.end}
                      </>
                    ) : (
                      "Not scheduled"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[10px] font-semibold">
                    ${(job.quotedValue || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onOpen(job)}
                        className="rounded border border-slate-200 px-2 py-1.5 text-[9px] font-bold"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => onSchedule(job)}
                        className="rounded bg-[#17251b] px-2 py-1.5 text-[9px] font-bold text-white"
                      >
                        Schedule
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-10 text-center text-xs text-slate-400">
          No active jobs yet. Create one directly or convert an accepted quote.
        </div>
      )}
    </section>
  );
}

function JobDetailModal({
  job,
  onClose,
}: {
  job: LiveJob;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: job.name || "",
    customer: job.vendorName || "",
    address: job.address || "",
    status: job.status || "New",
    notes: job.notes || "",
    quotedValue: String(job.quotedValue || ""),
    hourlyRate: String(job.hourlyRate || ""),
    estimatedHours: String(job.estimatedHours || ""),
    actualHours: String(job.actualHours || ""),
  });
  const [materials, setMaterials] = useState(
    job.equipment?.length
      ? job.equipment.map((item) => ({
          description: item.description,
          quantity: item.quantity || "1",
          unitPrice: String(item.unitPrice || ""),
        }))
      : [{ description: "", quantity: "1", unitPrice: "" }],
  );
  const [tasks, setTasks] = useState(
    job.scopeTasks?.length ? job.scopeTasks : [""],
  );
  const [saving, setSaving] = useState(false);
  const materialCost = materials.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const laborCost =
    Number(form.actualHours || form.estimatedHours || 0) *
    Number(form.hourlyRate || 0);
  const quoted = Number(form.quotedValue || 0);
  const margin = quoted
    ? Math.round(((quoted - laborCost - materialCost) / quoted) * 100)
    : 0;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, "jobs", job.id), {
        name: form.name.trim(),
        vendorName: form.customer.trim(),
        address: form.address.trim(),
        status: form.status,
        notes: form.notes.trim(),
        quotedValue: quoted,
        hourlyRate: Number(form.hourlyRate || 0),
        estimatedHours: Number(form.estimatedHours || 0),
        actualHours: Number(form.actualHours || 0),
        equipment: materials
          .filter((x) => x.description.trim())
          .map((x) => ({
            description: x.description.trim(),
            quantity: x.quantity,
            unitPrice: Number(x.unitPrice || 0),
          })),
        scopeTasks: tasks.map((x) => x.trim()).filter(Boolean),
        estimatedCost: laborCost + materialCost,
        margin,
        updatedAt: serverTimestamp(),
      });
      await recordAudit("updated", "job", job.id, `Updated job ${job.workOrderNumber || job.id}`, { status: form.status, margin });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={save}
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between border-b border-slate-100 pb-5">
          <div>
            <p className="font-mono text-[9px] text-tech-green-deep">
              {job.workOrderNumber || job.id}
            </p>
            <h2 className="mt-1 font-display text-xl uppercase">Job details</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field
            label="Job name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
          />
          <Field
            label="Customer"
            value={form.customer}
            onChange={(v) => setForm({ ...form, customer: v })}
            required
          />
          <div className="sm:col-span-2">
            <Field
              label="Site address"
              value={form.address}
              onChange={(v) => setForm({ ...form, address: v })}
            />
          </div>
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              {[
                "New",
                "Scheduled",
                "In Progress",
                "On Hold",
                "Field Complete",
                "Ready to Invoice",
                "Complete",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <Field
            label="Quoted value"
            value={form.quotedValue}
            onChange={(v) => setForm({ ...form, quotedValue: v })}
            type="number"
          />
          <Field
            label="Hourly cost"
            value={form.hourlyRate}
            onChange={(v) => setForm({ ...form, hourlyRate: v })}
            type="number"
          />
          <Field
            label="Estimated labor hours"
            value={form.estimatedHours}
            onChange={(v) => setForm({ ...form, estimatedHours: v })}
            type="number"
          />
          <Field
            label="Actual labor hours"
            value={form.actualHours}
            onChange={(v) => setForm({ ...form, actualHours: v })}
            type="number"
          />
          <label className="sm:col-span-2 text-[9px] font-bold uppercase text-slate-500">
            Job and site notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className="mt-1.5 w-full rounded border border-slate-200 p-3 text-xs outline-none focus:border-tech-green"
            />
          </label>
        </div>
        <div className="mt-6">
          <div className="flex justify-between">
            <h3 className="text-[10px] font-bold uppercase text-slate-500">
              Materials & equipment
            </h3>
            <button
              type="button"
              onClick={() =>
                setMaterials([
                  ...materials,
                  { description: "", quantity: "1", unitPrice: "" },
                ])
              }
              className="text-[9px] font-bold text-tech-green-deep"
            >
              + Add material
            </button>
          </div>
          {materials.map((item, index) => (
            <div
              key={index}
              className="mt-2 grid grid-cols-[1fr_70px_100px_24px] gap-2"
            >
              <input
                value={item.description}
                onChange={(e) =>
                  setMaterials(
                    materials.map((x, i) =>
                      i === index ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Description"
                className="rounded border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                value={item.quantity}
                onChange={(e) =>
                  setMaterials(
                    materials.map((x, i) =>
                      i === index ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Qty"
                className="rounded border border-slate-200 px-2 text-xs"
              />
              <input
                type="number"
                value={item.unitPrice}
                onChange={(e) =>
                  setMaterials(
                    materials.map((x, i) =>
                      i === index ? { ...x, unitPrice: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Unit cost"
                className="rounded border border-slate-200 px-2 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  setMaterials(materials.filter((_, i) => i !== index))
                }
                className="text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="flex justify-between">
            <h3 className="text-[10px] font-bold uppercase text-slate-500">
              Scope tasks
            </h3>
            <button
              type="button"
              onClick={() => setTasks([...tasks, ""])}
              className="text-[9px] font-bold text-tech-green-deep"
            >
              + Add task
            </button>
          </div>
          {tasks.map((task, index) => (
            <div key={index} className="mt-2 flex gap-2">
              <input
                value={task}
                onChange={(e) =>
                  setTasks(
                    tasks.map((x, i) => (i === index ? e.target.value : x)),
                  )
                }
                placeholder="Installation step or deliverable"
                className="flex-1 rounded border border-slate-200 px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => setTasks(tasks.filter((_, i) => i !== index))}
                className="text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 rounded bg-slate-50 p-4 text-center">
          <div>
            <p className="text-[9px] uppercase text-slate-400">Labor cost</p>
            <b className="text-sm">${laborCost.toLocaleString()}</b>
          </div>
          <div>
            <p className="text-[9px] uppercase text-slate-400">Material cost</p>
            <b className="text-sm">${materialCost.toLocaleString()}</b>
          </div>
          <div>
            <p className="text-[9px] uppercase text-slate-400">Est. margin</p>
            <b
              className={
                margin >= 30
                  ? "text-sm text-green-700"
                  : "text-sm text-orange-600"
              }
            >
              {margin}%
            </b>
          </div>
        </div>
        <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-slate-100 bg-white py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded bg-[#17251b] px-5 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save job"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InvoicesView({
  invoices,
  jobs,
  timeEntries,
  onCreate,
  onPayment,
}: {
  invoices: LiveInvoice[];
  jobs: LiveJob[];
  timeEntries: BillingTimeEntry[];
  onCreate: (job: LiveJob) => void;
  onPayment: (invoice: LiveInvoice) => void;
}) {
  const invoicedJobs = new Set(
    invoices.map((invoice) => invoice.jobId).filter(Boolean),
  );
  const [earlyBilling, setEarlyBilling] = useState(false);
  const billingReadyJobs = jobs.filter((job) => job.status === "Ready to Invoice" && !invoicedJobs.has(job.id));
  const overrideJobs = jobs.filter((job) => job.status !== "Ready to Invoice" && !invoicedJobs.has(job.id));
  const candidates = earlyBilling ? [...billingReadyJobs, ...overrideJobs] : billingReadyJobs;
  const [syncing, setSyncing] = useState("");
  const [delivering, setDelivering] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [refreshingReadiness, setRefreshingReadiness] = useState(false);
  const money = (value = 0) =>
    value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  const syncToQuickBooks = async (invoice: LiveInvoice) => {
    setSyncing(invoice.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(
        "/api/admin/quickbooks/status?operation=sync-invoice",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ invoiceId: invoice.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "QuickBooks synchronization failed.");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "QuickBooks synchronization failed.",
      );
    } finally {
      setSyncing("");
    }
  };
  const emailInvoice = async (invoice: LiveInvoice) => {
    setDelivering(invoice.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(
        "/api/contact?operation=send-customer-document",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: "invoice", documentId: invoice.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Invoice email could not be sent.");
      alert(`Invoice sent to ${result.email}.`);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Invoice email could not be sent.",
      );
    } finally {
      setDelivering("");
    }
  };
  const reconcileInvoices = async () => {
    setReconciling(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin/quickbooks/status?operation=reconcile-invoices", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "QuickBooks reconciliation failed.");
      alert(`QuickBooks reconciliation complete: ${result.checked} checked, ${result.updated} balance${result.updated === 1 ? "" : "s"} changed.`);
    } catch (error) { alert(error instanceof Error ? error.message : "QuickBooks reconciliation failed."); }
    finally { setReconciling(false); }
  };
  const refreshBillingReadiness = async () => {
    setRefreshingReadiness(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'refresh_billing_readiness' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Billing readiness could not be refreshed.');
      alert(`Billing review complete: ${result.checked} jobs checked, ${result.ready} ready to invoice.`);
    } catch (error) { alert(error instanceof Error ? error.message : 'Billing readiness could not be refreshed.'); }
    finally { setRefreshingReadiness(false); }
  };
  const download = async (invoice: LiveInvoice) => {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    pdf.setFillColor(11, 15, 12);
    pdf.rect(0, 0, 210, 32, "F");
    pdf.setTextColor(34, 197, 94);
    pdf.setFontSize(18);
    pdf.text("TECHSAVVY", 16, 18);
    pdf.setFontSize(9);
    pdf.setTextColor(220, 225, 221);
    pdf.text("FIELD SERVICES INVOICE", 16, 25);
    pdf.setTextColor(20, 25, 22);
    pdf.setFontSize(18);
    pdf.text("INVOICE", 155, 52);
    pdf.setFontSize(10);
    pdf.text(invoice.invoiceNumber || invoice.id, 155, 60);
    pdf.setFontSize(9);
    pdf.setTextColor(90, 100, 94);
    pdf.text(`Issue: ${invoice.issueDate}`, 155, 67);
    pdf.text(`Due: ${invoice.dueDate}`, 155, 73);
    pdf.setTextColor(20, 25, 22);
    pdf.setFontSize(11);
    pdf.text("Bill To", 16, 48);
    pdf.setFontSize(10);
    pdf.text(invoice.customer, 16, 57);
    pdf.setTextColor(90, 100, 94);
    pdf.text(invoice.site || "Address on file", 16, 64, { maxWidth: 100 });
    let y = 88;
    pdf.setFillColor(235, 240, 236);
    pdf.rect(16, y - 7, 178, 9, "F");
    pdf.setTextColor(40, 50, 43);
    pdf.text("Description", 19, y);
    pdf.text("Qty", 135, y);
    pdf.text("Rate", 153, y);
    pdf.text("Amount", 174, y);
    y += 10;
    invoice.lineItems.forEach((item) => {
      pdf.setTextColor(30, 35, 31);
      pdf.text(item.description, 19, y, { maxWidth: 105 });
      pdf.text(String(item.quantity), 137, y);
      pdf.text(money(item.unitPrice), 151, y);
      pdf.text(money(item.quantity * item.unitPrice), 174, y);
      y += 9;
    });
    y += 4;
    pdf.setDrawColor(220, 225, 221);
    pdf.line(125, y, 194, y);
    y += 8;
    pdf.text("Subtotal", 145, y);
    pdf.text(money(invoice.subtotal), 174, y);
    y += 7;
    pdf.text(`Tax (${invoice.taxRate}%)`, 145, y);
    pdf.text(money(invoice.tax), 174, y);
    y += 8;
    pdf.setFontSize(12);
    pdf.text("Total", 145, y);
    pdf.text(money(invoice.total), 174, y);
    y += 8;
    pdf.setTextColor(21, 128, 61);
    pdf.text("Balance Due", 135, y);
    pdf.text(money(invoice.balance), 174, y);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 110, 103);
    pdf.text(
      "Thank you for choosing TechSavvy. Payment is due according to the terms shown above.",
      16,
      280,
    );
    pdf.save(`${invoice.invoiceNumber || "TechSavvy-Invoice"}.pdf`);
  };
  return (
    <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-bold">Invoices & payments</h2>
          <p className="text-[10px] text-slate-400">
            Generate billing from job labor and materials, then track collection
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={()=>void refreshBillingReadiness()} disabled={refreshingReadiness} className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-[9px] font-bold text-violet-700 disabled:opacity-40">{refreshingReadiness ? 'Checking…' : 'Refresh billing readiness'}</button>
        <label className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-bold text-amber-800"><input type="checkbox" checked={earlyBilling} onChange={(event)=>setEarlyBilling(event.target.checked)} className="accent-amber-500"/>Early billing override</label>
        <button onClick={() => void reconcileInvoices()} disabled={reconciling} className="rounded border border-tech-green/30 bg-[#e8f7ed] px-3 py-2 text-[10px] font-bold text-tech-green-deep disabled:opacity-40">{reconciling ? "Reconciling…" : "Reconcile QuickBooks"}</button>
        <select
          defaultValue=""
          onChange={(e) => {
            const job = jobs.find((item) => item.id === e.target.value);
            if (job) onCreate(job);
            e.currentTarget.value = "";
          }}
          className="rounded bg-[#17251b] px-3 py-2 text-[10px] font-bold text-white"
        >
          <option value="" disabled>
            {candidates.length ? "Create invoice from billing-ready job" : earlyBilling ? "No uninvoiced jobs available" : "No billing-ready jobs"}
          </option>
          {candidates.map((job) => (
            <option key={job.id} value={job.id}>
              {job.workOrderNumber || job.id} · {job.vendorName || job.name}{job.status !== "Ready to Invoice" ? ` · OVERRIDE (${job.status || "New"})` : ""}
            </option>
          ))}
        </select>
        </div>
      </header>
      {invoices.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400">
              <tr>
                {[
                  "Invoice",
                  "Customer / Job",
                  "Issued / Due",
                  "Status",
                  "Total",
                  "Paid",
                  "Balance",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-[10px] font-bold text-tech-green-deep">
                    {invoice.invoiceNumber || invoice.id}
                    {invoice.qboSync?.lastReconciledAt && <span className="mt-1 block font-sans text-[8px] font-normal text-slate-400">QB checked {new Date(invoice.qboSync.lastReconciledAt).toLocaleDateString()}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[10px] font-semibold">
                      {invoice.customer}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {invoice.workOrderNumber}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[9px]">
                    {invoice.issueDate}
                    <br />
                    <span className="text-slate-400">
                      Due {invoice.dueDate}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] ${invoice.status === "Paid" ? "bg-green-50 text-green-700" : invoice.status === "Partially Paid" ? "bg-sky-50 text-sky-700" : invoice.status === "Overdue" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] font-semibold">
                    {money(invoice.total)}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-green-700">
                    {money(invoice.amountPaid)}
                  </td>
                  <td className="px-4 py-3 text-[10px] font-bold">
                    {money(invoice.balance)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        disabled={delivering === invoice.id}
                        onClick={() => void emailInvoice(invoice)}
                        className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[9px] font-bold text-sky-700 disabled:opacity-50"
                      >
                        {delivering === invoice.id
                          ? "Sending…"
                          : invoice.customerDelivery?.status === "sent"
                            ? "Resend"
                            : "Email"}
                      </button>
                      <button
                        disabled={
                          syncing === invoice.id ||
                          invoice.qboSync?.status === "synced"
                        }
                        onClick={() => void syncToQuickBooks(invoice)}
                        title={
                          invoice.qboSync?.error ||
                          "Export to QuickBooks Online"
                        }
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[9px] font-bold text-emerald-700 disabled:opacity-50"
                      >
                        {invoice.qboSync?.status === "synced"
                          ? "QB synced"
                          : syncing === invoice.id
                            ? "Syncing…"
                            : "Sync QB"}
                      </button>
                      <button
                        onClick={() => void download(invoice)}
                        className="rounded border border-slate-200 px-2 py-1.5 text-[9px] font-bold"
                      >
                        PDF
                      </button>
                      <button
                        disabled={invoice.balance <= 0}
                        onClick={() => onPayment(invoice)}
                        className="rounded bg-tech-green px-2 py-1.5 text-[9px] font-bold text-brand-black disabled:opacity-30"
                      >
                        Payment
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-64 place-items-center p-6 text-center">
          <div>
            <ReceiptText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-xs font-semibold">No invoices yet</p>
            <p className="mt-1 text-[10px] text-slate-400">
              Choose a completed job above to generate the first invoice.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function InvoiceModal({ job, timeEntries, onClose }: { job: LiveJob; timeEntries: BillingTimeEntry[]; onClose: () => void }) {
  const approvedEntries = timeEntries.filter((entry)=>entry.status==='approved' && entry.qboReadyAt);
  const laborHours = approvedEntries.reduce((sum, entry)=>sum+(entry.laborStatus==='approved'?Number(entry.totalHours||0):0),0) || job.actualHours || job.estimatedHours || 0;
  const defaultItems: InvoiceLine[] = [];
  if (laborHours)
    defaultItems.push({
      description: `Field labor · ${job.name || "Service work"}`,
      quantity: laborHours,
      unitPrice: job.hourlyRate || 0,
      kind: "labor",
    });
  approvedEntries.forEach((entry, index) => {
    if (entry.travelStatus === 'approved' && Number(entry.travelCost || 0) > 0) defaultItems.push({ description: `Approved travel${entry.technicianName ? ` · ${entry.technicianName}` : ` ${index + 1}`}`, quantity: 1, unitPrice: Number(entry.travelCost), kind: 'service' });
    if (entry.suppliesStatus === 'approved' && Number(entry.suppliesCost || 0) > 0) defaultItems.push({ description: `Approved field supplies${entry.technicianName ? ` · ${entry.technicianName}` : ` ${index + 1}`}`, quantity: 1, unitPrice: Number(entry.suppliesCost), kind: 'material' });
  });
  (job.equipment || []).forEach((item) =>
    defaultItems.push({
      description: item.description,
      quantity: Number(item.quantity || 1),
      unitPrice: item.unitPrice || 0,
      kind: "material",
    }),
  );
  if (!defaultItems.length)
    defaultItems.push({
      description: job.name || "Professional field services",
      quantity: 1,
      unitPrice: job.quotedValue || 0,
      kind: "service",
    });
  const [items, setItems] = useState(
    defaultItems.map((item) => ({
      ...item,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  );
  const today = new Date().toISOString().slice(0, 10);
  const dueDefault = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [dates, setDates] = useState({ issueDate: today, dueDate: dueDefault });
  const [taxRate, setTaxRate] = useState("0");
  const [accounting, setAccounting] = useState({
    paymentTerms: "Net 30",
    discount: "0",
    customerMessage: "Thank you for choosing TechSavvy.",
  });
  const [saving, setSaving] = useState(false);
  const subtotal = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const discount = Math.min(subtotal, Number(accounting.discount || 0));
  const tax = ((subtotal - discount) * Number(taxRate || 0)) / 100;
  const total = subtotal - discount + tax;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
      const created = await addDoc(collection(db, "invoices"), {
        invoiceNumber,
        jobId: job.id,
        workOrderNumber: job.workOrderNumber || job.id,
        customer: job.vendorName || "Customer",
        site: job.address || "",
        status: "Open",
        ...dates,
        lineItems: items
          .filter((item) => item.description.trim())
          .map((item) => ({
            description: item.description.trim(),
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            kind: item.kind || "service",
          })),
        subtotal,
        discount,
        paymentTerms: accounting.paymentTerms,
        customerMessage: accounting.customerMessage.trim(),
        taxRate: Number(taxRate || 0),
        tax,
        total,
        amountPaid: 0,
        balance: total,
        payments: [],
        earlyBillingOverride: job.status !== 'Ready to Invoice',
        sourceTimeEntryIds: approvedEntries.map((entry)=>entry.id),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "jobs", job.id), {
        status: "Invoiced",
        invoiceCreatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAudit("created", "invoice", created.id, `Created invoice ${invoiceNumber} for ${job.vendorName || "customer"}`, { jobId: job.id, total });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="font-mono text-[9px] text-tech-green-deep">
              {job.workOrderNumber || job.id}
            </p>
            <h2 className="mt-1 font-display text-lg uppercase">
              Generate invoice
            </h2>
            <p className="text-xs text-slate-500">
              {job.vendorName} · {job.name}
            </p>
            {job.status !== 'Ready to Invoice' && <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-800">Early billing override · current job status: {job.status || 'New'}</p>}
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Field
            label="Issue date"
            value={dates.issueDate}
            onChange={(v) => setDates({ ...dates, issueDate: v })}
            type="date"
            required
          />
          <Field
            label="Due date"
            value={dates.dueDate}
            onChange={(v) => setDates({ ...dates, dueDate: v })}
            type="date"
            required
          />
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Payment terms
            <select
              value={accounting.paymentTerms}
              onChange={(e) =>
                setAccounting({ ...accounting, paymentTerms: e.target.value })
              }
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              {["Due on receipt", "Net 15", "Net 30", "Net 45", "Net 60"].map(
                (term) => (
                  <option key={term}>{term}</option>
                ),
              )}
            </select>
          </label>
          <Field
            label="Discount amount"
            value={accounting.discount}
            onChange={(value) =>
              setAccounting({ ...accounting, discount: value })
            }
            type="number"
          />
          <label className="col-span-2 text-[9px] font-bold uppercase text-slate-500">
            Customer message
            <textarea
              value={accounting.customerMessage}
              onChange={(e) =>
                setAccounting({
                  ...accounting,
                  customerMessage: e.target.value,
                })
              }
              rows={2}
              className="mt-1.5 w-full rounded border border-slate-200 p-3 text-xs"
            />
          </label>
        </div>
        <div className="mt-5">
          <div className="flex justify-between">
            <p className="text-[9px] font-bold uppercase text-slate-500">
              Invoice lines
            </p>
            <button
              type="button"
              onClick={() =>
                setItems([
                  ...items,
                  {
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    kind: "service",
                  },
                ])
              }
              className="text-[9px] font-bold text-tech-green-deep"
            >
              + Add line
            </button>
          </div>
          {items.map((item, index) => (
            <div
              key={index}
              className="mt-2 grid grid-cols-[1fr_70px_100px_24px] gap-2"
            >
              <input
                required
                value={item.description}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
                className="rounded border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min="0"
                step=".01"
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
                className="rounded border border-slate-200 px-2 text-xs"
              />
              <input
                type="number"
                min="0"
                step=".01"
                value={item.unitPrice}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, unitPrice: e.target.value } : x,
                    ),
                  )
                }
                className="rounded border border-slate-200 px-2 text-xs"
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
                className="text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 ml-auto grid max-w-xs gap-2 border-t border-slate-100 pt-4 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <b>${subtotal.toLocaleString()}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Discount</span>
            <b>-${discount.toLocaleString()}</b>
          </div>
          <label className="flex items-center justify-between text-slate-500">
            Tax rate{" "}
            <span>
              <input
                type="number"
                min="0"
                step=".01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-slate-900"
              />{" "}
              %
            </span>
          </label>
          <div className="flex justify-between text-base">
            <span>Total</span>
            <b>${total.toLocaleString()}</b>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            disabled={saving || total <= 0}
            className="rounded bg-[#17251b] px-5 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PaymentModal({
  invoice,
  onClose,
}: {
  invoice: LiveInvoice;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    amount: String(invoice.balance),
    method: "ACH",
    reference: "",
  });
  const [saving, setSaving] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Math.min(Number(form.amount || 0), invoice.balance);
    if (amount <= 0) return;
    setSaving(true);
    try {
      const amountPaid = (invoice.amountPaid || 0) + amount;
      const balance = Math.max(0, invoice.total - amountPaid);
      await updateDoc(doc(db, "invoices", invoice.id), {
        amountPaid,
        balance,
        status: balance === 0 ? "Paid" : "Partially Paid",
        payments: arrayUnion({
          amount,
          method: form.method,
          reference: form.reference.trim(),
          receivedAt: new Date().toISOString(),
        }),
        updatedAt: serverTimestamp(),
      });
      if (balance === 0 && invoice.jobId)
        await updateDoc(doc(db, "jobs", invoice.jobId), {
          status: "Complete",
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      await recordAudit("payment-recorded", "invoice", invoice.id, `Recorded ${form.method} payment on ${invoice.invoiceNumber || invoice.id}`, { amount, balance, reference: form.reference.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md rounded bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="font-mono text-[9px] text-tech-green-deep">
              {invoice.invoiceNumber || invoice.id}
            </p>
            <h2 className="font-display text-lg uppercase">Record payment</h2>
            <p className="text-xs text-slate-500">
              Balance: ${invoice.balance.toLocaleString()}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field
            label="Amount received"
            value={form.amount}
            onChange={(v) => setForm({ ...form, amount: v })}
            type="number"
            required
          />
          <label className="block text-[9px] font-bold uppercase text-slate-500">
            Payment method
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              {["ACH", "Credit Card", "Check", "Cash", "Wire", "Other"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </label>
          <Field
            label="Reference / confirmation"
            value={form.reference}
            onChange={(v) => setForm({ ...form, reference: v })}
          />
        </div>
        <button
          disabled={
            saving ||
            Number(form.amount) <= 0 ||
            Number(form.amount) > invoice.balance
          }
          className="mt-5 w-full rounded bg-tech-green px-4 py-3 text-xs font-bold text-brand-black disabled:opacity-40"
        >
          {saving ? "Recording…" : "Record payment"}
        </button>
      </form>
    </div>
  );
}

function QuoteModal({
  customers: records,
  onClose,
}: {
  customers: LiveCustomer[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    customer: "",
    site: "",
    title: "",
    status: "Pending",
  });
  const [items, setItems] = useState([
    { description: "", quantity: "1", unitPrice: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const total = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const quoteNumber = `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
      const created = await addDoc(collection(db, "quotes"), {
        quoteNumber,
        ...form,
        lineItems: items
          .filter((i) => i.description.trim())
          .map((i) => ({
            description: i.description.trim(),
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        total,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAudit("created", "quote", created.id, `Created quote ${quoteNumber} for ${form.customer}`, { total, site: form.site });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase text-tech-green-deep">
              Itemized estimate
            </p>
            <h2 className="font-display text-lg uppercase">New quote</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Customer
            <select
              required
              value={form.customer}
              onChange={(e) => setForm({ ...form, customer: e.target.value })}
              className="mt-1 w-full rounded border border-slate-200 p-2.5 text-xs"
            >
              <option value="">Select</option>
              {records.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <Field
            label="Site address"
            value={form.site}
            onChange={(v) => setForm({ ...form, site: v })}
            required
          />
          <div className="sm:col-span-2">
            <Field
              label="Quote title / scope"
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
              required
            />
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex justify-between">
            <p className="text-[9px] font-bold uppercase text-slate-500">
              Line items
            </p>
            <button
              type="button"
              onClick={() =>
                setItems([
                  ...items,
                  { description: "", quantity: "1", unitPrice: "" },
                ])
              }
              className="text-[9px] font-bold text-tech-green-deep"
            >
              + Add item
            </button>
          </div>
          {items.map((item, index) => (
            <div
              key={index}
              className="mb-2 grid grid-cols-[1fr_70px_100px_24px] gap-2"
            >
              <input
                required
                value={item.description}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Labor or material"
                className="rounded border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min="0"
                step=".01"
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
                className="rounded border border-slate-200 px-2 text-xs"
              />
              <input
                type="number"
                min="0"
                step=".01"
                value={item.unitPrice}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, unitPrice: e.target.value } : x,
                    ),
                  )
                }
                placeholder="$ each"
                className="rounded border border-slate-200 px-2 text-xs"
              />
              <button
                type="button"
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
                className="text-red-500 disabled:opacity-20"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">Quote total</span>
          <b className="font-display text-xl">${total.toLocaleString()}</b>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            disabled={saving || !items.some((i) => i.description.trim())}
            className="rounded bg-[#17251b] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save quote"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ScheduleModal({
  job,
  technicians,
  onClose,
}: {
  job: LiveJob;
  technicians: Technician[];
  onClose: () => void;
}) {
  const [techIds, setTechIds] = useState<string[]>(job.assignedTechIds?.length ? job.assignedTechIds : job.assignedTechId ? [job.assignedTechId] : []);
  const [date, setDate] = useState(job.targetCompletion || "");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const selectedTechs = technicians.filter((technician) => techIds.includes(technician.id));
    if (!selectedTechs.length) return;
    const leadTech = selectedTechs[0];
    const techNames = selectedTechs.map((tech) => tech.name || tech.companyName || "Technician");
    setSaving(true);
    try {
      await updateDoc(doc(db, "jobs", job.id), {
        assignedTechId: leadTech.id,
        assignedTechIds: selectedTechs.map((tech) => tech.id),
        assignedTechName: techNames.join(", "),
        assignedTechNames: techNames,
        technicianLeadId: leadTech.id,
        targetCompletion: date,
        schedule: { date, start, end },
        status: "Scheduled",
        updatedAt: serverTimestamp(),
      });
      await recordAudit("scheduled", "job", job.id, `Scheduled ${job.workOrderNumber || job.id} with ${techNames.join(", ")}`, { technicianIds: selectedTechs.map((tech) => tech.id), leadTechnicianId: leadTech.id, date, start, end });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md rounded bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="font-mono text-[9px] text-tech-green-deep">
              {job.workOrderNumber || job.id}
            </p>
            <h2 className="mt-1 font-display text-lg uppercase">
              Assign technician
            </h2>
            <p className="text-xs text-slate-500">{job.name}</p>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <label className="block text-[9px] font-bold uppercase text-slate-500">
            Technicians ({techIds.length} selected)
            <span className="mt-1 block text-[9px] font-normal normal-case text-slate-400">The first selected technician is the lead. Select everyone assigned to this job.</span>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border border-slate-200 p-2">{technicians.map((technician)=><label key={technician.id} className="flex items-start gap-2 rounded p-2 text-xs font-normal normal-case hover:bg-slate-50"><input type="checkbox" checked={techIds.includes(technician.id)} onChange={()=>setTechIds((current)=>current.includes(technician.id)?current.filter((id)=>id!==technician.id):[...current,technician.id])} className="mt-0.5 accent-green-500"/><span><strong className="block">{technician.name || technician.companyName || technician.id}</strong>{technician.specialty&&<span className="text-[9px] text-slate-400">{technician.specialty}</span>}</span></label>)}</div>
          </label>
          <Field
            label="Schedule date"
            value={date}
            onChange={setDate}
            type="date"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Start"
              value={start}
              onChange={setStart}
              type="time"
              required
            />
            <Field
              label="Finish"
              value={end}
              onChange={setEnd}
              type="time"
              required
            />
          </div>
        </div>
        <button
          disabled={saving || techIds.length === 0}
          className="mt-5 w-full rounded bg-tech-green px-4 py-3 text-xs font-bold text-brand-black disabled:opacity-40"
        >
          {saving ? "Scheduling…" : "Confirm assignment"}
        </button>
      </form>
    </div>
  );
}

function AssetsView({
  assets,
  onCreate,
}: {
  assets: CustomerAsset[];
  onCreate: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [serviceAsset, setServiceAsset] = useState<CustomerAsset | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const dueAssets = assets.filter(
    (asset) =>
      asset.status === "Active" &&
      asset.maintenance?.enabled &&
      asset.maintenance.nextServiceDate <= today,
  );
  const readyToGenerate = dueAssets.filter(
    (asset) =>
      asset.lastGeneratedDueDate !== asset.maintenance?.nextServiceDate,
  );
  const generateJobs = async () => {
    if (!readyToGenerate.length) return;
    setGenerating(true);
    try {
      const batch = writeBatch(db);
      readyToGenerate.forEach((asset, index) => {
        const jobRef = doc(collection(db, "jobs"));
        const workOrderNumber = `PM-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}-${index + 1}`;
        batch.set(jobRef, {
          id: jobRef.id,
          workOrderNumber,
          assetId: asset.id,
          recurringMaintenance: true,
          vendorName: asset.customerName,
          name:
            asset.maintenance?.description ||
            `Preventative maintenance · ${asset.name}`,
          address: asset.site,
          notes: `Asset: ${asset.name}\nManufacturer/model: ${asset.manufacturer || "—"} ${asset.model || ""}\nSerial: ${asset.serialNumber || "—"}`,
          targetCompletion: asset.maintenance?.nextServiceDate,
          estimatedHours: asset.maintenance?.estimatedHours || 1,
          status: "New",
          assignedTechIds: [],
          scopeTasks: [
            "Inspect asset condition",
            "Perform scheduled maintenance",
            "Record test results and exceptions",
            "Update customer asset service history",
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, "customer_assets", asset.id), {
          lastGeneratedDueDate: asset.maintenance?.nextServiceDate,
          lastGeneratedJobId: jobRef.id,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      await recordAudit("maintenance-jobs-generated", "customer-asset", "batch", `Generated ${readyToGenerate.length} recurring maintenance job${readyToGenerate.length === 1 ? "" : "s"}`, { assetIds: readyToGenerate.map((asset) => asset.id) });
    } finally {
      setGenerating(false);
    }
  };
  return (
    <>
      <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold">
              Customer assets & recurring maintenance
            </h2>
            <p className="text-[10px] text-slate-400">
              Installed equipment, warranty coverage, service history and
              preventative work
            </p>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!readyToGenerate.length || generating}
              onClick={() => void generateJobs()}
              className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-bold text-orange-700 disabled:opacity-40"
            >
              {generating
                ? "Generating…"
                : `Generate due jobs (${readyToGenerate.length})`}
            </button>
            <button
              onClick={onCreate}
              className="rounded bg-[#17251b] px-3 py-2 text-[10px] font-bold text-white"
            >
              <Plus className="mr-1 inline h-3 w-3" /> Add asset
            </button>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
          <AssetMetric label="Registered assets" value={assets.length} />
          <AssetMetric
            label="Active"
            value={assets.filter((asset) => asset.status === "Active").length}
          />
          <AssetMetric
            label="Service due"
            value={dueAssets.length}
            warning={dueAssets.length > 0}
          />
          <AssetMetric
            label="Under warranty"
            value={
              assets.filter(
                (asset) =>
                  asset.warrantyExpiration && asset.warrantyExpiration >= today,
              ).length
            }
          />
        </div>
        {assets.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-[9px] uppercase text-slate-400">
                <tr>
                  {[
                    "Asset",
                    "Customer / Site",
                    "Identification",
                    "Warranty",
                    "Maintenance",
                    "History",
                    "Actions",
                  ].map((head) => (
                    <th key={head} className="px-4 py-3">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((asset) => {
                  const isDue = Boolean(
                    asset.maintenance?.enabled &&
                    asset.maintenance.nextServiceDate <= today,
                  );
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-semibold">
                          {asset.name}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {asset.category} · {asset.status}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[10px] font-semibold">
                          {asset.customerName}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {asset.site}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[10px]">
                          {asset.manufacturer} {asset.model}
                        </p>
                        <p className="font-mono text-[9px] text-slate-400">
                          S/N {asset.serialNumber || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[9px]">
                        {asset.warrantyExpiration || "Not recorded"}
                        <br />
                        {asset.warrantyExpiration && (
                          <span
                            className={
                              asset.warrantyExpiration >= today
                                ? "text-green-700"
                                : "text-red-600"
                            }
                          >
                            {asset.warrantyExpiration >= today
                              ? "Covered"
                              : "Expired"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[9px] ${isDue ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"}`}
                        >
                          {asset.maintenance?.enabled
                            ? isDue
                              ? "Due now"
                              : `Next ${asset.maintenance.nextServiceDate}`
                            : "Not scheduled"}
                        </span>
                        <p className="mt-1 text-[9px] text-slate-400">
                          {asset.maintenance?.enabled
                            ? `Every ${asset.maintenance.frequencyMonths} month(s)`
                            : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[10px]">
                        {asset.serviceHistory?.length || 0} service event
                        {asset.serviceHistory?.length === 1 ? "" : "s"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setServiceAsset(asset)}
                          className="rounded border border-slate-200 px-2 py-1.5 text-[9px] font-bold"
                        >
                          Record service
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center p-6 text-center">
            <div>
              <Wrench className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-xs font-semibold">
                No customer assets yet
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Register installed equipment to begin recurring maintenance
                planning.
              </p>
              <button
                onClick={onCreate}
                className="mt-4 rounded bg-[#17251b] px-4 py-2 text-[10px] font-bold text-white"
              >
                Add first asset
              </button>
            </div>
          </div>
        )}
      </section>
      {serviceAsset && (
        <ServiceRecordModal
          asset={serviceAsset}
          onClose={() => setServiceAsset(null)}
        />
      )}
    </>
  );
}

function AssetMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="bg-white p-4">
      <p className="text-[9px] font-semibold uppercase text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-xl ${warning ? "text-orange-600" : "text-slate-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

function AssetModal({
  customers,
  onClose,
}: {
  customers: LiveCustomer[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    customerId: "",
    site: "",
    name: "",
    category: "Network Equipment",
    manufacturer: "",
    model: "",
    serialNumber: "",
    installDate: "",
    warrantyExpiration: "",
    status: "Active",
    maintenanceEnabled: true,
    frequencyMonths: "12",
    nextServiceDate: "",
    maintenanceDescription: "Preventative inspection and service",
    estimatedHours: "1",
  });
  const [saving, setSaving] = useState(false);
  const selectedCustomer = customers.find(
    (customer) => customer.id === form.customerId,
  );
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      const created = await addDoc(collection(db, "customer_assets"), {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        site: form.site.trim(),
        name: form.name.trim(),
        category: form.category,
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        installDate: form.installDate,
        warrantyExpiration: form.warrantyExpiration,
        status: form.status,
        maintenance: {
          enabled: form.maintenanceEnabled,
          frequencyMonths: Number(form.frequencyMonths || 12),
          nextServiceDate: form.nextServiceDate,
          description: form.maintenanceDescription.trim(),
          estimatedHours: Number(form.estimatedHours || 1),
        },
        serviceHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAudit("created", "customer-asset", created.id, `Created asset ${form.name.trim()} for ${selectedCustomer.name}`, { site: form.site, maintenanceEnabled: form.maintenanceEnabled });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={save}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase text-tech-green-deep">
              Customer equipment register
            </p>
            <h2 className="font-display text-lg uppercase">New asset</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Customer
            <select
              required
              value={form.customerId}
              onChange={(e) =>
                setForm({ ...form, customerId: e.target.value, site: "" })
              }
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Customer site
            <select
              required
              value={form.site}
              onChange={(e) => setForm({ ...form, site: e.target.value })}
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              <option value="">Select site</option>
              {(selectedCustomer?.sites || []).map((site) => (
                <option key={site}>{site}</option>
              ))}
              <option value="Address on file">Address on file</option>
            </select>
          </label>
          <Field
            label="Asset name"
            value={form.name}
            onChange={(value) => setForm({ ...form, name: value })}
            required
          />
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Category
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              {[
                "Network Equipment",
                "Low Voltage",
                "Security System",
                "Cell Booster",
                "Server / Storage",
                "Power / UPS",
                "Other",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Field
            label="Manufacturer"
            value={form.manufacturer}
            onChange={(value) => setForm({ ...form, manufacturer: value })}
          />
          <Field
            label="Model"
            value={form.model}
            onChange={(value) => setForm({ ...form, model: value })}
          />
          <Field
            label="Serial number"
            value={form.serialNumber}
            onChange={(value) => setForm({ ...form, serialNumber: value })}
          />
          <label className="text-[9px] font-bold uppercase text-slate-500">
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
            >
              {["Active", "Out of Service", "Retired"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Field
            label="Installation date"
            value={form.installDate}
            onChange={(value) => setForm({ ...form, installDate: value })}
            type="date"
          />
          <Field
            label="Warranty expiration"
            value={form.warrantyExpiration}
            onChange={(value) =>
              setForm({ ...form, warrantyExpiration: value })
            }
            type="date"
          />
        </div>
        <div className="mt-6 rounded border border-green-200 bg-green-50 p-4">
          <label className="flex items-center gap-2 text-xs font-bold text-green-900">
            <input
              type="checkbox"
              checked={form.maintenanceEnabled}
              onChange={(e) =>
                setForm({ ...form, maintenanceEnabled: e.target.checked })
              }
            />{" "}
            Enable recurring maintenance
          </label>
          {form.maintenanceEnabled && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field
                label="Frequency in months"
                value={form.frequencyMonths}
                onChange={(value) =>
                  setForm({ ...form, frequencyMonths: value })
                }
                type="number"
                required
              />
              <Field
                label="Next service date"
                value={form.nextServiceDate}
                onChange={(value) =>
                  setForm({ ...form, nextServiceDate: value })
                }
                type="date"
                required
              />
              <div className="sm:col-span-2">
                <Field
                  label="Maintenance scope"
                  value={form.maintenanceDescription}
                  onChange={(value) =>
                    setForm({ ...form, maintenanceDescription: value })
                  }
                  required
                />
              </div>
              <Field
                label="Estimated hours"
                value={form.estimatedHours}
                onChange={(value) =>
                  setForm({ ...form, estimatedHours: value })
                }
                type="number"
                required
              />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-xs"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded bg-[#17251b] px-5 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save asset"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ServiceRecordModal({
  asset,
  onClose,
}: {
  asset: CustomerAsset;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    notes: "Scheduled maintenance completed",
    workOrderNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const nextDate = () => {
    const date = new Date(`${form.date}T12:00:00`);
    date.setMonth(date.getMonth() + (asset.maintenance?.frequencyMonths || 12));
    return date.toISOString().slice(0, 10);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, "customer_assets", asset.id), {
        serviceHistory: arrayUnion({
          date: form.date,
          workOrderNumber: form.workOrderNumber.trim(),
          notes: form.notes.trim(),
        }),
        "maintenance.nextServiceDate": nextDate(),
        lastGeneratedDueDate: null,
        lastServicedAt: form.date,
        updatedAt: serverTimestamp(),
      });
      await recordAudit("service-recorded", "customer-asset", asset.id, `Recorded service for ${asset.name}`, { serviceDate: form.date, nextServiceDate: nextDate(), workOrderNumber: form.workOrderNumber.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-md rounded bg-white p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase text-tech-green-deep">
              {asset.customerName}
            </p>
            <h2 className="font-display text-lg uppercase">
              Record asset service
            </h2>
            <p className="text-xs text-slate-500">{asset.name}</p>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Field
            label="Service date"
            value={form.date}
            onChange={(value) => setForm({ ...form, date: value })}
            type="date"
            required
          />
          <Field
            label="Work order number"
            value={form.workOrderNumber}
            onChange={(value) => setForm({ ...form, workOrderNumber: value })}
          />
          <label className="block text-[9px] font-bold uppercase text-slate-500">
            Service notes
            <textarea
              required
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className="mt-1.5 w-full rounded border border-slate-200 p-3 text-xs"
            />
          </label>
          <p className="rounded bg-slate-50 p-3 text-[10px] text-slate-500">
            Next maintenance date:{" "}
            <b className="text-slate-800">{nextDate()}</b>
          </p>
        </div>
        <button
          disabled={saving}
          className="mt-5 w-full rounded bg-tech-green px-4 py-3 text-xs font-bold text-brand-black disabled:opacity-40"
        >
          {saving ? "Saving…" : "Complete service record"}
        </button>
      </form>
    </div>
  );
}

function AccessGate({
  access,
  login,
  setLogin,
  error,
  pending,
  onSubmit,
}: {
  access: "checking" | "signed-out" | "denied";
  login: { email: string; password: string };
  setLogin: (value: { email: string; password: string }) => void;
  error: string;
  pending: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b0f0c] p-5 text-white">
      <div className="w-full max-w-md rounded border border-white/10 bg-[#151916] p-7 shadow-2xl">
        <span className="grid h-11 w-11 place-items-center rounded bg-tech-green text-brand-black">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <p className="mt-6 text-[10px] font-mono uppercase tracking-[.25em] text-tech-green">
          Protected workspace
        </p>
        <h1 className="mt-2 font-display text-xl uppercase">
          CRM administrator access
        </h1>
        {access === "checking" ? (
          <p className="mt-4 text-sm text-slate-400">Checking your session…</p>
        ) : access === "denied" ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              This account is signed in but does not have the administrator
              claim required to view customer and job records.
            </p>
            <button
              onClick={() => void signOut(auth)}
              className="mt-5 rounded bg-white/10 px-4 py-2 text-xs font-bold"
            >
              Use another account
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Email
              <input
                type="email"
                required
                value={login.email}
                onChange={(e) => setLogin({ ...login, email: e.target.value })}
                className="mt-2 w-full rounded border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-tech-green"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Password
              <input
                type="password"
                required
                value={login.password}
                onChange={(e) =>
                  setLogin({ ...login, password: e.target.value })
                }
                className="mt-2 w-full rounded border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-tech-green"
              />
            </label>
            {error && (
              <p className="rounded bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </p>
            )}
            <button
              disabled={pending}
              className="w-full rounded bg-tech-green px-4 py-3 text-xs font-bold uppercase tracking-wider text-brand-black disabled:opacity-50"
            >
              {pending ? "Signing in…" : "Open CRM"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CreateRecordModal({
  type,
  customers: records,
  onClose,
}: {
  type: "customer" | "job";
  customers: LiveCustomer[];
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({
    name: "",
    contact: "",
    email: "",
    phone: "",
    site: "",
  });
  const [job, setJob] = useState({
    customer: "",
    name: "",
    address: "",
    due: "",
    value: "",
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (type === "customer") {
        const created = await addDoc(collection(db, "customers"), {
          name: customer.name.trim(),
          contact: customer.contact.trim(),
          email: customer.email.trim(),
          phone: customer.phone.trim(),
          sites: customer.site.trim() ? [customer.site.trim()] : [],
          assets: 0,
          lifetimeValue: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAudit("created", "customer", created.id, `Created customer ${customer.name.trim()}`, { email: customer.email.trim(), site: customer.site.trim() });
      } else {
        const workOrderNumber = `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
        const created = await addDoc(collection(db, "jobs"), {
          workOrderNumber,
          vendorName: job.customer,
          name: job.name.trim(),
          address: job.address.trim(),
          targetCompletion: job.due,
          status: "New",
          quotedValue: Number(job.value || 0),
          assignedTechIds: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordAudit("created", "job", created.id, `Created job ${workOrderNumber} for ${job.customer}`, { value: Number(job.value || 0), due: job.due });
      }
      onClose();
    } catch {
      setError(
        "The record could not be saved. Confirm your administrator access and try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-tech-green-deep">
              Live Firestore record
            </p>
            <h2 className="mt-1 font-display text-lg uppercase">New {type}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {type === "customer" ? (
            <>
              <Field
                label="Company / customer name"
                value={customer.name}
                onChange={(v) => setCustomer({ ...customer, name: v })}
                required
              />
              <Field
                label="Primary contact"
                value={customer.contact}
                onChange={(v) => setCustomer({ ...customer, contact: v })}
              />
              <Field
                label="Email"
                value={customer.email}
                onChange={(v) => setCustomer({ ...customer, email: v })}
                type="email"
              />
              <Field
                label="Phone"
                value={customer.phone}
                onChange={(v) => setCustomer({ ...customer, phone: v })}
              />
              <div className="sm:col-span-2">
                <Field
                  label="First site address"
                  value={customer.site}
                  onChange={(v) => setCustomer({ ...customer, site: v })}
                />
              </div>
            </>
          ) : (
            <>
              <label className="sm:col-span-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Customer
                <select
                  required
                  value={job.customer}
                  onChange={(e) => setJob({ ...job, customer: e.target.value })}
                  className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs"
                >
                  <option value="">Select customer</option>
                  {records.map((c) => (
                    <option key={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <Field
                  label="Job description"
                  value={job.name}
                  onChange={(v) => setJob({ ...job, name: v })}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Site address"
                  value={job.address}
                  onChange={(v) => setJob({ ...job, address: v })}
                  required
                />
              </div>
              <Field
                label="Target completion"
                value={job.due}
                onChange={(v) => setJob({ ...job, due: v })}
                type="date"
              />
              <Field
                label="Quoted value"
                value={job.value}
                onChange={(v) => setJob({ ...job, value: v })}
                type="number"
              />
            </>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded bg-red-50 p-3 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 px-4 py-2 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded bg-[#17251b] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-tech-green"
      />
    </label>
  );
}
function EmptyState({
  label,
  detail,
  onCreate,
}: {
  label: string;
  detail: string;
  onCreate: () => void;
}) {
  return (
    <div className="grid min-h-64 place-items-center p-6 text-center">
      <div>
        <Building2 className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-xs font-semibold">{label}</p>
        <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
        <button
          onClick={onCreate}
          className="mt-4 rounded bg-[#17251b] px-4 py-2 text-[10px] font-bold uppercase text-white"
        >
          <Plus className="mr-1 inline h-3 w-3" /> Create customer
        </button>
      </div>
    </div>
  );
}
