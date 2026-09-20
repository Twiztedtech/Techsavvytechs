export type Color = 'Black' | 'Charcoal' | 'Olive' | 'White';
export const sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] as const;
export type Size = typeof sizes[number];
export type Crop = { x: number; y: number; w: number; h: number };
export type Product = {
  id: string; slug: string; name: string; category: 'T-Shirts' | 'Hoodies'; price: number;
  description: string; statement: string; colors: Color[]; image: Crop;
  colorImages?: Partial<Record<Color, Crop>>; label: string;
  fulfillment: 'in-house' | 'pod'; active: boolean;
};
export const colors: Record<Color, string> = { Black: '#1c1c1c', Charcoal: '#626462', Olive: '#646b47', White: '#f5f5ef' };
export const products: Product[] = [
  {id:'logo-tee',slug:'techsavvy-logo-tee',name:'TechSavvy Logo Tee',category:'T-Shirts',price:2800,label:'THE ORIGINAL',statement:'Wear what you stand for.',description:'The signature TS mark, front and center. A straightforward expression of the people and the work behind TechSavvy.',colors:['Black','Charcoal','Olive','White'],image:{x:38,y:577,w:207,h:164},colorImages:{Black:{x:38,y:577,w:207,h:164},Charcoal:{x:254,y:577,w:208,h:164},Olive:{x:476,y:577,w:207,h:164},White:{x:696,y:577,w:207,h:164}},fulfillment:'in-house',active:true},
  {id:'mission-tee',slug:'mission-tee',name:'Mission Tee',category:'T-Shirts',price:2800,label:'WEAR THE MISSION',statement:'Same mission. Different location.',description:'Design. Deploy. Support. Repeat. A back-print concept that speaks the language of the people who keep technology working.',colors:['Black'],image:{x:38,y:909,w:207,h:160},fulfillment:'in-house',active:true},
  {id:'head-geek',slug:'head-geek-tee',name:'Head Geek Tee',category:'T-Shirts',price:2800,label:'OWN YOUR TITLE',statement:'A little expertise. A lot of personality.',description:'The crown is earned. A handwritten Head Geek graphic for the person everyone calls when technology has other plans.',colors:['Black','Charcoal','Olive'],image:{x:254,y:909,w:208,h:160},fulfillment:'in-house',active:true},
  {id:'people-matter',slug:'people-matter-tee',name:'People Matter Tee',category:'T-Shirts',price:2800,label:'PEOPLE FIRST',statement:'People solve tech. People matter more.',description:'The belief behind the business, made wearable. A typographic design that puts the human side of technology first.',colors:['Black'],image:{x:476,y:909,w:207,h:160},fulfillment:'in-house',active:true},
  {id:'hoodie',slug:'techsavvy-hoodie',name:'TechSavvy Hoodie',category:'Hoodies',price:5500,label:'THE NEXT LAYER',statement:'The mission goes with you.',description:'The signature TechSavvy identity in a hoodie concept. An everyday layer for wherever the next project takes you.',colors:['Black','Charcoal'],image:{x:696,y:909,w:207,h:160},fulfillment:'pod',active:true}
];
export const money = (cents: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(cents/100);
export const findProduct = (slug: string) => products.find(p => p.slug === slug && p.active);
export const settings = {
  name: 'TechSavvy Gear', url: 'https://shop.techsavvytechs.com', companyUrl: 'https://techsavvytechs.com',
  email: 'support@techsavvytechs.com', checkoutEnabled: false,
  announcement: 'COLLECTION PREVIEW  |  REPRESENT TECHSAVVY  |  WIRED FOR WHAT’S NEXT.',
};
