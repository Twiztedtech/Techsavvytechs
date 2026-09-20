import Image from 'next/image';
import type { Crop } from '@/lib/catalog';
// Non-destructive viewport into the owner's supplied concept. Replace with real
// product photographs before accepting orders. Coordinates use the 941×1672 reference.
export function Artwork({ crop, alt, className = '', priority = false }: {crop: Crop; alt: string; className?: string; priority?: boolean}) {
  return <div className={`artwork ${className}`} style={{aspectRatio:`${crop.w}/${crop.h}`}}>
    <Image src="/reference/storefront-concept.png" alt={alt} width={941} height={1672} priority={priority} loading={priority?'eager':'lazy'} sizes="(max-width: 700px) 1800px, 2400px" style={{position:'absolute',maxWidth:'none',width:`${941/crop.w*100}%`,height:'auto',left:`${-crop.x/crop.w*100}%`,top:0,transform:`translateY(${-crop.y/1672*100}%)`}} />
  </div>;
}
