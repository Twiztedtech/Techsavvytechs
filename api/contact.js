import { adminDb } from "./_lib/firebase-admin.js";
import { createHash, randomBytes } from "node:crypto";
import { requireAdmin } from "./_lib/firebase-admin.js";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const recentSubmissions = new Map();
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

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

async function sendCustomerDocument(req, res) {
  await requireAdmin(req);
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
  const action = type === "quote" ? "Review and approve quote" : "View invoice";
  const sender =
    process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
  const supportEmail =
    process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "TechSavvy-CRM/1.0",
    },
    body: JSON.stringify({
      from: sender,
      reply_to: supportEmail,
      to: [email],
      subject:
        type === "quote"
          ? `TechSavvy quote ${number} — approval requested`
          : `TechSavvy invoice ${number}`,
      text: `Hello,\n\n${type === "quote" ? "Please review the proposed work" : "Your invoice is ready"} from TechSavvy.\n${number} · ${total}\n\n${action}: ${link}\n\nThis secure link expires ${expiresAt.slice(0, 10)}. Questions? Reply to this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">FIELD SERVICES</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>${type === "quote" ? "A quote is ready for your review and approval." : "Your invoice is ready to view."}</p><p><strong>${escapeHtml(number)}</strong><br><span style="font-size:26px">${escapeHtml(total)}</span></p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#22c55e;color:#071009;padding:13px 20px;border-radius:5px;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:12px;color:#64748b">This secure link expires ${escapeHtml(expiresAt.slice(0, 10))}. If you have questions, reply to this email.</p></div></div>`,
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
  return res.status(200).json({ success: true, email, expiresAt });
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
  const email = String(customer.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(422).json({ error: "The customer needs a valid email address." });
  if (!process.env.RESEND_API_KEY)
    return res.status(503).json({ error: "Customer email delivery is not configured." });

  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
  await adminDb.collection("customer_portal_tokens").doc(hash).set({
    customerId,
    customerName: customer.name,
    email,
    createdAt,
    expiresAt,
    createdByUid: user.uid,
  });
  const appUrl = (process.env.APP_URL || "https://techsavvytechs.com").replace(/\/$/, "");
  const link = `${appUrl}/customer/portal?token=${encodeURIComponent(rawToken)}`;
  const sender = process.env.EMAIL_FROM || "TechSavvy <support@techsavvytechs.com>";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@techsavvytechs.com";
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "TechSavvy-CRM/1.0" },
    body: JSON.stringify({
      from: sender,
      reply_to: supportEmail,
      to: [email],
      subject: "Your TechSavvy customer portal",
      text: `Hello ${customer.contact || customer.name},\n\nUse your secure TechSavvy customer portal to view jobs, quotes, invoices, equipment, maintenance, and online payment options.\n\nOpen portal: ${link}\n\nThis access link expires ${expiresAt.slice(0, 10)}.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17201a;line-height:1.55"><div style="background:#0b0f0c;padding:22px;color:#fff"><strong style="color:#22c55e;font-size:22px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">CUSTOMER PORTAL</div></div><div style="padding:28px;border:1px solid #e2e8f0"><p>Hello ${escapeHtml(customer.contact || customer.name)},</p><p>Your secure customer portal is ready. View jobs, quotes, invoices, equipment and maintenance in one place.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#22c55e;color:#071009;padding:13px 20px;border-radius:5px;text-decoration:none;font-weight:700">Open customer portal</a></p><p style="font-size:12px;color:#64748b">This access link expires ${escapeHtml(expiresAt.slice(0, 10))}. Questions? Reply to this email.</p></div></div>`,
    }),
  });
  if (!delivery.ok) {
    await adminDb.collection("customer_portal_tokens").doc(hash).delete();
    throw new Error("Portal email delivery failed: " + (await delivery.text()));
  }
  const deliveryData = await delivery.json();
  await customerRef.set({
    portalDelivery: { status: "sent", email, emailId: deliveryData.id, sentAt: createdAt, expiresAt, tokenHash: hash },
    updatedAt: createdAt,
  }, { merge: true });
  return res.status(200).json({ success: true, email, expiresAt });
}

async function getPortalAccess(rawToken) {
  const hash = rawToken ? tokenHash(rawToken) : "";
  const tokenSnapshot = hash ? await adminDb.collection("customer_portal_tokens").doc(hash).get() : null;
  const access = tokenSnapshot?.data();
  if (!tokenSnapshot?.exists || !access || access.expiresAt < new Date().toISOString())
    throw Object.assign(new Error("This customer portal link is invalid or has expired."), { statusCode: 410 });
  const customerSnapshot = await adminDb.collection("customers").doc(access.customerId).get();
  if (!customerSnapshot.exists || customerSnapshot.data()?.portalDelivery?.tokenHash !== hash)
    throw Object.assign(new Error("A newer customer portal link has replaced this one."), { statusCode: 410 });
  return { access, customerSnapshot };
}

async function loadCustomerPortal(req, res) {
  const rawToken = typeof req.query?.token === "string" ? req.query.token : "";
  const { access, customerSnapshot } = await getPortalAccess(rawToken);
  const customer = customerSnapshot.data();
  const [jobsSnapshot, quotesSnapshot, invoicesSnapshot, assetsSnapshot] = await Promise.all([
    adminDb.collection("jobs").where("vendorName", "==", customer.name).get(),
    adminDb.collection("quotes").where("customer", "==", customer.name).get(),
    adminDb.collection("invoices").where("customer", "==", customer.name).get(),
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
    return { id: doc.id, number: value.invoiceNumber || doc.id, status: value.status || "Open", issueDate: value.issueDate || "", dueDate: value.dueDate || "", total: Number(value.total || 0), balance: Number(value.balance ?? value.total ?? 0), paymentLink: value.qboSync?.invoiceLink || null, onlinePaymentEnabled: Boolean(value.qboSync?.invoiceLink) };
  });
  const assets = assetsSnapshot.docs.map((doc) => {
    const value = doc.data();
    return { id: doc.id, name: value.name || "Customer asset", site: value.site || "", category: value.category || "Equipment", manufacturer: value.manufacturer || "", model: value.model || "", serialNumber: value.serialNumber || "", status: value.status || "Active", nextServiceDate: value.maintenance?.enabled ? value.maintenance?.nextServiceDate || "" : "" };
  });
  return res.status(200).json({
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
  const subject = String(req.body?.subject || "").trim().slice(0, 120);
  const message = String(req.body?.message || "").trim().slice(0, 3000);
  const site = String(req.body?.site || "").trim().slice(0, 250);
  const preferredDate = String(req.body?.preferredDate || "").trim().slice(0, 20);
  if (!subject || !message)
    return res.status(400).json({ error: "Please add a subject and service details." });
  const createdAt = new Date().toISOString();
  const request = await adminDb.collection("contacts").add({
    type: "customer-portal-service-request",
    name: customerSnapshot.data()?.name,
    customerId: customerSnapshot.id,
    email: access.email,
    subject,
    message,
    site,
    preferredDate,
    status: "New",
    createdAt,
    deliveryStatus: "portal",
  });
  return res.status(201).json({ success: true, requestId: request.id });
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
        customerMessage: value.customerMessage || "",
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
  return res.status(200).json({ success: true, status: decision });
}

export default async function handler(req, res) {
  if (req.query?.operation === "send-customer-portal" && req.method === "POST") {
    try { return await sendCustomerPortal(req, res); }
    catch (error) {
      if (error.message === "Authentication required." || error.message === "Administrator access required.") return res.status(403).json({ error: error.message });
      console.error("Customer portal delivery failed:", error);
      return res.status(error.statusCode || 500).json({ error: error.message || "Customer portal delivery failed." });
    }
  }
  if (req.query?.operation === "customer-portal" && req.method === "GET") {
    try { return await loadCustomerPortal(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || "The customer portal could not be loaded." }); }
  }
  if (req.query?.operation === "portal-service-request" && req.method === "POST") {
    try { return await createPortalServiceRequest(req, res); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message || "The service request could not be sent." }); }
  }
  if (req.query?.operation === "send-customer-document") {
    try {
      return await sendCustomerDocument(req, res);
    } catch (error) {
      if (
        error.message === "Authentication required." ||
        error.message === "Administrator access required."
      )
        return res.status(403).json({ error: error.message });
      console.error("Customer document delivery failed:", error);
      return res
        .status(error.statusCode || 500)
        .json({ error: error.message || "Customer document delivery failed." });
    }
  }
  if (req.query?.operation === "customer-document" && req.method === "GET") {
    try {
      return await loadCustomerDocument(req, res);
    } catch (error) {
      return res
        .status(error.statusCode || 500)
        .json({ error: error.message || "The document could not be loaded." });
    }
  }
  if (req.query?.operation === "quote-decision" && req.method === "POST") {
    try {
      return await respondToQuote(req, res);
    } catch (error) {
      return res
        .status(error.statusCode || 500)
        .json({
          error: error.message || "The quote decision could not be saved.",
        });
    }
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
