import { useEffect, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck, XCircle } from "lucide-react";

type CustomerDocumentData = {
  id: string;
  number: string;
  customer: string;
  site: string;
  title: string;
  status: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  issueDate: string;
  dueDate: string;
  customerMessage: string;
};

export default function CustomerDocument() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const [data, setData] = useState<{
    type: "quote" | "invoice";
    document: CustomerDocumentData;
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState("");
  useEffect(() => {
    if (!token) {
      setError("This secure document link is incomplete.");
      return;
    }
    fetch(
      `/api/contact?operation=customer-document&token=${encodeURIComponent(token)}`,
    )
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.error || "The document could not be loaded.");
        setData(value);
      })
      .catch((reason) => setError(reason.message));
  }, [token]);
  const respond = async (value: "Accepted" | "Rejected") => {
    setPending(true);
    try {
      const response = await fetch("/api/contact?operation=quote-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision: value }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Your response could not be saved.");
      setDecision(value);
      setData((current) =>
        current
          ? { ...current, document: { ...current.document, status: value } }
          : current,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your response could not be saved.",
      );
    } finally {
      setPending(false);
    }
  };
  const money = (value = 0) =>
    value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  if (error)
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b0f0c] p-5">
        <div className="max-w-md rounded border border-red-500/20 bg-[#151916] p-8 text-center text-white">
          <XCircle className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-4 font-display text-xl uppercase">
            Document unavailable
          </h1>
          <p className="mt-3 text-sm text-slate-400">{error}</p>
          <a
            href="mailto:support@techsavvytechs.com"
            className="mt-5 inline-block text-xs font-bold text-tech-green"
          >
            Contact TechSavvy support
          </a>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b0f0c] text-sm text-slate-400">
        Verifying secure document…
      </div>
    );
  const { document, type } = data;
  const finalStatus = decision || document.status;
  return (
    <div className="min-h-screen bg-[#eef2ef] px-4 py-10 text-slate-900">
      <main className="mx-auto max-w-3xl overflow-hidden rounded border border-slate-200 bg-white shadow-xl">
        <header className="flex flex-col justify-between gap-5 bg-[#0b0f0c] p-7 text-white sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-xl uppercase text-tech-green">
              TechSavvy
            </p>
            <p className="text-[9px] uppercase tracking-[.24em] text-slate-400">
              Field Services
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">
              {type}
            </p>
            <p className="mt-1 font-mono text-sm">{document.number}</p>
          </div>
        </header>
        <section className="p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Prepared for
              </p>
              <h1 className="mt-2 text-lg font-bold">{document.customer}</h1>
              <p className="mt-1 text-xs text-slate-500">{document.site}</p>
              <p className="mt-2 text-sm">{document.title}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[9px] font-bold uppercase text-slate-400">
                Status
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-bold ${finalStatus === "Accepted" || finalStatus === "Paid" ? "bg-green-100 text-green-800" : finalStatus === "Rejected" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}
              >
                {finalStatus}
              </span>
              {document.issueDate && (
                <p className="mt-3 text-[10px] text-slate-500">
                  Issued {document.issueDate}
                  <br />
                  Due {document.dueDate}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead className="bg-slate-50 text-[9px] uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Product or service</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {document.lineItems.map((item, index) => (
                  <tr key={`${item.description}-${index}`}>
                    <td className="px-3 py-3 text-xs">{item.description}</td>
                    <td className="px-3 py-3 text-right text-xs">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-3 text-right text-xs">
                      {money(item.unitPrice)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-semibold">
                      {money(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-6 max-w-xs space-y-2 border-t border-slate-200 pt-4 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <b>{money(document.subtotal)}</b>
            </div>
            {document.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Discount</span>
                <b>-{money(document.discount)}</b>
              </div>
            )}
            {document.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Tax</span>
                <b>{money(document.tax)}</b>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-lg">
              <span>Total</span>
              <b>{money(document.total)}</b>
            </div>
            {type === "invoice" && (
              <div className="flex justify-between text-tech-green-deep">
                <span>Balance due</span>
                <b>{money(document.balance)}</b>
              </div>
            )}
          </div>
          {document.customerMessage && (
            <p className="mt-6 rounded bg-slate-50 p-4 text-xs text-slate-600">
              {document.customerMessage}
            </p>
          )}
          {type === "quote" && (
            <div className="mt-7 border-t border-slate-200 pt-6">
              {["Accepted", "Rejected"].includes(finalStatus) ? (
                <div className="flex items-center gap-3 rounded bg-green-50 p-4 text-sm text-green-800">
                  <CheckCircle2 className="h-5 w-5" /> Your response has been
                  recorded: <b>{finalStatus}</b>.
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-xs text-slate-500">
                    Please approve the proposed work or let us know it should
                    not proceed.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      disabled={pending}
                      onClick={() => void respond("Accepted")}
                      className="flex flex-1 items-center justify-center gap-2 rounded bg-tech-green px-5 py-3 text-xs font-bold text-brand-black disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve quote
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => void respond("Rejected")}
                      className="flex flex-1 items-center justify-center gap-2 rounded border border-slate-300 px-5 py-3 text-xs font-bold text-slate-600 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Decline
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <footer className="mt-8 flex items-center gap-2 border-t border-slate-100 pt-5 text-[10px] text-slate-400">
            <ShieldCheck className="h-4 w-4 text-tech-green-deep" /> Secure
            document provided by TechSavvy · Questions?
            support@techsavvytechs.com
          </footer>
        </section>
      </main>
    </div>
  );
}
