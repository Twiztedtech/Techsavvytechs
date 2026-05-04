import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const About = () => {
  return (
    <ServicePage 
      title="Our Technical Mission"
      subtitle="Excellence by Design"
      description="Tech Savvy LLC was founded on the principle that technical infrastructure should be invisible yet invincible. We bring enterprise-grade precision to the Fairfield, Sacramento, and Bay Area industrial landscapes."
      features={["Zero-Downtime Philosophy", "Standardized Deployments", "Certified Engineering", "Bay Area & Sacramento Focus", "Rapid Response Units", "Future-Proof Design"]}
      imageSeed="mission1"
    />
  );
};

export default About;
