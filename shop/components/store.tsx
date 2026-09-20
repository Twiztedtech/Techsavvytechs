'use client';
import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ArrowRight, ShoppingBag, Menu, X, Minus, Plus, Trash2, Search, Instagram, Facebook, Linkedin, Youtube } from 'lucide-react';
import { products, sizes, money, settings, type Color, type Size } from '@/lib/catalog';
import { Artwork } from './artwork';

type CartItem = { productId: string; color: Color; size: Size; quantity: number };
type State = { items: CartItem[]; ready: boolean };
type Action = { type: 'load'; items: CartItem[] } | { type: 'add'; item: CartItem } | { type: 'quantity'; key: string; quantity: number };
const keyOf = (i: CartItem) => `${i.productId}:${i.color}:${i.size}`;
function sanitize(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, CartItem>();
  for (const item of value.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const p = products.find(p => p.id === item.productId && p.active);
    if (!p || !p.colors.includes(item.color) || !sizes.includes(item.size) || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    const entry = {productId:p.id,color:item.color,size:item.size,quantity:Math.min(20,item.quantity)};
    result.set(keyOf(entry), entry);
  }
  return [...result.values()];
}
function reducer(state: State, action: Action): State {
  if (action.type === 'load') return {ready:true, items:action.items};
  if (action.type === 'quantity') return {...state,items:state.items.map(i => keyOf(i) === action.key ? {...i,quantity:Math.min(20,Math.max(0,action.quantity))} : i).filter(i => i.quantity > 0)};
  const existing = state.items.find(i => keyOf(i) === keyOf(action.item));
  return {...state,items:existing ? state.items.map(i => keyOf(i) === keyOf(action.item) ? {...i,quantity:Math.min(20,i.quantity+action.item.quantity)} : i) : [...state.items,action.item]};
}
const CartContext = createContext<{items:CartItem[];ready:boolean;add:(i:CartItem)=>void;quantity:(key:string,n:number)=>void;open:()=>void} | null>(null);
export function useCart() { const c = useContext(CartContext); if(!c) throw new Error('Cart provider missing'); return c; }
export function StoreProvider({children}:{children:ReactNode}) {
  const [state,dispatch] = useReducer(reducer,{items:[],ready:false});
  const [opened,setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { let items: CartItem[] = []; try { items = sanitize(JSON.parse(localStorage.getItem('techsavvy-cart-v1') || '[]')); } catch {} dispatch({type:'load',items}); },[]);
  useEffect(() => { if(state.ready) { try {localStorage.setItem('techsavvy-cart-v1',JSON.stringify(state.items));} catch {} } },[state]);
  useEffect(() => { if(opened) {dialog.current?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow='hidden'; return () => {document.body.style.overflow=previous;};} else dialog.current?.close(); },[opened]);
  return <CartContext.Provider value={{...state,add:item=>{dispatch({type:'add',item});setOpened(true);},quantity:(key,quantity)=>dispatch({type:'quantity',key,quantity}),open:()=>setOpened(true)}}>
    {children}
    <dialog ref={dialog} className="cart-dialog" aria-labelledby="drawer-title" onCancel={()=>setOpened(false)} onClick={e=>{if(e.target===e.currentTarget)setOpened(false);}}>
      <div className="drawer-inner"><div className="drawer-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2 id="drawer-title">The gear bag.</h2></div><button className="icon-button" aria-label="Close bag" onClick={()=>setOpened(false)}><X/></button></div>
      <CartContents compact />
      <Link className="button button-green" href="/cart" onClick={()=>setOpened(false)}>VIEW YOUR BAG <ArrowRight size={18}/></Link>
      <button className="text-button" onClick={()=>setOpened(false)}>Continue exploring</button></div>
    </dialog>
  </CartContext.Provider>;
}
export function Brand(){return <Link className="brand" href="/" aria-label="TechSavvy Gear home"><Image src="/brand/ts-monogram.png" width={86} height={43} alt="" priority/><span>Tech<span className="green">Savvy</span><span className="brand-llc"> LLC</span></span></Link>;}
export function Header(){
  const pathname = usePathname(); const cart = useCart(); const [menu,setMenu]=useState(false);
  const links = [['/','Home'],['/shop','Shop'],['/our-story','Our Story'],['/size-guide','Size Guide'],['/track-order','Track Order'],['/contact','Contact']];
  return <><div className="announcement"><span>{settings.announcement}</span><Link href="/partners">LET’S BUILD SOMETHING <ArrowRight size={13}/></Link></div>
  <header className="header"><div className="shell header-inner"><Brand/><nav aria-label="Main navigation" className="desktop-nav">{links.map(([href,label])=><Link key={href} href={href} aria-current={(href==='/'?pathname==='/':pathname.startsWith(href))?'page':undefined}>{label}</Link>)}</nav><div className="header-actions"><Link href="/shop#search" className="icon-button search-link" aria-label="Search the collection"><Search size={21}/></Link><button className="bag-button" onClick={cart.open} aria-label={`Open bag, ${cart.items.reduce((n,i)=>n+i.quantity,0)} items`}><ShoppingBag size={21}/><span className="bag-count">{cart.items.reduce((n,i)=>n+i.quantity,0)}</span></button><button className="icon-button mobile-menu-button" aria-label={menu?'Close menu':'Open menu'} aria-expanded={menu} aria-controls="mobile-nav" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></div>
  {menu&&<nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">{links.map(([href,label])=><Link href={href} key={href} onClick={()=>setMenu(false)}>{label}<ArrowRight size={18}/></Link>)}<Link href="/partners" onClick={()=>setMenu(false)}>Partner with us</Link></nav>}</header></>;
}
export function Footer(){return <footer className="footer draft-footer"><div className="shell footer-grid"><div className="footer-brand"><Link href="/" aria-label="TechSavvy Gear home"><Image src="/brand/techsavvy-logo.png" width={1984} height={800} alt="TechSavvy LLC — Wired for What’s Next" sizes="220px" loading="eager"/></Link></div><div><h3>Shop</h3><Link href="/shop">All Products</Link><Link href="/collections/t-shirts">T-Shirts</Link><Link href="/collections/hoodies">Hoodies</Link><Link href="/collections/hats">Hats</Link><Link href="/collections/accessories">Accessories</Link></div><div><h3>Support</h3><Link href="/size-guide">Size Guide</Link><Link href="/shipping-returns">Shipping & Returns</Link><Link href="/track-order">Track Order</Link><Link href="/contact">Contact</Link></div><div><h3>Company</h3><Link href="/our-story">Our Story</Link><a href={settings.companyUrl}>techsavvytechs.com</a><Link href="/shop/people-matter-tee">People Matter</Link><Link href="/partners">Partner With Us</Link></div><div className="footer-connect"><h3>STAY CONNECTED</h3><div className="social-icons" aria-label="Social profiles coming soon">{[{Icon:Instagram,name:'Instagram'},{Icon:Facebook,name:'Facebook'},{Icon:Linkedin,name:'LinkedIn'},{Icon:Youtube,name:'YouTube'}].map(({Icon,name})=><span key={name} role="img" aria-label={`${name} profile coming soon`} title={`${name} profile coming soon`}><Icon size={24}/></span>)}</div><p className="social-note">Social links coming soon.</p><p>Cabling | Networks | Managed IT</p><p>Bay Area | Sacramento | And Beyond</p></div></div><div className="shell footer-bottom"><span>© {new Date().getFullYear()} TechSavvy LLC. All rights reserved.</span><div><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></div></div></footer>;}
export function CartContents({compact=false}:{compact?:boolean}){
  const cart=useCart(); const total=cart.items.reduce((n,i)=>n+(products.find(p=>p.id===i.productId)?.price||0)*i.quantity,0);
  if(!cart.ready)return <p role="status">Loading your bag…</p>;
  if(!cart.items.length)return <div className="empty-state"><ShoppingBag size={36}/><h3>Your next favorite is out there.</h3><p>Your bag is empty. Explore the first collection and find your design.</p>{!compact&&<Link href="/shop" className="button button-green">EXPLORE THE COLLECTION <ArrowRight size={18}/></Link>}</div>;
  return <><div className="cart-items">{cart.items.map(item=>{const p=products.find(p=>p.id===item.productId)!;const key=keyOf(item);return <div className="cart-item" key={key}><Artwork crop={p.colorImages?.[item.color]||p.image} alt={`${p.name} concept`}/><div className="cart-item-info"><h3>{p.name}</h3><p>{item.color} / {item.size}</p><span>{money(p.price)}</span><div className="quantity"><button aria-label={`Decrease ${p.name} quantity`} onClick={()=>cart.quantity(key,item.quantity-1)}><Minus size={14}/></button><span aria-live="polite">{item.quantity}</span><button aria-label={`Increase ${p.name} quantity`} disabled={item.quantity>=20} onClick={()=>cart.quantity(key,item.quantity+1)}><Plus size={14}/></button></div></div><button className="icon-button remove" aria-label={`Remove ${p.name}`} onClick={()=>cart.quantity(key,0)}><Trash2 size={17}/></button></div>;})}</div><div className="subtotal"><span>Estimated subtotal</span><strong>{money(total)}</strong></div><p className="muted small">Collection preview. Prices are proposed. Your bag saves on this device; it does not reserve stock or place an order.</p></>;
}

