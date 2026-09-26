import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContractorRosterAdmin } from "../features/admin/ContractorRosterAdmin";
import { ClientRequestsAdmin } from "../features/client/ClientRequestsAdmin";
import { DispatchDemoContext } from "../features/admin/demoContext";
import { DemoTour, type DemoTab, type TourStep } from "./DemoTour";
import {
  LiveScheduleBoard,
  LiveSchedulingQueue,
  ScheduleModal,
  TechWorkloadSummary,
  type LiveJob,
  type Technician,
} from "./CRM";

// Everything on this page is fictional sample data held in React state. It
// never signs in, reads Firestore, or calls an API, so visitors cannot reach
// any real customer, technician or job record.

const pacificToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Illustrated portraits (not real people) so the roster shows how photos look.
type AvatarLook = { bg: [string, string]; skin: string; hair: string; shirt: string; style: "short" | "long" | "beard"; hat?: string };
const avatar = ({ bg, skin, hair, shirt, style, hat }: AvatarLook) => {
  const hairBack = style === "long" ? `<path d="M80 104 C68 176 84 190 100 190 L100 112 Z M176 104 C188 176 172 190 156 190 L156 112 Z" fill="${hair}"/>` : "";
  const hairTop = hat ? "" : `<path d="M82 104 C78 52 178 52 174 104 C164 82 92 82 82 104 Z" fill="${hair}"/>`;
  const beard = style === "beard" ? `<path d="M88 118 C92 168 164 168 168 118 C156 140 100 140 88 118 Z" fill="${hair}"/>` : "";
  const hard = hat ? `<path d="M78 96 C80 46 176 46 178 96 Z" fill="${hat}"/><rect x="66" y="92" width="124" height="11" rx="5" fill="${hat}"/><rect x="120" y="52" width="16" height="42" fill="rgba(255,255,255,0.25)"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/>${hairBack}<path d="M24 256 C24 204 70 178 128 178 C186 178 232 204 232 256 Z" fill="${shirt}"/><rect x="108" y="146" width="40" height="40" rx="8" fill="${skin}"/><ellipse cx="128" cy="112" rx="45" ry="52" fill="${skin}"/>${beard}${hairTop}${hard}<circle cx="110" cy="116" r="4.5" fill="#1f2937"/><circle cx="146" cy="116" r="4.5" fill="#1f2937"/><path d="M112 140 C120 148 136 148 144 140" stroke="#1f2937" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Sample client-portal data: requests, portal users, organizations, appointments.
const buildClientData = () => {
  const today = pacificToday();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const anchor = addDays(today, dow === 6 ? 2 : dow === 0 ? 1 : 0);
  const now = new Date().toISOString();
  const org = (id: string, name: string, domain: string, prefix: string, contact: string, email: string) => ({
    id, name, approvedDomains: [domain], referencePrefixes: [prefix], defaultContactPolicy: "techsavvy_only", billingEmail: email,
    personnel: [{ id: `${id}-p1`, name: contact, email, role: "primary_contact", active: true }],
  });
  const request = (n: number, status: string, companyName: string, siteName: string, requesterName: string, requesterEmail: string, scopeSummary: string, extra: Record<string, unknown> = {}) => ({
    id: `demo-req-${n}`, requestNumber: `REQ-DEMO-${4100 + n}`, status, companyName, siteName, requesterName, requesterEmail,
    clientReference: `PO-${7700 + n}`, scopeSummary, createdAt: now,
    requestedWindows: [{ date: addDays(anchor, n), start: "08:00", end: "17:00" }],
    scopeTasks: [], equipment: [], packages: [], deliverables: [], attachments: [], ...extra,
  });
  return {
    requests: [
      request(1, "requested", "Naboo Palace Apartments", "Royal Courtyard Leasing Office", "Padme's Property Manager", "manager@naboo.example",
        "Install two new access points and re-terminate the leasing office patch panel.", {
          urgent: true,
          scopeTasks: ["Survey coverage in the leasing office and lobby", "Mount and configure two access points", "Re-terminate and label the patch panel", "Test and document all drops"],
          equipment: [{ description: "Ubiquiti U6 Pro access point", quantity: 2, providedBy: "client", serial: "NAB-0042" }, { description: "Cat6A patch cables (3 ft)", quantity: 24, providedBy: "techsavvy" }],
          deliverables: ["Signed test report", "Updated patch panel labeling sheet"],
          attachments: [{ id: "a1" }],
        }),
      request(2, "requested", "Mos Eisley Coworking", "Cantina Suite 4", "Wuher Tolliver", "wuher@moseisley.example",
        "Run six Cat6A drops and mount a wall rack for the new tenant suite.", {
          scopeTasks: ["Pull six Cat6A cables to the suite", "Mount a 12U wall rack", "Terminate, test and label"],
          equipment: [{ description: "12U wall-mount rack", quantity: 1, providedBy: "techsavvy" }],
        }),
      request(3, "clarification_needed", "Endor Medical Plaza", "Ewok Village Clinic", "Wicket W. Warrick", "wicket@endor.example",
        "Boost cell signal in the basement imaging suite.", {
          scopeTasks: ["Survey signal in the basement", "Install donor antenna and booster", "Commission and document coverage"],
          packages: [{ carrier: "UPS", trackingNumber: "1Z999AA10123456784", destination: "site", description: "Signal booster kit" }],
        }),
      request(4, "reviewing", "Dagobah Dental Group", "Swamp Street Office", "Yoda Master", "yoda@dagobahdental.example",
        "Replace the aging firewall and re-check VLAN segmentation.", {
          scopeTasks: ["Configure replacement firewall", "Migrate rules and VLANs", "Verify guest network isolation"],
        }),
    ] as any[],
    organizations: [
      org("org-1", "Naboo Palace Apartments", "naboo.example", "NAB-", "Padme's Property Manager", "manager@naboo.example"),
      org("org-2", "Mos Eisley Coworking", "moseisley.example", "MEC-", "Wuher Tolliver", "wuher@moseisley.example"),
      org("org-3", "Dagobah Dental Group", "dagobahdental.example", "DDG-", "Yoda Master", "yoda@dagobahdental.example"),
      org("org-4", "Endor Medical Plaza", "endor.example", "EMP-", "Wicket W. Warrick", "wicket@endor.example"),
    ] as any[],
    users: [
      { id: "u1", displayName: "Bail Organa", email: "bail@naboo.example", status: "pending", customerId: "org-1", emailVerified: true, phoneVerified: true, suggestedRoles: ["company_admin"], requestedRoles: ["company_admin"] },
      { id: "u2", displayName: "Shmi Skywalker", email: "shmi@moseisley.example", status: "pending", customerId: "org-2", emailVerified: true, phoneVerified: false, phoneVerificationDeferred: true, requestedRoles: ["project_viewer"] },
      { id: "u3", displayName: "Mon Mothma", email: "mon@endor.example", status: "active", customerId: "org-4", roles: ["company_admin"], emailVerified: true, phoneVerified: true },
      { id: "u4", displayName: "Wedge Antilles", email: "wedge@dagobahdental.example", status: "active", customerId: "org-3", roles: ["billing"], emailVerified: true, phoneVerified: true },
      { id: "u5", displayName: "Jar Jar Binks", email: "jarjar@naboo.example", status: "suspended", customerId: "org-1", roles: ["project_viewer"], emailVerified: true, phoneVerified: true },
    ] as any[],
    appointments: [
      { id: "demo-appt-1", jobId: "demo-1", status: "scheduled", confirmedStart: `${addDays(anchor, 0)}T15:00:00.000Z`, confirmedEnd: `${addDays(anchor, 0)}T19:00:00.000Z`, technicianId: "t1", requestedWindows: [] },
      { id: "demo-appt-2", jobId: "demo-3", status: "requested", technicianId: "t3", requestedWindows: [{ date: addDays(anchor, 0), start: "13:00", end: "17:00" }] },
      { id: "demo-appt-3", jobId: "demo-9", status: "requested", technicianId: "", requestedWindows: [{ date: addDays(anchor, 3), start: "08:00", end: "12:00" }] },
    ] as any[],
    failedNotifications: [
      { id: "n1", channel: "email", type: "appointment_confirmed", createdAt: now, recipients: ["frontdesk@endor.example"], error: JSON.stringify({ message: "Mailbox full (sample failure)." }) },
    ] as any[],
    scopeChanges: [] as any[],
    settings: { enabled: true, pilotOnly: false },
  };
};

const pacificParts = (iso: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

// Sample timecards for the past two weeks (weekdays only), matched to contractors by authUid.
const buildTimeEntries = () => {
  const today = pacificToday();
  const sites: Record<string, string[]> = {
    t1: ["Dagobah Dental Group", "Tatooine Academy", "Alderaan Credit Union"],
    t2: ["Naboo Palace Apartments", "Coruscant Law Offices", "Mos Eisley Coworking"],
    t3: ["Echo Base Storage", "Jabba's Logistics", "Hoth Wellness Clinic"],
    t4: ["Endor Medical Plaza", "Echo Base Storage"],
    t5: ["Kamino Seaside Apartments", "Hoth Wellness Clinic"],
  };
  const rates: Record<string, number> = { t1: 85, t2: 95, t3: 80, t4: 100, t5: 65 };
  const entries: Array<Record<string, any>> = [];
  let n = 0;
  Object.keys(sites).forEach((techId, ti) => {
    let count = 0;
    for (let back = 1; back <= 14 && count < 5; back += 1) {
      const date = addDays(today, -back);
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6 || (back + ti) % 3 === 0) continue;
      const list = sites[techId];
      const hours = [4, 6.5, 8, 5.5, 7][(back + ti) % 5];
      const approved = back > 4;
      n += 1;
      count += 1;
      entries.push({
        id: `demo-te-${n}`,
        technicianUid: `auth-${techId}`,
        date,
        jobSite: list[(back + ti) % list.length],
        totalHours: hours,
        rate: rates[techId],
        suppliesCost: (back + ti) % 4 === 0 ? 42.5 : 0,
        travelCost: (back + ti) % 3 === 1 ? 35 : 0,
        status: approved ? "approved" : "pending",
        laborStatus: approved ? "approved" : "pending",
        suppliesStatus: approved ? "approved" : "pending",
        travelStatus: approved ? "approved" : "pending",
      });
    }
  });
  return entries.sort((a, b) => b.date.localeCompare(a.date));
};

const CONTRACTORS = (): Array<Technician & Record<string, any>> => [
  {
    id: "t1", authUid: "auth-t1", name: "Han Solo", email: "han.solo@example.com", specialty: "Fiber & structured cabling",
    rate: 85, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0111",
    profilePhotoUrl: avatar({ bg: ["#0f766e", "#5eead4"], skin: "#e0ac82", hair: "#2b1d14", shirt: "#f59e0b", style: "short", hat: "#facc15" }), onboarding: { status: "approved" }, role: "technician_lead",
    skills: ["Fiber splicing", "Cat6A termination", "Rack dressing", "OTDR testing"],
    tools: ["Fusion splicer", "OTDR", "Fluke DSX-8000"],
    certifications: [{ id: "c1", name: "BICSI Installer 2", expiryDate: "2027-05-01" }, { id: "c2", name: "Fiber Optic Association CFOT", expiryDate: "" }],
  },
  {
    id: "t2", authUid: "auth-t2", name: "Leia Organa", email: "leia.organa@example.com", specialty: "Network & Wi-Fi",
    rate: 95, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0122",
    profilePhotoUrl: avatar({ bg: ["#1d4ed8", "#93c5fd"], skin: "#f1c9a5", hair: "#5b3a1e", shirt: "#334155", style: "long" }), onboarding: { status: "approved" },
    skills: ["Wi-Fi surveys", "Firewall configuration", "SD-WAN", "VLAN design"],
    tools: ["Ekahau sidekick", "Laptop with console cable"],
    certifications: [{ id: "c3", name: "CCNA", expiryDate: "2026-10-15" }],
  },
  {
    id: "t3", authUid: "auth-t3", name: "Lando Calrissian", email: "lando.calrissian@example.com", specialty: "Low-voltage & access control",
    rate: 80, employmentType: "w2_employee", accessStatus: "Active", active: true, businessPhone: "(555) 010-0133",
    profilePhotoUrl: avatar({ bg: ["#7c3aed", "#d8b4fe"], skin: "#8d5a3b", hair: "#111827", shirt: "#0ea5e9", style: "beard" }), onboarding: { status: "approved" },
    skills: ["Access control wiring", "IP cameras", "Intercom systems", "Conduit runs"],
    tools: ["Bucket truck", "Conduit bender", "Toner and probe"],
    certifications: [{ id: "c4", name: "C-7 Low Voltage License", expiryDate: "2028-01-31" }],
  },
  {
    id: "t4", authUid: "auth-t4", name: "Luke Skywalker", email: "luke.skywalker@example.com", specialty: "RF / cell signal",
    rate: 100, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0144",
    profilePhotoUrl: avatar({ bg: ["#b45309", "#fcd34d"], skin: "#f5d3b3", hair: "#a16207", shirt: "#16a34a", style: "short", hat: "#f8fafc" }), onboarding: { status: "submitted" },
    skills: ["Cell booster commissioning", "DAS testing", "RF site survey"],
    tools: ["Spectrum analyzer", "Signal meter", "Antenna alignment kit"],
    certifications: [{ id: "c5", name: "FCC GROL", expiryDate: "" }],
  },
  {
    id: "t5", authUid: "auth-t5", name: "Padme Amidala", email: "padme.amidala@example.com", specialty: "Field technician",
    rate: 65, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0155",
    profilePhotoUrl: avatar({ bg: ["#15803d", "#86efac"], skin: "#c68b64", hair: "#1c1917", shirt: "#dc2626", style: "long" }),
    onboarding: { status: "not_started" },
    skills: ["Equipment install", "Printer setup", "Basic cabling"], tools: ["Hand tools"], certifications: [],
  },
  {
    id: "t6", authUid: "auth-t6", name: "Ahsoka Tano", email: "ahsoka.tano@example.com", specialty: "Structured cabling",
    rate: 70, employmentType: "1099_contractor", accessStatus: "Pending", active: false, onboarding: { status: "not_started" },
    skills: ["Cat6 terminations"], tools: [], certifications: [],
  },
];

function buildJobs(): LiveJob[] {
  // Anchor the sample week on the next business day so the board is never empty on weekends.
  const today = pacificToday();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const anchor = addDays(today, dow === 6 ? 2 : dow === 0 ? 1 : 0);
  const job = (
    n: number,
    name: string,
    vendorName: string,
    address: string,
    techId: string | null,
    dayOffset: number | null,
    start = "08:00",
    end = "10:00",
  ): LiveJob =>
    ({
      id: `demo-${n}`,
      workOrderNumber: `WO-DEMO-${1000 + n}`,
      name,
      vendorName,
      address,
      status: dayOffset === null ? "New" : "Scheduled",
      clientReference: `REQ-${4000 + n}`,
      siteContact: "Site contact · (555) 010-0100",
      notes: "Sample work order for demonstration purposes.",
      assignedTechId: techId || "ALL",
      assignedTechIds: [techId || "ALL"],
      schedule: dayOffset === null ? undefined : { date: addDays(anchor, dayOffset), start, end },
    }) as LiveJob;
  return [
    job(1, "Cat6A drops — second floor", "Dagobah Dental Group", "120 Bay St, Sample City", "t1", 0, "08:00", "12:00"),
    job(2, "Wi-Fi survey and AP install", "Naboo Palace Apartments", "48 Oak Ave, Sample City", "t2", 0, "09:00", "13:00"),
    job(3, "Camera install (6 units)", "Echo Base Storage", "900 Ridge Rd, Sample City", "t3", 0, "13:00", "17:00"),
    job(4, "Cell booster commissioning", "Endor Medical Plaza", "77 Harbor Blvd, Sample City", "t4", 0, "10:00", "14:00"),
    job(5, "Rack dressing and labeling", "Alderaan Credit Union", "15 Main St, Sample City", "t1", 1, "09:00", "15:00"),
    job(6, "Firewall replacement", "Coruscant Law Offices", "310 Pine St, Sample City", "t2", 1, "10:00", "12:00"),
    job(7, "Access control panel wiring", "Jabba's Logistics", "5 Dock Way, Sample City", "t3", 2, "08:00", "16:00"),
    job(8, "Fiber splice and OTDR test", "Tatooine Academy", "22 Maple Ln, Sample City", "t1", 2, "08:00", "11:00"),
    job(9, "Printer and network install", "Kamino Seaside Apartments", "2000 Coast Cir, Sample City", null, null),
    job(10, "Conference room AV cabling", "Mos Eisley Coworking", "8 Foundry Ct, Sample City", null, null),
    job(11, "Wi-Fi coverage check", "Hoth Wellness Clinic", "61 Cedar Pt, Sample City", "t5", null),
  ];
}

export default function Demo() {
  const [tab, setTab] = useState<DemoTab>("dispatch");
  const [client, setClient] = useState(buildClientData);
  const clientRef = useRef(client);
  clientRef.current = client;
  const [touring, setTouring] = useState(() => {
    try {
      return localStorage.getItem("techsavvy-demo-tour-seen") !== "1";
    } catch {
      return true;
    }
  });
  const endTour = () => {
    setTouring(false);
    setTab("dispatch");
    try {
      localStorage.setItem("techsavvy-demo-tour-seen", "1");
    } catch {
      /* private mode: the tour simply shows again next visit */
    }
  };
  const timeEntries = useMemo(buildTimeEntries, []);
  const [contractors, setContractors] = useState(CONTRACTORS);
  const [jobs, setJobs] = useState<LiveJob[]>(buildJobs);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const [scheduleJob, setScheduleJob] = useState<LiveJob | null>(null);
  const clientApi = useCallback(async (action: string, options: RequestInit = {}) => {
    const body = options.body ? JSON.parse(String(options.body)) : {};
    const patchRequest = (id: string, patch: Record<string, unknown>) =>
      setClient((current) => ({ ...current, requests: current.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    const patchUser = (id: string, patch: Record<string, unknown>) =>
      setClient((current) => ({ ...current, users: current.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
    if (action === "dashboard") {
      const data = clientRef.current;
      return {
        ...data,
        appointments: data.appointments.map((appointment) => {
          const job = jobsRef.current.find((item) => item.id === appointment.jobId);
          return {
            ...appointment,
            workOrderNumber: job?.workOrderNumber || "",
            jobName: job?.name || "",
            clientName: job?.vendorName || "",
            jobAddress: job?.address || "",
            clientReference: job?.clientReference || "",
          };
        }),
      };
    }
    if (action === "request-status") {
      patchRequest(body.requestId, { status: body.status, reviewNote: body.reviewNote || "" });
      return { success: true };
    }
    if (action === "convert") {
      const request = clientRef.current.requests.find((r) => r.id === body.requestId);
      if (!request) throw new Error("Request not found.");
      const n = jobsRef.current.length + 1;
      const techId = body.technicianLeadId || "";
      const job = {
        id: `demo-job-${n}`,
        workOrderNumber: `WO-DEMO-${2000 + n}`,
        name: request.siteName,
        vendorName: request.companyName,
        address: `${request.siteName}, Sample City`,
        clientReference: request.clientReference,
        status: "New",
        siteContact: `${request.requesterName} \u00b7 (555) 010-0199`,
        notes: request.scopeSummary,
        sourceRequestId: request.id,
        assignedTechId: techId || "ALL",
        assignedTechIds: [techId || "ALL"],
      } as unknown as LiveJob;
      setJobs((current) => [...current, job]);
      patchRequest(request.id, { status: "converted", convertedJobId: job.id });
      setClient((current) => ({
        ...current,
        appointments: [
          ...current.appointments,
          { id: `demo-appt-${current.appointments.length + 1}`, jobId: job.id, status: "requested", technicianId: techId, requestedWindows: request.requestedWindows },
        ],
      }));
      return { success: true };
    }
    if (action === "schedule") {
      const start = pacificParts(body.start);
      const end = pacificParts(body.end);
      const appointment = clientRef.current.appointments.find((a) => a.id === body.appointmentId);
      setClient((current) => ({
        ...current,
        appointments: current.appointments.map((a) =>
          a.id === body.appointmentId ? { ...a, status: "scheduled", confirmedStart: body.start, confirmedEnd: body.end, technicianId: body.technicianId || a.technicianId } : a,
        ),
      }));
      if (appointment) {
        setJobs((current) =>
          current.map((job) =>
            job.id === appointment.jobId
              ? ({
                  ...job,
                  status: !job.status || job.status === "New" ? "Scheduled" : job.status,
                  schedule: { date: start.date, start: start.time, end: end.date === start.date ? end.time : "23:59" },
                  ...(body.technicianId ? { assignedTechId: body.technicianId, assignedTechIds: [body.technicianId] } : {}),
                } as LiveJob)
              : job,
          ),
        );
      }
      return { success: true };
    }
    if (action === "approve-member") {
      patchUser(body.uid, { status: "active", roles: body.roles || ["project_viewer"] });
      return { success: true };
    }
    if (action === "update-member-access") {
      if (body.change === "roles") patchUser(body.uid, { roles: body.roles });
      if (body.change === "suspend") patchUser(body.uid, { status: "suspended" });
      if (body.change === "restore") patchUser(body.uid, { status: "active" });
      return { success: true };
    }
    if (action === "dismiss-notifications") {
      setClient((current) => ({ ...current, failedNotifications: current.failedNotifications.filter((f) => !(body.ids || []).includes(f.id)) }));
      return { success: true };
    }
    if (action === "resend-welcome") return { success: true };
    throw new Error("Not available in the demo \u2014 this is sample data only.");
  }, []);

  const api = useMemo(
    () => ({
      updateJob: (jobId: string, patch: Record<string, unknown>) =>
        setJobs((current) => current.map((item) => (item.id === jobId ? ({ ...item, ...patch } as LiveJob) : item))),
      updateContractor: (contractorId: string, patch: Record<string, unknown>) =>
        setContractors((current) => current.map((item) => (item.id === contractorId ? { ...item, ...patch } : item))),
      addContractor: (record: Record<string, unknown>) =>
        setContractors((current) => [...current, record as Technician & Record<string, any>]),
      timeEntries,
      clientApi,
    }),
    [timeEntries, clientApi],
  );

  useEffect(() => {
    const previous = document.title;
    document.title = "Dispatch demo | TechSavvy";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = previous;
      meta.remove();
    };
  }, []);

  const byText = (text: string) => () =>
    ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim().toLowerCase() === text.toLowerCase()) as HTMLElement | undefined) ?? null;
  const timesheetModal = () =>
    ([...document.querySelectorAll(".fixed")].find((d) => d.textContent?.includes("Timesheets:")) as HTMLElement | undefined) ?? null;
  const modalCard = () => (timesheetModal()?.firstElementChild as HTMLElement | null) ?? null;
  const modalClose = () =>
    ([...(timesheetModal()?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Close") as HTMLElement | undefined)?.click();
  const innerTab = (label: string) => () =>
    ([...document.querySelectorAll("button")].find((b) => b.querySelector("svg") && b.textContent?.trim().startsWith(label) && b.className.includes("rounded-lg")) as HTMLElement | undefined) ?? null;
  const steps: TourStep[] = [
    { tab: "dispatch", title: "Who is busy this week", body: "The workload table shows each technician's hours against a 40-hour week, jobs today, and what they are doing next. Red means overbooked.", find: () => document.querySelector('[data-tour="workload"]') },
    { tab: "dispatch", title: "Jobs waiting to be scheduled", body: "New work lands in the dispatch queue. Try it: drag a card down onto a technician's row on the board.", find: () => document.querySelector('[data-tour="queue"]') },
    { tab: "dispatch", title: "Drag to schedule", body: "Drop a card on a technician at the time you want (it snaps to 30 minutes). Drag an existing block to move it or hand it to someone else. Amber blocks overlap.", find: () => document.querySelector('[data-tour="board"]') },
    { tab: "dispatch", title: "Day and week views", body: "Switch between the hourly day view and the week view. In the week view you can drag jobs between days.", find: byText("Week") },
    {
      tab: "dispatch",
      title: "The week view",
      body: "We switched to the week view for you: Monday to Sunday across the top, one row per technician. Drag a job to another day or technician and it keeps its time. Click a day header to jump into that day.",
      find: () => document.querySelector('[data-tour="board"]'),
      onEnter: () => byText("week")()?.click(),
      onLeave: () => byText("day")()?.click(),
    },
    { tab: "dispatch", title: "Every job is clickable", body: "Each block on the board opens a detail panel when you click it. Next, we will open one for you.", find: () => document.querySelector('[data-tour="board"] button[draggable="true"]') },
    {
      tab: "dispatch",
      title: "The job side panel",
      body: "Site details, date and time with quick length buttons, a searchable technician list with photos, and an amber warning if someone is double-booked. Unschedule sends the job back to the queue.",
      find: () => document.querySelector(".fixed.inset-y-0.right-0"),
      onEnter: () => (document.querySelector('[data-tour="board"] button[draggable="true"]') as HTMLElement | null)?.click(),
      onLeave: () => (document.querySelector('[aria-label="Close panel"]') as HTMLElement | null)?.click(),
    },
    {
      tab: "client",
      title: "The client requests inbox",
      body: "Requests from the client portal land here with scope, equipment, shipments, deliverables and a preferred window. Review, ask for clarification, decline, or convert. Try the buttons on any card.",
      find: () => document.querySelector('[data-tour="client"] article'),
      onEnter: () => innerTab("Requests")()?.click(),
    },
    {
      tab: "client",
      title: "Convert to a work order",
      body: "We opened the convert form for you. Pick a technician and rates, then Create work order. The job appears in the dispatch queue and the request gets a scheduling appointment.",
      find: () => byText("Create work order")()?.parentElement ?? null,
      onEnter: () => ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Convert to work order" && !(b as HTMLButtonElement).disabled) as HTMLElement | undefined)?.click(),
    },
    {
      tab: "client",
      title: "Approve portal access",
      body: "Client staff who ask for portal access wait here. Choose their access level and approve. Active users can be re-roled, paused or sent a fresh welcome.",
      find: () => [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes("Pending memberships"))?.parentElement ?? null,
      onEnter: () => innerTab("Approvals")()?.click(),
    },
    {
      tab: "client",
      title: "Scheduling",
      body: "Every appointment names its work order, job, client and address. Confirm a time with the calendar picker and it flows onto the dispatch board.",
      find: () => [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes("Scheduling"))?.parentElement ?? null,
      onEnter: () => innerTab("Scheduling")()?.click(),
    },
    { tab: "roster", title: "Find people by skill", body: "Search the roster by name, skill, tool or certification. Try \"fiber\" or \"otdr\".", find: () => document.querySelector('input[placeholder^="Search name"]') },
    { tab: "roster", title: "Profiles with photos", body: "Open a profile to add a photo, skills, tools and certifications. Contractors can also edit these themselves in their own portal.", find: byText("Profile") },
    { tab: "roster", title: "Timecards", body: "The timecard window opened for you. Each row shows the day, job site, hours, rate, supplies and travel, and whether it is approved or still pending.", find: () => modalCard(), cardAtTop: true, onEnter: () => byText("View History")()?.click(), onLeave: () => modalClose() },
  ];
  const activeTechs = contractors.filter((c) => c.accessStatus === "Active");
  const active = scheduleJob ? jobs.find((item) => item.id === scheduleJob.id) || scheduleJob : null;

  return (
    <DispatchDemoContext.Provider value={api}>
      <div className="dark min-h-screen bg-crm-surface-soft text-crm-body">
        <div className="border-b border-crm-hairline bg-crm-canvas px-4 py-3 sm:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-crm-warning">Interactive demo · sample data only</p>
              <h1 className="text-lg font-bold text-crm-ink">TechSavvy CRM</h1>
              <p className="text-[11px] text-crm-muted">
                Dispatch jobs on the board, work the Client Requests inbox, or search the Contractor Roster. Nothing here is connected to real customers, technicians or jobs, and changes reset when you reload.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setScheduleJob(null); setTab("dispatch"); setTouring(true); }}
                className="rounded bg-crm-primary px-3 py-2 text-xs font-bold text-crm-on-primary"
              >
                Take the guided tour
              </button>
              <button
                type="button"
                onClick={() => { setJobs(buildJobs()); setContractors(CONTRACTORS()); setClient(buildClientData()); setScheduleJob(null); }}
                className="rounded border border-crm-hairline px-3 py-2 text-xs font-bold text-crm-ink hover:border-crm-ink"
              >
                Reset demo data
              </button>
            </div>
          </div>
        </div>
        <nav className="border-b border-crm-hairline bg-crm-canvas px-4 sm:px-8">
          <div className="mx-auto flex max-w-[1500px] gap-1">
            {([["dispatch", "Schedule & Dispatch"], ["client", "Client Requests"], ["roster", "Contractor Roster"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setTab(id); setScheduleJob(null); }}
                className={`border-b-2 px-4 py-3 text-xs font-bold ${tab === id ? "border-crm-ink text-crm-ink" : "border-transparent text-crm-muted hover:text-crm-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
        <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-8">
          {tab === "dispatch" ? (
            <>
              <div data-tour="workload"><TechWorkloadSummary jobs={jobs} technicians={activeTechs} /></div>
              <div data-tour="queue"><LiveSchedulingQueue jobs={jobs} onSchedule={setScheduleJob} /></div>
              <div data-tour="board"><LiveScheduleBoard jobs={jobs} technicians={activeTechs} onSchedule={setScheduleJob} /></div>
            </>
          ) : tab === "client" ? (
            <div data-tour="client">
              <ClientRequestsAdmin contractors={activeTechs.map((c) => ({ id: c.id, name: c.name || "", email: String(c.email || "") }))} />
            </div>
          ) : (
            <ContractorRosterAdmin contractors={contractors} jobs={jobs} />
          )}
        </main>
        {touring && <DemoTour steps={steps} tab={tab} setTab={setTab} onClose={endTour} />}
        {active && (
          <div key={active.id}>
            <ScheduleModal job={active} jobs={jobs} technicians={activeTechs} onClose={() => setScheduleJob(null)} onOpenJob={() => undefined} />
          </div>
        )}
      </div>
    </DispatchDemoContext.Provider>
  );
}
