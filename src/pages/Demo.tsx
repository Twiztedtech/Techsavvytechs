import { useEffect, useMemo, useState } from "react";
import { ContractorRosterAdmin } from "../features/admin/ContractorRosterAdmin";
import { DispatchDemoContext } from "../features/admin/demoContext";
import { DemoTour, type TourStep } from "./DemoTour";
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

// Placeholder portraits (initials on a gradient) so the roster shows how photos look.
const portrait = (initials: string, from: string, to: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><text x="128" y="152" font-family="Arial,sans-serif" font-size="96" font-weight="700" fill="white" text-anchor="middle">${initials}</text></svg>`,
  )}`;

// Sample timecards for the past two weeks (weekdays only), matched to contractors by authUid.
const buildTimeEntries = () => {
  const today = pacificToday();
  const sites: Record<string, string[]> = {
    t1: ["Harbor Dental Group", "Maple Grove School", "Lakeside Credit Union"],
    t2: ["Northgate Apartments", "Pinecrest Law Offices", "Foundry Coworking"],
    t3: ["Summit Storage", "Riverside Logistics", "Cedar Point Clinic"],
    t4: ["Bayview Medical Plaza", "Summit Storage"],
    t5: ["Seaside Apartments", "Cedar Point Clinic"],
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
    id: "t1", authUid: "auth-t1", name: "Alex Rivera", email: "alex.rivera@example.com", specialty: "Fiber & structured cabling",
    rate: 85, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0111",
    profilePhotoUrl: portrait("AR", "#0f766e", "#14b8a6"), onboarding: { status: "approved" }, role: "technician_lead",
    skills: ["Fiber splicing", "Cat6A termination", "Rack dressing", "OTDR testing"],
    tools: ["Fusion splicer", "OTDR", "Fluke DSX-8000"],
    certifications: [{ id: "c1", name: "BICSI Installer 2", expiryDate: "2027-05-01" }, { id: "c2", name: "Fiber Optic Association CFOT", expiryDate: "" }],
  },
  {
    id: "t2", authUid: "auth-t2", name: "Jordan Lee", email: "jordan.lee@example.com", specialty: "Network & Wi-Fi",
    rate: 95, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0122",
    profilePhotoUrl: portrait("JL", "#1d4ed8", "#60a5fa"), onboarding: { status: "approved" },
    skills: ["Wi-Fi surveys", "Firewall configuration", "SD-WAN", "VLAN design"],
    tools: ["Ekahau sidekick", "Laptop with console cable"],
    certifications: [{ id: "c3", name: "CCNA", expiryDate: "2026-10-15" }],
  },
  {
    id: "t3", authUid: "auth-t3", name: "Sam Patel", email: "sam.patel@example.com", specialty: "Low-voltage & access control",
    rate: 80, employmentType: "w2_employee", accessStatus: "Active", active: true, businessPhone: "(555) 010-0133",
    profilePhotoUrl: portrait("SP", "#7c3aed", "#c084fc"), onboarding: { status: "approved" },
    skills: ["Access control wiring", "IP cameras", "Intercom systems", "Conduit runs"],
    tools: ["Bucket truck", "Conduit bender", "Toner and probe"],
    certifications: [{ id: "c4", name: "C-7 Low Voltage License", expiryDate: "2028-01-31" }],
  },
  {
    id: "t4", authUid: "auth-t4", name: "Casey Morgan", email: "casey.morgan@example.com", specialty: "RF / cell signal",
    rate: 100, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0144",
    profilePhotoUrl: portrait("CM", "#b45309", "#f59e0b"), onboarding: { status: "submitted" },
    skills: ["Cell booster commissioning", "DAS testing", "RF site survey"],
    tools: ["Spectrum analyzer", "Signal meter", "Antenna alignment kit"],
    certifications: [{ id: "c5", name: "FCC GROL", expiryDate: "" }],
  },
  {
    id: "t5", authUid: "auth-t5", name: "Riley Chen", email: "riley.chen@example.com", specialty: "Field technician",
    rate: 65, employmentType: "1099_contractor", accessStatus: "Active", active: true, businessPhone: "(555) 010-0155",
    onboarding: { status: "not_started" },
    skills: ["Equipment install", "Printer setup", "Basic cabling"], tools: ["Hand tools"], certifications: [],
  },
  {
    id: "t6", authUid: "auth-t6", name: "Morgan Ellis", email: "morgan.ellis@example.com", specialty: "Structured cabling",
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
    job(1, "Cat6A drops — second floor", "Harbor Dental Group", "120 Bay St, Sample City", "t1", 0, "08:00", "12:00"),
    job(2, "Wi-Fi survey and AP install", "Northgate Apartments", "48 Oak Ave, Sample City", "t2", 0, "09:00", "13:00"),
    job(3, "Camera install (6 units)", "Summit Storage", "900 Ridge Rd, Sample City", "t3", 0, "13:00", "17:00"),
    job(4, "Cell booster commissioning", "Bayview Medical Plaza", "77 Harbor Blvd, Sample City", "t4", 0, "10:00", "14:00"),
    job(5, "Rack dressing and labeling", "Lakeside Credit Union", "15 Main St, Sample City", "t1", 1, "09:00", "15:00"),
    job(6, "Firewall replacement", "Pinecrest Law Offices", "310 Pine St, Sample City", "t2", 1, "10:00", "12:00"),
    job(7, "Access control panel wiring", "Riverside Logistics", "5 Dock Way, Sample City", "t3", 2, "08:00", "16:00"),
    job(8, "Fiber splice and OTDR test", "Maple Grove School", "22 Maple Ln, Sample City", "t1", 2, "08:00", "11:00"),
    job(9, "Printer and network install", "Seaside Apartments", "2000 Coast Cir, Sample City", null, null),
    job(10, "Conference room AV cabling", "Foundry Coworking", "8 Foundry Ct, Sample City", null, null),
    job(11, "Wi-Fi coverage check", "Cedar Point Clinic", "61 Cedar Pt, Sample City", "t5", null),
  ];
}

export default function Demo() {
  const [tab, setTab] = useState<"dispatch" | "roster">("dispatch");
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
  const [scheduleJob, setScheduleJob] = useState<LiveJob | null>(null);
  const api = useMemo(
    () => ({
      updateJob: (jobId: string, patch: Record<string, unknown>) =>
        setJobs((current) => current.map((item) => (item.id === jobId ? ({ ...item, ...patch } as LiveJob) : item))),
      updateContractor: (contractorId: string, patch: Record<string, unknown>) =>
        setContractors((current) => current.map((item) => (item.id === contractorId ? { ...item, ...patch } : item))),
      addContractor: (record: Record<string, unknown>) =>
        setContractors((current) => [...current, record as Technician & Record<string, any>]),
      timeEntries,
    }),
    [timeEntries],
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
  const steps: TourStep[] = [
    { tab: "dispatch", title: "Who is busy this week", body: "The workload table shows each technician's hours against a 40-hour week, jobs today, and what they are doing next. Red means overbooked.", find: () => document.querySelector('[data-tour="workload"]') },
    { tab: "dispatch", title: "Jobs waiting to be scheduled", body: "New work lands in the dispatch queue. Try it: drag a card down onto a technician's row on the board.", find: () => document.querySelector('[data-tour="queue"]') },
    { tab: "dispatch", title: "Drag to schedule", body: "Drop a card on a technician at the time you want (it snaps to 30 minutes). Drag an existing block to move it or hand it to someone else. Amber blocks overlap.", find: () => document.querySelector('[data-tour="board"]') },
    { tab: "dispatch", title: "Day and week views", body: "Switch between the hourly day view and the week view. In the week view you can drag jobs between days.", find: byText("Week") },
    { tab: "dispatch", title: "Open any job", body: "Click a job block to open its side panel: site details, date and time, technicians with conflict warnings, and Unschedule.", find: () => document.querySelector('[data-tour="board"] button[draggable="true"]') },
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
                Try dispatching jobs on the board, or open the Contractor Roster to search skills and edit a profile. Nothing here is connected to real customers, technicians or jobs, and changes reset when you reload.
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
                onClick={() => { setJobs(buildJobs()); setContractors(CONTRACTORS()); setScheduleJob(null); }}
                className="rounded border border-crm-hairline px-3 py-2 text-xs font-bold text-crm-ink hover:border-crm-ink"
              >
                Reset demo data
              </button>
            </div>
          </div>
        </div>
        <nav className="border-b border-crm-hairline bg-crm-canvas px-4 sm:px-8">
          <div className="mx-auto flex max-w-[1500px] gap-1">
            {([["dispatch", "Schedule & Dispatch"], ["roster", "Contractor Roster"]] as const).map(([id, label]) => (
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
