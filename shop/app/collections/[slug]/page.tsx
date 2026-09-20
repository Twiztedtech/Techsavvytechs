import { notFound } from 'next/navigation';
import { Catalog } from '@/components/catalog';
export const dynamicParams = false;
const collections:Record<string,string>={'t-shirts':'T-Shirts','hoodies':'Hoodies','long-sleeve':'Long Sleeve','hats':'Hats','accessories':'Accessories'};
export function generateStaticParams(){return Object.keys(collections).map(slug=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return {title:collections[slug]||'Collection',alternates:{canonical:`/collections/${slug}`}};}
export default async function Collection({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const category=collections[slug];if(!category)notFound();return <div className="shell section"><div className="page-intro"><span className="eyebrow">THE FIRST COLLECTION</span><h1>{category.toUpperCase()}<span className="green">.</span></h1><p>Original TechSavvy designs. Preview what’s next.</p></div><Catalog key={slug} initialCategory={category}/></div>;}
