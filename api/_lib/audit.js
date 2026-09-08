import { adminDb } from "./firebase-admin.js";

export async function writeAudit({ actor, action, entityType, entityId, summary, details = {}, source = "server" }) {
  try {
    await adminDb.collection("audit_logs").add({
      actorUid: actor?.uid || null,
      actorEmail: actor?.email || actor?.token?.email || "System",
      actorLabel: actor?.email || actor?.token?.email || "System",
      action,
      entityType,
      entityId: entityId || null,
      summary,
      details,
      source,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
