import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="py-20 px-4 max-w-4xl mx-auto space-y-8 relative z-10">
      <div className="border-l-4 border-safety-orange pl-4 space-y-2">
        <h1 className="text-3xl font-black text-white tracking-tight">PRIVACY POLICY</h1>
        <p className="text-xs text-slate-400 font-mono">Last Updated: August 25, 2026</p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 text-sm text-slate-300 leading-relaxed font-sans">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">01.</span> Introduction
          </h2>
          <p>
            Welcome to TechSavvy LLC ("Company", "we", "our", "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy governs our data collection, processing, and usage practices when you visit our website, use the client or contractor portals, receive transactional notifications, or integrate with QuickBooks Online.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">02.</span> Information We Collect
          </h2>
          <p>
            We collect personal information that you voluntarily provide to us when registering for the Contractor Portal, entering time logs, submitting expense claims, or initiating contact. This includes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li><strong>Personal Identifiers:</strong> Full name, business email address, physical address, and contact information.</li>
            <li><strong>Employment & Financial Info:</strong> Hourly labor rates, job site details, mileage, travel expense logs, and receipts.</li>
            <li><strong>QuickBooks Integration Data:</strong> If authorized, we retrieve Vendor IDs and sync itemized Vendor Bills to align accounts.</li>
            <li><strong>Client Booking Data:</strong> Company membership, job sites, requested schedules, scopes of work, documents, messages, status updates, and closeout records.</li>
            <li><strong>Communications Data:</strong> Transactional email and SMS consent, delivery status, replies, and notification preferences.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">03.</span> How We Use Your Information
          </h2>
          <p>
            We utilize the collected information strictly for operational and accounting workflows:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li>Facilitating daily shift logging, clock-in tracking, and field validation.</li>
            <li>Transmitting approved contractor invoices and vendor bills directly into your QuickBooks Online database.</li>
            <li>Notifying contractors of site instruction updates or manager revisions in real-time.</li>
            <li>Coordinating client requests, technician assignments, appointment reminders, progress updates, rescheduling, and job closeout.</li>
            <li>Complying with legal, tax (1099 reporting), and regulatory requirements.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><span className="text-safety-orange">05.</span> Transactional Messages</h2>
          <p>When you opt in, we use your mobile number to send account verification and operational messages about requested or active work. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Opting out of SMS does not prevent essential notices from being sent by email.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">04.</span> Data Security & Retention
          </h2>
          <p>
            We implement robust administrative, technical, and physical security measures, including Firebase security rules and TLS network encryption, to protect your personal details from unauthorized access or alteration. We retain your information only as long as necessary for administrative and compliance operations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">06.</span> Contact Us
          </h2>
          <p>
            If you have questions or concerns regarding this policy, please reach out to our privacy compliance officer at:
          </p>
          <p className="font-mono text-xs text-safety-orange bg-slate-950 p-3 rounded border border-slate-800 w-max">
            Email: privacy@tech5avvy.com<br />
            Address: Sacramento Regional Cluster, CA
          </p>
        </section>
      </div>
    </div>
  );
}
