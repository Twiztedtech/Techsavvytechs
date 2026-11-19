import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const LowVoltage = () => {
  return (
    <ServicePage 
      title="Low-Voltage Systems"
      subtitle="The Physical Layer"
      description="Certified copper and fiber optic cabling solutions that form the backbone of your data transmission. We specialize in precision rack dressing, rigorous labeling, and TIA/EIA compliant certifications."
      features={[

        {

          title: "Cat6/6A Certification",

          detail: "Every run is tested end to end with a cable certifier against TIA category limits, and you get the pass/fail report for each drop, so problems are caught before the walls close.",

        },

        {

          title: "Fiber Optic Splicing",

          detail: "Fiber backbones between floors, network closets and buildings, spliced and terminated, then tested for light loss so every strand performs as designed.",

        },

        {

          title: "Rack Modernization",

          detail: "We rebuild cluttered racks with new patch panels, cable management and correct-length patch cords, with every port labeled to match the documentation.",

        },

        {

          title: "Data Center Buildouts",

          detail: "Server rooms and network closets planned from the ground up: rack layout, ladder rack and cable pathways, grounding and power, and room left to grow.",

        },

        {

          title: "VOIP Infrastructure",

          detail: "Cabling, PoE switching and network setup for VoIP phone systems, with voice traffic prioritized so calls stay clear when the network is busy.",

        },

        {

          title: "AV Systems Integrations",

          detail: "Low-voltage runs for conference room displays, video conferencing, speakers and digital signage, routed and terminated cleanly so the room works on day one.",

        },

      ]}
      imageSeed="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default LowVoltage;
