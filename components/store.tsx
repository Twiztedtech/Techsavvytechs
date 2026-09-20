'use client';
import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ArrowRight, ShoppingBag, Menu, X, Minus, Plus, Trash2, Search } from 'lucide-react';
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
export function Brand(){return <Link className="brand" href="/" aria-label="TechSavvy Gear home"><Image src="/brand/ts-monogram.png" width={86} height={43} alt="" priority/><span>Tech<span className="green">Savvy</span><small>GEAR / WIRED FOR WHAT’S NEXT.</small></span></Link>;}
export function Header(){
  const pathname = usePathname(); const cart = useCart(); const [menu,setMenu]=useState(false);
  const links = [['/shop','The collection'],['/our-story','Our story'],['/partners','Partner with us']];
  return <><div className="announcement"><span>{settings.announcement}</span><Link href="/partners">LET’S BUILD SOMETHING <ArrowRight size={13}/></Link></div>
  <header className="header"><div className="shell header-inner"><Brand/><nav aria-label="Main navigation" className="desktop-nav">{links.map(([href,label])=><Link key={href} href={href} aria-current={pathname.startsWith(href)?'page':undefined}>{label}</Link>)}</nav><div className="header-actions"><Link href="/shop#search" className="icon-button search-link" aria-label="Search the collection"><Search size={21}/></Link><button className="bag-button" onClick={cart.open} aria-label={`Open bag, ${cart.items.reduce((n,i)=>n+i.quantity,0)} items`}><ShoppingBag size={21}/><span className="bag-count">{cart.items.reduce((n,i)=>n+i.quantity,0)}</span></button><button className="icon-button mobile-menu-button" aria-label={menu?'Close menu':'Open menu'} aria-expanded={menu} aria-controls="mobile-nav" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></div>
  {menu&&<nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">{links.map(([href,label])=><Link href={href} key={href} onClick={()=>setMenu(false)}>{label}<ArrowRight size={18}/></Link>)}<Link href="/contact" onClick={()=>setMenu(false)}>Contact</Link></nav>}</header></>;
}
export function Footer(){return <footer className="footer"><div className="shell footer-grid"><div className="footer-brand"><Brand/><p>For the people who keep<br/>technology—and each other—moving.</p><span className="micro">BAY AREA · SACRAMENTO · AND BEYOND</span></div><div><h3>THE GEAR</h3><Link href="/shop">The collection</Link><Link href="/collections/t-shirts">T-shirts</Link><Link href="/collections/hoodies">Hoodies</Link><Link href="/size-guide">Size guide</Link></div><div><h3>THE PEOPLE</h3><Link href="/our-story">Our story</Link><Link href="/partners">Partner with us</Link><Link href="/contact">Get in touch</Link><a href={settings.companyUrl}>TechSavvy services ↗</a></div><div><h3>GOOD TO KNOW</h3><Link href="/shipping-returns">Shipping & returns</Link><Link href="/track-order">Track an order</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div><div className="shell footer-bottom"><span>© {new Date().getFullYear()} TechSavvy LLC. All rights reserved.</span><span>CABLING / NETWORKS / MANAGED IT</span><span>PEOPLE FIRST. ALWAYS.</span></div></footer>;}
export function CartContents({compact=false}:{compact?:boolean}){
  const cart=useCart(); const total=cart.items.reduce((n,i)=>n+(products.find(p=>p.id===i.productId)?.price||0)*i.quantity,0);
  if(!cart.ready)return <p role="status">Loading your bag…</p>;
  if(!cart.items.length)return <div className="empty-state"><ShoppingBag size={36}/><h3>Your next favorite is out there.</h3><p>Your bag is empty. Explore the first collection and find your design.</p>{!compact&&<Link href="/shop" className="button button-green">EXPLORE THE COLLECTION <ArrowRight size={18}/></Link>}</div>;
  return <><div className="cart-items">{cart.items.map(item=>{const p=products.find(p=>p.id===item.productId)!;const key=keyOf(item);return <div className="cart-item" key={key}><Artwork crop={p.colorImages?.[item.color]||p.image} alt={`${p.name} concept`}/><div className="cart-item-info"><h3>{p.name}</h3><p>{item.color} / {item.size}</p><span>{money(p.price)}</span><div className="quantity"><button aria-label={`Decrease ${p.name} quantity`} onClick={()=>cart.quantity(key,item.quantity-1)}><Minus size={14}/></button><span aria-live="polite">{item.quantity}</span><button aria-label={`Increase ${p.name} quantity`} disabled={item.quantity>=20} onClick={()=>cart.quantity(key,item.quantity+1)}><Plus size={14}/></button></div></div><button className="icon-button remove" aria-label={`Remove ${p.name}`} onClick={()=>cart.quantity(key,0)}><Trash2 size={17}/></button></div>;})}</div><div className="subtotal"><span>Estimated subtotal</span><strong>{money(total)}</strong></div><p className="muted small">Collection preview. Prices are proposed. Your bag saves on this device; it does not reserve stock or place an order.</p></>;
}
