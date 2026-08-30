import { createHash } from "node:crypto";
import { adminDb } from "./firebase-admin.js";

const supportEmail = () =>
  process.env.OPERATIONS_ALERT_EMAIL ||
  process.env.SUPPORT_EMAIL ||
  process.env.CONTACT_RECIPIENT_EMAIL ||
  "support@techsavvytechs.com";

const structuredLog = (level, message, details = {}) => {
  const payload = { level, message, timestamp: new Date().toISOString(), ...details };
  const output = JSON.stringify(payload);
  if (level === "error") console.error(output);
  else if (level === "warning") console.warn(output);
  else console.log(output);
};

async function shouldSendAlert(fingerprint, minimumIntervalMs = 12 * 60 * 60 * 1000) {
  const ref = adminDb.collection("operational_alert_state").doc(fingerprint);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const lastSentAt = Date.parse(snapshot.data()?.lastSentAt || "");
    if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < minimumIntervalMs) return false;
    transaction.set(ref, { lastSentAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}

async function sendAlertEmail({ subject, summary, details }) {
  if (!process.env.RESEND_API_KEY) return false;
  const sender = process.env.EMAIL_FROM || "TechSavvy Operations <support@techsavvytechs.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "TechSavvy-Operations-Monitor/1.0",
    },
    body: JSON.stringify({
      from: sender,
      reply_to: supportEmail(),
      to: [supportEmail()],
      subject,
      text: `${summary}\n\n${details.map(({ name, status, message }) => `${name}: ${status}${message ? ` — ${message}` : ""}`).join("\n")}\n\nEnvironment: production\nTime: ${new Date().toISOString()}`,
    }),
  });
  if (!response.ok) structuredLog("error", "operations.alert_delivery_failed", { statusCode: response.status, providerMessage: await response.text() });
  return response.ok;
}

export async function runOperationalHealthCheck({ notify = false, persist = false } = {}) {
  const startedAt = Date.now();
  const checks = [];
  try {
    const qbo = await adminDb.collection("settings").doc("quickbooks").get();
    checks.push({ name: "firestore", status: "healthy" });
    const data = qbo.data();
    checks.push({
      name: "quickbooks",
      status: qbo.exists && data?.realmId && data?.refreshToken ? "healthy" : "warning",
      message: qbo.exists && data?.realmId && data?.refreshToken ? "" : "QuickBooks connection needs attention.",
    });
  } catch (error) {
    checks.push({ name: "firestore", status: "critical", message: error.message || "Database connection failed." });
    checks.push({ name: "quickbooks", status: "warning", message: error.message || "QuickBooks status could not be checked." });
  }

  checks.push({
    name: "email",
    status: process.env.RESEND_API_KEY ? "healthy" : "warning",
    message: process.env.RESEND_API_KEY ? "" : "Email delivery is not configured.",
  });
  checks.push({
    name: "firebase-admin",
    status: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "healthy" : "critical",
    message: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "" : "Firebase Admin configuration is incomplete.",
  });

  const status = checks.some((check) => check.status === "critical")
    ? "critical"
    : checks.some((check) => check.status === "warning")
      ? "degraded"
      : "healthy";
  const result = { status, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, checks };
  structuredLog(status === "critical" ? "error" : status === "degraded" ? "warning" : "info", "operations.health_check", result);

  if (persist) await adminDb.collection("operational_health").doc("current").set(result, { merge: true });
  if (notify && status !== "healthy") {
    const fingerprint = createHash("sha256").update(checks.filter((check) => check.status !== "healthy").map((check) => `${check.name}:${check.status}`).sort().join("|")).digest("hex").slice(0, 32);
    if (await shouldSendAlert(fingerprint)) {
      const sent = await sendAlertEmail({ subject: `TechSavvy production ${status} alert`, summary: `The automated production health check reports ${status} status.`, details: checks });
      await adminDb.collection("operational_alerts").add({ ...result, fingerprint, notificationSent: sent, createdAt: new Date().toISOString() });
    }
  }
  return result;
}

export async function reportOperationalError({ route, error, requestId = null, context = {} }) {
  const message = error instanceof Error ? error.message : String(error);
  structuredLog("error", "operations.request_failed", { route, requestId, error: message, ...context });
  const fingerprint = createHash("sha256").update(`${route}:${message}`).digest("hex").slice(0, 32);
  try {
    if (!(await shouldSendAlert(fingerprint, 30 * 60 * 1000))) return;
    const detail = [{ name: route, status: "critical", message }];
    const sent = await sendAlertEmail({ subject: `TechSavvy API failure: ${route}`, summary: "A production API operation failed and requires review.", details: detail });
    await adminDb.collection("operational_alerts").add({ status: "critical", route, message, requestId, context, fingerprint, notificationSent: sent, createdAt: new Date().toISOString() });
  } catch (alertError) {
    structuredLog("error", "operations.error_alert_failed", { route, error: alertError.message || String(alertError) });
  }
}
