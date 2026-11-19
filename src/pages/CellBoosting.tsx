import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const CellBoosting = () => {
  return (
    <ServicePage 
      title="Cell Signal Boosting"
      subtitle="Total Coverage"
      description="Solving cellular dead zones in commercial and residential structures. We deploy high-gain antenna systems and bi-directional amplifiers to ensure consistent 5G connectivity everywhere."
      features={[
        {
          title: "Industrial DAS",
          detail: "Passive distributed antenna systems for warehouses, multi-floor offices and campuses. A planned coax network feeds antennas throughout the building, so coverage reaches every floor instead of just the area near the amplifier.",
        },
        {
          title: "Bi-Directional Amps",
          detail: "FCC-certified amplifiers that capture the outside signal, boost it indoors, and carry your phones' signal back to the tower. Sized to your square footage and construction, not a one-size retail kit.",
        },
        {
          title: "Signal Source Mapping",
          detail: "Before anything is installed, we measure each carrier's signal outside your building (RSRP, RSRQ and SINR) to find the strongest tower direction and the best spot for the rooftop donor antenna.",
        },
        {
          title: "Floor Plan Heatmaps",
          detail: "Room-by-room readings plotted on your floor plan before and after installation, so you can see exactly where the dead zones were and confirm they are gone.",
        },
        {
          title: "Carrier Coordination",
          detail: "We handle booster registration and carrier requirements, and keep the system within FCC rules so it never interferes with the carrier network or puts your service at risk.",
        },
        {
          title: "Multi-band Passthrough",
          detail: "One system covers AT&T, Verizon and T-Mobile at the same time, for calls, texts and LTE/5G data on the bands the equipment supports. No app, no new phones and no plan changes for your team.",
        },
      ]}
      imageSeed="https://images.unsplash.com/photo-1563207153-f403bf289096?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default CellBoosting;
