import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const LowVoltage = () => {
  return (
    <ServicePage 
      title="Low-Voltage Systems"
      subtitle="The Physical Layer"
      description="Certified copper and fiber optic cabling solutions that form the backbone of your data transmission. We specialize in precision rack dressing, rigorous labeling, and TIA/EIA compliant certifications."
      features={["Cat6/6A Certification", "Fiber Optic Splicing", "Rack Modernization", "Data Center Buildouts", "VOIP Infrastructure", "AV Systems Integrations"]}
      imageSeed="https://images.unsplash.com/photo-1620288627223-53302f4e8c74?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default LowVoltage;
