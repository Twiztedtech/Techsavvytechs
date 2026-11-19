import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const MSP = () => {
  return (
    <ServicePage 
      title="Managed IT Solutions"
      subtitle="Proactive Ecosystems"
      description="Zero-friction IT management designed to prevent downtime before it occurs. High-impact monitoring, patch management, and immediate response protocols for the Sacramento business region."
      features={[

        {

          title: "Active RMM Agents",

          detail: "Monitoring software on your computers and servers tracks disk health, updates, security status and uptime, and alerts us before small issues turn into outages.",

        },

        {

          title: "Real-time Auditing",

          detail: "Ongoing checks of user accounts, admin rights, security settings and device health, with findings explained in plain language and fixed on a schedule.",

        },

        {

          title: "Automated Patching",

          detail: "Operating system and application updates scheduled outside business hours and tracked to completion, so machines stay current without interrupting work.",

        },

        {

          title: "Cloud System Backup",

          detail: "Automatic off-site backups of servers, workstations and Microsoft 365 or Google Workspace data, checked regularly so you know a restore will work when you need it.",

        },

        {

          title: "Email Security & MFA",

          detail: "Spam and phishing filtering, multi-factor sign-in on every account, and SPF, DKIM and DMARC email authentication so your domain is harder to spoof.",

        },

        {

          title: "Help Desk Pipeline",

          detail: "One place to ask for help by phone or email. Every request is tracked from first report to resolution, so nothing gets lost or forgotten.",

        },

      ]}
      imageSeed="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default MSP;
