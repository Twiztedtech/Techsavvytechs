import { useEffect, useMemo, useState } from "react";
import {
  DispatchDemoContext,
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

const TECHS: Technician[] = [
  { id: "t1", name: "Alex Rivera", specialty: "Fiber & structured cabling", accessStatus: "Active" },
  { id: "t2", name: "Jordan Lee", specialty: "Network & Wi-Fi", accessStatus: "Active" },
  { id: "t3", name: "Sam Patel", specialty: "Low-voltage & access control", accessStatus: "Active" },
  { id: "t4", name: "Casey Morgan", specialty: "RF / cell signal", accessStatus: "Active" },
  { id: "t5", name: "Riley Chen", specialty: "Field technician", accessStatus: "Active" },
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
  const [jobs, setJobs] = useState<LiveJob[]>(buildJobs);
  const [scheduleJob, setScheduleJob] = useState<LiveJob | null>(null);
  const api = useMemo(
    () => ({
      updateJob: (jobId: string, patch: Record<string, unknown>) =>
        setJobs((current) => current.map((item) => (item.id === jobId ? ({ ...item, ...patch } as LiveJob) : item))),
    }),
    [],
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

  const active = scheduleJob ? jobs.find((item) => item.id === scheduleJob.id) || scheduleJob : null;

  return (
    <DispatchDemoContext.Provider value={api}>
      <div className="dark min-h-screen bg-crm-surface-soft text-crm-body">
        <div className="border-b border-crm-hairline bg-crm-canvas px-4 py-3 sm:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-crm-warning">Interactive demo · sample data only</p>
              <h1 className="text-lg font-bold text-crm-ink">TechSavvy Schedule &amp; Dispatch</h1>
              <p className="text-[11px] text-crm-muted">
                Drag jobs from the queue onto a technician, switch to the week view, or click a job. Nothing here is connected to real customers, technicians or jobs, and changes reset when you reload.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setJobs(buildJobs()); setScheduleJob(null); }}
              className="rounded border border-crm-hairline px-3 py-2 text-xs font-bold text-crm-ink hover:border-crm-ink"
            >
              Reset demo data
            </button>
          </div>
        </div>
        <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-8">
          <TechWorkloadSummary jobs={jobs} technicians={TECHS} />
          <LiveSchedulingQueue jobs={jobs} onSchedule={setScheduleJob} />
          <LiveScheduleBoard jobs={jobs} technicians={TECHS} onSchedule={setScheduleJob} />
        </main>
        {active && (
          <div key={active.id}>
            <ScheduleModal job={active} jobs={jobs} technicians={TECHS} onClose={() => setScheduleJob(null)} onOpenJob={() => undefined} />
          </div>
        )}
      </div>
    </DispatchDemoContext.Provider>
  );
}
