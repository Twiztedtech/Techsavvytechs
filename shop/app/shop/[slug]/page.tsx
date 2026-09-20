import Link from 'next/link';
import { notFound } from 'next/navigation';
import { products,findProduct,type Color } from '@/lib/catalog';
import { ProductDetail,ProductCard } from '@/components/catalog';
export const dynamicParams = false;
export function generateStaticParams(){return products.map(p=>({slug:p.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=findProduct(slug);return {title:p?.name||'Product not found',description:p?.description,alternates:{canonical:`/shop/${slug}`}};}
export default async function ProductPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{color?:string|string[]}>}){const [{slug},{color:requestedColor}]=await Promise.all([params,searchParams]);const p=findProduct(slug);if(!p)notFound();const colorValue=Array.isArray(requestedColor)?requestedColor[0]:requestedColor;const initialColor=p.colors.find(color=>color.toLowerCase()===colorValue?.toLowerCase()) as Color|undefined;return <div className="shell section"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/shop">The collection</Link><span>/</span><span>{p.name}</span></nav><ProductDetail product={p} initialColor={initialColor}/><section className="related"><span className="eyebrow">KEEP EXPLORING</span><h2>SAME MISSION. MORE GEAR.</h2><div className="product-grid">{products.filter(x=>x.id!==p.id).slice(0,4).map(x=><ProductCard key={x.id} product={x}/>)}</div></section></div>;}
