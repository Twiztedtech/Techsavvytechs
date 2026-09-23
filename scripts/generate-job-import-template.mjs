// One-off generator for the customer-facing bulk job-import template.
// Run with: node scripts/generate-job-import-template.mjs
// Regenerate and re-commit the output whenever the template columns change.
import xlsx from "xlsx";
import { mkdirSync } from "node:fs";

const wb = xlsx.utils.book_new();

const instructions = [
  ["TechSavvy LLC — Bulk Job Import Template"],
  [],
  ["How to use this file:"],
  ["1. Fill in the 'Jobs' tab — one row per job you want to request. Give each job a short, unique Job Code (e.g. JOB-1, JOB-2)."],
  ["2. If a job has equipment or materials, add rows on the 'Equipment' tab using the same Job Code to link them."],
  ["3. If you're shipping anything to the site or to TechSavvy's office for a job, list it on the 'Packages' tab, again using the same Job Code."],
  ["4. Delete the example row on each tab before uploading (it's just there to show the expected format)."],
  ["5. Upload this file in the Client Portal under New Request > Bulk import. You'll see a preview of every job before anything is submitted."],
  [],
  ["Notes:"],
  ["- Dates: MM/DD/YYYY. Times: any time of day is fine (e.g. 8:00 AM, 14:30). Standard hours are 7:00 AM-5:00 PM Pacific; anything outside that is extended/night-rate work."],
  ["- Scope Tasks and Required Deliverables: put each item on its own line within the cell (Alt+Enter in Excel for a new line in the same cell)."],
  ["- Service Type must be one of: Low-voltage, Network, MSP support, Cellular enhancement, Site survey, Other."],
  ["- Provided By (Equipment tab) must be one of: Client, TechSavvy."],
  ["- Destination (Packages tab) must be one of: Site, Office."],
  ["- You can submit anywhere from a single job to 200 jobs in one file."],
];
const wsInstructions = xlsx.utils.aoa_to_sheet(instructions);
wsInstructions["!cols"] = [{ wch: 100 }];
xlsx.utils.book_append_sheet(wb, wsInstructions, "Instructions");

const jobsHeader = [
  "Job Code",
  "Site Name",
  "Full Site Address",
  "Site Contact (name, phone, email)",
  "Service Type",
  "Scope Summary",
  "Scope Tasks (one per line)",
  "Required Deliverables (one per line)",
  "Access / Check-in Instructions",
  "Safety Requirements",
  "PO / Project Reference #",
  "Preferred Date",
  "Preferred Start",
  "Preferred End",
  "Alternate Date",
  "Alternate Start",
  "Alternate End",
];
const jobsExample = [
  "JOB-1",
  "Example Distribution Center",
  "123 Main St, Fairfield, CA 94533",
  "Jane Doe, (707) 555-0100, jane@example.com",
  "Low-voltage",
  "Install Cat6A cabling for 12 new workstation drops in the east wing.",
  "Run cable to 12 drops\nTerminate and label each drop\nTest and certify all runs",
  "Cable test/certification report\nLabeled patch panel photo",
  "Check in at front desk, ask for Jane",
  "Hard hat required in warehouse area",
  "PO-4821",
  "10/06/2026",
  "8:00 AM",
  "12:00 PM",
  "10/07/2026",
  "1:00 PM",
  "5:00 PM",
];
const wsJobs = xlsx.utils.aoa_to_sheet([jobsHeader, jobsExample]);
wsJobs["!cols"] = jobsHeader.map((h) => ({ wch: Math.max(18, Math.min(40, h.length + 4)) }));
xlsx.utils.book_append_sheet(wb, wsJobs, "Jobs");

const equipmentHeader = [
  "Job Code",
  "Description",
  "Qty",
  "UPC",
  "Serial #",
  "Provided By",
  "Notes",
];
const equipmentExample = [
  "JOB-1",
  "Cat6A cable, 1000ft box",
  "3",
  "",
  "",
  "TechSavvy",
  "",
];
const wsEquipment = xlsx.utils.aoa_to_sheet([equipmentHeader, equipmentExample]);
wsEquipment["!cols"] = equipmentHeader.map((h) => ({ wch: Math.max(14, Math.min(30, h.length + 4)) }));
xlsx.utils.book_append_sheet(wb, wsEquipment, "Equipment");

const packagesHeader = ["Job Code", "Destination", "Carrier", "Tracking Number", "Description"];
const packagesExample = ["JOB-1", "Site", "UPS", "1Z999AA10123456784", "Box of PoE switches"];
const wsPackages = xlsx.utils.aoa_to_sheet([packagesHeader, packagesExample]);
wsPackages["!cols"] = packagesHeader.map((h) => ({ wch: Math.max(14, Math.min(30, h.length + 4)) }));
xlsx.utils.book_append_sheet(wb, wsPackages, "Packages");

mkdirSync(new URL("../public/templates", import.meta.url), { recursive: true });
xlsx.writeFile(wb, new URL("../public/templates/techsavvy-job-import-template.xlsx", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
console.log("Wrote public/templates/techsavvy-job-import-template.xlsx");
