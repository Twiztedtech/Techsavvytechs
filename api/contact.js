import { adminDb, adminStorage, requireAdmin } from './_lib/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import { writeAudit } from './_lib/audit.js';
import { reconcileQboInvoices } from './_lib/qbo-helper.js';
import { reportOperationalError, runOperationalHealthCheck } from './_lib/monitoring.js';
import { uploadInlineFiles } from './_lib/client-portal.js';
import { buildInvoicePdf, invoicePdfFileName } from './_lib/invoice-pdf.js';
import twilioWebhookHandler from './_lib/twilio-webhook-handler.js';
import resendWebhookHandler from './_lib/resend-webhook-handler.js';
import googleCalendarWebhookHandler from './_lib/google-calendar-webhook-handler.js';

export const config = { api: { bodyParser: false } };

async function ensureBody(req, integration) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  req.rawBody = raw;
  if (integration === 'resend') return;
  if (integration === 'twilio') req.body = Object.fromEntries(new URLSearchParams(raw));
  else if (raw) req.body = JSON.parse(raw);
  else req.body = {};
}

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const recentSubmissions = new Map();
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const dateValue = (value) => value?.toDate?.() || (value ? new Date(value) : null);

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

function isValidSubmission(value) {
  return (
    typeof value?.name === "string" &&
    value.name.trim().length >= 2 &&
    value.name.trim().length <= MAX_NAME_LENGTH &&
    typeof value.email === "string" &&
    value.email.length >= 5 &&
    value.email.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
    typeof value.message === "string" &&
    value.message.trim().length >= 1 &&
    value.message.trim().length <= MAX_MESSAGE_LENGTH
  );
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (
    typeof forwarded === "string"
      ? forwarded.split(",")[0]
      : req.socket?.remoteAddress || "unknown"
  ).trim();
}

function isRateLimited(ip, now) {
  const attempts = (recentSubmissions.get(ip) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  if (attempts.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  attempts.push(now);
  recentSubmissions.set(ip, attempts);
  return false;
}

function documentReplyTo(type) {
  return type === "invoice"
    ? process.env.BILLING_EMAIL || "billing@techsavvytechs.com"
    : process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
}

// A PDF problem must never block an invoice from going out, so a failure
// sends the email without the attachment (and the caller reports that).
function tryInvoicePdf(document) {
  try {
    return {
      filename: invoicePdfFileName(document),
      content: buildInvoicePdf(document).toString("base64"),
    };
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);
    return null;
  }
}

function renderCustomerDocumentEmail({ type, document, number, total, link, expiresAt, hasPdf }) {
  const action = type === "quote" ? "Review and approve quote" : "View invoice";
  // Some customers' AP departments require this in the invoice itself, not
  // just reachable via a link, to process payment (invoice #, service date,
  // PO/project reference, project manager). Include whatever is on file.
  const apDetails = [
    ["Invoice #", number],
    ["Date of service", document.serviceDate || ""],
    ["PO / project reference", document.clientReference || ""],
    ["Project manager", document.clientProjectManager || ""],
  ].filter(([, value]) => value);
  const apDetailsText = apDetails.map(([label, value]) => `${label}: ${value}`).join("\n");
  const apDetailsHtml = apDetails.length
    ? `<table style="margin-top:14px;font-size:13px;color:#334155">${apDetails.map(([label, value]) => `<tr><td style="padding:2px 12px 2px 0;color:#64748b">${escapeHtml(label)}</td><td style="font-weight:600">${escapeHtml(value)}</td></tr>`).join("")}</table>`
    : "";
  const pdfNoteText = hasPdf ? "\nA PDF copy of this invoice is attached.\n" : "";
  const pdfNoteHtml = hasPdf
    ? `<p style="font-size:12px;color:#64748b">A PDF copy of this invoice is attached.</p>`
    : "";
  return {
    subject:
      type === "quote"
        ? `TechSavvy quote ${number} — approval requested`
        : `TechSavvy invoice ${number}`,
    text: `Hello,\n\n${type === "quote" ? "Please review the proposed work" : "Your invoice is ready"} from TechSavvy.\n${number} · ${total}\n${apDetailsText ? `\n${apDetailsText}\n` : ""}\n${action}: ${link}\n${pdfNoteText}\nThis secure link expires ${expiresAt.slice(0, 10)}. Questions? Reply to this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">FIELD SERVICES</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>${type === "quote" ? "A quote is ready for your review and approval." : "Your invoice is ready to view."}</p><p><strong>${escapeHtml(number)}</strong><br><span style="font-size:26px">${escapeHtml(total)}</span></p>${apDetailsHtml}<p style="margin-top:18px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#22c55e;color:#071009;padding:13px 20px;border-radius:5px;text-decoration:none;font-weight:700">${action}</a></p>${pdfNoteHtml}<p style="font-size:12px;color:#64748b">This secure link expires ${escapeHtml(expiresAt.slice(0, 10))}. If you have questions, reply to this email.</p></div></div>`,
  };
}

async function previewCustomerDocument(req, res) {
  await requireAdmin(req);
  const type = req.body?.type === "invoice" ? "invoice" : req.body?.type === "quote" ? "quote" : "";
  const documentId = typeof req.body?.documentId === "string" ? req.body.documentId : "";
  if (!type || !documentId)
    return res.status(400).json({ error: "A quote or invoice is required." });
  const snapshot = await adminDb.collection(type === "quote" ? "quotes" : "invoices").doc(documentId).get();
  if (!snapshot.exists)
    return res.status(404).json({ error: `The ${type} was not found.` });
  const document = snapshot.data();
  const customerSnapshot = await adminDb.collection("customers").where("name", "==", document.customer).limit(1).get();
  const email = String(req.body?.email || customerSnapshot.docs[0]?.data()?.email || "").trim().toLowerCase();
  const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "");
  const expiresAt = new Date(Date.now() + (type === "quote" ? 30 : 60) * 86400000).toISOString();
  const number = type === "quote" ? document.quoteNumber || documentId : document.invoiceNumber || documentId;
  const total = Number(document.total || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const attachment = type === "invoice" ? tryInvoicePdf(document) : null;
  const { subject, html } = renderCustomerDocumentEmail({
    type,
    document,
    number,
    total,
    link: `${appUrl}/customer/document?type=${type}&token=your-secure-link`,
    expiresAt,
    hasPdf: Boolean(attachment),
  });
  return res.status(200).json({
    to: email,
    validRecipient: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    from: process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>",
    replyTo: documentReplyTo(type),
    subject,
    html,
    attachment: attachment
      ? { filename: attachment.filename, sizeKb: Math.max(1, Math.round((attachment.content.length * 3) / 4 / 1024)) }
      : null,
  });
}

async function sendCustomerDocument(req, res) {
  const user = await requireAdmin(req);
  const type =
    req.body?.type === "invoice"
      ? "invoice"
      : req.body?.type === "quote"
        ? "quote"
        : "";
  const documentId =
    typeof req.body?.documentId === "string" ? req.body.documentId : "";
  if (!type || !documentId)
    return res.status(400).json({ error: "A quote or invoice is required." });
  const collectionName = type === "quote" ? "quotes" : "invoices";
  const snapshot = await adminDb
    .collection(collectionName)
    .doc(documentId)
    .get();
  if (!snapshot.exists)
    return res.status(404).json({ error: `The ${type} was not found.` });
  const document = snapshot.data();
  const customerSnapshot = await adminDb
    .collection("customers")
    .where("name", "==", document.customer)
    .limit(1)
    .get();
  const email = String(
    req.body?.email || customerSnapshot.docs[0]?.data()?.email || "",
  )
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res
      .status(422)
      .json({ error: "The customer needs a valid email address." });
  if (!process.env.RESEND_API_KEY)
    return res
      .status(503)
      .json({ error: "Customer email delivery is not configured." });

  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const expiresAt = new Date(
    Date.now() + (type === "quote" ? 30 : 60) * 86400000,
  ).toISOString();
  await adminDb
    .collection("customer_document_tokens")
    .doc(hash)
    .set({
      type,
      documentId,
      email,
      expiresAt,
      createdAt: new Date().toISOString(),
      usedAt: null,
    });
  const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(
    /\/$/,
    "",
  );
  const link = `${appUrl}/customer/document?type=${type}&token=${encodeURIComponent(rawToken)}`;
  const number =
    type === "quote"
      ? document.quoteNumber || documentId
      : document.invoiceNumber || documentId;
  const total = Number(document.total || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const sender =
    process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
  const replyTo = documentReplyTo(type);
  const attachment = type === "invoice" ? tryInvoicePdf(document) : null;
  const { subject, text, html } = renderCustomerDocumentEmail({
    type,
    document,
    number,
    total,
    link,
    expiresAt,
    hasPdf: Boolean(attachment),
  });
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "TechSavvy-CRM/1.0",
    },
    body: JSON.stringify({
      from: sender,
      reply_to: replyTo,
      to: [email],
      subject,
      text,
      html,
      ...(attachment ? { attachments: [attachment] } : {}),
    }),
  });
  if (!delivery.ok) {
    await adminDb.collection("customer_document_tokens").doc(hash).delete();
    throw new Error("Email delivery failed: " + (await delivery.text()));
  }
  const deliveryData = await delivery.json();
  await snapshot.ref.set(
    {
      customerDelivery: {
        email,
        emailId: deliveryData.id,
        status: "sent",
        sentAt: new Date().toISOString(),
        expiresAt,
        tokenHash: hash,
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  await writeAudit({ actor: user, action: "emailed", entityType: type, entityId: documentId, summary: `Emailed ${type} ${number} to ${email}`, details: { email, expiresAt }, source: "api" });
  return res.status(200).json({ success: true, email, expiresAt, pdfAttached: Boolean(attachment) });
}

async function sendCustomerPortal(req, res) {
  const user = await requireAdmin(req);
  const customerId = String(req.body?.customerId || "").trim();
  if (!customerId)
    return res.status(400).json({ error: "A customer is required." });
  const customerRef = adminDb.collection("customers").doc(customerId);
  const customerSnapshot = await customerRef.get();
  if (!customerSnapshot.exists)
    return res.status(404).json({ error: "The customer was not found." });
  const customer = customerSnapshot.data();
  // Multiple people at the same company may need their own invite (this is
  // a self-signup pointer, not a single shared magic link), so the
  // recipient is whichever address the admin targets this send at --
  // defaulting to the company's contact email, not locked to it.
  const email = String(req.body?.recipientEmail || customer.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(422).json({ error: "A valid recipient email address is required." });
  if (!process.env.RESEND_API_KEY)
    return res.status(503).json({ error: "Customer email delivery is not configured." });

  const createdAt = new Date().toISOString();
  const sender = process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
  const defaultSubject = "Your TechSavvy customer portal";
  const defaultMessage =
    "Your secure customer portal is ready. View jobs, quotes, invoices, equipment and maintenance in one place.";
  const subject = String(req.body?.subject || "").trim().slice(0, 200) || defaultSubject;
  // The admin-edited message is the entire email body (it typically already
  // includes its own link/call to action, e.g. the /client self-signup
  // pilot invite), so it is sent as-is rather than having a link/expiry
  // footer appended after it the way the old fixed template did.
  const message = String(req.body?.message || "").trim().slice(0, 6000) || defaultMessage;
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "TechSavvy-CRM/1.0" },
    body: JSON.stringify({
      from: sender,
      reply_to: supportEmail,
      to: [email],
      subject,
      text: message,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">CUSTOMER PORTAL</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p></div></div>`,
    }),
  });
  if (!delivery.ok) {
    throw new Error("Portal email delivery failed: " + (await delivery.text()));
  }
  const deliveryData = await delivery.json();
  // Append-only invite history -- several people at one company can each
  // get their own invite, so this never overwrites a prior recipient's
  // entry the way a single portalDelivery object used to.
  await customerRef.set({
    portalInvites: FieldValue.arrayUnion({
      email,
      sentAt: createdAt,
      emailId: deliveryData.id,
      subject,
      sentByUid: user.uid,
    }),
    updatedAt: createdAt,
  }, { merge: true });
  await writeAudit({ actor: user, action: "portal-invited", entityType: "customer", entityId: customerId, summary: `Sent customer portal invite to ${email}`, details: { email }, source: "api" });
  return res.status(200).json({ success: true, email });
}

async function listClientUsers(req, res) {
  await requireAdmin(req);
  const snapshot = await adminDb.collection("client_users").limit(500).get();
  return res.status(200).json({
    users: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        customerId: data.customerId || "",
        email: String(data.email || "").toLowerCase(),
        displayName: data.displayName || "",
        status: data.status || "pending",
      };
    }),
  });
}

async function manageCustomerPortal(req, res) {
  const user = await requireAdmin(req);
  const customerId = String(req.body?.customerId || "").trim();
  const action = req.body?.action;
  if (!customerId || !["preview", "revoke"].includes(action))
    return res.status(400).json({ error: "A valid customer portal action is required." });
  const customerRef = adminDb.collection("customers").doc(customerId);
  const customerSnapshot = await customerRef.get();
  if (!customerSnapshot.exists)
    return res.status(404).json({ error: "The customer was not found." });
  const customer = customerSnapshot.data();
  if (action === "revoke") {
    const revokedAt = new Date().toISOString();
    await customerRef.set({ portalDelivery: { ...(customer.portalDelivery || {}), status: "revoked", tokenHash: null, revokedAt, revokedByUid: user.uid }, updatedAt: revokedAt }, { merge: true });
    await writeAudit({ actor: user, action: "portal-revoked", entityType: "customer", entityId: customerId, summary: `Revoked customer portal access for ${customer.name}`, source: "api" });
    return res.status(200).json({ success: true, status: "revoked" });
  }
  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
  await adminDb.collection("customer_portal_tokens").doc(hash).set({ customerId, customerName: customer.name, email: user.email || user.token?.email || "Administrator", preview: true, createdAt, expiresAt, createdByUid: user.uid });
  const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "");
  await writeAudit({ actor: user, action: "portal-previewed", entityType: "customer", entityId: customerId, summary: `Opened administrator portal preview for ${customer.name}`, details: { expiresAt }, source: "api" });
  return res.status(200).json({ success: true, url: `${appUrl}/customer/portal?preview=1&token=${encodeURIComponent(rawToken)}`, expiresAt });
}

async function getPortalAccess(rawToken) {
  const hash = rawToken ? tokenHash(rawToken) : "";
  const tokenSnapshot = hash ? await adminDb.collection("customer_portal_tokens").doc(hash).get() : null;
  const access = tokenSnapshot?.data();
  if (!tokenSnapshot?.exists || !access || access.expiresAt < new Date().toISOString())
    throw Object.assign(new Error("This customer portal link is invalid or has expired."), { statusCode: 410 });
  const customerSnapshot = await adminDb.collection("customers").doc(access.customerId).get();
  if (!customerSnapshot.exists || (!access.preview && customerSnapshot.data()?.portalDelivery?.tokenHash !== hash))
    throw Object.assign(new Error("A newer customer portal link has replaced this one."), { statusCode: 410 });
  return { access, customerSnapshot };
}

async function loadCustomerPortal(req, res) {
  const rawToken = typeof req.query?.token === "string" ? req.query.token : "";
  const { access, customerSnapshot } = await getPortalAccess(rawToken);
  const customer = customerSnapshot.data();
  const matchingCustomers = await adminDb.collection('customers').where('name', '==', customer.name).get();
  const customerRecords = async (collection, nameField) => {
    const linked = await adminDb.collection(collection).where('customerId', '==', customerSnapshot.id).get();
    const legacy = matchingCustomers.size === 1 ? await adminDb.collection(collection).where(nameField, '==', customer.name).get() : { docs: [] };
    return { docs: [...new Map([...linked.docs, ...legacy.docs.filter((doc) => !doc.data().customerId)].map((doc) => [doc.id, doc])).values()].filter((doc) => doc.data().status !== 'voided') };
  };
  const [jobsSnapshot, quotesSnapshot, invoicesSnapshot, assetsSnapshot] = await Promise.all([
    customerRecords('jobs', 'vendorName'),
    customerRecords('quotes', 'customer'),
    customerRecords('invoices', 'customer'),
    adminDb.collection("customer_assets").where("customerId", "==", customerSnapshot.id).get(),
  ]);
  const jobs = jobsSnapshot.docs.map((doc) => {
    const value = doc.data();
    return { id: doc.id, number: value.workOrderNumber || doc.id, title: value.name || "Service job", site: value.address || "", status: value.status || "Open", technician: value.assignedTechName || "Scheduling", targetCompletion: value.targetCompletion || "", schedule: value.schedule || null };
  });
  const quotes = quotesSnapshot.docs.map((doc) => {
    const value = doc.data();
    return { id: doc.id, number: value.quoteNumber || doc.id, title: value.title || "Quote", site: value.site || "", status: value.status || "Draft", total: Number(value.total || 0) };
  });
  const invoices = invoicesSnapshot.docs.map((doc) => {
    const value = doc.data();
    return { id: doc.id, number: value.invoiceNumber || doc.id, status: value.status || "Open", issueDate: value.issueDate || "", dueDate: value.dueDate || "", total: Number(value.total || 0), balance: Number(value.balance ?? value.total ?? 0), paymentLink: access.preview ? null : value.qboSync?.invoiceLink || null, onlinePaymentEnabled: !access.preview && Boolean(value.qboSync?.invoiceLink) };
  });
  const assets = assetsSnapshot.docs.map((doc) => {
    const value = doc.data();
    return { id: doc.id, name: value.name || "Customer asset", site: value.site || "", category: value.category || "Equipment", manufacturer: value.manufacturer || "", model: value.model || "", serialNumber: value.serialNumber || "", status: value.status || "Active", nextServiceDate: value.maintenance?.enabled ? value.maintenance?.nextServiceDate || "" : "", fulfillmentSource: value.fulfillmentSource || "", workOrderNumber: value.workOrderNumber || "", quantity: value.quantity || "" };
  });
  return res.status(200).json({
    preview: Boolean(access.preview),
    customer: { id: customerSnapshot.id, name: customer.name, contact: customer.contact || "", email: access.email, phone: customer.phone || "", sites: customer.sites || [] },
    jobs,
    quotes,
    invoices,
    assets,
  });
}

async function createPortalServiceRequest(req, res) {
  const rawToken = typeof req.body?.token === "string" ? req.body.token : "";
  const { access, customerSnapshot } = await getPortalAccess(rawToken);
  if (access.preview)
    return res.status(403).json({ error: "Administrator preview is read-only." });
  const subject = String(req.body?.subject || "").trim().slice(0, 120);
  const message = String(req.body?.message || "").trim().slice(0, 3000);
  const site = String(req.body?.site || "").trim().slice(0, 250);
  const address = String(req.body?.address || site).trim().slice(0, 300);
  const siteContact = String(req.body?.siteContact || "").trim().slice(0, 300);
  const clientReference = String(req.body?.clientReference || "").trim().slice(0, 100);
  const serviceType = String(req.body?.serviceType || "general").trim().slice(0, 80);
  const requiredDeliverables = Array.isArray(req.body?.requiredDeliverables) ? req.body.requiredDeliverables.map((value) => String(value || "").trim().slice(0, 500)).filter(Boolean).slice(0, 30) : String(req.body?.deliverables || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).slice(0, 30);
  const deliverables = requiredDeliverables.join("\n");
  const accessInstructions = String(req.body?.accessInstructions || "").trim().slice(0, 3000);
  const safetyRequirements = String(req.body?.safetyRequirements || "").trim().slice(0, 3000);
  const preferredDate = String(req.body?.preferredDate || "").trim().slice(0, 20);
  const scopeTasks = Array.isArray(req.body?.scopeTasks) ? req.body.scopeTasks.map((value) => String(value || "").trim().slice(0, 500)).filter(Boolean).slice(0, 30) : [];
  const equipment = Array.isArray(req.body?.equipment) ? req.body.equipment.map((item) => ({ description: String(item?.description || "").trim().slice(0, 300), quantity: String(item?.quantity || "").trim().slice(0, 40), notes: String(item?.notes || "").trim().slice(0, 500), fulfillmentSource: item?.fulfillmentSource === "techsavvy_supplied" ? "techsavvy_supplied" : "customer_shipped" })).filter((item) => item.description).slice(0, 30) : [];
  if (!subject || !message || !address || !preferredDate)
    return res.status(400).json({ error: "Please add a subject, site address, preferred date, and scope summary." });
  const createdAt = new Date().toISOString();
  const customer = customerSnapshot.data();
  // Writes to vendor_requests (the same collection BookJob.tsx/ClientPortal.tsx
  // use) instead of the old standalone `contacts` doc, so this request shows
  // up in the CRM's Client Requests admin screen and can actually be
  // converted into a job -- previously it wrote to `contacts`, which no admin
  // screen reads, so these requests silently went nowhere.
  const request = adminDb.collection("vendor_requests").doc();
  const attachments = await uploadInlineFiles(req.body?.attachments, request.id);
  const requestNumber = `TS-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-7)}`;
  await request.set({
    requestNumber,
    companyName: customer?.name || "",
    customerId: customerSnapshot.id,
    createdByClientUid: "",
    requesterName: customer?.contact || customer?.name || "",
    requesterEmail: access.email,
    requesterPhone: customer?.phone || "",
    clientReference,
    siteName: site || subject,
    address,
    siteContact,
    accessInstructions: safetyRequirements ? `${accessInstructions}${accessInstructions ? "\n\n" : ""}Safety requirements: ${safetyRequirements}` : accessInstructions,
    serviceType,
    scopeSummary: message,
    scopeTasks: scopeTasks.length ? scopeTasks : [message],
    equipment,
    deliverables: requiredDeliverables,
    requiredDeliverables,
    attachments,
    requestedWindows: [{ date: preferredDate, start: "", end: "" }],
    status: "requested",
    urgent: false,
    createdAt,
    source: "customer-portal",
  });
  await writeAudit({ actor: { email: access.email }, action: "service-requested", entityType: "customer", entityId: customerSnapshot.id, summary: `Customer submitted service request: ${subject}`, details: { requestId: request.id, site, preferredDate }, source: "customer-portal" });
  return res.status(201).json({ success: true, requestId: request.id, requestNumber });
}

async function deliverReminder({ type, entityId, entity, customer, actor, manual = false }) {
  const email = String(customer.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { skipped: "missing-email" };
  const preferences = customer.reminderPreferences || {};
  if (!manual && (preferences.enabled === false || preferences[type] === false)) return { skipped: "opted-out" };
  const today = new Date().toISOString().slice(0, 10);
  // Invoices escalate as they age: a fresh nudge weekly, then firmer wording
  // once it's clearly being ignored, then urgent (with the office CC'd so a
  // human steps in) and a faster cadence once it's seriously overdue.
  let invoiceEscalation = null;
  let cycle;
  if (type === "invoice") {
    const daysOverdue = entity.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(`${entity.dueDate}T00:00:00`).getTime()) / 86400000)) : 0;
    invoiceEscalation = daysOverdue >= 30 ? "urgent" : daysOverdue >= 14 ? "firm" : "gentle";
    const cadenceDays = invoiceEscalation === "urgent" ? 3 : 7;
    cycle = `overdue${Math.floor(daysOverdue / cadenceDays)}`;
  } else if (type === "appointment") {
    cycle = entity.schedule?.date || entity.targetCompletion || today;
  } else if (type === "maintenance") {
    cycle = entity.maintenance?.nextServiceDate || today;
  } else {
    cycle = `${today.slice(0, 8)}${String(Math.floor((Number(today.slice(8, 10)) - 1) / 7) + 1)}`;
  }
  const deliveryId = `${type}_${entityId}_${manual ? `manual_${Date.now()}` : cycle}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const deliveryRef = adminDb.collection("reminder_deliveries").doc(deliveryId);
  const existingDelivery = await deliveryRef.get();
  if (existingDelivery.exists && ["sent", "sending"].includes(existingDelivery.data()?.status)) return { skipped: "duplicate" };
  await deliveryRef.set({ type, entityId, customerId: customer.id, email, status: "sending", manual, createdAt: new Date().toISOString() });
  try {
    const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "");
    let actionUrl = `${appUrl}/contact`;
    let actionLabel = "Contact TechSavvy";
    if (type === "quote" || type === "invoice") {
      const rawToken = randomBytes(32).toString("base64url");
      const hash = tokenHash(rawToken);
      const expiresAt = new Date(Date.now() + (type === "quote" ? 30 : 60) * 86400000).toISOString();
      await adminDb.collection("customer_document_tokens").doc(hash).set({ type, documentId: entityId, email, expiresAt, createdAt: new Date().toISOString(), usedAt: null, reminder: true });
      await adminDb.collection(type === "quote" ? "quotes" : "invoices").doc(entityId).set({ customerDelivery: { ...(entity.customerDelivery || {}), email, status: "reminded", sentAt: new Date().toISOString(), expiresAt, tokenHash: hash }, updatedAt: new Date().toISOString() }, { merge: true });
      actionUrl = `${appUrl}/customer/document?type=${type}&token=${encodeURIComponent(rawToken)}`;
      actionLabel = type === "quote" ? "Review and approve quote" : "View invoice and payment options";
    }
    const number = entity.quoteNumber || entity.invoiceNumber || entity.workOrderNumber || entity.name || entityId;
    const amount = Number(entity.balance ?? entity.total ?? 0);
    const formattedAmount = amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
    const invoiceDetailByStage = {
      gentle: `Just a friendly reminder that invoice ${number} has an outstanding balance of ${formattedAmount}, due ${entity.dueDate || "recently"}.`,
      firm: `Invoice ${number} remains unpaid — the outstanding balance of ${formattedAmount} was due ${entity.dueDate || "recently"} and is now past due. Please remit payment at your earliest convenience.`,
      urgent: `Invoice ${number} is seriously past due. The outstanding balance of ${formattedAmount} (due ${entity.dueDate || "recently"}) requires immediate payment. Please contact us right away if there's an issue we should know about.`,
    };
    const detail = type === "appointment" ? `Scheduled for ${entity.schedule?.date || entity.targetCompletion || "the planned service date"}${entity.schedule?.start ? ` at ${entity.schedule.start}` : ""}.` : type === "quote" ? `Your quote ${number} for ${formattedAmount} is awaiting your decision.` : type === "invoice" ? invoiceDetailByStage[invoiceEscalation] : `${entity.name || "Your equipment"} is due for recurring maintenance on ${entity.maintenance?.nextServiceDate || "the upcoming service date"}.`;
    const invoiceSubjectByStage = {
      gentle: `Reminder: TechSavvy invoice ${number} is overdue`,
      firm: `Please remit payment — TechSavvy invoice ${number}`,
      urgent: `Payment required — TechSavvy invoice ${number}`,
    };
    const subjects = { appointment: `TechSavvy appointment reminder — ${number}`, quote: `Reminder: TechSavvy quote ${number} needs your review`, invoice: type === "invoice" ? invoiceSubjectByStage[invoiceEscalation] : "", maintenance: `TechSavvy maintenance reminder — ${entity.name || number}` };
    const sender = process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
    const supportEmail = process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
    const billingEmail = process.env.BILLING_EMAIL || "billing@techsavvytechs.com";
    // Once an invoice is seriously overdue, loop the office in on every
    // escalation email so a human knows to step in and follow up directly.
    const ccAddresses = invoiceEscalation === "urgent" ? (process.env.CLIENT_REQUEST_ALERT_EMAILS?.split(",") || [supportEmail]) : undefined;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `techsavvy-${deliveryId}`, "User-Agent": "TechSavvy-CRM/1.0" },
      body: JSON.stringify({ from: sender, reply_to: type === "invoice" ? billingEmail : supportEmail, to: [email], ...(ccAddresses ? { cc: ccAddresses } : {}), subject: subjects[type], text: `Hello ${customer.contact || customer.name},\n\n${detail}\n\n${actionLabel}: ${actionUrl}\n\nQuestions? Reply to this email.`, html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">SERVICE REMINDER</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>Hello ${escapeHtml(customer.contact || customer.name)},</p><p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#22c55e;color:#071009;padding:13px 20px;border-radius:5px;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;color:#64748b">Questions? Reply to this email. To change reminder preferences, contact TechSavvy support.</p></div></div>` }),
    });
    if (!response.ok) throw new Error("Reminder email failed: " + (await response.text()));
    const result = await response.json();
    await deliveryRef.set({ status: "sent", emailId: result.id, sentAt: new Date().toISOString(), ...(invoiceEscalation ? { escalation: invoiceEscalation } : {}) }, { merge: true });
    await writeAudit({ actor: actor || { email: "Scheduled reminder" }, action: manual ? "reminder-sent-manually" : "reminder-sent", entityType: type, entityId, summary: invoiceEscalation ? `Sent ${invoiceEscalation} invoice reminder to ${email}` : `Sent ${type} reminder to ${email}`, details: { deliveryId, email, ...(invoiceEscalation ? { escalation: invoiceEscalation } : {}) }, source: manual ? "crm" : "scheduled-reminder" });
    return { sent: true, deliveryId };
  } catch (error) {
    await deliveryRef.set({ status: "failed", error: error.message, failedAt: new Date().toISOString() }, { merge: true });
    throw error;
  }
}

async function reminderCandidates() {
  const [customersSnapshot, jobsSnapshot, quotesSnapshot, invoicesSnapshot, assetsSnapshot] = await Promise.all([
    adminDb.collection("customers").get(), adminDb.collection("jobs").get(), adminDb.collection("quotes").get(), adminDb.collection("invoices").get(), adminDb.collection("customer_assets").get(),
  ]);
  const customers = customersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const customerByName = new Map(customers.map((customer) => [customer.name, customer]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const maintenanceLimit = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const candidates = [];
  jobsSnapshot.docs.forEach((doc) => { const entity = doc.data(); const serviceDate = entity.schedule?.date || entity.targetCompletion; if (serviceDate === tomorrow) candidates.push({ type: "appointment", entityId: doc.id, entity, customer: (entity.customerId && customerById.get(entity.customerId)) || customerByName.get(entity.vendorName) }); });
  quotesSnapshot.docs.forEach((doc) => { const entity = doc.data(); const created = dateValue(entity.createdAt); if (["Pending", "Sent", "Draft"].includes(entity.status) && (!created || today.getTime() - created.getTime() >= 3 * 86400000)) candidates.push({ type: "quote", entityId: doc.id, entity, customer: (entity.customerId && customerById.get(entity.customerId)) || customerByName.get(entity.customer) }); });
  invoicesSnapshot.docs.forEach((doc) => { const entity = doc.data(); if (Number(entity.balance || 0) > 0 && entity.dueDate && new Date(`${entity.dueDate}T00:00:00`) < today) candidates.push({ type: "invoice", entityId: doc.id, entity, customer: customerByName.get(entity.customer) }); });
  assetsSnapshot.docs.forEach((doc) => { const entity = doc.data(); const due = entity.maintenance?.nextServiceDate; if (entity.status === "Active" && entity.maintenance?.enabled && due && due >= today.toISOString().slice(0, 10) && due <= maintenanceLimit) candidates.push({ type: "maintenance", entityId: doc.id, entity, customer: customerById.get(entity.customerId) }); });
  return candidates.filter((candidate) => candidate.customer);
}

async function runReminderCycle(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: "Unauthorized" });
  await runOperationalHealthCheck({ notify: true, persist: true });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: "Email delivery is not configured." });
  const candidates = await reminderCandidates();
  const results = [];
  for (const candidate of candidates.slice(0, 100)) {
    try { results.push(await deliverReminder(candidate)); }
    catch (error) { results.push({ failed: true, error: error.message }); }
  }
  let reconciliation = { skipped: true };
  try {
    reconciliation = await reconcileQboInvoices();
    for (const change of reconciliation.changes) await writeAudit({ actor: { email: "Scheduled reconciliation" }, action: "payment-reconciled", entityType: "invoice", entityId: change.id, summary: `QuickBooks updated ${change.invoiceNumber}: balance ${change.previousBalance} → ${change.balance}`, details: change, source: "scheduled-reconciliation" });
    await writeAudit({ actor: { email: "Scheduled reconciliation" }, action: "reconciled", entityType: "quickbooks", entityId: "invoices", summary: `Scheduled reconciliation checked ${reconciliation.checked} QuickBooks invoice${reconciliation.checked === 1 ? "" : "s"}; ${reconciliation.updated} balance${reconciliation.updated === 1 ? "" : "s"} changed; ${reconciliation.imported || 0} new invoice${reconciliation.imported === 1 ? "" : "s"} imported from QuickBooks`, details: { checked: reconciliation.checked, updated: reconciliation.updated, imported: reconciliation.imported || 0 }, source: "scheduled-reminder" });
  }
  catch (error) { reconciliation = { failed: true, error: error.message }; }
  return res.status(200).json({ success: true, candidates: candidates.length, sent: results.filter((result) => result.sent).length, skipped: results.filter((result) => result.skipped).length, failed: results.filter((result) => result.failed).length, reconciliation });
}

async function sendManualReminder(req, res) {
  const user = await requireAdmin(req);
  const type = req.body?.type;
  const entityId = String(req.body?.entityId || "").trim();
  if (!entityId || !["appointment", "quote", "invoice", "maintenance"].includes(type)) return res.status(400).json({ error: "A valid reminder is required." });
  const collectionName = type === "appointment" ? "jobs" : type === "maintenance" ? "customer_assets" : `${type}s`;
  const entitySnapshot = await adminDb.collection(collectionName).doc(entityId).get();
  if (!entitySnapshot.exists) return res.status(404).json({ error: "The reminder record was not found." });
  const entity = entitySnapshot.data();
  let customer = null;
  if (entity.customerId) {
    const byIdSnapshot = await adminDb.collection("customers").doc(entity.customerId).get();
    if (byIdSnapshot.exists) customer = { id: byIdSnapshot.id, ...byIdSnapshot.data() };
  }
  if (!customer) {
    const byNameSnapshot = await adminDb.collection("customers").where("name", "==", entity.vendorName || entity.customer).limit(1).get();
    if (!byNameSnapshot.empty) customer = { id: byNameSnapshot.docs[0].id, ...byNameSnapshot.docs[0].data() };
  }
  if (!customer) return res.status(422).json({ error: "The record is not linked to a customer." });
  const result = await deliverReminder({ type, entityId, entity, customer, actor: user, manual: true });
  return res.status(200).json({ success: true, ...result, email: customer.email });
}

async function loadCustomerDocument(req, res) {
  const rawToken = typeof req.query?.token === "string" ? req.query.token : "";
  const hash = rawToken ? tokenHash(rawToken) : "";
  const tokenSnapshot = hash
    ? await adminDb.collection("customer_document_tokens").doc(hash).get()
    : null;
  const access = tokenSnapshot?.data();
  if (
    !tokenSnapshot?.exists ||
    !access ||
    access.expiresAt < new Date().toISOString()
  )
    return res
      .status(410)
      .json({ error: "This secure link is invalid or has expired." });
  const collectionName = access.type === "quote" ? "quotes" : "invoices";
  const documentSnapshot = await adminDb
    .collection(collectionName)
    .doc(access.documentId)
    .get();
  if (!documentSnapshot.exists)
    return res
      .status(404)
      .json({ error: "This document is no longer available." });
  const value = documentSnapshot.data();
  if (access.type === "quote" && value.customerDelivery?.tokenHash !== hash)
    return res
      .status(410)
      .json({ error: "A newer approval link has replaced this one." });
  return res
    .status(200)
    .json({
      type: access.type,
      document: {
        id: documentSnapshot.id,
        number:
          access.type === "quote" ? value.quoteNumber : value.invoiceNumber,
        customer: value.customer,
        site: value.site || "",
        title: value.title || value.workOrderNumber || "",
        clientReference: value.clientReference || "",
        clientProjectManager: value.clientProjectManager || "",
        status: value.status,
        lineItems: value.lineItems || [],
        subtotal: Number(value.subtotal ?? value.total ?? 0),
        discount: Number(value.discount || 0),
        tax: Number(value.tax || 0),
        total: Number(value.total || 0),
        amountPaid: Number(value.amountPaid || 0),
        balance: Number(value.balance ?? value.total ?? 0),
        issueDate: value.issueDate || "",
        dueDate: value.dueDate || "",
        serviceDate: value.serviceDate || "",
        customerMessage: value.customerMessage || "",
        stipulations: Array.isArray(value.stipulations) ? value.stipulations : [],
        paymentLink: value.qboSync?.invoiceLink || null,
      },
    });
}

async function respondToQuote(req, res) {
  const rawToken = typeof req.body?.token === "string" ? req.body.token : "";
  const decision = req.body?.decision;
  if (!rawToken || !["Accepted", "Rejected"].includes(decision))
    return res
      .status(400)
      .json({ error: "A valid quote decision is required." });
  const hash = tokenHash(rawToken);
  await adminDb.runTransaction(async (transaction) => {
    const tokenRef = adminDb.collection("customer_document_tokens").doc(hash);
    const tokenSnapshot = await transaction.get(tokenRef);
    const access = tokenSnapshot.data();
    if (
      !tokenSnapshot.exists ||
      access?.type !== "quote" ||
      access.expiresAt < new Date().toISOString()
    )
      throw Object.assign(
        new Error("This approval link is invalid or has expired."),
        { statusCode: 410 },
      );
    const quoteRef = adminDb.collection("quotes").doc(access.documentId);
    const quoteSnapshot = await transaction.get(quoteRef);
    if (!quoteSnapshot.exists)
      throw Object.assign(new Error("The quote is no longer available."), {
        statusCode: 404,
      });
    if (access.usedAt)
      throw Object.assign(
        new Error(
          `This quote was already ${access.decision?.toLowerCase() || "answered"}.`,
        ),
        { statusCode: 409 },
      );
    if (quoteSnapshot.data()?.customerDelivery?.tokenHash !== hash)
      throw Object.assign(
        new Error("A newer approval link has replaced this one."),
        { statusCode: 410 },
      );
    transaction.set(
      quoteRef,
      {
        status: decision,
        customerDecision: {
          decision,
          email: access.email,
          decidedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    transaction.set(
      tokenRef,
      { usedAt: new Date().toISOString(), decision },
      { merge: true },
    );
  });
  const accessSnapshot = await adminDb.collection("customer_document_tokens").doc(hash).get();
  const access = accessSnapshot.data();
  await writeAudit({ actor: { email: access?.email }, action: decision.toLowerCase(), entityType: "quote", entityId: access?.documentId, summary: `Customer ${decision.toLowerCase()} quote`, details: { customerEmail: access?.email }, source: "customer-document" });
  return res.status(200).json({ success: true, status: decision });
}

async function sendCustomerAgreement(req, res) {
  const user = await requireAdmin(req);
  const customerId = String(req.body?.customerId || "").trim();
  if (!customerId) return res.status(400).json({ error: "A customer is required." });
  const customerRef = adminDb.collection("customers").doc(customerId);
  const customerSnapshot = await customerRef.get();
  if (!customerSnapshot.exists) return res.status(404).json({ error: "The customer was not found." });
  const customer = customerSnapshot.data();
  const email = String(customer.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(422).json({ error: "The customer needs a valid email address." });
  if (!process.env.RESEND_API_KEY)
    return res.status(503).json({ error: "Customer email delivery is not configured." });

  const standardRate = Number(req.body?.standardRate);
  const nightRate = Number(req.body?.nightRate);
  const minimumHours = Number(req.body?.minimumHours) > 0 ? Number(req.body.minimumHours) : 2;
  if (!Number.isFinite(standardRate) || standardRate <= 0 || !Number.isFinite(nightRate) || nightRate <= 0)
    return res.status(400).json({ error: "A standard rate and a night rate are required." });

  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await adminDb.collection("customer_document_tokens").doc(hash).set({
    type: "agreement",
    customerId,
    email,
    standardRate,
    nightRate,
    minimumHours,
    createdAt,
    expiresAt,
    usedAt: null,
  });
  const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "");
  const link = `${appUrl}/agreement?token=${encodeURIComponent(rawToken)}`;
  const sender = process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      reply_to: supportEmail,
      to: [email],
      subject: "Please review & sign your TechSavvy service agreement",
      text: `Hello ${customer.contact || customer.name},\n\nPlease review and sign your TechSavvy service agreement to get started.\n\nReview & sign: ${link}\n\nThis link expires ${expiresAt.slice(0, 10)}.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">SERVICE AGREEMENT</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>Hello ${escapeHtml(customer.contact || customer.name)},</p><p>Please review and sign your TechSavvy service agreement to get started.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#22c55e;color:#071009;padding:13px 20px;border-radius:5px;text-decoration:none;font-weight:700">Review &amp; sign agreement</a></p><p style="font-size:12px;color:#64748b">This link expires ${escapeHtml(expiresAt.slice(0, 10))}. Questions? Reply to this email.</p></div></div>`,
    }),
  });
  if (!delivery.ok) {
    await adminDb.collection("customer_document_tokens").doc(hash).delete();
    throw new Error("Agreement email delivery failed: " + (await delivery.text()));
  }
  const deliveryData = await delivery.json();
  await customerRef.set(
    {
      serviceAgreement: {
        status: "sent",
        email,
        emailId: deliveryData.id,
        sentAt: createdAt,
        expiresAt,
        tokenHash: hash,
        standardRate,
        nightRate,
        minimumHours,
      },
      updatedAt: createdAt,
    },
    { merge: true },
  );
  await writeAudit({ actor: user, action: "emailed", entityType: "customer", entityId: customerId, summary: `Emailed service agreement to ${email}`, details: { email, expiresAt }, source: "api" });
  return res.status(200).json({ success: true, email, expiresAt });
}

async function loadCustomerAgreement(req, res) {
  const rawToken = typeof req.query?.token === "string" ? req.query.token : "";
  const hash = rawToken ? tokenHash(rawToken) : "";
  const tokenSnapshot = hash ? await adminDb.collection("customer_document_tokens").doc(hash).get() : null;
  const access = tokenSnapshot?.data();
  if (!tokenSnapshot?.exists || access?.type !== "agreement" || access.expiresAt < new Date().toISOString())
    return res.status(410).json({ error: "This secure link is invalid or has expired." });
  const customerSnapshot = await adminDb.collection("customers").doc(access.customerId).get();
  const customer = customerSnapshot.exists ? customerSnapshot.data() : {};
  if (customer?.serviceAgreement?.tokenHash !== hash)
    return res.status(410).json({ error: "A newer signing link has replaced this one." });
  return res.status(200).json({
    signed: customer?.serviceAgreement?.status === "signed",
    customer: {
      name: customer?.contact || customer?.name || "",
      businessName: customer?.name || "",
      email: access.email,
      phone: customer?.phone || "",
      address: customer?.sites?.[0] || "",
    },
    standardRate: access.standardRate || 0,
    nightRate: access.nightRate || 0,
    minimumHours: access.minimumHours || 2,
  });
}

async function getAgreementPdfLink(req, res) {
  await requireAdmin(req);
  const customerId = String(req.body?.customerId || "").trim();
  if (!customerId) return res.status(400).json({ error: "A customer is required." });
  const customerSnapshot = await adminDb.collection("customers").doc(customerId).get();
  const storagePath = customerSnapshot.data()?.serviceAgreement?.storagePath;
  if (!storagePath)
    return res.status(404).json({ error: "No signed agreement is on file for this customer." });
  const [url] = await adminStorage
    .file(storagePath)
    .getSignedUrl({ action: "read", version: "v4", expires: Date.now() + 10 * 60 * 1000 });
  return res.status(200).json({ url });
}

async function submitAgreement(req, res) {
  if (req.body?.company) return res.status(201).json({ success: true });
  if (isRateLimited(`agreement:${getClientIp(req)}`, Date.now()))
    return res
      .status(429)
      .json({ error: "Please wait a few minutes before submitting again." });

  const rawToken = typeof req.body?.token === "string" ? req.body.token : "";
  if (!rawToken)
    return res.status(400).json({ error: "This signing link is missing or invalid." });
  const hash = tokenHash(rawToken);

  const customerName = String(req.body?.customerName || "").trim().slice(0, 150);
  const businessName = String(req.body?.businessName || "").trim().slice(0, 150);
  const phone = String(req.body?.phone || "").trim().slice(0, 40);
  const address = String(req.body?.address || "").trim().slice(0, 300);
  const completedAt = String(req.body?.completedAt || new Date().toISOString());
  const fileName = String(req.body?.fileName || "signed-agreement.pdf")
    .slice(0, 150)
    .replace(/[^a-zA-Z0-9._-]/g, "-");
  const pdfBase64 = typeof req.body?.pdfBase64 === "string" ? req.body.pdfBase64 : "";

  if (!customerName || !address)
    return res.status(400).json({ error: "Please provide your name and address." });
  if (!pdfBase64 || pdfBase64.length > 15 * 1024 * 1024)
    return res.status(422).json({ error: "The signed agreement could not be read." });

  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64, "base64");
  } catch {
    return res.status(422).json({ error: "The signed agreement could not be read." });
  }
  if (pdfBuffer.length < 1000)
    return res.status(422).json({ error: "The signed agreement appears to be empty." });

  const tokenRef = adminDb.collection("customer_document_tokens").doc(hash);
  const tokenSnapshot = await tokenRef.get();
  const access = tokenSnapshot.data();
  if (!tokenSnapshot.exists || access?.type !== "agreement" || access.expiresAt < new Date().toISOString())
    return res.status(410).json({ error: "This signing link is invalid or has expired." });
  if (access.usedAt)
    return res.status(409).json({ error: "This agreement has already been signed." });
  const customerRef = adminDb.collection("customers").doc(access.customerId);
  const customerSnapshot = await customerRef.get();
  if (!customerSnapshot.exists)
    return res.status(404).json({ error: "The customer record could not be found." });
  if (customerSnapshot.data()?.serviceAgreement?.tokenHash !== hash)
    return res.status(410).json({ error: "A newer signing link has replaced this one." });
  const email = access.email;

  const record = adminDb.collection("signed_agreements").doc();
  const storagePath = `signed-agreements/${access.customerId}/${record.id}-${fileName}`;

  try {
    await adminStorage
      .file(storagePath)
      .save(pdfBuffer, { metadata: { contentType: "application/pdf" } });
  } catch (error) {
    console.error("Could not archive signed agreement to storage:", error);
  }

  await adminDb.runTransaction(async (transaction) => {
    const freshToken = await transaction.get(tokenRef);
    if (!freshToken.exists || freshToken.data()?.usedAt)
      throw Object.assign(new Error("This agreement has already been signed."), { statusCode: 409 });
    transaction.set(record, {
      customerId: access.customerId,
      customerName,
      businessName,
      email,
      phone,
      address,
      standardRate: access.standardRate,
      nightRate: access.nightRate,
      minimumHours: access.minimumHours,
      completedAt,
      storagePath,
      fileName,
      clientIp: getClientIp(req),
      createdAt: new Date().toISOString(),
    });
    transaction.set(
      customerRef,
      {
        serviceAgreement: {
          status: "signed",
          email,
          sentAt: access.createdAt,
          expiresAt: access.expiresAt,
          tokenHash: hash,
          signedAt: completedAt,
          signerName: customerName,
          storagePath,
          fileName,
        },
        // Authoritative source for auto-filling a new job's customer bill
        // rates in the CRM (see CreateRecordModal / JobDetailModal) -- only
        // ever written here, on a completed signature, never from an
        // unsigned proposal.
        rateAgreement: {
          standardRate: access.standardRate,
          nightRate: access.nightRate,
          minimumHours: access.minimumHours,
          agreedAt: completedAt,
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    transaction.set(tokenRef, { usedAt: new Date().toISOString() }, { merge: true });
  });

  await writeAudit({ actor: { email }, action: "signed", entityType: "customer", entityId: access.customerId, summary: "Customer signed service agreement", details: { email, storagePath }, source: "customer-agreement" });

  const sender = process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
  if (process.env.RESEND_API_KEY) {
    const attachments = [{ filename: fileName, content: pdfBase64 }];
    const customerLabel = businessName || customerName;
    const sendEmail = (to, subject, html, text) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: sender, reply_to: supportEmail, to: [to], subject, html, text, attachments }),
      });
    try {
      await sendEmail(
        email,
        "Your signed TechSavvy service agreement",
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">FIELD SERVICES</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>Hi ${escapeHtml(customerName)},</p><p>Thanks for signing your TechSavvy service agreement. Your signed copy is attached to this email as a PDF.</p><p style="font-size:12px;color:#64748b">Questions? Reply to this email or call (707) 653-6702.</p></div></div>`,
        `Hi ${customerName},\n\nThanks for signing your TechSavvy service agreement. Your signed copy is attached to this email.\n\nQuestions? Reply to this email or call (707) 653-6702.`,
      );
      await sendEmail(
        supportEmail,
        `Signed agreement: ${customerLabel}`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17201a;line-height:1.55"><p><strong>${escapeHtml(customerLabel)}</strong> signed a service agreement.</p><table style="font-size:13px;color:#334155"><tr><td style="padding:2px 12px 2px 0;color:#64748b">Email</td><td>${escapeHtml(email)}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#64748b">Phone</td><td>${escapeHtml(phone || "-")}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#64748b">Address</td><td>${escapeHtml(address)}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#64748b">Standard rate</td><td>$${access.standardRate}/hr</td></tr><tr><td style="padding:2px 12px 2px 0;color:#64748b">Night rate</td><td>$${access.nightRate}/hr</td></tr><tr><td style="padding:2px 12px 2px 0;color:#64748b">Minimum hours</td><td>${access.minimumHours}</td></tr></table><p style="font-size:12px;color:#64748b">These rates are now on file for this customer and will auto-fill on new jobs. Signed PDF attached. Also archived at storage path: ${escapeHtml(storagePath)}</p></div>`,
        `${customerLabel} signed a service agreement.\nEmail: ${email}\nPhone: ${phone || "-"}\nAddress: ${address}\nStandard rate: $${access.standardRate}/hr\nNight rate: $${access.nightRate}/hr\nMinimum hours: ${access.minimumHours}\n\nThese rates are now on file for this customer and will auto-fill on new jobs. Signed PDF attached. Archived at: ${storagePath}`,
      );
    } catch (error) {
      console.error("Agreement confirmation email failed:", error);
    }
  }

  return res.status(201).json({ success: true, id: record.id });
}

export default async function handler(req, res) {
  const integration = String(req.query?.integration || '');
  await ensureBody(req, integration);
  if (integration === 'twilio') {
    req.url = '/api/webhooks/twilio';
    return twilioWebhookHandler(req, res);
  }
  if (integration === 'resend') return resendWebhookHandler(req, res);
  if (integration === 'googleCalendar') return googleCalendarWebhookHandler(req, res);
  const requestId = req.headers['x-vercel-id'] || null;
  if (req.query?.operation === 'health' && req.method === 'GET') {
    try {
      const health = await runOperationalHealthCheck();
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(health.status === 'critical' ? 503 : 200).json(health);
    } catch (error) {
      await reportOperationalError({ route: '/api/contact?operation=health', error, requestId });
      return res.status(503).json({ status: 'critical', checkedAt: new Date().toISOString() });
    }
  }
  if (req.query?.operation === 'run-reminders' && req.method === 'GET') {
    try {
      return await runReminderCycle(req, res);
    } catch (error) {
      await reportOperationalError({ route: '/api/contact?operation=run-reminders', error, requestId });
      return res.status(500).json({ error: error.message || 'Reminder cycle failed.' });
    }
  }
  if (req.query?.operation === 'send-reminder' && req.method === 'POST') {
    try { return await sendManualReminder(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Reminder could not be sent.' }); }
  }
  if (req.query?.operation === 'manage-customer-portal' && req.method === 'POST') {
    try { return await manageCustomerPortal(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Customer portal management failed.' }); }
  }
  if (req.query?.operation === 'send-customer-portal' && req.method === 'POST') {
    try { return await sendCustomerPortal(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Customer portal delivery failed.' }); }
  }
  if (req.query?.operation === 'list-client-users' && req.method === 'GET') {
    try { return await listClientUsers(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Client users could not be loaded.' }); }
  }
  if (req.query?.operation === 'customer-portal' && req.method === 'GET') {
    try { return await loadCustomerPortal(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'The customer portal could not be loaded.' }); }
  }
  if (req.query?.operation === 'portal-service-request' && req.method === 'POST') {
    try { return await createPortalServiceRequest(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'The service request could not be sent.' }); }
  }
  if (req.query?.operation === 'send-customer-document') {
    try { return await sendCustomerDocument(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Customer document delivery failed.' }); }
  }
  if (req.query?.operation === 'preview-customer-document' && req.method === 'POST') {
    try { return await previewCustomerDocument(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Email preview failed.' }); }
  }
  if (req.query?.operation === 'customer-document' && req.method === 'GET') {
    try { return await loadCustomerDocument(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'The document could not be loaded.' }); }
  }
  if (req.query?.operation === 'quote-decision' && req.method === 'POST') {
    try { return await respondToQuote(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'The quote decision could not be saved.' }); }
  }
  if (req.query?.operation === 'submit-agreement' && req.method === 'POST') {
    try { return await submitAgreement(req, res); }
    catch (error) {
      console.error('Agreement submission failed:', error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'The agreement could not be submitted.' });
    }
  }
  if (req.query?.operation === 'send-customer-agreement' && req.method === 'POST') {
    try { return await sendCustomerAgreement(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'Agreement delivery failed.' }); }
  }
  if (req.query?.operation === 'customer-agreement' && req.method === 'GET') {
    try { return await loadCustomerAgreement(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'The agreement could not be loaded.' }); }
  }
  if (req.query?.operation === 'agreement-pdf-link' && req.method === 'POST') {
    try { return await getAgreementPdfLink(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || 'The signed agreement could not be opened.' }); }
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.body?.company) {
    return res.status(201).json({ success: true });
  }
  if (isRateLimited(getClientIp(req), Date.now())) {
    return res
      .status(429)
      .json({
        error: "Please wait a few minutes before sending another message.",
      });
  }
  if (!isValidSubmission(req.body)) {
    return res
      .status(400)
      .json({
        error: "Please provide a valid name, email address, and message.",
      });
  }

  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const message = req.body.message.trim();
  const createdAt = new Date().toISOString();
  try {
    const contact = await adminDb
      .collection("contacts")
      .add({ name, email, message, createdAt, deliveryStatus: "pending" });
    if (!process.env.RESEND_API_KEY) {
      await contact.update({ deliveryStatus: "not-configured" });
      return res.status(201).json({ success: true });
    }

    const supportEmail =
      process.env.SUPPORT_EMAIL ||
      process.env.CONTACT_RECIPIENT_EMAIL ||
      "support@techsavvytechs.com";
    const sender =
      process.env.EMAIL_FROM ||
      "TechSavvy Website <support@techsavvytechs.com>";
    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        reply_to: email,
        to: [supportEmail],
        subject: `New website contact from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `<h1>New TechSavvy website contact</h1><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p><p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
      }),
    });

    if (!delivery.ok) {
      console.error("Contact email delivery failed:", await delivery.text());
      await contact.update({ deliveryStatus: "failed" });
      return res.status(201).json({ success: true });
    }

    await contact.update({ deliveryStatus: "sent" });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Contact submission failed:", error);
    return res
      .status(500)
      .json({
        error: "Your message could not be sent. Please try again later.",
      });
  }
}
