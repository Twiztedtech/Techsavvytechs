import { jsPDF } from "jspdf";
import { INVOICE_LOGO_PNG_BASE64, INVOICE_LOGO_RATIO } from "./invoice-logo.js";

const money = (value = 0) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function invoicePdfFileName(invoice) {
  const base = String(invoice.invoiceNumber || invoice.quoteNumber || "TechSavvy-Invoice").replace(/[^\w.-]+/g, "-");
  return `${base}.pdf`;
}

// Shared by the server (emailed attachment) and the CRM download button, so it
// must not touch Node-only globals (process, Buffer) outside the wrappers below.
// A record with a quoteNumber (and no invoiceNumber) renders as a quote: no balance
// due, the stipulations are printed, and the footer points to the approval link.
export function buildInvoicePdfDocument(invoice, billingEmail = "billing@techsavvytechs.com") {
  const isQuote = Boolean(invoice.quoteNumber) && !invoice.invoiceNumber;
  const docLabel = isQuote ? "QUOTE" : "INVOICE";
  const docNumber = String(invoice.invoiceNumber || invoice.quoteNumber || invoice.id || "");
  const pdf = new jsPDF();
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  // Brand header: black band carrying the full logo, green accent rule, invoice number at right.
  pdf.setFillColor(0, 0, 0);
  pdf.rect(0, 0, 210, 44, "F");
  const logoH = 38;
  try {
    pdf.addImage(`data:image/png;base64,${INVOICE_LOGO_PNG_BASE64}`, "PNG", 10, 3, logoH / INVOICE_LOGO_RATIO, logoH);
  } catch {
    pdf.setTextColor(34, 197, 94);
    pdf.setFontSize(20);
    pdf.text("TECHSAVVY", 16, 24);
  }
  pdf.setFillColor(102, 220, 20);
  pdf.rect(0, 44, 210, 1.6, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(22);
  pdf.text(docLabel, 194, 20, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(120, 230, 40);
  pdf.text(docNumber, 194, 28, { align: "right" });
  pdf.setFontSize(8);
  pdf.setTextColor(200, 205, 201);
  pdf.text("Fairfield, CA  |  (707) 653-6702  |  techsavvytechs.com", 194, 37, { align: "right" });

  pdf.setFontSize(9);
  pdf.setTextColor(90, 100, 94);
  if (isQuote) {
    pdf.text("Valid for 30 days", 155, 63);
  } else {
    pdf.text(`Issue: ${invoice.issueDate || ""}`, 155, 63);
    pdf.text(`Due: ${invoice.dueDate || ""}`, 155, 69);
    if (invoice.serviceDate) pdf.text(`Service: ${invoice.serviceDate}`, 155, 75);
  }

  pdf.setTextColor(20, 25, 22);
  pdf.setFontSize(11);
  pdf.text("BILL TO", 16, 58);
  pdf.setFontSize(10);
  pdf.text(String(invoice.customer || ""), 16, 65);
  pdf.setTextColor(90, 100, 94);
  pdf.text(String(invoice.site || "Address on file"), 16, 71, { maxWidth: 100 });
  const reference = [
    invoice.clientReference ? `PO / project ref: ${invoice.clientReference}` : "",
    invoice.clientProjectManager ? `Project manager: ${invoice.clientProjectManager}` : "",
  ].filter(Boolean);
  reference.forEach((line, index) => pdf.text(line, 16, 81 + index * 6));

  let y = 100;
  const header = () => {
    pdf.setFillColor(15, 20, 16);
    pdf.rect(16, y - 7, 178, 9, "F");
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.text("Description", 19, y);
    pdf.text("Qty", 135, y);
    pdf.text("Rate", 153, y);
    pdf.text("Amount", 174, y);
    y += 10;
  };
  header();

  pdf.setFontSize(10);
  for (const item of lineItems) {
    const lines = pdf.splitTextToSize(String(item.description || ""), 105);
    const rowHeight = Math.max(9, lines.length * 5 + 4);
    if (y + rowHeight > 262) {
      pdf.addPage();
      y = 24;
      header();
    }
    pdf.setTextColor(30, 35, 31);
    pdf.text(lines, 19, y);
    pdf.text(String(item.quantity ?? ""), 137, y);
    pdf.text(money(item.unitPrice), 151, y);
    pdf.text(money(Number(item.quantity || 0) * Number(item.unitPrice || 0)), 174, y);
    y += rowHeight;
  }

  if (y > 232) {
    pdf.addPage();
    y = 24;
  }
  y += 4;
  pdf.setDrawColor(220, 225, 221);
  pdf.line(125, y, 194, y);
  y += 8;
  pdf.setTextColor(30, 35, 31);
  pdf.text("Subtotal", 145, y);
  pdf.text(money(invoice.subtotal ?? invoice.total), 174, y);
  y += 7;
  if (Number(invoice.discount) > 0) {
    pdf.text("Discount", 145, y);
    pdf.text(`-${money(invoice.discount)}`, 174, y);
    y += 7;
  }
  pdf.text(invoice.taxRate ? `Tax (${invoice.taxRate}%)` : "Tax", 145, y);
  pdf.text(money(invoice.tax), 174, y);
  y += 8;
  pdf.setFontSize(12);
  pdf.text("Total", 145, y);
  pdf.text(money(invoice.total), 174, y);
  y += 8;
  pdf.setFillColor(102, 220, 20);
  pdf.rect(125, y - 6, 69, 10, "F");
  pdf.setTextColor(0, 0, 0);
  pdf.text(isQuote ? "Quote Total" : "Balance Due", 128, y + 1);
  pdf.text(money(isQuote ? invoice.total : (invoice.balance ?? invoice.total)), 191, y + 1, { align: "right" });

  if (invoice.customerMessage) {
    y += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(60, 70, 63);
    pdf.text(pdf.splitTextToSize(String(invoice.customerMessage), 178), 16, y);
  }

  const stipulations = isQuote && Array.isArray(invoice.stipulations) ? invoice.stipulations.filter(Boolean) : [];
  if (stipulations.length) {
    y += 14;
    if (y > 240) {
      pdf.addPage();
      y = 24;
    }
    pdf.setFillColor(102, 220, 20);
    pdf.rect(16, y - 5, 1.6, 7, "F");
    pdf.setFontSize(10);
    pdf.setTextColor(20, 25, 22);
    pdf.text("STIPULATIONS & TERMS", 20, y);
    y += 8;
    pdf.setFontSize(9);
    pdf.setTextColor(60, 70, 63);
    stipulations.forEach((line, index) => {
      const wrapped = pdf.splitTextToSize(String(line), 168);
      const height = wrapped.length * 4.5 + 3;
      if (y + height > 272) {
        pdf.addPage();
        y = 24;
      }
      pdf.text(`${index + 1}.`, 18, y);
      pdf.text(wrapped, 26, y);
      y += height;
    });
  }

  pdf.setFontSize(8);
  pdf.setTextColor(100, 110, 103);
  pdf.text(
    isQuote
      ? `Thank you for the opportunity to earn your business. To approve this quote, use the secure link in your email. Questions? ${billingEmail}`
      : `Thank you for choosing TechSavvy. Payment is due by ${invoice.dueDate || "the due date shown above"}. Questions? ${billingEmail}`,
    16,
    284,
    { maxWidth: 178 },
  );

  return pdf;
}

export function buildInvoicePdf(invoice) {
  const billingEmail = process.env.BILLING_EMAIL || "billing@techsavvytechs.com";
  return Buffer.from(buildInvoicePdfDocument(invoice, billingEmail).output("arraybuffer"));
}
