// A small, safe markdown parser for forum posts and training lessons.
// It produces a plain data tree (never HTML), so nothing a person types can
// become a script, an iframe or an event handler. Links and images are limited
// to https/http, mailto, tel and same-site paths. Supports headings, bold,
// italic, inline and fenced code, quotes, bullet/numbered/checkbox lists,
// rules, tables, links and images.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'image'; src: string; alt: string };

export type ListItem = { checked?: boolean; c: Inline[] };
export type Block =
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: ListItem[] }
  | { t: 'ol'; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

/** Returns the url when it is safe to use as a link or image address, otherwise an empty string. */
export function safeUrl(raw: string, { image = false }: { image?: boolean } = {}): string {
  const url = String(raw ?? '').trim();
  if (!url || /[\u0000-\u001f\u007f\s]/.test(url) || url.length > 2000) return '';
  if (url.startsWith('//')) return '';
  if (url.startsWith('/') || url.startsWith('#')) return url;
  if (/^https:\/\//i.test(url)) return url;
  if (!image && /^(http:\/\/|mailto:|tel:)/i.test(url)) return url;
  return '';
}

const isWordChar = (value: string | undefined) => Boolean(value && /[A-Za-z0-9]/.test(value));

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => { if (buffer) { out.push({ t: 'text', v: buffer }); buffer = ''; } };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) { buffer += src[i + 1]; i += 2; continue; }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) { flush(); out.push({ t: 'code', v: src.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (src.startsWith('![', i)) {
      const match = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (match) {
        const url = safeUrl(match[2], { image: true });
        if (url) { flush(); out.push({ t: 'image', src: url, alt: match[1].slice(0, 200) }); }
        i += match[0].length;
        continue;
      }
    }
    if (ch === '[') {
      const match = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (match) {
        flush();
        const href = safeUrl(match[2]);
        if (href && depth < 3) out.push({ t: 'link', href, c: parseInline(match[1], depth + 1) });
        else out.push({ t: 'text', v: match[1] });
        i += match[0].length;
        continue;
      }
    }
    if (src.startsWith('**', i) && depth < 3) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), depth + 1) }); i = end + 2; continue; }
    }
    if ((ch === '*' || ch === '_') && depth < 3 && src[i + 1] !== ' ' && !(ch === '_' && isWordChar(src[i - 1]))) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && !(ch === '_' && isWordChar(src[end + 1]))) { flush(); out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), depth + 1) }); i = end + 1; continue; }
    }
    if (ch === 'h' && /^https?:\/\//i.test(src.slice(i, i + 8))) {
      const match = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/i.exec(src.slice(i));
      const url = match ? safeUrl(match[0]) : '';
      if (match && url) { flush(); out.push({ t: 'link', href: url, c: [{ t: 'text', v: match[0] }] }); i += match[0].length; continue; }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
const blockStart = (line: string) => /^(#{1,3}\s|>|```|\s*[-*]\s+|\s*\d+[.)]\s+|(-{3,}|\*{3,})\s*$)/.test(line);

export function parseMarkdown(markdown: string): Block[] {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = /^```\s*([A-Za-z0-9_-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ t: 'code', lang: fence[1], v: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) { blocks.push({ t: 'h', level: heading[1].length as 1 | 2 | 3, c: parseInline(heading[2].trim()) }); i += 1; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue; }
    if (line.startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { quoted.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      blocks.push({ t: 'quote', c: parseMarkdown(quoted.join('\n')) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line).map((cell) => parseInline(cell));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(splitRow(lines[i]).map((cell) => parseInline(cell))); i += 1; }
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const rest = lines[i].replace(/^\s*[-*]\s+/, '');
        const box = /^\[([ xX])\]\s+(.*)$/.exec(rest);
        items.push(box ? { checked: box[1].toLowerCase() === 'x', c: parseInline(box[2]) } : { c: parseInline(rest) });
        i += 1;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push({ c: parseInline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) }); i += 1; }
      blocks.push({ t: 'ol', items });
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !blockStart(lines[i]))) { paragraph.push(lines[i]); i += 1; }
    blocks.push({ t: 'p', c: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}

/** Plain text of a markdown body, for excerpts and search. */
export function markdownToText(markdown: string, max = 200): string {
  const walk = (inlines: Inline[]): string => inlines.map((node) => (node.t === 'text' || node.t === 'code' ? node.v : node.t === 'image' ? node.alt : walk(node.c))).join('');
  const parts = (blocks: Block[]): string[] => blocks.flatMap((block) => {
    if (block.t === 'h' || block.t === 'p') return [walk(block.c)];
    if (block.t === 'ul' || block.t === 'ol') return block.items.map((item) => walk(item.c));
    if (block.t === 'quote') return parts(block.c);
    if (block.t === 'code') return [block.v];
    if (block.t === 'table') return [...block.head.map(walk), ...block.rows.flat().map(walk)];
    return [];
  });
  return parts(parseMarkdown(markdown)).join(' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
