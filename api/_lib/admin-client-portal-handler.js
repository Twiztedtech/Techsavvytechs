import { adminDb, requireStaffRole } from "./firebase-admin.js";
import { writeAudit } from "./audit.js";
import {
  CLIENT_ROLES,
  alertRecipients,
  clean,
  hashValue,
  notifyMembershipApproved,
  nowIso,
  opaqueToken,
  recordEvent,
  sendEmail,
  sendSms,
  syncCalendarAppointment,
} from "./client-portal.js";

async function listDashboard(res) {
  const [
    requests,
    organizations,
    users,
    settings,
    appointments,
    failedNotifications,
    scopeChanges,
  ] = await Promise.all([
    adminDb.collection("vendor_requests").limit(100).get(),
    adminDb.collection("customers").limit(100).get(),
    adminDb.collection("client_users").limit(200).get(),
    adminDb.collection("settings").doc("client_portal").get(),
    adminDb.collection("appointments").limit(200).get(),
    adminDb
      .collection("notification_deliveries")
      .where("status", "==", "failed")
      .limit(50)
      .get(),
    adminDb
      .collection("scope_versions")
      .where("status", "==", "client_requested")
      .limit(50)
      .get(),
  ]);
  const jobIds = [
    ...new Set(appointments.docs.map((doc) => doc.data().jobId).filter(Boolean)),
  ];
  const jobDocs = jobIds.length
    ? await adminDb.getAll(...jobIds.map((id) => adminDb.collection("jobs").doc(id)))
    : [];
  const jobById = new Map(
    jobDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()]),
  );
  return res.status(200).json({
    requests: requests.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    organizations: organizations.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })),
    users: users.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, verificationCodeHash: undefined };
    }),
    appointments: appointments.docs.map((doc) => {
      const appointment = doc.data();
      const job = jobById.get(appointment.jobId) || {};
      return {
        id: doc.id,
        ...appointment,
        workOrderNumber: job.workOrderNumber || "",
        jobName: job.name || "",
        clientName: job.vendorName || "",
        jobAddress: job.address || "",
        clientReference: job.clientReference || "",
      };
    }),
    failedNotifications: failedNotifications.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })),
    scopeChanges: scopeChanges.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })),
    settings: settings.exists
      ? settings.data()
      : { enabled: true, pilotOnly: false },
  });
}

async function saveOrganization(req, res, admin) {
  // Phase 1 of the customers/client_organizations merge: this now reads and
  // writes the CRM `customers` collection instead of `client_organizations`.
  // `organizationId` in the request body is kept as the external field name
  // (ClientCompanyEditor.tsx isn't changed in this phase) but is now a
  // `customers` document id.
  const customerId =
    clean(req.body?.organizationId, 120) ||
    adminDb.collection("customers").doc().id;
  const current = await adminDb.collection("customers").doc(customerId).get();
  const domains = Array.isArray(req.body?.approvedDomains)
    ? req.body.approvedDomains
        .map((v) => clean(v, 120).toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
    : current.data()?.approvedDomains || [];
  const prefixes = Array.isArray(req.body?.referencePrefixes)
    ? req.body.referencePrefixes.map((v) => clean(v, 40)).filter(Boolean)
    : current.data()?.referencePrefixes || [];
  const personnelRoles = [
    "primary_contact",
    "owner",
    "requester",
    "sales",
    "project_manager",
    "payroll",
    "accounts_payable",
    "manager",
    "other",
  ];
  const personnel = Array.isArray(req.body?.personnel)
    ? req.body.personnel
        .map((person) => ({
          id: clean(person?.id, 60) || opaqueToken(),
          name: clean(person?.name, 150),
          email: clean(person?.email, 254).toLowerCase(),
          role: personnelRoles.includes(person?.role) ? person.role : "other",
          active: person?.active !== false,
        }))
        .filter((person) => person.name && person.email)
    : current.data()?.personnel || [];
  const personnelEmails = new Set(personnel.map((person) => person.email));
  const billingRecipientEmails = Array.isArray(
    req.body?.billingRecipientEmails,
  )
    ? [
        ...new Set(
          req.body.billingRecipientEmails
            .map((v) => clean(v, 254).toLowerCase())
            .filter((email) => personnelEmails.has(email)),
        ),
      ]
    : current.data()?.billingRecipientEmails || [];
  const data = {
    name: clean(req.body?.name || current.data()?.name, 150),
    approvedDomains: [...new Set(domains)],
    referencePrefixes: [...new Set(prefixes)],
    personnel,
    billingRecipientEmails,
    defaultContactPolicy: [
      "techsavvy_only",
      "direct_required",
      "per_job",
    ].includes(req.body?.defaultContactPolicy)
      ? req.body.defaultContactPolicy
      : current.data()?.defaultContactPolicy || "techsavvy_only",
    billingEmail: clean(
      req.body?.billingEmail || current.data()?.billingEmail,
      254,
    ).toLowerCase(),
    status: req.body?.status === "suspended" ? "suspended" : "active",
    updatedAt: nowIso(),
    updatedByUid: admin.uid,
    ...(current.exists ? {} : { createdAt: nowIso() }),
  };
  if (!data.name)
    return res.status(422).json({ error: "Company name is required." });
  await adminDb.collection("customers").doc(customerId).set(data, { merge: true });
  return res
    .status(200)
    .json({ organization: { id: customerId, ...data } });
}

async function approveMember(req, res, admin) {
  const uid = clean(req.body?.uid, 128);
  const ref = adminDb.collection("client_users").doc(uid);
  const profile = await ref.get();
  if (!profile.exists)
    return res.status(404).json({ error: "Membership request not found." });
  if (
    profile.data().emailVerified !== true ||
    (profile.data().phoneVerified !== true &&
      profile.data().phoneVerificationDeferred !== true)
  )
    return res
      .status(409)
      .json({
        error: "The user must verify email and either verify or defer phone verification before approval.",
      });
  const chosen = (Array.isArray(req.body?.roles) ? req.body.roles : []).filter(
    (role) => CLIENT_ROLES.includes(role),
  );
  const roles = chosen.length
    ? chosen
    : profile.data().requestedRoles?.length
      ? profile.data().requestedRoles
      : ["project_viewer"];
  await ref.set(
    {
      status: "active",
      roles,
      approvedAt: nowIso(),
      approvedByUid: admin.uid,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await notifyMembershipApproved(profile.data());
  return res.status(200).json({ success: true });
}

async function updateRequest(req, res, admin) {
  const requestId = clean(req.body?.requestId, 120);
  const status = clean(req.body?.status, 40);
  if (
    !["reviewing", "clarification_needed", "approved", "declined"].includes(
      status,
    )
  )
    return res.status(422).json({ error: "Invalid request status." });
  const ref = adminDb.collection("vendor_requests").doc(requestId);
  const snapshot = await ref.get();
  if (!snapshot.exists)
    return res.status(404).json({ error: "Request not found." });
  await ref.set(
    {
      status,
      reviewNote: clean(req.body?.reviewNote, 2000),
      reviewedAt: nowIso(),
      reviewedByUid: admin.uid,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  await recordEvent({
    requestId,
    type: `request_${status}`,
    actorUid: admin.uid,
    actorRole: "admin",
    visibility: "client",
    message:
      status === "clarification_needed"
        ? clean(req.body?.reviewNote, 2000)
        : `Request marked ${status.replace(/_/g, " ")}.`,
  });
  await sendEmail({
    to: snapshot.data().requesterEmail,
    subject: `${snapshot.data().requestNumber} update`,
    text:
      clean(req.body?.reviewNote, 2000) ||
      `Your request is now ${status.replace(/_/g, " ")}.`,
    html: `<p>${clean(req.body?.reviewNote, 2000) || `Your request is now ${status.replace(/_/g, " ")}.`}</p>`,
    type: "request_status",
  }).catch(() => null);
  return res.status(200).json({ success: true });
}

async function convertRequest(req, res, admin) {
  const requestId = clean(req.body?.requestId, 120);
  const requestRef = adminDb.collection("vendor_requests").doc(requestId);
  const snapshot = await requestRef.get();
  if (!snapshot.exists)
    return res.status(404).json({ error: "Request not found." });
  if (snapshot.data().convertedJobId)
    return res
      .status(409)
      .json({ error: "This request already has a work order." });
  const request = snapshot.data();
  // A request that already knows its customer (e.g. submitted through the
  // logged-in customer portal) is linked directly -- the fragile name-match
  // fallback below is only for anonymous/public booking-form requests that
  // never had a customerId to begin with.
  let customerRef;
  let customerExists = false;
  if (request.customerId) {
    const existing = await adminDb.collection('customers').doc(request.customerId).get();
    customerRef = adminDb.collection('customers').doc(request.customerId);
    customerExists = existing.exists;
  } else {
    const customerMatches = await adminDb.collection('customers').where('name', '==', request.companyName).get();
    if (customerMatches.size > 1) return res.status(409).json({ error: 'Multiple CRM customers match this company. Resolve the duplicate customer records before converting.' });
    customerRef = customerMatches.empty ? adminDb.collection('customers').doc() : customerMatches.docs[0].ref;
    customerExists = !customerMatches.empty;
  }
  const deliverables = Array.isArray(request.deliverables) ? request.deliverables : String(request.deliverables || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const jobRef = adminDb.collection("jobs").doc();
  const workOrderNumber =
    clean(req.body?.workOrderNumber, 80) ||
    `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const assignedTechIds =
    Array.isArray(req.body?.assignedTechIds) && req.body.assignedTechIds.length
      ? req.body.assignedTechIds.map((v) => clean(v, 120))
      : ["ALL"];
  const conversationToken = opaqueToken();
  const job = {
    id: jobRef.id,
    name: request.siteName,
    address: request.address,
    notes: request.accessInstructions || request.scopeSummary,
    clientVisibleNotes: request.scopeSummary,
    workOrderNumber,
    clientReference: request.clientReference,
    clientProjectManager: request.clientProjectManager || "",
    vendorName: request.companyName,
    customerId: customerRef.id,
    siteContact:
      request.siteContact ||
      `${request.requesterName} · ${request.requesterPhone}`,
    dateIssued: nowIso().slice(0, 10),
    targetCompletion: request.requestedWindows?.[0]?.date || "",
    workOrderTemplate: request.serviceType || "general",
    hourlyRate: Number(req.body?.hourlyRate || 55),
    travelRate: Number(req.body?.travelRate || 35),
    equipment: request.equipment || [],
    packages: request.packages || [],
    scopeTasks: request.scopeTasks?.length
      ? request.scopeTasks
      : [request.scopeSummary],
    requiredDeliverables: deliverables,
    qaChecklist: deliverables.length
      ? deliverables
      : [
          "Scope completed or exceptions noted.",
          "Work area cleared and equipment secured.",
          "Customer walkthrough completed.",
        ],
    attachments: request.attachments || [],
    assignedTechIds,
    assignedTechId: assignedTechIds[0],
    technicianLeadId: clean(req.body?.technicianLeadId, 120),
    sourceRequestId: requestId,
    createdByClientUid: request.createdByClientUid || "",
    clientStatus: "scheduling",
    clientContactPolicy:
      req.body?.directContactApproved === true
        ? "direct_approved"
        : "techsavvy_only",
    currentScopeVersion: 1,
    closeoutStatus: "",
    conversationTokenHash: hashValue(conversationToken),
    // Same defaults buildJobRecord() applies on every other job-creation path
    // (src/features/jobs/buildJobRecord.ts) -- kept in sync manually since this
    // server file can't import that client-side TS module. status must never be
    // left undefined (technician job-list queries filter on it), and
    // signatureRequired must be a real boolean, never undefined, or the
    // "require signature before completion" policy silently never applies.
    status: "New",
    signatureRequired: false,
    signatureStatus: "pending",
    signaturePolicyUpdatedAt: nowIso(),
    signaturePolicyUpdatedByUid: admin.uid || "",
    signaturePolicyHistory: [{ required: false, changedAt: nowIso(), changedByUid: admin.uid || "" }],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const batch = adminDb.batch();
  if (!customerExists) batch.set(customerRef, { name: request.companyName, contact: request.requesterName || '', email: request.requesterEmail || '', sites: request.address ? [request.address] : [], depositPolicy: 'required', createdAt: nowIso(), updatedAt: nowIso() }, { merge: true });
  batch.set(jobRef, job);
  batch.set(adminDb.collection("scope_versions").doc(`${jobRef.id}_1`), {
    jobId: jobRef.id,
    version: 1,
    status: "approved",
    scopeTasks: job.scopeTasks,
    equipment: job.equipment,
    requiredDeliverables: job.requiredDeliverables,
    approvedByUid: admin.uid,
    approvedAt: nowIso(),
    createdAt: nowIso(),
  });
  batch.set(
    requestRef,
    {
      status: "converted",
      convertedJobId: jobRef.id,
      customerId: customerRef.id,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  if (request.createdByClientUid)
    batch.set(
      adminDb
        .collection("job_participants")
        .doc(`${jobRef.id}_${request.createdByClientUid}`),
      {
        jobId: jobRef.id,
        clientUid: request.createdByClientUid,
        customerId: customerRef.id,
        roles: ["requester"],
        notifications: {
          email: true,
          sms: request.smsConsent?.optedIn === true,
        },
        createdAt: nowIso(),
      },
    );
  await batch.commit();
  const requested = request.requestedWindows?.[0];
  if (requested)
    await adminDb
      .collection("appointments")
      .add({
        jobId: jobRef.id,
        requestedWindows: request.requestedWindows,
        status: "requested",
        technicianId: clean(req.body?.technicianLeadId, 120),
        history: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
  await recordEvent({
    jobId: jobRef.id,
    requestId,
    type: "request_converted",
    actorUid: admin.uid,
    actorRole: "admin",
    visibility: "client",
    message: "Request approved and converted to a work order.",
  });
  await sendEmail({
    to: request.requesterEmail,
    subject: `${workOrderNumber} approved`,
    text: `Your request ${request.requestNumber} was approved as work order ${workOrderNumber}. TechSavvy is confirming the appointment and assignment.`,
    html: `<h1>Request approved</h1><p>Your request ${request.requestNumber} is now work order <strong>${workOrderNumber}</strong>.</p>`,
    jobId: jobRef.id,
    type: "request_converted",
  }).catch(() => null);
  if (job.technicianLeadId) {
    const technician = await adminDb
      .collection("contractors")
      .doc(job.technicianLeadId)
      .get();
    if (technician.exists)
      await sendEmail({
        to: technician.data().email,
        subject: `New assignment ${workOrderNumber}`,
        text: `You have been assigned to ${job.name}. Sign in to the Contractor Portal to review the SOW.`,
        html: `<h1>New assignment</h1><p>You have been assigned to <strong>${job.name}</strong>. Sign in to review the SOW.</p>`,
        jobId: jobRef.id,
        type: "technician_assignment",
      }).catch(() => null);
  }
  return res.status(201).json({ jobId: jobRef.id, workOrderNumber });
}

async function scheduleAppointment(req, res, admin) {
  const appointmentId = clean(req.body?.appointmentId, 120);
  const ref = adminDb.collection("appointments").doc(appointmentId);
  const snapshot = await ref.get();
  if (!snapshot.exists)
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
      .json({ error: "Choose a valid appointment window." });
  const previous = snapshot.data();
  const appointment = {
    id: appointmentId,
    ...previous,
    confirmedStart: start,
    confirmedEnd: end,
    technicianId: clean(req.body?.technicianId, 120) || previous.technicianId,
    status: "scheduled",
    directContactApproved: req.body?.directContactApproved === true,
    history: [
      ...(previous.history || []),
      { type: "scheduled", start, end, actorUid: admin.uid, at: nowIso() },
    ],
    updatedAt: nowIso(),
  };
  const jobDoc = await adminDb.collection("jobs").doc(previous.jobId).get();
  const calendar = await syncCalendarAppointment(
    appointment,
    { id: jobDoc.id, ...jobDoc.data() },
    previous.googleCalendarEventId,
  ).catch((error) => ({ error: error.message }));
  await ref.set(
    {
      ...appointment,
      googleCalendarEventId:
        calendar.eventId || previous.googleCalendarEventId || "",
      calendarSyncStatus: calendar.error
        ? "failed"
        : calendar.skipped
          ? "not_configured"
          : "synced",
      calendarSyncError: calendar.error || "",
    },
    { merge: true },
  );
  // The CRM Schedule & Dispatch board reads job.schedule (Pacific local
  // date/time) and the assignedTech* fields, so mirror the confirmed window
  // and technician onto the job.
  const pacific = (iso) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(new Date(iso))
        .map((p) => [p.type, p.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
    };
  };
  const startLocal = pacific(start);
  const endLocal = pacific(end);
  const jobUpdate = {
    clientStatus: "scheduled",
    targetCompletion: startLocal.date,
    schedule: {
      date: startLocal.date,
      start: startLocal.time,
      end: endLocal.date === startLocal.date ? endLocal.time : "23:59",
    },
    updatedAt: nowIso(),
  };
  const techId = appointment.technicianId;
  if (techId) {
    const tech = await adminDb.collection("contractors").doc(techId).get();
    const techName = tech.exists
      ? tech.data().name || tech.data().companyName || "Technician"
      : "";
    Object.assign(jobUpdate, {
      assignedTechId: techId,
      assignedTechIds: [techId],
      technicianLeadId: techId,
      ...(techName
        ? { assignedTechName: techName, assignedTechNames: [techName] }
        : {}),
    });
  }
  if (!jobDoc.data()?.status || jobDoc.data().status === "New")
    jobUpdate.status = "Scheduled";
  await adminDb
    .collection("jobs")
    .doc(previous.jobId)
    .set(jobUpdate, { merge: true });
  await recordEvent({
    jobId: previous.jobId,
    appointmentId,
    type: "appointment_scheduled",
    actorUid: admin.uid,
    actorRole: "admin",
    visibility: "client",
    message: "Appointment confirmed.",
    metadata: { start, end },
  });
  const participants = await adminDb
    .collection("job_participants")
    .where("jobId", "==", previous.jobId)
    .get();
  const clients = await Promise.all(
    participants.docs.map((doc) =>
      adminDb.collection("client_users").doc(doc.data().clientUid).get(),
    ),
  );
  await Promise.allSettled(
    clients
      .filter((doc) => doc.exists && doc.data().status === "active")
      .map(async (client) => {
        const text = `TechSavvy appointment confirmed for ${new Date(start).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}.`;
        await sendEmail({
          to: client.data().email,
          subject: `${jobDoc.data().workOrderNumber} appointment confirmed`,
          text,
          html: `<p>${text}</p>`,
          jobId: previous.jobId,
          type: "appointment_confirmed",
        });
        if (client.data().smsConsent?.optedIn === true)
          await sendSms({
            to: client.data().phone,
            body: text,
            jobId: previous.jobId,
            type: "appointment_confirmed",
          });
      }),
  );
  return res
    .status(200)
    .json({
      success: true,
      calendarSyncStatus: calendar.error
        ? "failed"
        : calendar.skipped
          ? "not_configured"
          : "synced",
    });
}

async function approveScopeChange(req, res, admin) {
  const scopeVersionId = clean(req.body?.scopeVersionId, 120);
  const ref = adminDb.collection("scope_versions").doc(scopeVersionId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().status !== "client_requested")
    return res.status(404).json({ error: "Pending scope change not found." });
  const approved = req.body?.approve === true;
  await ref.set(
    {
      status: approved ? "approved" : "declined",
      reviewNote: clean(req.body?.reviewNote, 2000),
      reviewedAt: nowIso(),
      reviewedByUid: admin.uid,
    },
    { merge: true },
  );
  if (approved) {
    const scopeTasks = clean(snapshot.data().revisedScope, 5000)
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    await adminDb
      .collection("jobs")
      .doc(snapshot.data().jobId)
      .set(
        {
          currentScopeVersion: snapshot.data().version,
          scopeTasks,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
  }
  await recordEvent({
    jobId: snapshot.data().jobId,
    type: approved ? "scope_change_approved" : "scope_change_declined",
    actorUid: admin.uid,
    actorRole: "admin",
    visibility: "client",
    message: approved
      ? "TechSavvy approved the revised scope."
      : "TechSavvy declined the requested scope change.",
  });
  return res.status(200).json({ success: true });
}

async function saveTechnicianPublicProfile(req, res, admin) {
  const contractorId = clean(req.body?.contractorId, 120);
  const ref = adminDb.collection("contractors").doc(contractorId);
  if (!(await ref.get()).exists)
    return res.status(404).json({ error: "Technician not found." });
  const data = {
    publicDisplayName: clean(req.body?.publicDisplayName, 100),
    specialty: clean(req.body?.specialty, 120),
    profilePhotoUrl:
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
        String(req.body?.profilePhotoUrl || ""),
      ) && String(req.body.profilePhotoUrl).length <= 200000
        ? String(req.body.profilePhotoUrl)
        : clean(req.body?.profilePhotoUrl, 1000),
    showPhotoToClients: req.body?.showPhotoToClients === true,
    allowDirectClientContact: req.body?.allowDirectClientContact === true,
    businessPhone: clean(req.body?.businessPhone, 40),
    businessEmail: clean(req.body?.businessEmail, 254).toLowerCase(),
    contactHours: clean(req.body?.contactHours, 100),
    publicProfileUpdatedAt: nowIso(),
    publicProfileUpdatedByUid: admin.uid,
  };
  await ref.set(data, { merge: true });
  return res.status(200).json({ success: true });
}

function cleanRecipientList(value, max) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values.map((v) => clean(v, 200)).filter(Boolean).slice(0, max);
}

async function saveSettings(req, res, admin) {
  const patch = {
    enabled: req.body?.enabled !== false,
    pilotOnly: req.body?.pilotOnly === true,
    updatedAt: nowIso(),
    updatedByUid: admin.uid,
  };
  // Who gets emailed/texted for a new job request or a new portal-access
  // request that needs review -- omit the key entirely (rather than writing
  // an empty array) when the field wasn't part of this save, so toggling
  // "enabled"/"pilotOnly" alone never wipes out recipients set earlier.
  if (req.body?.alertEmails !== undefined) patch.alertEmails = cleanRecipientList(req.body.alertEmails, 20);
  if (req.body?.alertPhones !== undefined) patch.alertPhones = cleanRecipientList(req.body.alertPhones, 20);
  await adminDb.collection("settings").doc("client_portal").set(patch, { merge: true });
  return res.status(200).json({ success: true });
}

const maskPhone = (value) => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : "(invalid)";
};

// Sends one real test email and text to the configured alert recipients and
// reports what each provider said, so a misconfigured Twilio/Resend setup is
// visible now instead of silently swallowing the next real alert.
async function sendTestAlert(req, res, admin) {
  const { emails, phones } = await alertRecipients();
  const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const results = { emails: [], phones: [] };
  for (const to of emails) {
    try {
      const sent = await sendEmail({
        to,
        subject: "TechSavvy test alert",
        text: `This is a test of your new request and approval alerts (${stamp} Pacific). If you can read this, email alerts work.`,
        html: `<p>This is a test of your new request and approval alerts (${stamp} Pacific).</p><p>If you can read this, email alerts work.</p>`,
        type: "test_alert",
      });
      results.emails.push({ to, ok: !sent?.skipped, error: sent?.skipped ? "Email is not configured (no RESEND_API_KEY)." : "" });
    } catch (error) {
      results.emails.push({ to, ok: false, error: error.detail || error.message });
    }
  }
  for (const to of phones) {
    try {
      const sent = await sendSms({
        to,
        body: `TechSavvy test alert (${stamp} PT). If you got this text, request alerts will reach you.`,
        type: "test_alert",
        important: true,
      });
      results.phones.push({
        to: maskPhone(to),
        ok: !sent?.skipped,
        error: sent?.skipped
          ? sent.reason === "opted_out"
            ? "This number has opted out of texts (they replied STOP)."
            : "Text messaging is not configured, or the number is not a valid US/E.164 number."
          : "",
      });
    } catch (error) {
      results.phones.push({ to: maskPhone(to), ok: false, error: error.detail || error.message });
    }
  }
  return res.status(200).json({ success: true, ...results });
}

async function sendSampleApprovalEmail(req, res) {
  const { emails } = await alertRecipients();
  if (!emails.length)
    return res.status(422).json({ error: "Save at least one alert email first." });
  await Promise.all(
    emails.map((email) =>
      notifyMembershipApproved(
        { email, displayName: "Alex Example", companyName: "Example Company", smsConsent: { optedIn: false } },
        { sample: true },
      ),
    ),
  );
  return res.status(200).json({ success: true, sentTo: emails });
}

// TechSavvy staff manage any portal user's access: change their role (the only
// place Company Administrator can be granted after approval), pause or restore
// them. Every change is written to the audit log.
async function updateMemberAccess(req, res, admin) {
  const uid = clean(req.body?.uid, 128);
  const ref = adminDb.collection("client_users").doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: "Portal user not found." });
  const member = snapshot.data();
  const change = clean(req.body?.change, 20);
  let patch;
  let summary;
  if (change === "roles") {
    const roles = (Array.isArray(req.body?.roles) ? req.body.roles : []).filter((role) =>
      CLIENT_ROLES.includes(role),
    );
    if (!roles.length) return res.status(422).json({ error: "Choose a role." });
    patch = { roles };
    summary = `Changed portal access for ${member.email} to ${roles.join(", ")}`;
  } else if (change === "suspend" && member.status === "active") {
    patch = { status: "suspended", suspendedAt: nowIso(), suspendedByUid: admin.uid };
    summary = `Paused portal access for ${member.email}`;
  } else if (change === "restore" && member.status === "suspended") {
    patch = { status: "active", restoredAt: nowIso(), restoredByUid: admin.uid };
    summary = `Restored portal access for ${member.email}`;
  } else {
    return res.status(409).json({ error: "That change is not available for this user right now." });
  }
  await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
  await writeAudit({
    actor: admin,
    action: `portal-user-${change}`,
    entityType: "client_user",
    entityId: uid,
    summary,
    details: { email: member.email, customerId: member.customerId, previousRoles: member.roles || [], ...patch },
    source: "api",
  });
  return res.status(200).json({ success: true });
}

// Collections whose records carry a customerId that ties them to a company.
const RELINK_COLLECTIONS = [
  "client_users",
  "vendor_requests",
  "jobs",
  "job_participants",
  "job_messages",
  "scope_versions",
  "conversation_tokens",
  "appointments",
];

// Re-points everything that references a company record that no longer exists
// (e.g. removed while merging duplicate customers) at the company it should
// belong to. It refuses to run when the "from" company still exists, so it can
// never pull records away from a real company. dryRun only counts.
async function relinkCompany(req, res, admin) {
  const fromId = clean(req.body?.fromCustomerId, 120);
  const toId = clean(req.body?.toCustomerId, 120);
  if (!fromId || !toId || fromId === toId)
    return res.status(400).json({ error: "Choose the company to move these records to." });
  const [from, to] = await Promise.all([
    adminDb.collection("customers").doc(fromId).get(),
    adminDb.collection("customers").doc(toId).get(),
  ]);
  if (!to.exists) return res.status(404).json({ error: "The target company was not found." });
  if (from.exists)
    return res.status(409).json({
      error: "The current company still exists. Only records pointing at a missing company can be moved.",
    });
  const counts = {};
  const docs = [];
  for (const name of RELINK_COLLECTIONS) {
    const snap = await adminDb.collection(name).where("customerId", "==", fromId).limit(500).get();
    counts[name] = snap.size;
    docs.push(...snap.docs);
  }
  const total = docs.length;
  if (req.body?.dryRun === true)
    return res.status(200).json({ success: true, dryRun: true, counts, total, targetName: to.data().name || "" });
  for (let i = 0; i < docs.length; i += 400) {
    const batch = adminDb.batch();
    docs.slice(i, i + 400).forEach((snap) =>
      batch.update(snap.ref, { customerId: toId, previousCustomerId: fromId, relinkedAt: nowIso() }),
    );
    await batch.commit();
  }
  await writeAudit({
    actor: admin,
    action: "company-relinked",
    entityType: "customer",
    entityId: toId,
    summary: `Moved ${total} record${total === 1 ? "" : "s"} from missing company ${fromId} to ${to.data().name || toId}`,
    details: { fromCustomerId: fromId, toCustomerId: toId, counts },
    source: "api",
  });
  return res.status(200).json({ success: true, counts, total, targetName: to.data().name || "" });
}

async function resendWelcome(req, res, admin) {
  const uid = clean(req.body?.uid, 128);
  const snapshot = await adminDb.collection("client_users").doc(uid).get();
  if (!snapshot.exists) return res.status(404).json({ error: "Portal user not found." });
  const member = snapshot.data();
  if (member.status !== "active")
    return res.status(409).json({ error: "Only active users can be sent the welcome message." });
  await notifyMembershipApproved(member);
  await writeAudit({
    actor: admin,
    action: "portal-user-welcome-resent",
    entityType: "client_user",
    entityId: uid,
    summary: `Resent the portal welcome message to ${member.email}`,
    details: { email: member.email },
    source: "api",
  });
  return res.status(200).json({ success: true, email: member.email });
}

async function dismissNotifications(req, res, admin) {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map((id) => clean(id, 100))
    .filter(Boolean)
    .slice(0, 50);
  if (!ids.length) return res.status(400).json({ error: "No notifications selected." });
  const refs = ids.map((id) => adminDb.collection("notification_deliveries").doc(id));
  const snaps = await adminDb.getAll(...refs);
  const batch = adminDb.batch();
  let dismissed = 0;
  for (const snap of snaps) {
    if (!snap.exists || snap.data().status !== "failed") continue;
    batch.update(snap.ref, {
      status: "acknowledged",
      acknowledgedAt: nowIso(),
      acknowledgedByUid: admin.uid,
    });
    dismissed += 1;
  }
  if (dismissed) await batch.commit();
  return res.status(200).json({ success: true, dismissed });
}

const JOB_CASCADE_COLLECTIONS = [
  "appointments",
  "scope_versions",
  "job_participants",
  "job_events",
  "job_messages",
  "notification_deliveries",
];

// Permanently deletes a job and its portal-side records. Refuses when the job
// has invoices or time entries so financial history is never orphaned.
async function deleteJob(req, res, admin) {
  if (admin.admin !== true)
    return res.status(403).json({ error: "Administrator access required." });
  const jobId = clean(req.body?.jobId, 120);
  if (!jobId) return res.status(400).json({ error: "A job is required." });
  const jobRef = adminDb.collection("jobs").doc(jobId);
  const job = await jobRef.get();
  if (!job.exists) return res.status(404).json({ error: "Job not found." });
  const [invoices, entries] = await Promise.all([
    adminDb.collection("invoices").where("jobId", "==", jobId).limit(1).get(),
    adminDb.collection("time_entries").where("jobId", "==", jobId).limit(1).get(),
  ]);
  if (!invoices.empty || !entries.empty)
    return res.status(409).json({
      error:
        "This job has invoices or time entries. Void it instead so financial history is kept.",
    });
  const linked = await Promise.all([
    ...JOB_CASCADE_COLLECTIONS.map((name) =>
      adminDb.collection(name).where("jobId", "==", jobId).get(),
    ),
    adminDb.collection("vendor_requests").where("convertedJobId", "==", jobId).get(),
  ]);
  const removed = {};
  const refs = [];
  JOB_CASCADE_COLLECTIONS.forEach((name, i) => {
    removed[name] = linked[i].size;
    linked[i].docs.forEach((doc) => refs.push(doc.ref));
  });
  for (let i = 0; i < refs.length; i += 400) {
    const batch = adminDb.batch();
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  const requestBatch = adminDb.batch();
  linked[linked.length - 1].docs.forEach((doc) =>
    requestBatch.set(
      doc.ref,
      { convertedJobId: "", status: "reviewing", updatedAt: nowIso() },
      { merge: true },
    ),
  );
  await requestBatch.commit();
  await jobRef.delete();
  console.info("Job deleted", { jobId, by: admin.uid, removed });
  return res.status(200).json({ success: true, removed });
}

// Converts a Pacific wall-clock date/time to an ISO instant (handles DST).
function pacificToIso(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return new Date(guess + (guess - shown)).toISOString();
}

// Called by the dispatch board after a drag-and-drop so the client-portal
// appointment matches the job's new schedule and technician.
async function syncJobAppointment(req, res, admin) {
  const jobId = clean(req.body?.jobId, 120);
  const date = clean(req.body?.date, 10);
  const start = clean(req.body?.start, 5);
  const end = clean(req.body?.end, 5);
  if (!jobId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end))
    return res.status(400).json({ error: "A job, date and time window are required." });
  const technicianId = clean(req.body?.technicianId, 120);
  const snapshot = await adminDb.collection("appointments").where("jobId", "==", jobId).get();
  const confirmedStart = pacificToIso(date, start);
  const confirmedEnd = pacificToIso(date, end);
  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => {
    const previous = doc.data();
    batch.set(
      doc.ref,
      {
        confirmedStart,
        confirmedEnd,
        status: "scheduled",
        ...(technicianId ? { technicianId } : {}),
        history: [
          ...(previous.history || []),
          { type: "scheduled", start: confirmedStart, end: confirmedEnd, actorUid: admin.uid, at: nowIso(), via: "dispatch_board" },
        ],
        updatedAt: nowIso(),
      },
      { merge: true },
    );
  });
  if (!snapshot.empty) await batch.commit();
  await adminDb.collection("jobs").doc(jobId).set({ clientStatus: "scheduled" }, { merge: true });
  return res.status(200).json({ success: true, appointments: snapshot.size });
}

export default async function handler(req, res) {
  try {
    // Dispatchers get view-only access to the "requests" dashboard; every
    // mutating action here (convert, approve, schedule, settings, ...) stays
    // Admin/Assistant Admin only, per the RBAC role matrix.
    const admin = await requireStaffRole(req, ["assistant_admin", "dispatcher"]);
    const action = clean(req.query?.action, 60);
    const isViewOnlyRole = admin.admin !== true && admin.staffRole === "dispatcher";
    if (isViewOnlyRole && !(req.method === "GET" && action === "dashboard")) {
      return res.status(403).json({ error: "You do not have access to this feature." });
    }
    if (req.method === "GET" && action === "dashboard")
      return await listDashboard(res);
    if (req.method === "POST" && action === "organization")
      return await saveOrganization(req, res, admin);
    if (req.method === "POST" && action === "approve-member")
      return await approveMember(req, res, admin);
    if (req.method === "POST" && action === "request-status")
      return await updateRequest(req, res, admin);
    if (req.method === "POST" && action === "convert")
      return await convertRequest(req, res, admin);
    if (req.method === "POST" && action === "sync-job-appointment")
      return await syncJobAppointment(req, res, admin);
    if (req.method === "POST" && action === "delete-job")
      return await deleteJob(req, res, admin);
    if (req.method === "POST" && action === "schedule")
      return await scheduleAppointment(req, res, admin);
    if (req.method === "POST" && action === "scope-change")
      return await approveScopeChange(req, res, admin);
    if (req.method === "POST" && action === "technician-public-profile")
      return await saveTechnicianPublicProfile(req, res, admin);
    if (req.method === "POST" && action === "settings")
      return await saveSettings(req, res, admin);
    if (req.method === "POST" && action === "dismiss-notifications")
      return await dismissNotifications(req, res, admin);
    if (req.method === "POST" && action === "update-member-access")
      return await updateMemberAccess(req, res, admin);
    if (req.method === "POST" && action === "relink-company")
      return await relinkCompany(req, res, admin);
    if (req.method === "POST" && action === "resend-welcome")
      return await resendWelcome(req, res, admin);
    if (req.method === "POST" && action === "test-alert")
      return await sendTestAlert(req, res, admin);
    if (req.method === "POST" && action === "sample-approval-email")
      return await sendSampleApprovalEmail(req, res);
    return res
      .status(404)
      .json({ error: "Admin client-portal operation not found." });
  } catch (error) {
    console.error("Admin client portal error:", error);
    const status = [
      "Authentication required.",
      "Administrator access required.",
      "You do not have access to this feature.",
    ].includes(error.message)
      ? 403
      : error.statusCode || 500;
    return res
      .status(status)
      .json({
        error:
          status === 500
            ? "The admin client portal could not complete this request."
            : error.message,
      });
  }
}
