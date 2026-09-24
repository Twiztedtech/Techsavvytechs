import { randomInt } from "node:crypto";
import { prepareUpload, verifyUpload } from "./booking-uploads.js";
import { submitClientFeedback } from "./client-feedback-handler.js";
import { adminAuth, adminDb, adminStorage } from "./firebase-admin.js";
import { jobEditState } from "./job-access.js";
import {
  CLIENT_ROLES,
  addBusinessDays,
  alertRecipients,
  canAccessJob,
  clean,
  emailDomain,
  hasRole,
  hashValue,
  ipFor,
  normalizeEmail,
  normalizePhone,
  notifyMembershipApproved,
  notifyNewRequest,
  nowIso,
  opaqueToken,
  optionalUser,
  escapeHtml,
  publicTechnician,
  rateLimited,
  recordEvent,
  requireClient,
  requireUser,
  safeEqual,
  sendEmail,
  sendSms,
  uploadInlineFiles,
  verificationHash,
} from "./client-portal.js";

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function requestedWindows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 3)
    .map((window) => ({
      date: clean(window?.date, 10),
      start: clean(window?.start, 5),
      end: clean(window?.end, 5),
    }))
    .filter((window) => {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(window.date) ||
        !/^\d{2}:\d{2}$/.test(window.start) ||
        !/^\d{2}:\d{2}$/.test(window.end)
      )
        return false;
      const weekday = new Date(`${window.date}T12:00:00Z`).getUTCDay();
      // Any time of day is requestable now (standard hours are 7:00 AM-5:00
      // PM; anything outside that is extended/night-rate work, not simply
      // disallowed). Still same calendar day only -- a window spanning past
      // midnight isn't supported here.
      return ![0, 6].includes(weekday) && window.end > window.start;
    });
}

function isUrgent(windows) {
  if (!windows[0]) return false;
  const requested = new Date(`${windows[0].date}T${windows[0].start}:00-07:00`);
  return requested < addBusinessDays(new Date(), 2);
}

async function findOrganization(domain) {
  if (!domain) return null;
  const snapshot = await adminDb
    .collection("customers")
    .where("approvedDomains", "array-contains", domain)
    .limit(1)
    .get();
  return snapshot.empty
    ? null
    : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function createRequest(req, res) {
  const portalSettings = await adminDb
    .collection("settings")
    .doc("client_portal")
    .get();
  if (portalSettings.exists && portalSettings.data().enabled === false)
    return res
      .status(404)
      .json({ error: "Client booking is not currently accepting requests." });
  if (req.body?.website) return res.status(202).json({ success: true });
  if (rateLimited(req, "booking", 4))
    return res
      .status(429)
      .json({ error: "Please wait before submitting another request." });
  const requesterEmail = normalizeEmail(req.body?.requesterEmail);
  const windows = requestedWindows(req.body?.requestedWindows);
  const required = [
    req.body?.companyName,
    req.body?.requesterName,
    requesterEmail,
    req.body?.requesterPhone,
    req.body?.siteName,
    req.body?.address,
    req.body?.scopeSummary,
  ];
  if (
    !required.every((value) => clean(value, 500)) ||
    !validEmail(requesterEmail) ||
    windows.length === 0
  ) {
    return res.status(422).json({
      error:
        "Complete the company, contact, site, scope, and requested scheduling fields.",
    });
  }
  const user = await optionalUser(req).catch(() => null);
  let clientProfile = null;
  let organization = await findOrganization(emailDomain(requesterEmail));
  if (user) {
    const profileDoc = await adminDb
      .collection("client_users")
      .doc(user.uid)
      .get();
    if (profileDoc.exists && profileDoc.data().status !== "active")
      return res.status(403).json({
        error: "Your client account must be approved before booking a job.",
      });
    if (profileDoc.exists && profileDoc.data().status === "active") {
      clientProfile = { id: profileDoc.id, ...profileDoc.data() };
      const organizationDoc = await adminDb
        .collection("customers")
        .doc(clientProfile.customerId)
        .get();
      if (!organizationDoc.exists)
        return res
          .status(422)
          .json({ error: "Your client company is no longer available." });
      organization = { id: organizationDoc.id, ...organizationDoc.data() };
      if (requesterEmail !== normalizeEmail(user.email))
        return res.status(422).json({
          error: "Use the email address associated with your client account.",
        });
    }
  }
  if (portalSettings.data()?.pilotOnly === true && !organization?.id)
    return res.status(403).json({
      error: "Online booking is currently limited to approved pilot companies.",
    });
  const ref = adminDb.collection("vendor_requests").doc();
  const sequence = Date.now().toString().slice(-7);
  const requestNumber = `TS-${new Date().getUTCFullYear()}-${sequence}`;
  let prefix = clean(req.body?.referencePrefix, 40);
  if (organization?.id) {
    const approved = Array.isArray(organization.referencePrefixes)
      ? organization.referencePrefixes
      : [];
    if (prefix && !approved.includes(prefix))
      return res.status(422).json({
        error: "Choose an approved reference prefix for this company.",
      });
    if (!prefix && approved.length) prefix = approved[0];
  }
  const suppliedReference = clean(req.body?.clientReference, 80);
  const clientReference = suppliedReference
    ? `${prefix}${suppliedReference}`
    : `${prefix || "REQ-"}${sequence}`;
  if (organization?.id) {
    const duplicate = await adminDb
      .collection("vendor_requests")
      .where("customerId", "==", organization.id)
      .where("clientReference", "==", clientReference)
      .limit(1)
      .get();
    if (!duplicate.empty)
      return res.status(409).json({
        error: "That client reference is already used by this company.",
      });
  }
  const createdAt = nowIso();
  const statusToken = opaqueToken();
  const request = {
    requestNumber,
    companyName: clientProfile
      ? organization.name
      : clean(req.body.companyName, 150),
    customerId: organization?.id || "",
    createdByClientUid: clientProfile?.id || user?.uid || "",
    requesterName: clientProfile
      ? clean(clientProfile.displayName, 120)
      : clean(req.body.requesterName, 120),
    requesterEmail: clientProfile ? normalizeEmail(user.email) : requesterEmail,
    requesterPhone: clientProfile
      ? normalizePhone(clientProfile.phone)
      : normalizePhone(req.body.requesterPhone),
    clientReference,
    clientProjectManager: clean(req.body.clientProjectManager, 150),
    siteName: clean(req.body.siteName, 160),
    address: clean(req.body.address, 300),
    siteContact: clean(req.body.siteContact, 200),
    accessInstructions: clean(req.body.accessInstructions, 2000),
    serviceType: clean(req.body.serviceType, 80),
    scopeSummary: clean(req.body.scopeSummary, 5000),
    scopeTasks: Array.isArray(req.body.scopeTasks)
      ? req.body.scopeTasks
          .map((v) => clean(v, 500))
          .filter(Boolean)
          .slice(0, 30)
      : [],
    equipment: Array.isArray(req.body.equipment)
      ? req.body.equipment
          .slice(0, 30)
          .map((v) => ({
            description: clean(v?.description, 300),
            quantity: clean(v?.quantity, 50),
            upc: clean(v?.upc, 60),
            serial: clean(v?.serial, 60),
            notes: clean(v?.notes, 300),
            providedBy: v?.providedBy === "techsavvy" ? "techsavvy" : "client",
          }))
          .filter((v) => v.description)
      : [],
    // Shipments the customer has coming (or already sent) to the site or the
    // TechSavvy office for this job, so dispatch knows what to expect and
    // isn't caught off guard by an unlabeled box at the front desk.
    packages: Array.isArray(req.body.packages)
      ? req.body.packages
          .slice(0, 30)
          .map((v) => ({
            carrier: clean(v?.carrier, 80),
            trackingNumber: clean(v?.trackingNumber, 120),
            destination: v?.destination === "office" ? "office" : "site",
            description: clean(v?.description, 300),
          }))
          .filter((v) => v.trackingNumber || v.description)
      : [],
    deliverables: Array.isArray(req.body.deliverables)
      ? req.body.deliverables
          .map((value) => clean(value, 500))
          .filter(Boolean)
          .slice(0, 30)
      : clean(req.body.deliverables, 2000)
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
    safetyRequirements: clean(req.body.safetyRequirements, 2000),
    requestedWindows: windows,
    urgent: isUrgent(windows),
    status: "requested",
    directContactRequested: req.body.directContactRequested === true,
    directContactDecision: "techsavvy_only",
    smsConsent:
      req.body.smsConsent === true
        ? {
            optedIn: true,
            phone: clientProfile
              ? normalizePhone(clientProfile.phone)
              : normalizePhone(req.body.requesterPhone),
            consentVersion: "client-booking-2026-08",
            consentedAt: createdAt,
          }
        : { optedIn: false },
    attachments: [],
    statusTokenHash: hashValue(statusToken),
    createdAt,
    updatedAt: createdAt,
  };
  const uploadSession = clean(req.body?.uploadSession, 80);
  const attachments = [];
  for (const file of Array.isArray(req.body?.attachments)
    ? req.body.attachments
    : []) {
    attachments.push(
      await verifyUpload(
        file.receipt,
        uploadSession,
        user?.uid || hashValue(ipFor(req)),
      ),
    );
  }
  request.attachments = attachments;
  await ref.set(request);
  await recordEvent({
    requestId: ref.id,
    type: "request_created",
    actorUid: user?.uid || "",
    actorRole: user ? "client" : "public",
    visibility: "client",
    message: "Job request submitted.",
  });
  await notifyNewRequest({ id: ref.id, ...request });
  const statusUrl = `${(process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "")}/request-status?request=${encodeURIComponent(ref.id)}&token=${encodeURIComponent(statusToken)}`;
  await sendEmail({
    to: requesterEmail,
    subject: `We received ${requestNumber}`,
    text: `Your TechSavvy job request ${requestNumber} has been received. Track it or answer clarification requests here: ${statusUrl}`,
    html: `<h1>Request received</h1><p>Your TechSavvy job request <strong>${requestNumber}</strong> has been received.</p><p><a href="${statusUrl}">Track your request</a></p>`,
    type: "request_receipt",
  }).catch(() => null);
  return res.status(201).json({
    success: true,
    requestId: ref.id,
    requestNumber,
    urgent: request.urgent,
    statusUrl,
  });
}

// ---------------------------------------------------------------------------
// Bulk job import (spreadsheet upload) -- lets a logged-in client submit many
// job requests at once instead of filling the form one at a time. A "Jobs"
// row is required per job; "Equipment" and "Packages" rows are optional and
// link back to a job by its Job Code. Every row still goes through the same
// field limits/shape as a single web-form submission (see createRequest
// above) so nothing downstream (admin review, conversion to a work order)
// needs to know a request came from a spreadsheet instead of the form.
const BULK_IMPORT_MAX_ROWS = 200;
// Kept well under the platform's ~4.5 MB request body ceiling once base64
// encoded (raw bytes * ~1.37 for base64 overhead) -- a 200-row text-only
// spreadsheet is realistically well under 1 MB, so this still leaves room.
const BULK_IMPORT_MAX_BYTES = 2.5 * 1024 * 1024;
const SERVICE_TYPE_LABELS = {
  "low-voltage": "low-voltage",
  network: "network",
  "msp support": "msp",
  "cellular enhancement": "cell-boosting",
  "site survey": "survey",
  other: "other",
};

function cellText(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function splitLines(value) {
  return cellText(value)
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDateCell(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : "";
}

function parseTimeCell(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }
  const text = cellText(value);
  const ampm = text.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let hours = Number(ampm[1]) % 12;
    if (/p/i.test(ampm[3])) hours += 12;
    return `${String(hours).padStart(2, "0")}:${ampm[2]}`;
  }
  const plain = text.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
  return "";
}

function normalizeServiceType(value) {
  const key = cellText(value).toLowerCase();
  return SERVICE_TYPE_LABELS[key] || "other";
}

async function parseBulkImportWorkbook(buffer) {
  const XLSX = (await import("xlsx")).default;
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw Object.assign(new Error("That file could not be read. Please use the provided .xlsx template."), {
      statusCode: 422,
    });
  }
  const jobsSheet = workbook.Sheets["Jobs"];
  if (!jobsSheet)
    throw Object.assign(new Error('This file has no "Jobs" tab. Please use the provided template.'), {
      statusCode: 422,
    });
  const jobRows = XLSX.utils.sheet_to_json(jobsSheet, { defval: "" });
  const equipmentRows = workbook.Sheets["Equipment"]
    ? XLSX.utils.sheet_to_json(workbook.Sheets["Equipment"], { defval: "" })
    : [];
  const packageRows = workbook.Sheets["Packages"]
    ? XLSX.utils.sheet_to_json(workbook.Sheets["Packages"], { defval: "" })
    : [];

  const filledJobRows = jobRows.filter((row) => cellText(row["Job Code"]));
  if (filledJobRows.length === 0)
    throw Object.assign(new Error('No job rows found. Fill in the "Jobs" tab and try again.'), {
      statusCode: 422,
    });
  if (filledJobRows.length > BULK_IMPORT_MAX_ROWS)
    throw Object.assign(
      new Error(`This file has ${filledJobRows.length} jobs -- please split it into batches of ${BULK_IMPORT_MAX_ROWS} or fewer.`),
      { statusCode: 422 },
    );

  const equipmentByJob = new Map();
  for (const row of equipmentRows) {
    const jobCode = cellText(row["Job Code"]);
    const description = clean(row["Description"], 300);
    if (!jobCode || !description) continue;
    const list = equipmentByJob.get(jobCode) || [];
    list.push({
      description,
      quantity: clean(row["Qty"], 50),
      upc: clean(row["UPC"], 60),
      serial: clean(row["Serial #"], 60),
      notes: clean(row["Notes"], 300),
      providedBy: cellText(row["Provided By"]).toLowerCase() === "techsavvy" ? "techsavvy" : "client",
    });
    equipmentByJob.set(jobCode, list.slice(0, 30));
  }

  const packagesByJob = new Map();
  for (const row of packageRows) {
    const jobCode = cellText(row["Job Code"]);
    const trackingNumber = clean(row["Tracking Number"], 120);
    const description = clean(row["Description"], 300);
    if (!jobCode || (!trackingNumber && !description)) continue;
    const list = packagesByJob.get(jobCode) || [];
    list.push({
      carrier: clean(row["Carrier"], 80),
      trackingNumber,
      destination: cellText(row["Destination"]).toLowerCase() === "office" ? "office" : "site",
      description,
    });
    packagesByJob.set(jobCode, list.slice(0, 30));
  }

  const seenCodes = new Set();
  return filledJobRows.map((row) => {
    const jobCode = cellText(row["Job Code"]).slice(0, 40);
    const errors = [];
    if (seenCodes.has(jobCode)) errors.push(`Job Code "${jobCode}" is used more than once.`);
    seenCodes.add(jobCode);

    const siteName = clean(row["Site Name"], 160);
    const address = clean(row["Full Site Address"], 300);
    const scopeSummary = clean(row["Scope Summary"], 5000);
    if (!siteName) errors.push("Site Name is required.");
    if (!address) errors.push("Full Site Address is required.");
    if (!scopeSummary) errors.push("Scope Summary is required.");

    const preferredDate = parseDateCell(row["Preferred Date"]);
    const preferredStart = parseTimeCell(row["Preferred Start"]);
    const preferredEnd = parseTimeCell(row["Preferred End"]);
    const alternateDate = parseDateCell(row["Alternate Date"]);
    const alternateStart = parseTimeCell(row["Alternate Start"]);
    const alternateEnd = parseTimeCell(row["Alternate End"]);
    if (!preferredDate || !preferredStart || !preferredEnd)
      errors.push("Preferred Date, Preferred Start, and Preferred End are required.");

    const rawWindows = [
      { date: preferredDate, start: preferredStart, end: preferredEnd },
      ...(alternateDate ? [{ date: alternateDate, start: alternateStart, end: alternateEnd }] : []),
    ];
    const windows = requestedWindows(rawWindows);
    if (preferredDate && windows.length === 0)
      errors.push("Requested windows must be on a weekday with the end time after the start time.");

    return {
      jobCode,
      siteName,
      address,
      siteContact: clean(row["Site Contact (name, phone, email)"], 200),
      serviceType: normalizeServiceType(row["Service Type"]),
      scopeSummary,
      scopeTasks: splitLines(row["Scope Tasks (one per line)"]).slice(0, 30),
      deliverables: splitLines(row["Required Deliverables (one per line)"]).slice(0, 30),
      accessInstructions: clean(row["Access / Check-in Instructions"], 2000),
      safetyRequirements: clean(row["Safety Requirements"], 2000),
      clientReference: clean(row["PO / Project Reference #"], 80),
      equipment: equipmentByJob.get(jobCode) || [],
      packages: packagesByJob.get(jobCode) || [],
      requestedWindows: windows,
      urgent: isUrgent(windows),
      valid: errors.length === 0,
      errors,
    };
  });
}

async function resolveClientOrganization(req) {
  const { profile } = await requireClient(req);
  const orgSnapshot = await adminDb.collection("customers").doc(profile.customerId).get();
  if (!orgSnapshot.exists)
    throw Object.assign(new Error("Your client company is no longer available."), { statusCode: 422 });
  return { profile, organization: { id: orgSnapshot.id, ...orgSnapshot.data() } };
}

function readUploadedFile(req) {
  const base64 = typeof req.body?.fileBase64 === "string" ? req.body.fileBase64 : "";
  if (!base64)
    throw Object.assign(new Error("Choose a completed template file to upload."), { statusCode: 422 });
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > BULK_IMPORT_MAX_BYTES)
    throw Object.assign(new Error("The file must be between 1 byte and 2.5 MB."), { statusCode: 422 });
  return buffer;
}

async function bulkImportPreview(req, res) {
  const { organization } = await resolveClientOrganization(req);
  const buffer = readUploadedFile(req);
  const jobs = await parseBulkImportWorkbook(buffer);
  const approvedPrefixes = Array.isArray(organization.referencePrefixes) ? organization.referencePrefixes : [];
  for (const job of jobs) {
    if (!job.valid || !job.clientReference) continue;
    const prefix = approvedPrefixes.find((value) => job.clientReference.startsWith(value)) || "";
    const duplicate = await adminDb
      .collection("vendor_requests")
      .where("customerId", "==", organization.id)
      .where("clientReference", "==", `${prefix}${job.clientReference}`)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      job.valid = false;
      job.errors.push(`Reference "${job.clientReference}" is already used by this company.`);
    }
  }
  return res.status(200).json({
    jobs,
    validCount: jobs.filter((job) => job.valid).length,
    invalidCount: jobs.filter((job) => !job.valid).length,
  });
}

async function bulkImportSubmit(req, res) {
  if (rateLimited(req, "bulk-import-submit", 5, 60 * 60 * 1000))
    return res.status(429).json({ error: "Please wait before submitting another bulk import." });
  const { profile, organization } = await resolveClientOrganization(req);
  const buffer = readUploadedFile(req);
  const jobs = await parseBulkImportWorkbook(buffer);
  const approvedPrefixes = Array.isArray(organization.referencePrefixes) ? organization.referencePrefixes : [];
  const created = [];
  const skipped = [];
  for (const job of jobs) {
    if (!job.valid) {
      skipped.push({ jobCode: job.jobCode, errors: job.errors });
      continue;
    }
    const sequence = `${Date.now().toString().slice(-7)}${created.length}`;
    const requestNumber = `TS-${new Date().getUTCFullYear()}-${sequence}`;
    const prefix = job.clientReference
      ? approvedPrefixes.find((value) => job.clientReference.startsWith(value)) || approvedPrefixes[0] || ""
      : approvedPrefixes[0] || "";
    const clientReference = job.clientReference ? `${prefix}${job.clientReference}` : `${prefix || "REQ-"}${sequence}`;
    const duplicate = await adminDb
      .collection("vendor_requests")
      .where("customerId", "==", organization.id)
      .where("clientReference", "==", clientReference)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      skipped.push({ jobCode: job.jobCode, errors: [`Reference "${clientReference}" is already used by this company.`] });
      continue;
    }
    const createdAt = nowIso();
    const statusToken = opaqueToken();
    const ref = adminDb.collection("vendor_requests").doc();
    const record = {
      requestNumber,
      companyName: organization.name,
      customerId: organization.id,
      createdByClientUid: profile.id,
      requesterName: clean(profile.displayName, 120),
      requesterEmail: normalizeEmail(profile.email),
      requesterPhone: normalizePhone(profile.phone),
      clientReference,
      clientProjectManager: "",
      siteName: job.siteName,
      address: job.address,
      siteContact: job.siteContact,
      accessInstructions: job.accessInstructions,
      serviceType: job.serviceType,
      scopeSummary: job.scopeSummary,
      scopeTasks: job.scopeTasks,
      equipment: job.equipment,
      packages: job.packages,
      deliverables: job.deliverables,
      safetyRequirements: job.safetyRequirements,
      requestedWindows: job.requestedWindows,
      urgent: job.urgent,
      status: "requested",
      directContactRequested: false,
      directContactDecision: "techsavvy_only",
      smsConsent: { optedIn: false },
      attachments: [],
      statusTokenHash: hashValue(statusToken),
      source: "bulk_import",
      createdAt,
      updatedAt: createdAt,
    };
    await ref.set(record);
    await recordEvent({
      requestId: ref.id,
      type: "request_created",
      actorUid: profile.id,
      actorRole: "client",
      visibility: "client",
      message: "Job request submitted via bulk import.",
    });
    await notifyNewRequest({ id: ref.id, ...record });
    created.push({ jobCode: job.jobCode, requestId: ref.id, requestNumber });
  }
  if (created.length) {
    const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "");
    await sendEmail({
      to: normalizeEmail(profile.email),
      subject: `We received ${created.length} job request${created.length === 1 ? "" : "s"}`,
      text: `Your bulk job import is complete.\n\nCreated: ${created.map((job) => `${job.jobCode} -> ${job.requestNumber}`).join(", ")}\n${skipped.length ? `Skipped (see errors): ${skipped.map((job) => job.jobCode).join(", ")}\n` : ""}\nTrack these in the client portal: ${appUrl}/client`,
      html: `<h1>Bulk import complete</h1><p>${created.length} job request${created.length === 1 ? "" : "s"} created${skipped.length ? `, ${skipped.length} skipped` : ""}.</p><p><a href="${appUrl}/client">Open the client portal</a></p>`,
      type: "bulk_import_receipt",
    }).catch(() => null);
  }
  return res.status(201).json({ success: true, created, skipped });
}

async function uploadRequestFile(req, res) {
  if (rateLimited(req, "request-file", 60))
    return res.status(429).json({
      error: "Please wait before uploading additional documents.",
    });
  const uploadSession = clean(req.body?.uploadSession, 80);
  if (!/^[a-f0-9-]{30,40}$/i.test(uploadSession))
    return res.status(422).json({ error: "The upload session is invalid." });
  const user = await optionalUser(req);
  const settings = await adminDb
    .collection("settings")
    .doc("client_portal")
    .get();
  if (settings.data()?.enabled === false)
    return res.status(403).json({ error: "Client booking is unavailable." });
  return res
    .status(201)
    .json(
      await prepareUpload(
        uploadSession,
        req.body?.file,
        user?.uid || hashValue(ipFor(req)),
      ),
    );
}

async function publicRequestStatus(req, res) {
  const requestId = clean(req.query?.requestId || req.body?.requestId, 120);
  const token = clean(req.query?.token || req.body?.token, 200);
  const snapshot = await adminDb
    .collection("vendor_requests")
    .doc(requestId)
    .get();
  if (
    !snapshot.exists ||
    !token ||
    snapshot.data().statusTokenHash !== hashValue(token)
  )
    return res
      .status(404)
      .json({ error: "Request tracking link is invalid or expired." });
  if (req.method === "POST") {
    if (rateLimited(req, `request-message:${requestId}`, 8))
      return res
        .status(429)
        .json({ error: "Please wait before sending another reply." });
    const message = clean(req.body?.message, 5000);
    if (!message) return res.status(422).json({ error: "Enter a reply." });
    await adminDb.collection("job_messages").add({
      requestId,
      customerId: snapshot.data().customerId || "",
      authorName: snapshot.data().requesterName,
      authorRole: "client",
      visibility: "client",
      message,
      source: "private_status_link",
      createdAt: nowIso(),
    });
    await recordEvent({
      requestId,
      type: "clarification_reply",
      actorRole: "client",
      visibility: "client",
      message: "Client replied to the request.",
    });
    await sendEmail({
      to:
        process.env.CLIENT_REQUEST_ALERT_EMAILS?.split(",") ||
        process.env.SUPPORT_EMAIL,
      subject: `${snapshot.data().requestNumber} clarification reply`,
      text: message,
      html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
      type: "clarification_reply",
    }).catch(() => null);
  }
  const [events, messages] = await Promise.all([
    adminDb.collection("job_events").where("requestId", "==", requestId).get(),
    adminDb
      .collection("job_messages")
      .where("requestId", "==", requestId)
      .get(),
  ]);
  const data = snapshot.data();
  return res.status(200).json({
    request: {
      requestNumber: data.requestNumber,
      companyName: data.companyName,
      siteName: data.siteName,
      status: data.status,
      requestedWindows: data.requestedWindows,
      reviewNote: data.reviewNote || "",
      convertedJobId: data.convertedJobId || "",
    },
    events: events.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((event) => event.visibility === "client")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    messages: messages.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((message) => message.visibility === "client")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
  });
}

async function registerMembership(req, res) {
  const user = await requireUser(req);
  const email = normalizeEmail(user.email);
  const phone = normalizePhone(req.body?.phone);
  if (!user.email_verified)
    return res
      .status(403)
      .json({ error: "Verify your email before requesting company access." });
  const organization = await findOrganization(emailDomain(email));
  const requestedOrgId = clean(req.body?.organizationId, 100);
  const customerId = organization?.id || requestedOrgId;
  if (!customerId)
    return res.status(422).json({
      error:
        "No approved company matches this email domain. Submit a first job request or contact TechSavvy.",
    });
  const org = await adminDb.collection("customers").doc(customerId).get();
  if (!org.exists) return res.status(404).json({ error: "Company not found." });
  if (!phone)
    return res.status(422).json({
      error: "Enter a valid mobile number, including the country code if outside the US.",
    });
  const requestedRoles = Array.isArray(req.body?.roles)
    ? req.body.roles.filter(
        (role) => CLIENT_ROLES.includes(role) && role !== "company_admin",
      )
    : [];
  // If TechSavvy already lists this person as the company's primary contact or
  // owner, suggest Company Administrator on the approval screen. It is only a
  // suggestion: nobody becomes an administrator without a human approving it.
  const listedContact = (org.data().personnel || []).find(
    (person) =>
      person.active !== false &&
      normalizeEmail(person.email) === email &&
      ["primary_contact", "owner"].includes(person.role),
  );
  await adminDb
    .collection("client_users")
    .doc(user.uid)
    .set(
      {
        customerId,
        email,
        displayName: clean(req.body?.displayName || user.name || email, 120),
        phone,
        roles: requestedRoles.length ? requestedRoles : ["project_viewer"],
        requestedRoles,
        suggestedRoles: listedContact ? ["company_admin"] : [],
        status: "pending",
        emailVerified: true,
        phoneVerified: false,
        smsConsent:
          req.body?.smsConsent === true
            ? {
                optedIn: true,
                phone,
                consentVersion: "client-membership-2026-08",
                consentedAt: nowIso(),
              }
            : { optedIn: false },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      { merge: true },
    );
  const matchingRequests = await adminDb
    .collection("vendor_requests")
    .where("requesterEmail", "==", email)
    .limit(25)
    .get();
  const batch = adminDb.batch();
  matchingRequests.docs.forEach((doc) =>
    batch.set(
      doc.ref,
      { createdByClientUid: user.uid, customerId, updatedAt: nowIso() },
      { merge: true },
    ),
  );
  await batch.commit();
  for (const request of matchingRequests.docs) {
    if (request.data().convertedJobId) {
      await adminDb.collection("jobs").doc(request.data().convertedJobId).set(
        {
          createdByClientUid: user.uid,
          customerId,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
      await adminDb
        .collection("job_participants")
        .doc(`${request.data().convertedJobId}_${user.uid}`)
        .set(
          {
            jobId: request.data().convertedJobId,
            clientUid: user.uid,
            customerId,
            roles: ["requester"],
            notifications: { email: true, sms: req.body?.smsConsent === true },
            createdAt: nowIso(),
          },
          { merge: true },
      );
    }
  }
  const adminUrl = `${(process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "")}/crm?module=requests`;
  const requesterLabel = clean(req.body?.displayName || user.name || email, 120);
  const { emails: alertEmails, phones: alertPhones } = await alertRecipients();
  await Promise.allSettled([
    sendEmail({
      to: alertEmails,
      subject: `New client portal access request — ${org.data().name}`,
      text: `${requesterLabel} (${email}) requested access to ${org.data().name}. Review the pending membership here: ${adminUrl}`,
      html: `<h1>New client portal access request</h1><p><strong>${escapeHtml(requesterLabel)}</strong> (${escapeHtml(email)}) requested access to <strong>${escapeHtml(org.data().name)}</strong>.</p><p><a href="${escapeHtml(adminUrl)}">Review pending membership</a></p>`,
      type: "membership_requested",
    }).catch(() => null),
    ...alertPhones.map((phone) =>
      sendSms({
        to: phone,
        body: `New client portal access request: ${requesterLabel} (${org.data().name}). Review: ${adminUrl}`,
        type: "membership_requested",
        important: true,
      }).catch(() => null),
    ),
  ]);
  return res.status(202).json({
    success: true,
    organization: { id: org.id, name: org.data().name },
    status: "pending_phone_verification",
  });
}

async function sendVerificationEmail(req, res) {
  const user = await requireUser(req);
  if (user.email_verified)
    return res.status(200).json({ success: true, alreadyVerified: true });
  if (rateLimited(req, `email-verification:${user.uid}`, 4, 30 * 60 * 1000)) {
    return res.status(429).json({
      error: "Please wait before requesting another verification email.",
    });
  }
  const email = normalizeEmail(user.email);
  if (!email)
    return res
      .status(422)
      .json({ error: "This account does not have an email address." });
  const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(
    /\/$/,
    "",
  );
  const firebaseVerificationLink = await adminAuth.generateEmailVerificationLink(
    email,
    { url: `${appUrl}/client` },
  );
  const firebaseAction = new URL(firebaseVerificationLink);
  const oobCode = firebaseAction.searchParams.get("oobCode");
  if (!oobCode) throw new Error("Firebase did not return an email verification code.");
  // Keep the one-time code behind an explicit button. Corporate email scanners
  // can safely inspect this page without consuming the Firebase action code.
  const verificationLink = `${appUrl}/client/verify-email?oobCode=${encodeURIComponent(oobCode)}`;
  const safeLink = escapeHtml(verificationLink);
  const delivery = await sendEmail({
    to: email,
    subject: "Verify your TechSavvy Client Portal email",
    text: `Verify your TechSavvy Client Portal email by opening this secure link:\n${verificationLink}\n\nIf you did not create this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55"><h1 style="color:#16a34a;font-size:24px">TechSavvy Client Portal</h1><p>Confirm that this email belongs to you.</p><p><a href="${safeLink}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Verify email address</a></p><p style="color:#475569">If you did not create this account, you can ignore this message.</p></div>`,
    type: "client_email_verification",
  });
  if (delivery.skipped)
    return res
      .status(503)
      .json({ error: "Verification email delivery is not configured." });
  return res.status(202).json({ success: true });
}

async function sendVerificationCode(req, res) {
  const user = await requireUser(req);
  if (rateLimited(req, `verify:${user.uid}`, 4, 30 * 60 * 1000))
    return res
      .status(429)
      .json({ error: "Please wait before requesting another code." });
  const profileRef = adminDb.collection("client_users").doc(user.uid);
  const profile = await profileRef.get();
  if (!profile.exists)
    return res
      .status(404)
      .json({ error: "Submit a company membership request first." });
  const code = String(randomInt(100000, 1000000));
  await profileRef.set(
    {
      verificationCodeHash: verificationHash(user.uid, code),
      verificationExpiresAt: new Date(
        Date.now() + 10 * 60 * 1000,
      ).toISOString(),
      verificationAttempts: 0,
    },
    { merge: true },
  );
  let delivery;
  try {
    delivery = await sendSms({
      to: profile.data().phone,
      body: `${code} is your TechSavvy client portal verification code. It expires in 10 minutes.`,
      type: "client_verification",
      important: true,
    });
  } catch (error) {
    console.error("Client phone verification delivery failed:", {
      uid: user.uid,
      message: error instanceof Error ? error.message : "Unknown SMS error",
    });
    return res.status(503).json({
      error:
        "The verification text could not be delivered. Please try again shortly or contact TechSavvy.",
    });
  }
  if (delivery.skipped)
    return res
      .status(503)
      .json({ error: "Text verification is not configured yet." });
  return res.status(202).json({ success: true });
}

async function verifyCode(req, res) {
  const user = await requireUser(req);
  const profileRef = adminDb.collection("client_users").doc(user.uid);
  const profile = await profileRef.get();
  const data = profile.data();
  if (!profile.exists || !data.verificationCodeHash)
    return res
      .status(404)
      .json({ error: "Request a verification code first." });
  if (
    Date.parse(data.verificationExpiresAt) < Date.now() ||
    Number(data.verificationAttempts || 0) >= 5
  )
    return res
      .status(410)
      .json({ error: "The code expired. Request a new one." });
  const valid = safeEqual(
    verificationHash(user.uid, clean(req.body?.code, 6)),
    data.verificationCodeHash,
  );
  if (!valid) {
    await profileRef.set(
      { verificationAttempts: Number(data.verificationAttempts || 0) + 1 },
      { merge: true },
    );
    return res
      .status(422)
      .json({ error: "The verification code is incorrect." });
  }
  await profileRef.set(
    {
      phoneVerified: true,
      phoneVerificationDeferred: false,
      phoneVerifiedAt: nowIso(),
      verificationCodeHash: "",
      verificationExpiresAt: "",
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  return res.status(200).json({ success: true, status: "pending_approval" });
}

async function deferPhoneVerification(req, res) {
  const user = await requireUser(req);
  const profileRef = adminDb.collection("client_users").doc(user.uid);
  const profile = await profileRef.get();
  if (!profile.exists)
    return res
      .status(404)
      .json({ error: "Submit a company membership request first." });
  if (profile.data().emailVerified !== true)
    return res
      .status(403)
      .json({ error: "Verify your email before continuing." });
  await profileRef.set(
    {
      phoneVerified: false,
      phoneVerificationDeferred: true,
      phoneVerificationDeferredAt: nowIso(),
      verificationCodeHash: "",
      verificationExpiresAt: "",
      smsConsent: { optedIn: false },
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  return res.status(200).json({ success: true, status: "pending_approval" });
}

async function getMe(req, res) {
  const user = await requireUser(req);
  const profile = await adminDb.collection("client_users").doc(user.uid).get();
  if (!profile.exists)
    return res
      .status(200)
      .json({ user: { uid: user.uid, email: user.email }, profile: null });
  const data = profile.data();
  const org = data.customerId
    ? await adminDb.collection("customers").doc(data.customerId).get()
    : null;
  let members = [];
  if (data.status === "active" && hasRole(data, "company_admin")) {
    const memberSnapshot = await adminDb
      .collection("client_users")
      .where("customerId", "==", data.customerId)
      .limit(100)
      .get();
    members = memberSnapshot.docs.map((doc) => {
      const member = doc.data();
      return {
        id: doc.id,
        displayName: member.displayName,
        email: member.email,
        roles: member.roles || [],
        requestedRoles: member.requestedRoles || [],
        status: member.status,
        emailVerified: member.emailVerified,
        phoneVerified: member.phoneVerified,
        phoneVerificationDeferred: member.phoneVerificationDeferred === true,
      };
    });
  }
  return res.status(200).json({
    user: {
      uid: user.uid,
      email: user.email,
      emailVerified: user.email_verified,
    },
    profile: { id: profile.id, ...data, verificationCodeHash: undefined },
    organization: org?.exists ? { id: org.id, ...org.data() } : null,
    members,
  });
}

async function listJobs(req, res) {
  const { profile } = await requireClient(req);
  const jobsSnapshot = await adminDb
    .collection("jobs")
    .where("customerId", "==", profile.customerId)
    .limit(100)
    .get();
  let allowedIds = null;
  if (!hasRole(profile, "company_admin")) {
    const participants = await adminDb
      .collection("job_participants")
      .where("clientUid", "==", profile.id)
      .get();
    allowedIds = new Set(participants.docs.map((doc) => doc.data().jobId));
  }
  const jobs = jobsSnapshot.docs
    .filter(
      (doc) =>
        hasRole(profile, "company_admin") ||
        doc.data().createdByClientUid === profile.id ||
        allowedIds.has(doc.id),
    )
    .map((doc) => {
      const data = doc.data();
      const reportCount =
        (data.attachments || []).length +
        (data.signedWorkOrders || []).length +
        (data.sourceSurveyId ? 1 : 0) +
        (hasRole(profile, "billing", "company_admin")
          ? (data.clientBillingDocuments || []).length
          : 0);
      return {
        id: doc.id,
        name: data.name,
        address: data.address,
        workOrderNumber: data.workOrderNumber,
        clientReference: data.clientReference,
        status: data.clientStatus || data.status,
        targetCompletion: data.targetCompletion,
        closeoutStatus: data.closeoutStatus || "",
        reportCount,
      };
    });
  return res.status(200).json({ jobs });
}

async function getJob(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.query?.jobId, 120);
  if (!jobId || !(await canAccessJob(profile, jobId)))
    return res.status(404).json({ error: "Job not found." });
  const [jobDoc, appointments, events, messages, contractors] =
    await Promise.all([
      adminDb.collection("jobs").doc(jobId).get(),
      adminDb.collection("appointments").where("jobId", "==", jobId).get(),
      adminDb.collection("job_events").where("jobId", "==", jobId).get(),
      adminDb.collection("job_messages").where("jobId", "==", jobId).get(),
      adminDb.collection("contractors").get(),
    ]);
  const data = jobDoc.data();
  const surveyReportDoc = data.sourceSurveyId
    ? await adminDb.collection("survey_reports").doc(data.sourceSurveyId).get()
    : null;
  const surveyReport = surveyReportDoc?.exists && surveyReportDoc.data().status === "shared_with_customer"
    ? { id: surveyReportDoc.id, ...surveyReportDoc.data() }
    : null;
  const contractorMap = new Map(
    contractors.docs.map((doc) => [doc.id, doc.data()]),
  );
  const safeAppointments = appointments.docs
    .map((doc) => {
      const appointment = { id: doc.id, ...doc.data() };
      return {
        id: appointment.id,
        status: appointment.status,
        confirmedStart: appointment.confirmedStart,
        confirmedEnd: appointment.confirmedEnd,
        requestedWindows: appointment.requestedWindows || [],
        rescheduleProposal: appointment.rescheduleProposal || null,
        technician: publicTechnician(
          contractorMap.get(appointment.technicianId),
          appointment,
        ),
      };
    })
    .sort((a, b) =>
      String(a.confirmedStart || "").localeCompare(
        String(b.confirmedStart || ""),
      ),
    );
  const clientFiles = await Promise.all(
    [...(data.attachments || []), ...(data.signedWorkOrders || [])]
      .filter((file) => file.storagePath || file.url)
      .slice(0, 30)
      .map(async (file) => {
        if (file.storagePath) {
          const [url] = await adminStorage.file(file.storagePath).getSignedUrl({
            action: "read",
            version: "v4",
            expires: Date.now() + 15 * 60 * 1000,
          });
          return {
            name: file.name || file.fileName,
            url,
            type: file.contentType || "document",
          };
        }
        return {
          name: file.name || file.fileName,
          url: file.url,
          type: file.contentType || "document",
        };
      }),
  );
  const billingDocuments = hasRole(profile, "billing", "company_admin")
    ? data.clientBillingDocuments || []
    : [];
  return res.status(200).json({
    job: {
      id: jobDoc.id,
      name: data.name,
      address: data.address,
      siteContact: data.siteContact || "",
      equipment: (data.equipment || []).map(clientEquipmentView),
      editable: jobEditState(profile, data),
      notes: data.clientVisibleNotes || "",
      workOrderNumber: data.workOrderNumber,
      clientReference: data.clientReference,
      clientProjectManager: data.clientProjectManager || "",
      status: data.clientStatus || data.status,
      targetCompletion: data.targetCompletion,
      scopeTasks: data.scopeTasks || [],
      qaChecklist: data.qaChecklist || [],
      contactPolicy: data.clientContactPolicy || "techsavvy_only",
      closeoutStatus: data.closeoutStatus || "",
      documents: clientFiles,
      billingDocuments,
    },
    appointments: safeAppointments,
    events: events.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((event) => event.visibility === "client")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    messages: messages.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((message) => message.visibility === "client")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    surveyReport,
  });
}

async function postMessage(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!(await canAccessJob(profile, jobId)))
    return res.status(404).json({ error: "Job not found." });
  const message = clean(req.body?.message, 5000);
  if (!message) return res.status(422).json({ error: "Enter a message." });
  const job = await adminDb.collection("jobs").doc(jobId).get();
  const token = opaqueToken();
  const ref = await adminDb.collection("job_messages").add({
    jobId,
    customerId: profile.customerId,
    authorUid: profile.id,
    authorName: profile.displayName,
    authorRole: "client",
    visibility: "client",
    message,
    source: "portal",
    createdAt: nowIso(),
  });
  const replyAddress = process.env.RESEND_RECEIVING_DOMAIN
    ? `job+${token}@${process.env.RESEND_RECEIVING_DOMAIN}`
    : undefined;
  await adminDb.collection("conversation_tokens").doc(hashValue(token)).set({
    jobId,
    customerId: profile.customerId,
    active: true,
    createdAt: nowIso(),
  });
  await sendEmail({
    to: process.env.SUPPORT_EMAIL,
    subject: `[${job.data().workOrderNumber || jobId}] Client message`,
    text: message,
    html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
    replyTo: replyAddress,
    jobId,
    type: "job_message",
  }).catch(() => null);
  return res
    .status(201)
    .json({ message: { id: ref.id, message, createdAt: nowIso() } });
}

async function reschedule(req, res) {
  const { profile } = await requireClient(req);
  const appointmentId = clean(req.body?.appointmentId, 120);
  const appointmentRef = adminDb.collection("appointments").doc(appointmentId);
  const appointment = await appointmentRef.get();
  if (
    !appointment.exists ||
    !(await canAccessJob(profile, appointment.data().jobId))
  )
    return res.status(404).json({ error: "Appointment not found." });
  const start = clean(req.body?.start, 40),
    end = clean(req.body?.end, 40);
  if (
    !Date.parse(start) ||
    !Date.parse(end) ||
    Date.parse(end) <= Date.parse(start)
  )
    return res
      .status(422)
      .json({ error: "Choose a valid replacement window." });
  await appointmentRef.set(
    {
      rescheduleProposal: {
        start,
        end,
        proposedByUid: profile.id,
        proposedByRole: "client",
        status: "proposed",
        createdAt: nowIso(),
      },
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await recordEvent({
    jobId: appointment.data().jobId,
    appointmentId,
    type: "reschedule_proposed",
    actorUid: profile.id,
    actorRole: "client",
    visibility: "client",
    message: "Client proposed a new appointment window.",
    metadata: { start, end },
  });
  return res.status(200).json({ success: true });
}

async function acceptCloseout(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!(await canAccessJob(profile, jobId)))
    return res.status(404).json({ error: "Job not found." });
  await adminDb.collection("jobs").doc(jobId).set(
    {
      closeoutStatus: "accepted",
      clientStatus: "closed",
      clientAcceptedAt: nowIso(),
      clientAcceptedByUid: profile.id,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await recordEvent({
    jobId,
    type: "closeout_accepted",
    actorUid: profile.id,
    actorRole: "client",
    visibility: "client",
    message: "Client accepted the closeout package.",
  });
  return res.status(200).json({ success: true });
}

async function requestScopeChange(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!(await canAccessJob(profile, jobId)))
    return res.status(404).json({ error: "Job not found." });
  const reason = clean(req.body?.reason, 3000);
  const revisedScope = clean(req.body?.revisedScope, 5000);
  if (!reason || !revisedScope)
    return res
      .status(422)
      .json({ error: "Provide the reason and requested scope revision." });
  const job = await adminDb.collection("jobs").doc(jobId).get();
  const ref = await adminDb.collection("scope_versions").add({
    jobId,
    customerId: profile.customerId,
    version: Number(job.data().currentScopeVersion || 1) + 1,
    status: "client_requested",
    reason,
    revisedScope,
    scheduleImpact: clean(req.body?.scheduleImpact, 1000),
    costImpact: clean(req.body?.costImpact, 1000),
    requestedByUid: profile.id,
    requestedAt: nowIso(),
    createdAt: nowIso(),
  });
  await recordEvent({
    jobId,
    type: "scope_change_requested",
    actorUid: profile.id,
    actorRole: "client",
    visibility: "client",
    message: "Client submitted a scope change for TechSavvy approval.",
  });
  return res.status(201).json({ success: true, scopeVersionId: ref.id });
}

// Clients see and edit descriptive fields only. Staff-only fields on the same
// record (unit cost, billing, internal notes) never leave the server.
const clientEquipmentView = (item) => ({
  description: item.description || "",
  quantity: item.quantity ?? "",
  upc: item.upc || "",
  serial: item.serial || "",
  notes: item.notes || "",
  providedBy:
    item.providedBy === "techsavvy" || item.fulfillmentSource === "techsavvy_supplied"
      ? "techsavvy"
      : "client",
});

async function updateJob(req, res) {
  const { profile } = await requireClient(req);
  const jobId = clean(req.body?.jobId, 120);
  if (!jobId || !(await canAccessJob(profile, jobId)))
    return res.status(404).json({ error: "Job not found." });
  const ref = adminDb.collection("jobs").doc(jobId);
  const snapshot = await ref.get();
  const job = snapshot.data();
  const state = jobEditState(profile, job);
  if (!state.allowed) return res.status(409).json({ error: state.reason });

  const changes = req.body?.changes || {};
  const patch = {};
  const changed = [];
  const setIfChanged = (field, label, value, current) => {
    if (JSON.stringify(value) === JSON.stringify(current)) return;
    patch[field] = value;
    changed.push(label);
  };
  if ("address" in changes) {
    const address = clean(changes.address, 300);
    if (!address) return res.status(422).json({ error: "Enter the site address." });
    setIfChanged("address", "site address", address, job.address || "");
  }
  if ("siteContact" in changes)
    setIfChanged("siteContact", "site contact", clean(changes.siteContact, 300), job.siteContact || "");
  if ("notes" in changes)
    setIfChanged("clientVisibleNotes", "scope summary", clean(changes.notes, 5000), job.clientVisibleNotes || "");
  if ("targetCompletion" in changes) {
    const date = clean(changes.targetCompletion, 20);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(422).json({ error: "Enter the requested date as YYYY-MM-DD." });
    setIfChanged("targetCompletion", "requested date", date, job.targetCompletion || "");
  }
  if (Array.isArray(changes.scopeTasks))
    setIfChanged(
      "scopeTasks",
      "scope tasks",
      changes.scopeTasks.map((task) => clean(task, 500)).filter(Boolean).slice(0, 40),
      job.scopeTasks || [],
    );
  if (Array.isArray(changes.equipment)) {
    const existing = Array.isArray(job.equipment) ? job.equipment : [];
    const next = changes.equipment
      .slice(0, 60)
      .map((item, index) => ({
        ...(existing[index] || {}),
        description: clean(item?.description, 300),
        quantity: clean(item?.quantity, 20),
        upc: clean(item?.upc, 40),
        serial: clean(item?.serial, 80),
        notes: clean(item?.notes, 500),
        providedBy: item?.providedBy === "techsavvy" ? "techsavvy" : "client",
      }))
      .filter((item) => item.description);
    const before = existing.map(clientEquipmentView);
    const after = next.map(clientEquipmentView);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      patch.equipment = next;
      changed.push("equipment and materials");
    }
  }
  if (!changed.length) return res.status(200).json({ success: true, changed: [] });

  patch.updatedAt = nowIso();
  patch.lastClientEditAt = nowIso();
  patch.lastClientEditByUid = profile.id;
  await ref.set(patch, { merge: true });
  const workOrder = job.workOrderNumber || jobId;
  await recordEvent({
    jobId,
    type: "client_job_edited",
    actorUid: profile.id,
    actorRole: "client",
    visibility: "client",
    message: `${profile.displayName || "A client user"} updated: ${changed.join(", ")}.`,
    metadata: { changed },
  });
  const { emails } = await alertRecipients();
  await sendEmail({
    to: emails,
    subject: `Client updated job ${workOrder}`,
    text: `${profile.displayName || profile.email} (${job.vendorName || "client"}) updated ${changed.join(", ")} on ${workOrder}. Review it in the CRM: ${(process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "")}/crm?module=jobs`,
    html: `<p><strong>${escapeHtml(profile.displayName || profile.email)}</strong> (${escapeHtml(job.vendorName || "client")}) updated <strong>${escapeHtml(changed.join(", "))}</strong> on ${escapeHtml(workOrder)}.</p><p><a href="${escapeHtml((process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, ""))}/crm?module=jobs">Review in the CRM</a></p>`,
    type: "client_job_edited",
    jobId,
  }).catch(() => null);
  return res.status(200).json({ success: true, changed });
}

// A company administrator manages their own company's people. They can change
// roles, pause or restore access, and decline requests, but never grant or
// alter Company Administrator (only TechSavvy does), and never their own access.
async function updateCompanyMember(req, res) {
  const { profile } = await requireClient(req);
  if (!hasRole(profile, "company_admin"))
    return res.status(403).json({ error: "Company Administrator role required." });
  const uid = clean(req.body?.uid, 128);
  const target = await adminDb.collection("client_users").doc(uid).get();
  if (!target.exists || target.data().customerId !== profile.customerId)
    return res.status(404).json({ error: "Team member not found." });
  if (uid === profile.id)
    return res.status(409).json({ error: "You cannot change your own access." });
  const member = target.data();
  if (hasRole(member, "company_admin"))
    return res.status(403).json({ error: "Only TechSavvy can change a Company Administrator." });
  const change = clean(req.body?.change, 20);
  let patch;
  if (change === "roles") {
    const roles = (Array.isArray(req.body?.roles) ? req.body.roles : []).filter(
      (role) => CLIENT_ROLES.includes(role) && role !== "company_admin",
    );
    if (!roles.length) return res.status(422).json({ error: "Choose a role." });
    patch = { roles };
  } else if (change === "suspend" && member.status === "active") {
    patch = { status: "suspended", suspendedAt: nowIso(), suspendedByUid: profile.id };
  } else if (change === "restore" && member.status === "suspended") {
    patch = { status: "active", restoredAt: nowIso(), restoredByUid: profile.id };
  } else if (change === "decline" && member.status === "pending") {
    patch = { status: "rejected", rejectedAt: nowIso(), rejectedByUid: profile.id };
  } else {
    return res.status(409).json({ error: "That change is not available for this person right now." });
  }
  await target.ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
  return res.status(200).json({ success: true });
}

async function approveCompanyMember(req, res) {
  const { profile } = await requireClient(req);
  if (!hasRole(profile, "company_admin"))
    return res
      .status(403)
      .json({ error: "Company Administrator role required." });
  const uid = clean(req.body?.uid, 128);
  const target = await adminDb.collection("client_users").doc(uid).get();
  if (!target.exists || target.data().customerId !== profile.customerId)
    return res.status(404).json({ error: "Membership request not found." });
  if (
    target.data().emailVerified !== true ||
    (target.data().phoneVerified !== true &&
      target.data().phoneVerificationDeferred !== true)
  )
    return res
      .status(409)
      .json({ error: "The user must verify email and phone first." });
  const roles = Array.isArray(req.body?.roles)
    ? req.body.roles.filter(
        (role) => CLIENT_ROLES.includes(role) && role !== "company_admin",
      )
    : target.data().requestedRoles;
  await target.ref.set(
    {
      status: "active",
      roles,
      approvedAt: nowIso(),
      approvedByUid: profile.id,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await notifyMembershipApproved(target.data());
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  try {
    const action = clean(req.query?.action, 60);
    if (req.method === "POST" && action === "request")
      return await createRequest(req, res);
    if (req.method === "POST" && action === "feedback")
      return await submitClientFeedback(req, res);
    if (req.method === "POST" && action === "request-file")
      return await uploadRequestFile(req, res);
    if (req.method === "POST" && action === "bulk-import-preview")
      return await bulkImportPreview(req, res);
    if (req.method === "POST" && action === "bulk-import-submit")
      return await bulkImportSubmit(req, res);
    if (["GET", "POST"].includes(req.method) && action === "request-status")
      return await publicRequestStatus(req, res);
    if (req.method === "POST" && action === "register")
      return await registerMembership(req, res);
    if (req.method === "POST" && action === "send-verification-email")
      return await sendVerificationEmail(req, res);
    if (req.method === "POST" && action === "send-code")
      return await sendVerificationCode(req, res);
    if (req.method === "POST" && action === "verify-code")
      return await verifyCode(req, res);
    if (req.method === "POST" && action === "defer-phone-verification")
      return await deferPhoneVerification(req, res);
    if (req.method === "GET" && action === "me") return await getMe(req, res);
    if (req.method === "GET" && action === "jobs")
      return await listJobs(req, res);
    if (req.method === "GET" && action === "job") return await getJob(req, res);
    if (req.method === "POST" && action === "message")
      return await postMessage(req, res);
    if (req.method === "POST" && action === "reschedule")
      return await reschedule(req, res);
    if (req.method === "POST" && action === "accept-closeout")
      return await acceptCloseout(req, res);
    if (req.method === "POST" && action === "scope-change")
      return await requestScopeChange(req, res);
    if (req.method === "POST" && action === "update-job")
      return await updateJob(req, res);
    if (req.method === "POST" && action === "update-member")
      return await updateCompanyMember(req, res);
    if (req.method === "POST" && action === "approve-member")
      return await approveCompanyMember(req, res);
    return res
      .status(404)
      .json({ error: "Client portal operation not found." });
  } catch (error) {
    console.error("Client portal error:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode
        ? error.message
        : "The client portal could not complete this request.",
    });
  }
}
