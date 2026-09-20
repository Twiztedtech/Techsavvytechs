import type { MetadataRoute } from 'next';
import {products,settings} from '@/lib/catalog';
export default function sitemap():MetadataRoute.Sitemap{return ['','/shop','/our-story','/partners','/contact','/size-guide','/shipping-returns','/privacy','/terms','/collections/t-shirts','/collections/hoodies',...products.map(p=>`/shop/${p.slug}`)].map(path=>({url:`${settings.url}${path}`}));}
