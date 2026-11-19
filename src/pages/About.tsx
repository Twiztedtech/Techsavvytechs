import React from 'react';
import ServicePage from '../components/templates/ServicePage';

const About = () => {
  return (
    <ServicePage 
      title="Our Technical Mission"
      subtitle="Excellence by Design"
      description="Tech Savvy LLC was founded on the principle that technical infrastructure should be invisible yet invincible. We bring enterprise-grade precision to the Fairfield, Sacramento, and Bay Area industrial landscapes."
      features={[

        {

          title: "Zero-Downtime Philosophy",

          detail: "Cutovers and upgrades are planned around your business hours and staged in advance, so the work happens with as little disruption to your team as possible.",

        },

        {

          title: "Standardized Deployments",

          detail: "The same proven methods on every job: consistent labeling, documented configurations and tested results, whether it is one office or a multi-site rollout.",

        },

        {

          title: "Certified Engineering",

          detail: "Cabling is installed and tested to TIA standards and equipment is configured to manufacturer best practices, with test results and documentation handed over at closeout.",

        },

        {

          title: "Bay Area & Sacramento Focus",

          detail: "Based in Fairfield, CA, serving Fairfield, Sacramento and the Bay Area directly, and supporting multi-site rollouts in other states through field technician partnerships.",

        },

        {

          title: "Rapid Response Units",

          detail: "Field technicians for scheduled projects and urgent site visits across Northern California, with clear communication from booking to closeout.",

        },

        {

          title: "Future-Proof Design",

          detail: "Cabling, switching and wireless sized for the next upgrade, not just today, so you are not pulling new cable again in a few years.",

        },

      ]}
      imageSeed="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=1200"
    />
  );
};

export default About;
