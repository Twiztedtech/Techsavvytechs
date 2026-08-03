import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const pageMetadata: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'TechSavvy LLC | Low-Voltage, Network Infrastructure & Managed IT',
    description: 'TechSavvy provides low-voltage cabling, network infrastructure, managed IT, and cell signal solutions for Northern California businesses.',
  },
  '/services/low-voltage': {
    title: 'Low-Voltage Cabling & Fiber | TechSavvy LLC',
    description: 'Plan and deliver structured cabling, fiber, rack modernization, and low-voltage systems for business sites.',
  },
  '/services/infrastructure': {
    title: 'Network Infrastructure Services | TechSavvy LLC',
    description: 'Network architecture, switching, wireless, secure connectivity, and infrastructure planning for growing businesses.',
  },
  '/services/msp': {
    title: 'Managed IT Services | TechSavvy LLC',
    description: 'Practical managed IT, monitoring, security, backups, and support for Northern California businesses.',
  },
  '/services/cell-boosting': {
    title: 'Commercial Cell Signal Boosting | TechSavvy LLC',
    description: 'Improve indoor cellular coverage with commercial and residential cell signal boosting solutions.',
  },
  '/contact': {
    title: 'Request a Site Survey or Quote | TechSavvy LLC',
    description: 'Contact TechSavvy to discuss a site survey, cabling project, managed IT support, or network infrastructure need.',
  },
};

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
    document.head.appendChild(element);
  } else {
    element.content = attributes.content;
  }
}

export const Seo = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadata = pageMetadata[pathname] || pageMetadata['/'];
    const url = `${window.location.origin}${pathname}`;
    document.title = metadata.title;
    setMeta('meta[name="description"]', { name: 'description', content: metadata.description });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: metadata.title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: metadata.description });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: url });
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });

    let structuredData = document.getElementById('techsavvy-local-business') as HTMLScriptElement | null;
    if (!structuredData) {
      structuredData = document.createElement('script');
      structuredData.id = 'techsavvy-local-business';
      structuredData.type = 'application/ld+json';
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      name: 'TechSavvy LLC',
      url: window.location.origin,
      telephone: '+1-707-653-6702',
      email: 'support@techsavvytechs.com',
      areaServed: ['Fairfield, CA', 'Sacramento, CA', 'Bay Area, CA'],
      serviceType: ['Low-voltage cabling', 'Network infrastructure', 'Managed IT services', 'Cell signal boosting'],
    });
  }, [pathname]);

  return null;
};
