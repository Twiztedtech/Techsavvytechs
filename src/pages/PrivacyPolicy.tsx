import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="py-20 px-4 max-w-4xl mx-auto space-y-8 relative z-10">
      <div className="border-l-4 border-safety-orange pl-4 space-y-2">
        <h1 className="text-3xl font-black text-white tracking-tight">PRIVACY POLICY</h1>
        <p className="text-xs text-slate-400 font-mono">Last Updated: October 5, 2026</p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 text-sm text-slate-300 leading-relaxed font-sans">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">01.</span> Introduction
          </h2>
          <p>
            Welcome to TechSavvy LLC ("Company", "we", "our", "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy governs our data collection, processing, and usage practices when you visit our website, use the client or contractor portals or our mobile app, receive transactional notifications, or integrate with QuickBooks Online. Our Android app is published on Google Play under the developer name "TechSavvy Dojo" and is operated by TechSavvy LLC.
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
            <li><strong>Location Data:</strong> In the technician app and portal, your device's precise GPS location, collected only while you are using the app and only at the moment you clock in, clock out, or ask for directions to a job site. It is used to verify on-site work and to start navigation. We do not track your location in the background.</li>
            <li><strong>Photos & Signatures:</strong> Job-completion and site-survey photos you take or choose from your device, your profile photo, and signatures you draw or collect on work orders. The app asks for camera access only when you add a photo.</li>
            <li><strong>Account & Device Information:</strong> Your sign-in details (email, or your Google account if you choose Google sign-in) and basic technical information such as IP address and app or browser version, kept in security and error logs.</li>
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
          <p>When you opt in, TechSavvy LLC uses your mobile number to send account verification and recurring transactional messages about requested or active work, including scheduling, technician arrival, progress, and completion updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not a condition of purchase. Opting out of SMS does not prevent essential notices from being sent by email.</p>
          <p>We do not sell, rent, or share mobile numbers, SMS opt-in data, or messaging consent with third parties or affiliates for marketing or promotional purposes. We share information with service providers only as necessary to deliver the requested operational messages and administer the service.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">04.</span> Data Security & Retention
          </h2>
          <p>
            We implement robust administrative, technical, and physical security measures, including Firebase security rules and TLS network encryption, to protect your personal details from unauthorized access or alteration. We retain your information only as long as necessary for administrative and compliance operations.
          </p>
          <p>
            We share information only with service providers that run the service on our behalf (Google Firebase and Google Cloud for sign-in, database and file storage; Vercel for hosting; Resend and Twilio for email and SMS; QuickBooks Online for payment records; Google Maps for maps and directions) and where the law requires it. We do not sell personal information, and we do not use location or photos for advertising.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">06.</span> Deleting Your Account
          </h2>
          <p>
            Technicians can delete their account at any time in the TechSavvy app (My Profile, then Delete my account) or on the website. Anyone else can request deletion at <a href="/delete-account" className="text-safety-orange underline">techsavvytechs.com/delete-account</a> or by email, and we complete it within 30 days.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li><strong>Deleted:</strong> your login, name, email, phone number, photo, saved signature, skills and certifications, notification settings, and the GPS location stamps saved with clock-ins and clock-outs.</li>
            <li><strong>Kept as required by law:</strong> pay history and your W-9, for tax and 1099 reporting, for 4 years and then removed; and completed work records that customers already received (such as signed work orders and invoices), which can still show your name.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-safety-orange">07.</span> Contact Us
          </h2>
          <p>
            If you have questions or concerns regarding this policy, please reach out to our privacy compliance officer at:
          </p>
          <p className="font-mono text-xs text-safety-orange bg-slate-950 p-3 rounded border border-slate-800 w-max">
            Email: privacy@techsavvytechs.com<br />
            Address: Sacramento Regional Cluster, CA
          </p>
        </section>
      </div>
    </div>
  );
}
