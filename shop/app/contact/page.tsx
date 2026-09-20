import { Inquiry } from '@/components/inquiry';
import { settings } from '@/lib/catalog';
export const metadata={title:'Contact',alternates:{canonical:'/contact'}};
export default function Contact(){return <section className="shell section contact-grid"><div className="page-intro"><span className="eyebrow">REAL PEOPLE. REAL CONVERSATIONS.</span><h1>LET’S <span className="green">TALK.</span></h1><p>Collection questions, collaboration ideas, or just a hello.</p><a className="contact-email" href={`mailto:${settings.email}`}>{settings.email}</a><p className="small muted">For technology services, visit<br/><a href={settings.companyUrl}>techsavvytechs.com ↗</a></p></div><Inquiry/></section>;}
