import type { Metadata } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import { StoreProvider, Header, Footer } from '@/components/store';
import { settings } from '@/lib/catalog';
import './globals.css';
const inter=Inter({subsets:['latin'],variable:'--font-body'});
const display=Barlow_Condensed({subsets:['latin'],weight:['500','600','700','800'],variable:'--font-display'});
export const metadata: Metadata = {
  metadataBase:new URL(settings.url), title:{default:'TechSavvy Gear — Wired for What’s Next.',template:'%s | TechSavvy Gear'},
  description:'Original apparel from TechSavvy. For the builders, troubleshooters, and people who keep technology working. Explore the first collection and partner with us.',
  icons:{icon:'/brand/ts-monogram.png'},openGraph:{type:'website',siteName:'TechSavvy Gear',title:'TechSavvy Gear — Wired for What’s Next.',description:'People solve tech. People matter more. Explore the first collection.'},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-scroll-behavior="smooth"><body className={`${inter.variable} ${display.variable}`}><a className="skip-link" href="#main">Skip to content</a><StoreProvider><Header/><main id="main">{children}</main><Footer/></StoreProvider></body></html>;}

