import type { MetadataRoute } from 'next';
import { settings } from '@/lib/catalog';
export default function robots(): MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/cart','/checkout']},sitemap:`${settings.url}/sitemap.xml`};}
