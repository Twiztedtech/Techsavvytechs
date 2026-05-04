import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const CellBoosting = () => {
  return (
    <ServicePage 
      title="Cell Signal Boosting"
      subtitle="Total Coverage"
      description="Solving cellular dead zones in commercial and residential structures. We deploy high-gain antenna systems and bi-directional amplifiers to ensure consistent 5G connectivity everywhere."
      features={["Industrial DAS", "Bi-Directional Amps", "Signal Source Mapping", "Floor Plan Heatmaps", "Carrier Coordination", "Multi-band Passthrough"]}
      imageSeed="cell1"
    />
  );
};

export default CellBoosting;
