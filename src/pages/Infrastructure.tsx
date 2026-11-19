import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const Infrastructure = () => {
  return (
    <ServicePage 
      title="Network Infrastructure"
      subtitle="Operational Resilience"
      description="Modernizing business networks through resilient architecture. We design and deploy high-performance switching environments, optimized wireless topology, and secure gateway solutions."
      features={[

        {

          title: "Multi-Gig Switching",

          detail: "2.5G, 5G and 10G switching where it counts: Wi-Fi 6E/7 access points, servers and uplinks, so the network stops being the bottleneck.",

        },

        {

          title: "WIFI 6E/7 Audits",

          detail: "We survey your space for coverage, interference and capacity, then show you where access points belong and whether moving to Wi-Fi 6E or 7 is worth it.",

        },

        {

          title: "Core Routing Setup",

          detail: "Firewall and router configuration with clean IP addressing, failover between internet connections where available, and SD-WAN for businesses with multiple sites.",

        },

        {

          title: "VPN & Secure Remote",

          detail: "Secure remote access for staff and site-to-site links between offices, with multi-factor sign-in and access limited to what each person needs.",

        },

        {

          title: "Network Topology Maps",

          detail: "Clear documentation of your network: devices, connections, IP addressing and VLANs, so troubleshooting and future changes start from facts, not guesswork.",

        },

        {

          title: "VLAN Segmentation",

          detail: "Separate networks for staff, guests, phones, cameras and payment devices, so a problem or breach in one area cannot spread to the rest.",

        },

      ]}
      imageSeed="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default Infrastructure;
