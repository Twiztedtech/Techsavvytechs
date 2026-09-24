import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { depositAmount } from "../../../api/_lib/deposit-policy.js";

type DepositJob = { id: string; name?: string; address?: string; workOrderNumber?: string; clientReference?: string; clientProjectManager?: string; vendorName?: string; customerId?: string; customerBillRate?: number };
type DepositCustomer = { id: string; name: string; email?: string; depositHours?: number; rateAgreement?: { standardRate: number; minimumHours: number } };

export type DepositResult = { invoiceId: string; invoiceNumber: string; amount: number; hours: number };

const today = () => new Date().toISOString().slice(0, 10);

async function post(path: string, body: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

// Creates the deposit invoice, syncs it to QuickBooks (which is what produces
// the online pay link), then emails it. Stops at the first failure with a
// message saying where it got to, so a half-finished deposit is never silent.
export async function requestDeposit(job: DepositJob, customer: DepositCustomer): Promise<DepositResult> {
  const { hours, rate, amount } = depositAmount(job, customer);
  if (amount <= 0) throw new Error("Set a customer bill rate on the job (or a signed rate agreement) before requesting a deposit.");
  if (!customer.email) throw new Error("This customer has no email address to send the deposit invoice to.");

  const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  const created = await addDoc(collection(db, "invoices"), {
    invoiceNumber,
    type: "deposit",
    depositCredit: { status: "held" },
    jobId: job.id,
    customerId: job.customerId || customer.id,
    workOrderNumber: job.workOrderNumber || job.id,
    clientReference: job.clientReference || "",
    clientProjectManager: job.clientProjectManager || "",
    customer: customer.name,
    site: job.address || "",
    status: "Open",
    issueDate: today(),
    dueDate: today(),
    lineItems: [{ description: `Deposit: first ${hours} hours (${job.name || job.workOrderNumber || "first job"})`, quantity: hours, unitPrice: rate, kind: "service" }],
    subtotal: amount,
    discount: 0,
    paymentTerms: "Due on receipt",
    customerMessage: "This deposit is due before work begins and will be credited against your final invoice.",
    taxRate: 0,
    tax: 0,
    total: amount,
    amountPaid: 0,
    balance: amount,
    payments: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const where = `Deposit invoice ${invoiceNumber} was created`;
  try {
    await post("/api/admin/quickbooks/status?operation=sync-invoice", { invoiceId: created.id });
  } catch (error) {
    throw new Error(`${where}, but QuickBooks sync failed (${error instanceof Error ? error.message : "unknown error"}). Open it in Invoices, sync it, then send it.`);
  }
  try {
    await post("/api/contact?operation=send-customer-document", { type: "invoice", documentId: created.id, email: customer.email });
  } catch (error) {
    throw new Error(`${where} and synced, but the email failed (${error instanceof Error ? error.message : "unknown error"}). Send it from Invoices.`);
  }
  return { invoiceId: created.id, invoiceNumber, amount, hours };
}
