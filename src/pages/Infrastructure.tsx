import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const Infrastructure = () => {
  return (
    <ServicePage 
      title="Network Infrastructure"
      subtitle="Operational Resilience"
      description="Modernizing business networks through resilient architecture. We design and deploy high-performance switching environments, optimized wireless topology, and secure gateway solutions."
      features={["Multi-Gig Switching", "WIFI 6E/7 Audits", "Core Routing Setup", "VPN & Secure Remote", "Network Topology Maps", "VLAN Segmentation"]}
      imageSeed="net1"
    />
  );
};

export default Infrastructure;
