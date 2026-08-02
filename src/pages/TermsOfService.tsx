import React from 'react';

export default function TermsOfService() {
  return (
    <div className="py-20 px-4 max-w-4xl mx-auto space-y-8 relative z-10">
      <div className="border-l-4 border-safety-orange pl-4 space-y-2">
        <h1 className="text-3xl font-black text-white tracking-tight">END-USER LICENSE AGREEMENT</h1>
        <p className="text-xs text-slate-400 font-mono">Last Updated: August 2, 2026</p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 text-sm text-slate-300 leading-relaxed font-sans">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">01.</span> Agreement to Terms
          </h2>
          <p>
            This End-User License Agreement ("EULA" or "Terms of Service") constitutes a binding legal agreement between TechSavvy LLC ("Company", "we", "our", "us") and you, whether personally or on behalf of an entity ("you" or "User"), concerning your access to and use of the Contractor Portal and its QuickBooks Online integration features.
          </p>
          <p>
            By logging into the portal, submitting time cards, or linking your QuickBooks account, you acknowledge that you have read, understood, and agreed to be bound by all of these terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">02.</span> Use License & Restrictions
          </h2>
          <p>
            We grant you a limited, non-exclusive, non-transferable, revocable license to access the portal solely for submitting shift log timesheets, travel expenses, and billing information. You agree not to:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li>Submit fraudulent or inflated labor logs, supply expenses, or travel claims.</li>
            <li>Attempt to bypass Firestore security constraints or reverse engineer the portal's client bundle.</li>
            <li>Use the QuickBooks integration API calls for any unauthorized financial transactions or data extraction.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">03.</span> QuickBooks Online Integration
          </h2>
          <p>
            The Contractor Portal offers integration with QuickBooks Online to automate 1099 payroll bills. By authorizing the QuickBooks connection, you grant us permission to query Vendor details and upload itemized vendor bills to your QuickBooks profile. You are solely responsible for verifying the accuracy of all submitted data before sending invoices to QuickBooks.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">04.</span> Limitation of Liability
          </h2>
          <p>
            TechSavvy LLC, its directors, and agents shall not be liable for any direct, indirect, incidental, or consequential damages resulting from your use of the portal, QuickBooks sync interruptions, database downtime, or any errors in financial ledgers resulting from contractor-submitted data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">05.</span> Modifications & Governing Law
          </h2>
          <p>
            We reserve the right to revise or modify this EULA at any time. Changes take effect immediately upon publication. These terms are governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law principles.
          </p>
        </section>
      </div>
    </div>
  );
}
