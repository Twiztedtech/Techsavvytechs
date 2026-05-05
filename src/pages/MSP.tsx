import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const MSP = () => {
  return (
    <ServicePage 
      title="Managed IT Solutions"
      subtitle="Proactive Ecosystems"
      description="Zero-friction IT management designed to prevent downtime before it occurs. High-impact monitoring, patch management, and immediate response protocols for the Sacramento business region."
      features={["Active RMM Agents", "Real-time Auditing", "Automated Patching", "Cloud System Backup", "Email Security & MFA", "Help Desk Pipeline"]}
      imageSeed="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default MSP;
