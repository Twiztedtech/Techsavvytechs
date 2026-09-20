import Image from 'next/image';
import type { Crop } from '@/lib/catalog';
// Non-destructive viewport into the owner's supplied concept art. Source
// dimensions travel with the crop so higher-resolution originals can be used.
export function Artwork({ crop, alt, className = '', priority = false }: {crop: Crop; alt: string; className?: string; priority?: boolean}) {
  const src = crop.src ?? '/reference/storefront-concept.png';
  const sourceW = crop.sourceW ?? 941;
  const sourceH = crop.sourceH ?? 1672;
  return <div className={`artwork ${className}`} style={{aspectRatio:`${crop.w}/${crop.h}`}}>
    <Image src={src} alt={alt} width={sourceW} height={sourceH} priority={priority} loading={priority?'eager':'lazy'} unoptimized sizes="100vw" style={{position:'absolute',maxWidth:'none',width:`${sourceW/crop.w*100}%`,height:'auto',left:`${-crop.x/crop.w*100}%`,top:0,transform:`translateY(${-crop.y/sourceH*100}%)`}} />
  </div>;
}
