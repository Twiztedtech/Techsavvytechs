import { Fragment, useMemo, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from './markdown';

// Renders the safe markdown tree as React elements. Text is always escaped by
// React; there is no dangerouslySetInnerHTML anywhere in this file.

const external = (href: string) => /^https?:\/\//i.test(href);

function renderText(value: string, key: string): ReactNode {
  const parts = value.split('\n');
  return parts.map((part, index) => (
    <Fragment key={`${key}-${index}`}>
      {index > 0 && <br />}
      {part}
    </Fragment>
  ));
}

function renderInline(nodes: Inline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.t) {
      case 'text': return <Fragment key={key}>{renderText(node.v, key)}</Fragment>;
      case 'strong': return <strong key={key} className="font-bold text-white">{renderInline(node.c, key)}</strong>;
      case 'em': return <em key={key}>{renderInline(node.c, key)}</em>;
      case 'code': return <code key={key} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-amber-300">{node.v}</code>;
      case 'link': return (
        <a key={key} href={node.href} className="font-semibold text-amber-400 underline underline-offset-2 hover:text-amber-300" {...(external(node.href) ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
          {renderInline(node.c, key)}
        </a>
      );
      case 'image': return <img key={key} src={node.src} alt={node.alt} loading="lazy" className="my-2 max-h-96 max-w-full rounded-lg border border-slate-700" />;
    }
  });
}

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.t) {
    case 'h': {
      const size = block.level === 1 ? 'text-2xl' : block.level === 2 ? 'text-xl' : 'text-lg';
      return <p key={key} role="heading" aria-level={block.level + 1} className={`${size} mt-5 mb-2 font-black text-white first:mt-0`}>{renderInline(block.c, key)}</p>;
    }
    case 'p': return <p key={key} className="my-3 leading-relaxed text-slate-200">{renderInline(block.c, key)}</p>;
    case 'ul': return (
      <ul key={key} className="my-3 space-y-1.5 pl-1 text-slate-200">
        {block.items.map((item, index) => (
          <li key={`${key}-${index}`} className="flex gap-2">
            {item.checked === undefined ? <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${item.checked ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-slate-600'}`}>{item.checked ? '✓' : ''}</span>}
            <span>{renderInline(item.c, `${key}-${index}`)}</span>
          </li>
        ))}
      </ul>
    );
    case 'ol': return (
      <ol key={key} className="my-3 list-decimal space-y-1.5 pl-6 text-slate-200 marker:font-bold marker:text-amber-500">
        {block.items.map((item, index) => <li key={`${key}-${index}`}>{renderInline(item.c, `${key}-${index}`)}</li>)}
      </ol>
    );
    case 'quote': return <blockquote key={key} className="my-3 border-l-4 border-amber-500/60 bg-slate-900/60 py-1 pl-4 text-slate-300">{block.c.map((child, index) => renderBlock(child, `${key}-${index}`))}</blockquote>;
    case 'code': return <pre key={key} className="my-3 overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"><code>{block.v}</code></pre>;
    case 'hr': return <hr key={key} className="my-5 border-slate-700" />;
    case 'table': return (
      <div key={key} className="my-3 overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400"><tr>{block.head.map((cell, index) => <th key={`${key}-h${index}`} className="px-3 py-2">{renderInline(cell, `${key}-h${index}`)}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800">{block.rows.map((row, rowIndex) => <tr key={`${key}-r${rowIndex}`}>{row.map((cell, index) => <td key={`${key}-r${rowIndex}c${index}`} className="px-3 py-2">{renderInline(cell, `${key}-r${rowIndex}c${index}`)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <div className={`text-sm ${className}`}>{blocks.map((block, index) => renderBlock(block, `b${index}`))}</div>;
}
