import { jsPDF } from "jspdf";

const money = (value = 0) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function invoicePdfFileName(invoice) {
  const base = String(invoice.invoiceNumber || "TechSavvy-Invoice").replace(/[^\w.-]+/g, "-");
  return `${base}.pdf`;
}

export function buildInvoicePdf(invoice) {
  const pdf = new jsPDF();
  const billingEmail = process.env.BILLING_EMAIL || "billing@techsavvytechs.com";
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  pdf.setFillColor(11, 15, 12);
  pdf.rect(0, 0, 210, 32, "F");
  pdf.setTextColor(34, 197, 94);
  pdf.setFontSize(18);
  pdf.text("TECHSAVVY", 16, 18);
  pdf.setFontSize(9);
  pdf.setTextColor(220, 225, 221);
  pdf.text("FIELD SERVICES INVOICE", 16, 25);

  pdf.setTextColor(20, 25, 22);
  pdf.setFontSize(18);
  pdf.text("INVOICE", 155, 52);
  pdf.setFontSize(10);
  pdf.text(String(invoice.invoiceNumber || invoice.id || ""), 155, 60);
  pdf.setFontSize(9);
  pdf.setTextColor(90, 100, 94);
  pdf.text(`Issue: ${invoice.issueDate || ""}`, 155, 67);
  pdf.text(`Due: ${invoice.dueDate || ""}`, 155, 73);
  if (invoice.serviceDate) pdf.text(`Service: ${invoice.serviceDate}`, 155, 79);

  pdf.setTextColor(20, 25, 22);
  pdf.setFontSize(11);
  pdf.text("Bill To", 16, 48);
  pdf.setFontSize(10);
  pdf.text(String(invoice.customer || ""), 16, 57);
  pdf.setTextColor(90, 100, 94);
  pdf.text(String(invoice.site || "Address on file"), 16, 64, { maxWidth: 100 });
  const reference = [
    invoice.clientReference ? `PO / project ref: ${invoice.clientReference}` : "",
    invoice.clientProjectManager ? `Project manager: ${invoice.clientProjectManager}` : "",
  ].filter(Boolean);
  reference.forEach((line, index) => pdf.text(line, 16, 74 + index * 6));

  let y = 92;
  const header = () => {
    pdf.setFillColor(235, 240, 236);
    pdf.rect(16, y - 7, 178, 9, "F");
    pdf.setFontSize(10);
    pdf.setTextColor(40, 50, 43);
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
  pdf.setTextColor(21, 128, 61);
  pdf.text("Balance Due", 135, y);
  pdf.text(money(invoice.balance ?? invoice.total), 174, y);

  if (invoice.customerMessage) {
    y += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(60, 70, 63);
    pdf.text(pdf.splitTextToSize(String(invoice.customerMessage), 178), 16, y);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(100, 110, 103);
  pdf.text(
    `Thank you for choosing TechSavvy. Payment is due by ${invoice.dueDate || "the due date shown above"}. Questions? ${billingEmail}`,
    16,
    284,
    { maxWidth: 178 },
  );

  return Buffer.from(pdf.output("arraybuffer"));
}
