import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const About = () => {
  return (
    <ServicePage 
      title="Our Technical Mission"
      subtitle="Excellence by Design"
      description="Tech Savvy LLC was founded on the principle that technical infrastructure should be invisible yet invincible. We bring enterprise-grade precision to the Fairfield, Sacramento, and Bay Area industrial landscapes."
      features={["Zero-Downtime Philosophy", "Standardized Deployments", "Certified Engineering", "Bay Area & Sacramento Focus", "Rapid Response Units", "Future-Proof Design"]}
      imageSeed="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default About;
