import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CartContents } from '@/components/store';
export const metadata={title:'Your Gear Bag',robots:{index:false,follow:true}};
export default function Cart(){return <div className="shell section"><div className="page-intro"><span className="eyebrow">YOUR COLLECTION</span><h1>THE GEAR <span className="green">BAG.</span></h1></div><div className="cart-page"><div><CartContents/></div><aside className="info-panel"><span className="eyebrow">A FIRST LOOK</span><h2>GOOD THINGS<br/>ARE IN THE WORKS.</h2><p>This is a preview of our first collection. You can explore designs and save a bag, but we aren’t accepting orders or payments yet.</p><Link href="/checkout" className="button button-outline">LAUNCH & ORDERING INFO <ArrowRight size={18}/></Link><Link href="/shop" className="text-link">Back to the collection <ArrowRight size={16}/></Link></aside></div></div>;}
